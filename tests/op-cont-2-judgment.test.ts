/**
 * op.cont.2 · el juicio del plan de continuidad.
 *
 *     npx tsx tests/op-cont-2-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. op.cont.2 es un control de DOCUMENTO sin runbook ni reglas:
 * todo lo que decide son tablas de la pantalla con su vigencia, juzgadas contra
 * la fecha de la evaluación, y lo que cumple sale ACREDITADO DOCUMENTALMENTE.
 * Se rige por el nivel de Disponibilidad y solo en ALTO. Cada caso mueve UN eje
 * y lleva al lado la REVERSIÓN: la misma tabla con otra fecha, u otro `now`,
 * cambia el veredicto.
 *
 * No hay hechos: ninguna máquina emite nada de op.cont.2, así que lo que no se
 * puede acreditar es de CONFIGURACIÓN, nunca de RECOGIDA, también por el motor
 * entero (bloque 7).
 *
 * El motor arrastra `kibana-services`, que solo existe en el árbol del plugin
 * `main` de Wazuh; aquí se sustituye por un módulo vacío antes de cargarlo.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ENSCatalog } from '../public/ens/catalog';
import { opCont2PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-cont-2.policy';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { opCont2CatalogDefinition } from '../public/ens/catalog/op-cont-2';
import { opCont2Configuration } from '../public/ens/configuration/data/op-cont-2-parameters';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { controlExpectsFacts, getEvidenceDefinitions } from '../public/ens/core/evidence/registry';
import { applyPolicyDecisionsToEvidences } from '../public/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../public/ens/core/evaluation/evaluation-engine';
import { validateParameterValue } from '../public/ens/configuration/services/parameter-value-validator';
import { ensConfigurationRepository } from '../public/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../public/ens/configuration/data/default-configuration';
import { buildOpCont2ReportModel } from '../public/ens/reports/op-cont-2-report-model';
import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../public/ens/configuration/types';
import type { ENSEvidenceResolved } from '../public/ens/core/evidence/types';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

// `kibana-services` de mentira, ANTES de cargar el motor.
{
  const Module = require('module');
  const cargar = Module._load;

  Module._load = function (peticion: string, ...resto: unknown[]) {
    if (/kibana-services$/.test(peticion)) {
      return {};
    }

    return cargar.call(this, peticion, ...resto);
  };
}

const { getENSComplianceResults, getENSComplianceState } = require('../public/ens/core/ens-engine') as typeof import('../public/ens/core/ens-engine');

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (nombre: string, condicion: boolean, detalle: unknown = ''): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle !== '' ? ` — ${String(detalle)}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- la configuración --------------------------------------------------------

const AHORA = new Date('2026-10-09T12:00:00Z');

type Valores = Record<string, string[] | string | undefined>;

const configuracion = (valores: Valores): ENSControlConfiguration => ({
  ...opCont2Configuration,
  parameters: opCont2Configuration.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    // Un parámetro vacío es la clave `value` AUSENTE, nunca `null`.
    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

// Lo que declararía una organización con D en ALTO y todo en orden el
// 09/10/2026: la versión vigente del plan (y la anterior, que se conserva), dos
// servicios esenciales, dos funciones (una sin suplente), dos medios
// alternativos contratados y la formación de las tres personas.
const BASE: Valores = {
  'P-01': [
    'Plan de Continuidad del Servicio | v3.0 | 2026-01-15 | Comité de Seguridad | Responsable de Seguridad',
    'Plan de Continuidad del Servicio | v2.1 | 2024-03-10 | Comité de Seguridad | Responsable de Seguridad',
  ],
  'P-02': ['sede electrónica | 4 h | 1 h | srv-web, srv-bd', 'correo corporativo | 8 h | 30 min | ldap-zimbra'],
  'P-03': [
    'coordinador de crisis | A. Martínez | J. Ruiz | activar el plan y convocar al comité de crisis',
    'responsable de sistemas | L. Gómez | - | conmutar al CPD alternativo y verificar la integridad',
  ],
  'P-04': [
    'CPD alternativo | Proveedor X | CT-2025-014 | 2027-06-30 | 48 h',
    'enlace de respaldo | Operador Y | CT-2024-201 | 2026-12-31 | 4 h',
  ],
  'P-05': [
    'A. Martínez | coordinación de crisis | 2026-02-10 | 2027-02-10',
    'J. Ruiz | coordinación de crisis (suplente) | 2026-02-10 | 2027-02-10',
    'L. Gómez | conmutación al CPD alternativo | 2025-11-20 | 2026-11-20',
  ],
  'P-06': ['Plan de Emergencia del edificio', 'Plan de Continuidad de Negocio corporativo'],
  'P-07': ['/boot', '/etc', 'versión de BIOS/UEFI'],
  'P-08': '12',
};

const con = (cambios: Valores): Valores => ({ ...BASE, ...cambios });

const BASE_REQ = ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'];

// El camino del motor para UN control sin hechos, pieza a pieza: evidencias,
// policy, puente, requisitos y, con `motor()`, el resultado entero con la misma
// expectativa de hechos que le da `ens-engine.ts`.
const evalua = (valores: Valores = BASE, nivel: ENSLevel = 'ALTO', ahora: Date = AHORA, tocaTabla?: (t: ENSEvidenceResolved[]) => ENSEvidenceResolved[]) => {
  const cfg = configuracion(valores);
  const evidencias = resolveEvidenceForControl('op.cont.2', [], '000', nivel, cfg, ahora);
  const contexto = buildPolicyContext(opCont2CatalogDefinition, cfg, nivel, [], evidencias, ahora);
  const { decisions, runtimeVariables } = opCont2PolicyDefinition.evaluator!(contexto);
  // Sin hechos, «no ha llegado nada» solo cuenta si el control esperaba hechos
  // (`nadaRecibido` del motor): op.cont.2 no los espera.
  const puenteada = applyPolicyDecisionsToEvidences(evidencias, decisions, opCont2CatalogDefinition.requirements, controlExpectsFacts('op.cont.2'));
  const tabla = tocaTabla ? tocaTabla(puenteada) : puenteada;
  const requisito = (id: string) =>
    evaluateRequirement(opCont2CatalogDefinition.requirements.find(q => q.id === id)!, nivel, tabla, false, decisions, 'ACTIVE');
  const evidencia = (id: string) => tabla.find(e => e.id === id);
  const motivo = (req: string) => decisions.find(d => d.requirementId === req && d.trace.ruleId === req)?.reason || '';
  const deEvidencia = (req: string, ev: string) => decisions.find(d => d.trace.ruleId === `${req}/${ev}`);
  const variable = (nombre: string) => runtimeVariables.find(v => v.name === nombre);
  const motor = () =>
    evaluateENSControl(
      opCont2CatalogDefinition,
      cfg,
      nivel,
      evidencias,
      {
        controlId: 'op.cont.2',
        policyId: opCont2PolicyDefinition.id,
        evaluatedAt: ahora.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      [],
      controlExpectsFacts('op.cont.2')
    );

  return { decisions, runtimeVariables, requisito, evidencia, motivo, deEvidencia, variable, motor };
};

const todos = (r: ReturnType<typeof evalua>, cumple: (id: string) => boolean): string[] => BASE_REQ.filter(id => !cumple(id));

// --- 1. catálogo ------------------------------------------------------------

bloque('1. Catálogo: Disponibilidad, solo ALTO, sin hechos y sin runbook');

{
  const niveles = (id: string) => opCont2CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  comprueba('se rige por la Disponibilidad (levelDimension D)', opCont2CatalogDefinition.levelDimension === 'D');
  comprueba('se evalúa solo en la fila del manager (control de la organización)', JSON.stringify(opCont2CatalogDefinition.measurementPlanes) === '["manager"]');
  comprueba('el control está ACTIVE', opCont2CatalogDefinition.status === 'ACTIVE', opCont2CatalogDefinition.status);
  comprueba('los cinco requisitos base solo en ALTO', BASE_REQ.every(id => niveles(id) === 'ALTO'));
  comprueba('R1 y R2 definidos, sin niveles', niveles('op.cont.2.r1.1') === '' && niveles('op.cont.2.r2.1') === '');
  comprueba(
    'los cinco se apoyan en EV-01 (el plan); 2.3 en EV-04 y 2.4 en EV-06; 2.5 tiene evidencia',
    BASE_REQ.every(id => opCont2CatalogDefinition.requirements.find(r => r.id === id)!.evidenceIds[0] === 'EV-01') &&
      opCont2CatalogDefinition.requirements.find(r => r.id === 'op.cont.2.3')!.evidenceIds.join(',') === 'EV-01,EV-04' &&
      opCont2CatalogDefinition.requirements.find(r => r.id === 'op.cont.2.4')!.evidenceIds.join(',') === 'EV-01,EV-06' &&
      opCont2CatalogDefinition.requirements.find(r => r.id === 'op.cont.2.5')!.evidenceIds.join(',') === 'EV-01'
  );
  comprueba(
    'ninguna evidencia escucha un evento, tiene origen ni acredita reglas',
    getEvidenceDefinitions('op.cont.2').length === 8 &&
      getEvidenceDefinitions('op.cont.2').every(e => !e.expectedEventTypes.length && !e.sourceTypes.length && !e.relatedRules.length && !e.judgment)
  );
  comprueba('op.cont.2 no espera hechos', controlExpectsFacts('op.cont.2') === false);
  comprueba(
    'y es el único: todos los demás controles del catálogo esperan hechos',
    ENSCatalog.filter(c => c.id !== 'op.cont.2').every(c => controlExpectsFacts(c.id)),
    ENSCatalog.filter(c => c.id !== 'op.cont.2' && !controlExpectsFacts(c.id)).map(c => c.id).join(', ')
  );
  comprueba(
    'la policy declara los mismos niveles y evidencias que el catálogo',
    opCont2PolicyDefinition.requirements.length === opCont2CatalogDefinition.requirements.length &&
      opCont2PolicyDefinition.requirements.every(r => {
        const c = opCont2CatalogDefinition.requirements.find(q => q.id === r.requirementId)!;

        return r.levels.join(',') === c.applicability.levels.join(',') && r.evidenceIds.join(',') === c.evidenceIds.join(',');
      })
  );
  comprueba('sin P-ATT: una atestación no caduca', !opCont2Configuration.parameters.some(p => p.id === 'P-ATT'));
  comprueba(
    'obligatorios solo P-01 y P-08',
    opCont2Configuration.parameters.filter(p => p.required).map(p => p.id).join(',') === 'P-01,P-08'
  );
  comprueba(
    'las fechas son columnas date (las mismas que valida la pantalla)',
    ['P-01:fecha_de_aprobacion', 'P-04:vigencia', 'P-05:fecha', 'P-05:vigencia'].every(par => {
      const [id, col] = par.split(':');

      return opCont2Configuration.parameters.find(p => p.id === id)?.columns?.find(c => c.name === col)?.type === 'date';
    })
  );

  const sinRunbook = JSON.parse(readFileSync(join(__dirname, 'controls-without-runbook.json'), 'utf-8'));
  const bloqueJson = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'op-cont-2-control-block.json'), 'utf-8'));

  comprueba('declarado sin runbook, con motivo', typeof sinRunbook['op.cont.2'] === 'string' && sinRunbook['op.cont.2'].length > 20);
  comprueba('el bloque de config/ es el TS, tal cual', JSON.stringify(bloqueJson) === JSON.stringify(opCont2Configuration));
}

// --- 2. verde ---------------------------------------------------------------

bloque('2. Verde: todo declarado y en vigor el 09/10/2026, D en ALTO');

{
  const r = evalua();

  comprueba(
    'los cinco requisitos CUMPLE, acreditados documentalmente y demostrados',
    todos(r, id => r.requisito(id).status === 'CUMPLE' && r.requisito(id).attested === true && r.requisito(id).evidenced === true).length === 0,
    todos(r, id => r.requisito(id).status === 'CUMPLE' && r.requisito(id).attested === true).join(', ')
  );
  comprueba(
    'y su observación empieza por «Acreditado documentalmente»',
    BASE_REQ.every(id => r.requisito(id).observations[0].startsWith('Acreditado documentalmente')),
    r.requisito('op.cont.2.1').observations[0]
  );
  comprueba(
    'EV-01: el plan v3.0 del 15/01 vence el 15/01/2027 con P-08 = 12 (la v2.1 de 2024 no cuenta)',
    r.evidencia('EV-01')?.status === 'CUMPLE' && /v3\.0, aprobado el 2026-01-15 por Comité de Seguridad: vigente hasta el 2027-01-15/.test(r.deEvidencia('op.cont.2.1', 'EV-01')?.reason || ''),
    r.deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );
  comprueba(
    'la evidencia dice que es una declaración, no una medida',
    (r.evidencia('EV-01')?.observations || []).some(o => /Declaración de la pantalla, no medida/.test(o)),
    (r.evidencia('EV-01')?.observations || []).join(' | ')
  );
  comprueba(
    'EV-04: los dos contratos en vigor, con los días que quedan',
    r.evidencia('EV-04')?.status === 'CUMPLE' && /CT-2025-014 con Proveedor X, hasta el 2027-06-30/.test(r.deEvidencia('op.cont.2.3', 'EV-04')?.reason || ''),
    r.deEvidencia('op.cont.2.3', 'EV-04')?.reason
  );
  comprueba(
    'EV-06: las tres personas de P-03 (el «-» no es un suplente) con formación vigente',
    r.evidencia('EV-06')?.status === 'CUMPLE' && /Las 3 persona\(s\) del plan/.test(r.deEvidencia('op.cont.2.4', 'EV-06')?.reason || ''),
    r.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );
  comprueba(
    'EV-02, EV-03, EV-05, EV-07 y EV-08: NO_APLICA, dato del informe',
    ['EV-02', 'EV-03', 'EV-05', 'EV-07', 'EV-08'].every(
      id => r.evidencia(id)?.status === 'NO_APLICA' && (r.evidencia(id)?.observations || []).some(o => /Dato del informe, sin veredicto/.test(o))
    ),
    ['EV-02', 'EV-03', 'EV-05', 'EV-07', 'EV-08'].map(id => `${id}=${r.evidencia(id)?.status}`).join(' ')
  );
  comprueba('R1 y R2 NO_APLICA', r.requisito('op.cont.2.r1.1').status === 'NO_APLICA' && r.requisito('op.cont.2.r2.1').status === 'NO_APLICA');
  comprueba('la variable del plan lleva su último día de vigencia', r.variable('plan_vigente_hasta')?.value === '2027-01-15', r.variable('plan_vigente_hasta')?.value);

  const resultado = r.motor();

  comprueba('el control CUMPLE al 100 %', resultado.status === 'CUMPLE' && resultado.score === 100, `${resultado.status} ${resultado.score}`);
  comprueba('sin no conformidades', resultado.nonConformities.length === 0, resultado.nonConformities.map(nc => nc.id).join(', '));
  comprueba(
    'los valores de BASE son válidos para el validador de la pantalla',
    configuracion(BASE).parameters.filter(p => p.value !== undefined).every(p => validateParameterValue(p, p.value).valid),
    configuracion(BASE).parameters.filter(p => p.value !== undefined && !validateParameterValue(p, p.value).valid).map(p => `${p.id}: ${validateParameterValue(p, p.value).reason}`).join('; ')
  );

  const informe = buildOpCont2ReportModel(resultado);
  const campo = (id: string) => informe.fields.find(f => f.id === `op.cont.2.${id}`);

  comprueba('el informe tiene los doce campos de la plantilla', informe.fields.length === 12, informe.fields.length);
  comprueba('informe · plan vigente hasta el 2027-01-15, DOCUMENTO APORTADO', /DOCUMENTO APORTADO.*2027-01-15/.test(campo('campo2')?.value || ''), campo('campo2')?.value);
  comprueba('informe · los servicios esenciales de P-02', campo('campo3')?.status === 'CUMPLE' && /sede electrónica/.test(campo('campo3')?.value || ''), campo('campo3')?.value);
  comprueba('informe · la integración con otros planes de P-06', campo('campo10')?.status === 'CUMPLE', campo('campo10')?.status);
  comprueba(
    'informe · interrupciones, disponibilidad y activación de medios: no se miden y lo dice',
    ['campo4', 'campo5', 'campo6'].every(id => campo(id)?.status === 'NO_APLICA' && /No se mide/.test(campo(id)?.value || '')),
    ['campo4', 'campo5', 'campo6'].map(id => campo(id)?.value).join(' | ')
  );
  comprueba(
    'informe · la puntuación dice que todo es documental',
    /100 %.*5 de 5 acreditados documentalmente.*nada se verifica técnicamente/.test(campo('campo12')?.value || ''),
    campo('campo12')?.value
  );
}

// --- 3. el plan y su vigencia -------------------------------------------------

bloque('3. EV-01: el plan vencido tumba los cinco; la periodicidad y la fecha deciden');

{
  const viejo = con({ 'P-01': ['Plan de Continuidad del Servicio | v2.1 | 2025-09-01 | Comité de Seguridad | RS'] });
  const r = evalua(viejo);

  comprueba(
    'aprobado el 01/09/2025 con P-08 = 12: vencido el 2026-09-01 → los cinco NO_CUMPLE medidos, sin la marca',
    todos(r, id => r.requisito(id).status === 'NO_CUMPLE' && r.requisito(id).evidenced === true && !r.requisito(id).attested).length === 0,
    BASE_REQ.map(id => `${id}=${r.requisito(id).status}/${r.requisito(id).attested}`).join(' ')
  );
  comprueba('y el motivo da la fecha y los días', /venció el 2026-09-01, hace 37 días/.test(r.motivo('op.cont.2.3')), r.motivo('op.cont.2.3'));

  const bienal = evalua({ ...viejo, 'P-08': '24' });

  comprueba(
    'reversión · el mismo plan con P-08 = 24 (bienal): CUMPLE acreditado',
    todos(bienal, id => bienal.requisito(id).status === 'CUMPLE' && bienal.requisito(id).attested === true).length === 0,
    bienal.motivo('op.cont.2.1')
  );

  const justo = con({ 'P-01': ['Plan | v1 | 2025-10-09 | Comité | RS'] });

  comprueba(
    'aprobado el 09/10/2025 con P-08 = 12: el 09/10/2026 todavía vale (vence al acabar el día)',
    evalua(justo).evidencia('EV-01')?.status === 'CUMPLE',
    evalua(justo).deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );
  comprueba(
    'reversión · el 10/10/2026 ya ha vencido',
    evalua(justo, 'ALTO', new Date('2026-10-10T00:00:00Z')).evidencia('EV-01')?.status === 'NO_CUMPLE'
  );

  const finDeMes = con({ 'P-01': ['Plan | v1 | 2026-01-31 | Comité | RS'], 'P-08': '1' });

  comprueba(
    'los meses son de calendario: 31/01 + 1 mes vence el 28/02, no el 03/03',
    evalua(finDeMes, 'ALTO', new Date('2026-02-28T23:00:00Z')).evidencia('EV-01')?.status === 'CUMPLE' &&
      evalua(finDeMes, 'ALTO', new Date('2026-03-01T00:00:00Z')).evidencia('EV-01')?.status === 'NO_CUMPLE',
    evalua(finDeMes, 'ALTO', new Date('2026-02-28T23:00:00Z')).deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );

  // La serie diaria evalúa días pasados con la configuración de hoy: una
  // versión aprobada después de esa fecha no existía todavía.
  const antes = evalua(BASE, 'ALTO', new Date('2025-12-01T12:00:00Z'));

  comprueba(
    'el 01/12/2025 cuenta la v2.1 de 2024 (la v3.0 aún no existía), vencida el 10/03/2025',
    antes.evidencia('EV-01')?.status === 'NO_CUMPLE' && /v2\.1/.test(antes.deEvidencia('op.cont.2.1', 'EV-01')?.reason || ''),
    antes.deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );

  const soloFutura = evalua(con({ 'P-01': ['Plan | v3.0 | 2026-01-15 | Comité | RS'] }), 'ALTO', new Date('2025-12-01T12:00:00Z'));

  comprueba(
    'sin ninguna versión aprobada a esa fecha: no demostrado (CONFIGURATION), nunca CUMPLE',
    soloFutura.evidencia('EV-01')?.status === 'NO_EVALUABLE' && soloFutura.evidencia('EV-01')?.gapCause === 'CONFIGURATION',
    soloFutura.deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );
}

// --- 4. contratos y formación ------------------------------------------------

bloque('4. EV-04 y EV-06: lo que la organización declara que falta o venció es NO_CUMPLE');

{
  const sinContrato = evalua(con({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 2027-06-30 | 48 h', 'sede de respaldo | - |  |  | 24 h'] }));

  comprueba(
    'un medio sin contrato: op.cont.2.3 NO_CUMPLE medido, y lo nombra',
    sinContrato.requisito('op.cont.2.3').status === 'NO_CUMPLE' && sinContrato.requisito('op.cont.2.3').evidenced === true && /sin acuerdo ni contrato: sede de respaldo/.test(sinContrato.motivo('op.cont.2.3')),
    sinContrato.motivo('op.cont.2.3')
  );
  comprueba(
    'y los otros cuatro siguen acreditados (el plan está en vigor)',
    ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.4', 'op.cont.2.5'].every(id => sinContrato.requisito(id).status === 'CUMPLE' && sinContrato.requisito(id).attested === true)
  );

  const vencido = evalua(con({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 2026-06-30 | 48 h'] }));

  comprueba(
    'un contrato vencido el 30/06: NO_CUMPLE con la fecha',
    vencido.evidencia('EV-04')?.status === 'NO_CUMPLE' && /venció el 2026-06-30/.test(vencido.deEvidencia('op.cont.2.3', 'EV-04')?.reason || ''),
    vencido.deEvidencia('op.cont.2.3', 'EV-04')?.reason
  );
  comprueba(
    'reversión · el mismo contrato evaluado el 15/06/2026: en vigor',
    evalua(con({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 2026-06-30 | 48 h'] }), 'ALTO', new Date('2026-06-15T12:00:00Z')).evidencia('EV-04')?.status === 'CUMPLE'
  );

  const sinFecha = evalua(con({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 |  | 48 h'] }));

  comprueba(
    'un contrato sin fecha de vigencia: no demostrado (CONFIGURATION), no CUMPLE',
    sinFecha.evidencia('EV-04')?.status === 'NO_EVALUABLE' &&
      sinFecha.evidencia('EV-04')?.gapCause === 'CONFIGURATION' &&
      sinFecha.requisito('op.cont.2.3').status === 'NO_CUMPLE' &&
      sinFecha.requisito('op.cont.2.3').evidenced === false,
    sinFecha.deEvidencia('op.cont.2.3', 'EV-04')?.reason
  );

  const mala = evalua(con({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 30/06/2027 | 48 h'] }));

  comprueba(
    'una vigencia «30/06/2027» no es una fecha: CONFIGURATION, nombrando el medio',
    mala.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /CPD alternativo \(CT-2025-014\): vigencia «30\/06\/2027»/.test(mala.deEvidencia('op.cont.2.3', 'EV-04')?.reason || ''),
    mala.deEvidencia('op.cont.2.3', 'EV-04')?.reason
  );
  comprueba(
    'y la pantalla la rechaza igual',
    (() => {
      const p04 = configuracion(con({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 30/06/2027 | 48 h'] })).parameters.find(p => p.id === 'P-04')!;

      return !validateParameterValue(p04, p04.value).valid;
    })()
  );

  const mixto = evalua(con({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 2026-06-30 | 48 h', 'enlace | Operador Y | CT-9 |  | 4 h'] }));

  comprueba(
    'un contrato vencido y otro sin fecha: manda el incumplimiento, y el otro se dice',
    mixto.evidencia('EV-04')?.status === 'NO_CUMPLE' && /Además: P-04 no permite afirmar/.test(mixto.deEvidencia('op.cont.2.3', 'EV-04')?.reason || ''),
    mixto.deEvidencia('op.cont.2.3', 'EV-04')?.reason
  );

  const sinRuiz = evalua(con({ 'P-05': (BASE['P-05'] as string[]).filter(f => !f.startsWith('J. Ruiz')) }));

  comprueba(
    'el suplente sin formación registrada: op.cont.2.4 NO_CUMPLE, y lo nombra',
    sinRuiz.requisito('op.cont.2.4').status === 'NO_CUMPLE' && /sin formación registrada en P-05: J\. Ruiz/.test(sinRuiz.motivo('op.cont.2.4')),
    sinRuiz.motivo('op.cont.2.4')
  );

  const minusculas = evalua(con({ 'P-05': ['a. martinez | coordinación | 2026-02-10 | 2027-02-10', 'J.  RUIZ | coordinación | 2026-02-10 | 2027-02-10', 'L. Gómez | conmutación | 2025-11-20 | 2026-11-20'] }));

  comprueba(
    'reversión · «a. martinez» y «J.  RUIZ» son las personas de P-03 (sin mayúsculas, tildes ni espacios de más)',
    minusculas.evidencia('EV-06')?.status === 'CUMPLE',
    minusculas.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );
  comprueba(
    'pero nunca por parecido: «Martínez» no es «A. Martínez»',
    evalua(con({ 'P-05': ['Martínez | coordinación | 2026-02-10 | 2027-02-10', 'J. Ruiz | x | 2026-02-10 | 2027-02-10', 'L. Gómez | x | 2025-11-20 | 2026-11-20'] })).evidencia('EV-06')?.status === 'NO_CUMPLE'
  );

  const caducada = evalua(con({ 'P-05': ['A. Martínez | coordinación | 2025-02-10 | 2026-02-10', 'J. Ruiz | x | 2026-02-10 | 2027-02-10', 'L. Gómez | x | 2025-11-20 | 2026-11-20'] }));

  comprueba(
    'una formación vencida el 10/02: NO_CUMPLE con la fecha',
    caducada.evidencia('EV-06')?.status === 'NO_CUMPLE' && /A\. Martínez \(coordinación, venció el 2026-02-10/.test(caducada.deEvidencia('op.cont.2.4', 'EV-06')?.reason || ''),
    caducada.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );

  const renovada = evalua(con({ 'P-05': ['A. Martínez | coordinación | 2025-02-10 | 2026-02-10', 'A. Martínez | coordinación (renovación) | 2026-02-09 | 2027-02-09', 'J. Ruiz | x | 2026-02-10 | 2027-02-10', 'L. Gómez | x | 2025-11-20 | 2026-11-20'] }));

  comprueba('reversión · con la renovación en otra fila, vigente', renovada.evidencia('EV-06')?.status === 'CUMPLE', renovada.deEvidencia('op.cont.2.4', 'EV-06')?.reason);

  const futura = evalua(con({ 'P-05': ['A. Martínez | coordinación | 2026-11-15 | 2027-11-15', 'J. Ruiz | x | 2026-02-10 | 2027-02-10', 'L. Gómez | x | 2025-11-20 | 2026-11-20'] }));

  comprueba(
    'una formación que se recibirá en noviembre no forma hoy',
    futura.evidencia('EV-06')?.status === 'NO_CUMPLE' && /recibida el 2026-11-15, después de la fecha de la evaluación/.test(futura.deEvidencia('op.cont.2.4', 'EV-06')?.reason || ''),
    futura.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );

  const sinP05 = evalua(con({ 'P-05': undefined }));

  comprueba(
    'P-05 vacío: no demostrado (CONFIGURATION), nunca CUMPLE ni un NO_CUMPLE inventado',
    sinP05.evidencia('EV-06')?.status === 'NO_EVALUABLE' && sinP05.evidencia('EV-06')?.gapCause === 'CONFIGURATION' && sinP05.requisito('op.cont.2.4').evidenced === false,
    sinP05.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );
}

// --- 5. las declaraciones propias de 2.1, 2.2 y 2.5 --------------------------

bloque('5. P-03, P-02 y P-06: fila a medias o duración ilegible es CONFIGURATION, con la fila');

{
  const sinActividades = evalua(con({ 'P-03': ['coordinador de crisis | A. Martínez | J. Ruiz | ', 'responsable de sistemas | L. Gómez | - | conmutar'] }));

  comprueba(
    'una función sin actividades: op.cont.2.1 no demostrado (CONFIGURATION), nombrando la fila',
    sinActividades.requisito('op.cont.2.1').status === 'NO_CUMPLE' &&
      sinActividades.requisito('op.cont.2.1').evidenced === false &&
      /fila 1 \(coordinador de crisis\)/.test(sinActividades.motivo('op.cont.2.1')),
    sinActividades.motivo('op.cont.2.1')
  );
  comprueba(
    'y EV-01 sigue CUMPLE: el plan no se pinta «sin medir» por un parámetro que no es suyo',
    sinActividades.evidencia('EV-01')?.status === 'CUMPLE',
    `${sinActividades.evidencia('EV-01')?.status} ${(sinActividades.evidencia('EV-01')?.observations || [])[0]}`
  );

  const rto = evalua(con({ 'P-02': ['sede electrónica | cuanto antes | 1 h | srv-web', 'correo corporativo | 8 h | 30 min | ldap-zimbra'] }));

  comprueba(
    'un RTO «cuanto antes»: op.cont.2.2 no demostrado (CONFIGURATION), nombrando el servicio',
    rto.requisito('op.cont.2.2').evidenced === false && /fila 1 \(sede electrónica\): RTO «cuanto antes»/.test(rto.motivo('op.cont.2.2')),
    rto.motivo('op.cont.2.2')
  );
  comprueba(
    'reversión · «1,5 horas», «2 días» y «45 min» son duraciones',
    evalua(con({ 'P-02': ['sede electrónica | 1,5 horas | 45 min | srv-web', 'correo | 2 días | 4 h | x'] })).requisito('op.cont.2.2').status === 'CUMPLE'
  );
  comprueba('un RTO «4» sin unidad no lo es', evalua(con({ 'P-02': ['sede | 4 | 1 h | x'] })).requisito('op.cont.2.2').evidenced === false);

  const sinP06 = evalua(con({ 'P-06': undefined }));

  comprueba(
    'P-06 vacío: op.cont.2.5 no demostrado (CONFIGURATION)',
    sinP06.requisito('op.cont.2.5').status === 'NO_CUMPLE' && sinP06.requisito('op.cont.2.5').evidenced === false && /P-06 .* está sin configurar/.test(sinP06.motivo('op.cont.2.5')),
    sinP06.motivo('op.cont.2.5')
  );
}

// --- 6. la medida manda sobre la acreditación ---------------------------------

bloque('6. attested: una medida en NO_CUMPLE manda siempre sobre la declaración');

{
  // Una evidencia MEDIDA en contra (como si un agente la hubiera medido): la
  // declaración no la tapa.
  const medidaEnContra = (t: ENSEvidenceResolved[]) =>
    t.map(e => (e.id === 'EV-04' ? { ...e, status: 'NO_CUMPLE' as const, observations: ['EV-04 medida: contrato rescindido.'] } : e));
  const r = evalua(BASE, 'ALTO', AHORA, medidaEnContra);

  comprueba(
    'EV-04 medida en NO_CUMPLE: op.cont.2.3 NO_CUMPLE, sin la marca',
    r.requisito('op.cont.2.3').status === 'NO_CUMPLE' && !r.requisito('op.cont.2.3').attested,
    r.requisito('op.cont.2.3').observations.join(' | ')
  );
  comprueba(
    'y la observación lo explica',
    r.requisito('op.cont.2.3').observations.some(o => /La medida manda sobre la acreditación documental: EV-04 NO_CUMPLE/.test(o))
  );
  comprueba(
    'reversión · los requisitos que no se apoyan en EV-04 siguen acreditados',
    ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.4', 'op.cont.2.5'].every(id => r.requisito(id).status === 'CUMPLE' && r.requisito(id).attested === true)
  );
  comprueba(
    'una acreditación no rellena evidencias: la decisión del requisito acreditada no está en la tabla, solo las de evidencia',
    evalua().decisions.filter(d => d.attested).every(d => BASE_REQ.includes(d.trace.ruleId))
  );
}

// --- 7. sin parámetros: CONFIGURATION, nunca RECOGIDA --------------------------

bloque('7. Sin parámetros: NO_CUMPLE no demostrado por CONFIGURACIÓN, nunca por recogida');

{
  const r = evalua({});

  comprueba(
    'los cinco NO_CUMPLE, no demostrados',
    todos(r, id => r.requisito(id).status === 'NO_CUMPLE' && r.requisito(id).evidenced === false).length === 0,
    BASE_REQ.map(id => `${id}=${r.requisito(id).status}/${r.requisito(id).evidenced}`).join(' ')
  );
  comprueba(
    'EV-01, EV-04 y EV-06 sin medir por CONFIGURATION (P-01, P-04 y P-03 sin configurar)',
    ['EV-01', 'EV-04', 'EV-06'].every(id => r.evidencia(id)?.status === 'NO_EVALUABLE' && r.evidencia(id)?.gapCause === 'CONFIGURATION'),
    ['EV-01', 'EV-04', 'EV-06'].map(id => `${id}=${r.evidencia(id)?.status}/${r.evidencia(id)?.gapCause}`).join(' ')
  );

  const resultado = r.motor();
  const causas = resultado.nonConformities.map(nc => `${nc.id}:${nc.cause}`);

  comprueba('el control no cumple y nada es CUMPLE', resultado.status === 'NO_CUMPLE' && resultado.requirements.every(q => q.status !== 'CUMPLE'), resultado.status);
  comprueba(
    'NC-CFG con P-01 y P-08, los obligatorios',
    resultado.nonConformities.find(nc => nc.id === 'NC-CFG')?.parameterIds.join(',') === 'P-01,P-08',
    resultado.nonConformities.find(nc => nc.id === 'NC-CFG')?.parameterIds.join(',')
  );
  comprueba(
    'todas las no conformidades por CONFIGURATION; ninguna manda a restablecer la recogida',
    resultado.nonConformities.every(nc => nc.cause === 'CONFIGURATION' && !/RECOGIDA/.test(nc.requiredAction)),
    causas.join(' ')
  );

  // La reversión del eje que importa: el MISMO hueco en un control que sí
  // espera hechos se atribuye a la recogida. Es lo que se evita aquí.
  const comoSiEsperaraHechos = evaluateENSControl(
    opCont2CatalogDefinition,
    configuracion({}),
    'ALTO',
    resolveEvidenceForControl('op.cont.2', [], '000', 'ALTO', configuracion({}), AHORA),
    {
      controlId: 'op.cont.2',
      policyId: opCont2PolicyDefinition.id,
      evaluatedAt: AHORA.toISOString(),
      decisions: r.decisions,
      appliedParameters: [],
      runtimeVariables: r.runtimeVariables,
    },
    [],
    true
  );

  comprueba(
    'reversión · si esperara hechos, el mismo vacío saldría como RECOGIDA',
    comoSiEsperaraHechos.nonConformities.some(nc => nc.cause === 'COLLECTION'),
    comoSiEsperaraHechos.nonConformities.map(nc => `${nc.id}:${nc.cause}`).join(' ')
  );

  const sinP08 = evalua(con({ 'P-08': undefined }));

  comprueba(
    'sin P-08: el plan no tiene vigencia que medir (CONFIGURATION)',
    sinP08.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /P-08 .* está sin configurar/.test(sinP08.deEvidencia('op.cont.2.1', 'EV-01')?.reason || ''),
    sinP08.deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );
  comprueba(
    'P-08 = 12,5: tiene que ser un entero de meses (CONFIGURATION)',
    evalua(con({ 'P-08': '12.5' })).evidencia('EV-01')?.gapCause === 'CONFIGURATION'
  );

  const fechaMala = evalua(con({ 'P-01': ['Plan de Continuidad del Servicio | v3.0 | 15/01/2026 | Comité | RS'] }));

  comprueba(
    'una fecha de aprobación «15/01/2026»: CONFIGURATION, nombrando la fila',
    fechaMala.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /fila 1 \(Plan de Continuidad del Servicio\): «15\/01\/2026»/.test(fechaMala.deEvidencia('op.cont.2.1', 'EV-01')?.reason || ''),
    fechaMala.deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );
  comprueba(
    'una versión del plan sin versión: CONFIGURATION',
    evalua(con({ 'P-01': ['Plan de Continuidad del Servicio |  | 2026-01-15 | Comité | RS'] })).evidencia('EV-01')?.gapCause === 'CONFIGURATION'
  );
}

// --- 8. el motor entero: Disponibilidad y fila del manager ----------------------

bloque('8. Motor entero: solo con D en ALTO, en la fila del manager y sin recogida');

{
  const conValores = (global: Record<string, unknown>, valores: Valores): ENSConfigurationVersion => ({
    ...defaultENSConfigurationTemplate,
    global: {
      ...defaultENSConfigurationTemplate.global,
      clientName: 'Cliente de prueba',
      organization: 'Organización de prueba',
      scope: 'Laboratorio',
      ...global,
    } as ENSConfigurationVersion['global'],
    controls: defaultENSConfigurationTemplate.controls.map(control =>
      control.controlId !== 'op.cont.2' ? control : configuracion(valores)
    ),
  });

  const evaluaMotor = (global: Record<string, unknown>, nivel: ENSLevel, valores: Valores = BASE) => {
    ensConfigurationRepository.replaceActive(conValores(global, valores));

    return getENSComplianceResults(nivel, [], undefined, undefined, AHORA).find(r => r.control.id === 'op.cont.2')!;
  };

  const altaConDMedia = evaluaMotor({ ensLevel: 'ALTO', availabilityLevel: 'MEDIO' }, 'ALTO');

  comprueba(
    'categoría ALTA con D en MEDIO: NO_APLICA, y la policy no decide nada',
    altaConDMedia.status === 'NO_APLICA' && altaConDMedia.level === 'MEDIO' && (altaConDMedia.policyRuntime?.decisions || []).length === 0,
    `${altaConDMedia.status} ${altaConDMedia.level} ${(altaConDMedia.policyRuntime?.decisions || []).length}`
  );
  comprueba(
    'y ninguna evidencia ni requisito cuenta',
    altaConDMedia.requirements.every(q => q.status === 'NO_APLICA') && altaConDMedia.evidences.every(e => e.status === 'NO_APLICA')
  );

  const media = evaluaMotor({ ensLevel: 'MEDIO' }, 'MEDIO');

  comprueba('categoría MEDIA sin D: NO_APLICA (el objetivo del responsable)', media.status === 'NO_APLICA', media.status);
  comprueba(
    'informe en MEDIA: todo NO_APLICA y dice por qué',
    buildOpCont2ReportModel(media).fields.every(f => f.status === 'NO_APLICA') && /solo se exige con nivel ALTO de Disponibilidad/.test(buildOpCont2ReportModel(media).fields[1].value)
  );

  const mediaConDAlta = evaluaMotor({ ensLevel: 'MEDIO', availabilityLevel: 'ALTO' }, 'MEDIO');

  comprueba(
    'reversión · categoría MEDIA con D en ALTO: se exige, y con todo en vigor CUMPLE acreditado',
    mediaConDAlta.status === 'CUMPLE' && mediaConDAlta.level === 'ALTO' && mediaConDAlta.requirements.filter(q => BASE_REQ.includes(q.id)).every(q => q.attested),
    `${mediaConDAlta.status} ${mediaConDAlta.level}`
  );

  const altaVacia = evaluaMotor({ ensLevel: 'ALTO' }, 'ALTO', {});

  comprueba(
    'categoría ALTA sin parámetros, por el motor: todo por CONFIGURATION, nada por recogida',
    altaVacia.status === 'NO_CUMPLE' &&
      altaVacia.nonConformities.length > 0 &&
      altaVacia.nonConformities.every(nc => nc.cause === 'CONFIGURATION') &&
      altaVacia.evidences
        .filter(e => e.status === 'NO_EVALUABLE')
        .every(e => e.observations.some(o => /está sin configurar/.test(o)) && !e.observations.some(o => /ningún evento|recogida|RECOGIDA/.test(o))),
    altaVacia.nonConformities.map(nc => `${nc.id}:${nc.cause}`).join(' ') +
      ' | ' +
      altaVacia.evidences.filter(e => e.status === 'NO_EVALUABLE').map(e => `${e.id}: ${e.observations.join(' / ')}`).join(' || ')
  );

  // La fila del manager, con agentes en el alcance y sin ningún hecho de
  // op.cont.2: se evalúa allí y solo allí, sin recolector que pueda estar parado.
  ensConfigurationRepository.replaceActive(conValores({ ensLevel: 'ALTO' }, BASE));

  const alcance = [
    { id: '001', name: 'wazuh-real', groups: ['ens'] },
    { id: '000', name: 'Wazuh-4', groups: [], isManager: true },
  ];
  const estado = getENSComplianceState('ALTO', [], undefined, alcance, AHORA);
  const filaManager = estado.agents.find(a => a.agentId === '000');
  const filaAgente = estado.agents.find(a => a.agentId === '001');

  comprueba('se evalúa en la fila del manager', Boolean(filaManager?.results.some(x => x.control.id === 'op.cont.2')));
  comprueba('y no en la de un agente', Boolean(filaAgente) && !filaAgente!.results.some(x => x.control.id === 'op.cont.2'));
  comprueba(
    'el consolidado CUMPLE acreditado sobre la fila del manager',
    estado.results.find(x => x.control.id === 'op.cont.2')?.status === 'CUMPLE' &&
      JSON.stringify(estado.results.find(x => x.control.id === 'op.cont.2')?.consolidatedAgents?.map(a => a.agentId)) === '["000"]',
    estado.results.find(x => x.control.id === 'op.cont.2')?.status
  );

  ensConfigurationRepository.reset();
}

// --- salida ----------------------------------------------------------------

console.log(`\n${fallos.length ? `${fallos.length} FALLAN` : 'todo OK'}`);

if (fallos.length) {
  process.exit(1);
}
