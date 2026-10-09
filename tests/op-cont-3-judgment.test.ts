/**
 * op.cont.3 · el juicio de las pruebas periódicas del plan de continuidad.
 *
 *     npx tsx tests/op-cont-3-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. op.cont.3 se rige por la Disponibilidad (solo D en ALTO) y
 * se mide entero en el manager (agent.id=000): dos registros TSV de la
 * organización (pruebas y deficiencias) y, para cada prueba, lo que el manager
 * vio en su ventana (caídas y arranques de los agentes, restauraciones de
 * mp.info.6, cambios de FIM posteriores). Cada caso mueve UN eje y lleva al
 * lado la REVERSIÓN: el MISMO hecho con otro parámetro, u otro `now`, cambia
 * el veredicto.
 *
 * Los hechos siguen el contrato de eventos de op.cont.3 (el que documentará el
 * runbook `linux/op.cont.3`), con los agentes de wazuh4. El recolector todavía
 * no existe: cuando exista, se sustituyen por su salida real en modo --prueba.
 * Pasan por el normalizador real como alertas de alerts.json.
 */
import { opCont3PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-cont-3.policy';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { opCont3CatalogDefinition } from '../public/ens/catalog/op-cont-3';
import { opCont3Configuration } from '../public/ens/configuration/data/op-cont-3-parameters';
import { normalizeWazuhAlerts } from '../public/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../public/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../public/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../public/ens/core/evaluation/evaluation-engine';
import { parseRequirementAttestations } from '../public/ens/configuration/services/attestation-service';
import { validateParameterValue } from '../public/ens/configuration/services/parameter-value-validator';
import { resolveControlLevel } from '../public/ens/core/control-level';
import { buildOpCont3ReportModel } from '../public/ens/reports/op-cont-3-report-model';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../public/ens/configuration/types';
import type { ENSNormalizedEvent } from '../public/ens/core/data-source/types';

declare const process: { exit(code: number): void };

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

// --- los hechos ------------------------------------------------------------

type Linea = Record<string, unknown>;

// La pasada del recolector del manager (cada 6 h): la de las 12:05.
const PASADA = '2026-10-09T12:05';
const AHORA = new Date('2026-10-09T12:30:00Z');

const REQ = 'op.cont.3.1';
const comun = { requisito: REQ, plano: 'central' };

const lectura = (ts: string, evento: string, evidencia: string, fichero: string, filas: number, extra: Linea = {}): Linea => ({
  ts, event: evento, evidence_id: evidencia, ...comun,
  fichero, presente: 'si', legible: 'si', cabecera: 'ok', filas, filas_invalidas: 0, lineas_invalidas: '-', ...extra,
});

const FICHERO_PRUEBAS = '/etc/ensfacil/continuity-test-register.tsv';
const FICHERO_DEFICIENCIAS = '/etc/ensfacil/continuity-deficiency-register.tsv';

const prueba = (ts: string, linea: number, inicio: string, fin: string, tipo: string, escenario: string, sistemas: string, resultado: string, deficiencias: number, extra: Linea = {}): Linea => ({
  ts, event: 'continuity_test_recorded', evidence_id: 'EV-01', ...comun,
  linea, inicio, fin, tipo, escenario, sistemas, participantes: 'RSI, Sistemas', resultado, deficiencias,
  referencia: `https://intranet.ejemplo/continuidad/prueba-${linea}.pdf`,
  ...(sistemas === '-' || !['parcial', 'simulacro'].includes(tipo)
    ? { medicion: 'no_aplica', medido_desde: '-', medido_hasta: '-', dias_sin_alertas: '-' }
    : { medicion: 'completa', medido_desde: inicio, medido_hasta: new Date(Date.parse(fin) + 24 * 3600 * 1000).toISOString().replace('.000Z', 'Z'), dias_sin_alertas: '-' }),
  ...extra,
});

const deficiencia = (ts: string, linea: number, id: string, pruebaInicio: string, plazo: string, situacion: string, cierre: string, version: string, extra: Linea = {}): Linea => ({
  ts, event: 'continuity_deficiency_recorded', evidence_id: 'EV-05', ...comun,
  linea, deficiencia_id: id, prueba_inicio: pruebaInicio, descripcion: `deficiencia ${id}`, responsable: 'Responsable de Sistemas',
  plazo, situacion, cierre, version_plan: version, referencia: '-', ...extra,
});

const disponibilidad = (ts: string, pruebaInicio: string, pruebaFin: string, sistema: string, id: string, agente: string, eventos: string, extra: Linea = {}): Linea => ({
  ts, event: 'availability_event_observed', evidence_id: 'EV-03', ...comun,
  prueba_inicio: pruebaInicio, prueba_fin: pruebaFin, sistema, agente_id: id, agente,
  eventos, eventos_total: eventos === '-' ? 0 : eventos.split(',').length, ...extra,
});

const latido = (ts: string, cubiertas = 'EV-01,EV-03,EV-05,EV-06,EV-08'): Linea => ({
  ts, event: 'collector_run', resultado: 'completada', evidencias_cubiertas: cubiertas, tipo_servidor: 'manager', emisor: 'recolector',
});

// El simulacro de pérdida de CPD del 17/09 en wazuh4: wazuh-real (024) parado
// y arrancado en el CPD alternativo; el LDAP (028) desconectado una hora larga
// y de vuelta sin reiniciar el agente (lo prueba su primera alerta).
const SIMULACRO = '2026-09-17T20:00:00Z';
const SIMULACRO_FIN = '2026-09-17T23:30:00Z';
const ESCRITORIO = '2026-06-18T09:00:00Z';
const REVISION = '2026-03-12T00:00:00Z';

const pasada = (ts = PASADA): Linea[] => {
  const t = (s: number) => `${ts}:${String(s).padStart(2, '0')}Z`;

  return [
    lectura(t(0), 'continuity_test_register_read', 'EV-01', FICHERO_PRUEBAS, 3),
    prueba(t(1), 2, REVISION, '2026-03-12T23:59:59Z', 'revision_documental', 'pérdida total de CPD', '-', 'satisfactorio', 1),
    prueba(t(1), 3, ESCRITORIO, '2026-06-18T12:00:00Z', 'escritorio', 'ciberincidente con cifrado de datos', '-', 'parcial', 2),
    prueba(t(1), 4, SIMULACRO, SIMULACRO_FIN, 'simulacro', 'Pérdida total de CPD', 'wazuh-real,28', 'satisfactorio', 1),
    lectura(t(2), 'continuity_deficiency_register_read', 'EV-05', FICHERO_DEFICIENCIAS, 4),
    deficiencia(t(3), 2, 'DEF-2026-01', REVISION, '2026-04-30', 'cerrada', '2026-04-20', '2.1'),
    deficiencia(t(3), 3, 'DEF-2026-02', ESCRITORIO, '2026-08-31', 'cerrada', '2026-08-25', '2.2'),
    deficiencia(t(3), 4, 'DEF-2026-03', ESCRITORIO, '2026-08-31', 'cerrada', '2026-08-28', '-'),
    deficiencia(t(3), 5, 'DEF-2026-04', SIMULACRO, '2026-11-30', 'abierta', '-', '-'),
    disponibilidad(t(4), SIMULACRO, SIMULACRO_FIN, 'wazuh-real', '024', 'wazuh-real', 'parada@2026-09-17T20:05:00Z,arranque@2026-09-17T22:41:00Z'),
    disponibilidad(t(4), SIMULACRO, SIMULACRO_FIN, '28', '028', 'ldap-zimbra', 'desconexion@2026-09-17T20:10:00Z,actividad@2026-09-17T21:20:00Z'),
    { ts: t(5), event: 'backup_restore_observed', evidence_id: 'EV-08', ...comun,
      prueba_inicio: SIMULACRO, agente_id: '026', agente: 'pbs-01', instante: '2026-09-17T21:00:00Z', resultado: 'ok', coincide: 'si', backup_id: 'host/wazuh-real' },
    { ts: t(6), event: 'post_test_change_observed', evidence_id: 'EV-06', ...comun,
      prueba_inicio: SIMULACRO, sistema: 'wazuh-real', agente_id: '024', agente: 'wazuh-real', cambios: 3, rutas: '/etc/hosts,/etc/fstab',
      primera: '2026-09-18T08:00:00Z', ultima: '2026-09-18T09:10:00Z' },
    latido(t(40)),
  ];
};

let contador = 0;

const REGLA: Record<string, string> = {
  continuity_test_register_read: '111701', continuity_test_recorded: '111702',
  continuity_deficiency_register_read: '111703', continuity_deficiency_recorded: '111704',
  availability_event_observed: '111705', backup_restore_observed: '111706', post_test_change_observed: '111707',
  evidence_state: '111750', collector_run: '111797',
};

const MANAGER = { id: '000', name: 'Wazuh-4' };

// Una línea del NDJSON del recolector tal como la deja el manager en el índice.
const alerta = (linea: Linea) => {
  contador += 1;
  const { ts, host: _host, ...data } = linea as Linea & { ts: string };

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': ts,
      agent: MANAGER,
      rule: { id: REGLA[String(data.event)] || '111700', description: 'op.cont.3' },
      location: '/var/log/ensfacil/op_cont_3.json',
      data: Object.fromEntries(Object.entries({ ensfacil: 'op.cont.3', ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const eventos = (lineas: Linea[], cambia: (l: Linea) => Linea | undefined = l => l): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lineas
      .map(l => cambia({ ...l }))
      .filter((l): l is Linea => Boolean(l))
      .map(alerta)
  );

const hoy = (cambia?: (l: Linea) => Linea | undefined, extra: Linea[] = []) => eventos([...pasada(), ...extra], cambia);

// Cambia una fila concreta: de un tipo, y que cumpla `donde`.
const fila = (evento: string, donde: (l: Linea) => boolean, cambio: Linea) => (l: Linea): Linea =>
  l.event === evento && donde(l) ? { ...l, ...cambio } : l;

const simulacro = (l: Linea) => l.inicio === SIMULACRO || l.prueba_inicio === SIMULACRO;

// --- la configuración --------------------------------------------------------

type Valores = Record<string, string[] | string | undefined>;

const configuracion = (valores: Valores): ENSControlConfiguration => ({
  ...opCont3Configuration,
  parameters: opCont3Configuration.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    // Un parámetro vacío es la clave `value` AUSENTE, nunca `null`.
    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

const REGISTRO_PRUEBAS = 'Registro ENSFácil (/etc/ensfacil/continuity-test-register.tsv)';
const REGISTRO_DEFICIENCIAS = 'Registro ENSFácil (/etc/ensfacil/continuity-deficiency-register.tsv)';

// Lo que el responsable declararía (spec §6.5): pruebas anuales, tres
// modalidades, dos escenarios del análisis de impacto, los dos registros de
// ENSFácil y un RTO general de 4 h, más estricto para el LDAP.
const BASE: Valores = {
  'P-01': '12',
  'P-02': ['revision_documental | revisión del plan | anual', 'escritorio | ejercicio de mesa | 12', 'simulacro | conmutación real al CPD alternativo | 12'],
  'P-03': ['pérdida total de CPD | todos', 'ciberincidente con cifrado de datos | correo, LDAP'],
  'P-04': REGISTRO_PRUEBAS,
  'P-05': REGISTRO_DEFICIENCIAS,
  'P-06': ['17/09/2026 | 20:00 | 23:30 | wazuh-real, 028'],
  'P-07': ['* | 4 | 0', '028 | 2 | 15'],
};

const SIN_PARAMETROS: Valores = {};

const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Valores = BASE,
  nivel: ENSLevel = 'ALTO',
  ahora: Date = AHORA
) => {
  const cfg = configuracion(valores);
  const delControl = keepLatestRunStateFacts('op.cont.3', evs, ahora);
  const evidencias = resolveEvidenceForControl('op.cont.3', delControl, '000', nivel, cfg, ahora);
  const contexto = buildPolicyContext(opCont3CatalogDefinition, cfg, nivel, delControl, evidencias, ahora);
  const { decisions, runtimeVariables } = opCont3PolicyDefinition.evaluator!(contexto);
  const tabla = applyPolicyDecisionsToEvidences(evidencias, decisions, opCont3CatalogDefinition.requirements);
  const atestaciones = parseRequirementAttestations(cfg);
  const requisito = () =>
    evaluateRequirement(
      opCont3CatalogDefinition.requirements[0],
      nivel,
      tabla,
      false,
      decisions,
      'ACTIVE',
      atestaciones.get(REQ)
    );
  const evidencia = (id: string) => tabla.find(e => e.id === id);
  const motivo = () => decisions.find(d => d.trace.ruleId === REQ)?.reason || '';
  const de = (ev: string) => decisions.find(d => d.trace.ruleId === `${REQ}/${ev}`)?.reason || '';
  const motor = () =>
    evaluateENSControl(
      opCont3CatalogDefinition,
      cfg,
      nivel,
      evidencias,
      {
        controlId: 'op.cont.3',
        policyId: opCont3PolicyDefinition.id,
        evaluatedAt: ahora.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      delControl
    );

  return { decisions, runtimeVariables, requisito, evidencia, motivo, de, motor };
};

const estado = (r: ReturnType<typeof evalua>, id: string) => `${r.evidencia(id)?.status} ${r.evidencia(id)?.gapCause || ''}`.trim();

// --- 1. catálogo ------------------------------------------------------------

bloque('1. Catálogo: Disponibilidad en ALTO, plano del manager, un requisito');

{
  comprueba('op.cont.3 se rige por la Disponibilidad', opCont3CatalogDefinition.levelDimension === 'D');
  comprueba('se mide solo en el manager', JSON.stringify(opCont3CatalogDefinition.measurementPlanes) === '["manager"]');
  comprueba('un requisito, solo en ALTO', opCont3CatalogDefinition.requirements.length === 1 && opCont3CatalogDefinition.requirements[0].applicability.levels.join(',') === 'ALTO');
  comprueba('el control está ACTIVE', opCont3CatalogDefinition.status === 'ACTIVE', opCont3CatalogDefinition.status);
  comprueba(
    'el requisito se decide con EV-01, EV-02, EV-04 y EV-05 (spec §6.3)',
    opCont3CatalogDefinition.requirements[0].evidenceIds.join(',') === 'EV-01,EV-02,EV-04,EV-05'
  );
  comprueba(
    'la policy declara los mismos niveles y evidencias que el catálogo',
    opCont3PolicyDefinition.requirements.every(r => {
      const c = opCont3CatalogDefinition.requirements.find(q => q.id === r.requirementId)!;

      return r.levels.join(',') === c.applicability.levels.join(',') && r.evidenceIds.join(',') === c.evidenceIds.join(',');
    })
  );
  comprueba(
    'todos los hechos con veredicto o medida son de estado (también las caídas y restauraciones de cada prueba)',
    ['continuity_test_register_read', 'continuity_test_recorded', 'continuity_deficiency_register_read', 'continuity_deficiency_recorded', 'availability_event_observed', 'backup_restore_observed', 'post_test_change_observed'].every(t => getStateFactEventTypes('op.cont.3').has(t))
  );
  comprueba(
    'D en MEDIO con categoría ALTA: el control se evalúa en MEDIO',
    resolveControlLevel(opCont3CatalogDefinition, 'ALTO', { availabilityLevel: 'MEDIO' }) === 'MEDIO'
  );
  comprueba(
    'ningún hecho del contrato se llama como un fallo ni lleva un campo `estado`',
    pasada().every(l => !/error|failed|missing|unauthorized/.test(String(l.event)) && !('estado' in l) && !('status' in l))
  );
}

// --- 2. verde ----------------------------------------------------------------

bloque('2. Verde: tres pruebas al día, el simulacro medido dentro del RTO, deficiencias en seguimiento');

{
  const r = evalua(hoy());

  comprueba('op.cont.3.1 CUMPLE en ALTO', r.requisito().status === 'CUMPLE' && r.requisito().evidenced === true, r.motivo());
  ['EV-01', 'EV-02', 'EV-04', 'EV-05'].forEach(id => comprueba(`${id} CUMPLE`, r.evidencia(id)?.status === 'CUMPLE', `${estado(r, id)} ${r.de(id)}`));
  comprueba('EV-01 cuenta las pruebas por tipo', /3 prueba\(s\) registrada\(s\) \(1 revision_documental, 1 escritorio, 0 parcial, 1 simulacro\)/.test(r.de('EV-01')), r.de('EV-01'));
  comprueba('EV-02 da el próximo vencimiento (la revisión documental anual, el 12/03/2027)', /próximo vencimiento es el 2027-03-12/.test(r.de('EV-02')), r.de('EV-02'));
  comprueba(
    'EV-04: wazuh-real 2 h 36 min (RTO 4 h) y el LDAP, declarado «28», 1 h 10 min (su RTO de 2 h + 15 min)',
    /wazuh-real \(024\): 1 caída\(s\), la más larga 2 h 36 min, restablecido \(RTO 4 h\)/.test(r.de('EV-04')) && /28 \(ldap-zimbra, 028\): 1 caída\(s\), la más larga 1 h 10 min, restablecido \(RTO 2 h \+ 15 min\)/.test(r.de('EV-04')),
    r.de('EV-04')
  );
  ['EV-03', 'EV-06', 'EV-07', 'EV-08'].forEach(id =>
    comprueba(`${id} NO_APLICA como dato del informe, no en gris`, r.evidencia(id)?.status === 'NO_APLICA' && /Dato del informe/.test(r.de(id)), `${estado(r, id)} ${r.de(id)}`)
  );
  comprueba('EV-07 señala la deficiencia cerrada sin versión del plan', /corrección posiblemente nominal: DEF-2026-03/.test(r.de('EV-07')) && /DEF-2026-01 → versión 2\.1/.test(r.de('EV-07')), r.de('EV-07'));
  comprueba('EV-08 enseña la restauración de la ventana', /pbs-01 \(026\) 2026-09-17T21:00:00Z: ok/.test(r.de('EV-08')), r.de('EV-08'));
  comprueba('EV-06 enseña los cambios de FIM posteriores y las deficiencias registradas de esa prueba', /wazuh-real \(024\) 3 cambio\(s\)/.test(r.de('EV-06')) && /1 deficiencia\(s\) registradas/.test(r.de('EV-06')), r.de('EV-06'));

  const informe = buildOpCont3ReportModel(r.motor());
  comprueba('el informe enseña el requisito con su veredicto', informe.fields[0].details.some(d => /op\.cont\.3\.1 .*: CUMPLE/.test(d)), informe.fields[0].details.join(' | '));
  const medicion = informe.fields.find(f => f.id === 'op.cont.3.campo5')!;
  comprueba('la medición de la prueba lleva el estado de EV-04, al que alimenta, y su cronología', medicion.status === 'CUMPLE' && medicion.details.some(d => /2 h 36 min/.test(d)), `${medicion.status} ${medicion.details.join(' | ')}`);
}

// --- 3. MEDIA ------------------------------------------------------------------

bloque('3. En MEDIA (sin ninguna dimensión en ALTO) todo es NO_APLICA');

{
  const r = evalua(hoy(), BASE, 'MEDIO');

  comprueba('op.cont.3.1 NO_APLICA', r.requisito().status === 'NO_APLICA', r.requisito().status);
  comprueba('la policy no emite ninguna decisión', r.decisions.length === 0, r.decisions.length);
  comprueba('y ninguna evidencia sale en gris', ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'].every(id => r.evidencia(id)?.status === 'NO_APLICA'), ['EV-01', 'EV-05'].map(id => estado(r, id)).join(', '));
  comprueba('ni siquiera sin registros ni parámetros', evalua([], SIN_PARAMETROS, 'MEDIO').requisito().status === 'NO_APLICA');
  comprueba('el informe sale NO_APLICA por campo', buildOpCont3ReportModel(r.motor()).fields.slice(1, 10).every(f => f.status === 'NO_APLICA'));
}

// --- 4. primera obligación: probar -----------------------------------------------

bloque('4. Rojo, primera obligación: periodicidad, escenarios y alcance, cada uno con su reversión');

{
  const p01 = evalua(hoy(), { ...BASE, 'P-01': '3' });
  comprueba(
    'P-01 = 3: el escenario de ciberincidente se probó el 18/06, hace 3 meses y 3 semanas → NO_CUMPLE',
    p01.evidencia('EV-02')?.status === 'NO_CUMPLE' && /escenario «ciberincidente con cifrado de datos»: la última es del 2026-06-18, hace 3 meses \(P-01 = 3\)/.test(p01.de('EV-02')),
    p01.de('EV-02')
  );
  comprueba('y el requisito NO_CUMPLE medido', p01.requisito().status === 'NO_CUMPLE' && p01.requisito().evidenced === true);
  comprueba('REVERSIÓN: los mismos hechos con P-01 = 12 → EV-02 CUMPLE', evalua(hoy(), { ...BASE, 'P-01': '12' }).evidencia('EV-02')?.status === 'CUMPLE');

  const nunca = evalua(hoy(), { ...BASE, 'P-03': [...(BASE['P-03'] as string[]), 'caída de proveedor crítico | ERP'] });
  comprueba('un escenario de P-03 nunca probado → NO_CUMPLE nombrándolo', nunca.evidencia('EV-02')?.status === 'NO_CUMPLE' && /escenario «caída de proveedor crítico»: nunca se ha probado/.test(nunca.de('EV-02')), nunca.de('EV-02'));
  comprueba(
    'los escenarios se comparan sin mayúsculas ni tildes («PERDIDA TOTAL DE CPD»)',
    evalua(hoy(), { ...BASE, 'P-03': ['PERDIDA TOTAL DE CPD | todos'] }).evidencia('EV-02')?.status === 'CUMPLE'
  );

  const porTipo = evalua(hoy(), { ...BASE, 'P-02': ['escritorio | ejercicio de mesa | trimestral', 'simulacro | conmutación | 12'] });
  comprueba('P-02 pide escritorio trimestral y el último es del 18/06 → NO_CUMPLE por tipo', porTipo.evidencia('EV-02')?.status === 'NO_CUMPLE' && /tipo escritorio: la última es del 2026-06-18.*P-02 = 3/.test(porTipo.de('EV-02')), porTipo.de('EV-02'));
  comprueba('REVERSIÓN: semestral → CUMPLE', evalua(hoy(), { ...BASE, 'P-02': ['escritorio | ejercicio de mesa | semestral', 'simulacro | conmutación | 12'] }).evidencia('EV-02')?.status === 'CUMPLE');
  comprueba(
    'un tipo de P-02 sin periodicidad propia usa P-01',
    evalua(hoy(), { ...BASE, 'P-01': '3', 'P-03': ['pérdida total de CPD | todos'], 'P-02': ['escritorio | x | ', 'simulacro | x | 12'] }).evidencia('EV-02')?.status === 'NO_CUMPLE'
  );

  const soloMesa = hoy(fila('continuity_test_recorded', simulacro, { tipo: 'escritorio', medicion: 'no_aplica' }));
  const mesa = evalua(soloMesa);
  comprueba(
    'solo revisiones documentales y de escritorio → EV-01 NO_CUMPLE (ninguna ejercita los medios alternativos)',
    mesa.evidencia('EV-01')?.status === 'NO_CUMPLE' && /solo revisiones documentales o de escritorio/.test(mesa.de('EV-01')),
    mesa.de('EV-01')
  );
  comprueba('y EV-02: el simulacro previsto en P-02 nunca se ha hecho', mesa.evidencia('EV-02')?.status === 'NO_CUMPLE' && /tipo simulacro: nunca se ha probado/.test(mesa.de('EV-02')), mesa.de('EV-02'));
  comprueba(
    'REVERSIÓN: la misma fila como prueba parcial → EV-01 CUMPLE',
    evalua(hoy(fila('continuity_test_recorded', simulacro, { tipo: 'parcial' })), { ...BASE, 'P-02': [...(BASE['P-02'] as string[]).filter(f => !f.startsWith('simulacro')), 'parcial | conmutación de componentes | 12'] }).evidencia('EV-01')?.status === 'CUMPLE'
  );

  const sinReales = evalua(hoy(), { ...BASE, 'P-02': ['revision_documental | x | 12', 'escritorio | x | 12'] });
  comprueba('P-02 no prevé ninguna modalidad que ejercite los medios alternativos → EV-01 NO_CUMPLE', sinReales.evidencia('EV-01')?.status === 'NO_CUMPLE' && /ninguna modalidad \(parcial o simulacro\)/.test(sinReales.de('EV-01')), sinReales.de('EV-01'));
}

// --- 5. el resultado declarado frente a lo medido ---------------------------------

bloque('5. Rojo, EV-04: declarada satisfactoria y medida fuera de objetivo');

{
  const lento = hoy(fila('availability_event_observed', l => l.agente_id === '024', { eventos: 'parada@2026-09-17T20:05:00Z,arranque@2026-09-18T00:52:00Z' }));
  const r = evalua(lento);
  comprueba(
    'wazuh-real 4 h 47 min sin servicio con RTO 4 h y la prueba declarada satisfactoria → NO_CUMPLE (discrepancia)',
    r.evidencia('EV-04')?.status === 'NO_CUMPLE' && /declarada satisfactorio, y la medida la desmiente: wazuh-real \(024\) estuvo 4 h 47 min sin servicio, por encima de su RTO 4 h/.test(r.de('EV-04')),
    r.de('EV-04')
  );
  comprueba('y el requisito NO_CUMPLE medido', r.requisito().status === 'NO_CUMPLE' && r.requisito().evidenced === true);
  comprueba('REVERSIÓN: P-07 con un RTO general de 5 h → CUMPLE', evalua(lento, { ...BASE, 'P-07': ['* | 5 | 0', '028 | 2 | 15'] }).evidencia('EV-04')?.status === 'CUMPLE');
  const lentaYParcial = (l: Linea): Linea =>
    fila('continuity_test_recorded', simulacro, { resultado: 'parcial' })(
      fila('availability_event_observed', x => x.agente_id === '024', { eventos: 'parada@2026-09-17T20:05:00Z,arranque@2026-09-18T00:52:00Z' })(l)
    );
  const honesta = evalua(hoy(lentaYParcial));
  comprueba(
    'REVERSIÓN: la misma medida con la prueba declarada «parcial» → coherente, CUMPLE (la corrección la juzga EV-05)',
    honesta.evidencia('EV-04')?.status === 'CUMPLE' && /coherente con lo declarado/.test(honesta.de('EV-04')),
    `${estado(honesta, 'EV-04')} ${honesta.de('EV-04')}`
  );

  const sinVolver = evalua(hoy(fila('availability_event_observed', l => l.agente_id === '024', { eventos: 'parada@2026-09-17T20:05:00Z', eventos_total: 1 })));
  comprueba(
    'wazuh-real parado y sin volver en la ventana ni en las 24 h siguientes → supera su RTO: NO_CUMPLE',
    sinVolver.evidencia('EV-04')?.status === 'NO_CUMPLE' && /no se restableció en la ventana medida/.test(sinVolver.de('EV-04')),
    sinVolver.de('EV-04')
  );

  const restauracion = (resultado: string, coincide: string) =>
    hoy(fila('backup_restore_observed', () => true, { resultado, coincide }));
  comprueba(
    'la restauración de la ventana falló y la prueba se declaró satisfactoria → NO_CUMPLE',
    evalua(restauracion('error', 'no')).evidencia('EV-04')?.status === 'NO_CUMPLE' && /falló la restauración de copias: pbs-01 \(026\)/.test(evalua(restauracion('error', 'no')).de('EV-04')),
    evalua(restauracion('error', 'no')).de('EV-04')
  );
  comprueba('una restauración «ok» cuyo contenido no coincide también falla', evalua(restauracion('ok', 'no')).evidencia('EV-04')?.status === 'NO_CUMPLE');
  comprueba('REVERSIÓN: restauración ok y coincide → CUMPLE', evalua(restauracion('ok', 'si')).evidencia('EV-04')?.status === 'CUMPLE');

  // Una caída que EMPIEZA después de la ventana no es de la prueba.
  const despues = evalua(hoy(fila('availability_event_observed', l => l.agente_id === '024', {
    eventos: 'parada@2026-09-17T20:05:00Z,arranque@2026-09-17T22:41:00Z,desconexion@2026-09-18T02:00:00Z,actividad@2026-09-18T09:00:00Z',
  })));
  comprueba('una desconexión de 7 h que empieza tras la ventana no cuenta para la prueba → CUMPLE', despues.evidencia('EV-04')?.status === 'CUMPLE', despues.de('EV-04'));
}

// --- 6. segunda obligación: corregir ------------------------------------------------

bloque('6. Rojo, segunda obligación: deficiencias fuera de plazo, vivas en la prueba siguiente o sin seguimiento');

{
  const vencida = evalua(hoy(fila('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-04', { plazo: '2026-10-01' })));
  comprueba(
    'DEF-2026-04 abierta con plazo 01/10 → EV-05 NO_CUMPLE nombrándola',
    vencida.evidencia('EV-05')?.status === 'NO_CUMPLE' && /fuera de plazo a 2026-10-09: DEF-2026-04 \(prueba del 2026-09-17, plazo 2026-10-01/.test(vencida.de('EV-05')),
    vencida.de('EV-05')
  );
  comprueba('y el requisito NO_CUMPLE: probar sin corregir no cumple', vencida.requisito().status === 'NO_CUMPLE' && vencida.requisito().evidenced === true);
  comprueba('REVERSIÓN: el mismo hecho con plazo 30/11 → CUMPLE', evalua(hoy(fila('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-04', { plazo: '2026-11-30' }))).evidencia('EV-05')?.status === 'CUMPLE');
  comprueba(
    'el plazo vence al ACABAR su día: plazo 09/10 leído el 09/10 a las 12:05 → aún en plazo',
    evalua(hoy(fila('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-04', { plazo: '2026-10-09' }))).evidencia('EV-05')?.status === 'CUMPLE'
  );

  const viva = evalua(hoy(fila('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-03', { situacion: 'abierta', cierre: '-', plazo: '2026-12-31' })));
  comprueba(
    'DEF-2026-03 de la prueba de junio, en plazo, pero abierta después del simulacro de septiembre → NO_CUMPLE',
    viva.evidencia('EV-05')?.status === 'NO_CUMPLE' && /siguen abiertas después de la prueba siguiente: DEF-2026-03 \(de la prueba del 2026-06-18; la siguiente fue simulacro del 2026-09-17/.test(viva.de('EV-05')),
    viva.de('EV-05')
  );

  const declaradas = evalua(hoy(fila('continuity_test_recorded', simulacro, { deficiencias: 3 })));
  comprueba(
    'el simulacro declara 3 deficiencias y el registro solo sigue 1 → NO_CUMPLE',
    declaradas.evidencia('EV-05')?.status === 'NO_CUMPLE' && /declara 3, en seguimiento 1/.test(declaradas.de('EV-05')),
    declaradas.de('EV-05')
  );
  comprueba('REVERSIÓN: declara 1 → CUMPLE', evalua(hoy(fila('continuity_test_recorded', simulacro, { deficiencias: 1 }))).evidencia('EV-05')?.status === 'CUMPLE');

  const huerfana = evalua(hoy(undefined, [deficiencia(`${PASADA}:03Z`, 6, 'DEF-2026-05', '2026-07-01T00:00:00Z', '2026-08-31', 'cerrada', '2026-08-01', '2.2')]));
  comprueba(
    'una deficiencia cuyo prueba_inicio no es ninguna prueba del registro → NO_EVALUABLE por CONFIGURATION, nombrándola',
    huerfana.evidencia('EV-05')?.status === 'NO_EVALUABLE' && huerfana.evidencia('EV-05')?.gapCause === 'CONFIGURATION' && /DEF-2026-05 \(2026-07-01T00:00:00Z, línea 6\)/.test(huerfana.de('EV-05')),
    `${estado(huerfana, 'EV-05')} ${huerfana.de('EV-05')}`
  );
}

// --- 7. sin registros -----------------------------------------------------------

bloque('7. Sin registro: NO_EVALUABLE por CONFIGURATION; registro vacío: se juzga');

{
  const sinRegistro = evalua(hoy(l => {
    if (l.event === 'continuity_test_recorded') {
      return undefined;
    }

    return l.event === 'continuity_test_register_read' ? { ...l, presente: 'no', legible: '-', cabecera: '-', filas: 0 } : l;
  }));
  ['EV-01', 'EV-02', 'EV-04'].forEach(id =>
    comprueba(`sin registro de pruebas, ${id} NO_EVALUABLE por CONFIGURATION`, sinRegistro.evidencia(id)?.status === 'NO_EVALUABLE' && sinRegistro.evidencia(id)?.gapCause === 'CONFIGURATION', estado(sinRegistro, id))
  );
  comprueba('y el requisito no demostrado, nunca CUMPLE', sinRegistro.requisito().status === 'NO_CUMPLE' && sinRegistro.requisito().evidenced === false, `${sinRegistro.requisito().status} ${sinRegistro.requisito().evidenced}`);
  comprueba('el motivo dice que un registro ausente no es un registro vacío', /un registro ausente no es un registro vacío/.test(sinRegistro.de('EV-01')), sinRegistro.de('EV-01'));

  const vacio = evalua(hoy(l => {
    if (l.event === 'continuity_test_recorded' || l.event === 'availability_event_observed') {
      return undefined;
    }

    return l.event === 'continuity_test_register_read' ? { ...l, filas: 0 } : l;
  }));
  comprueba('registro de pruebas vacío → EV-01 NO_CUMPLE medido: no consta ninguna prueba', vacio.evidencia('EV-01')?.status === 'NO_CUMPLE' && /no consta ninguna prueba realizada/.test(vacio.de('EV-01')), vacio.de('EV-01'));
  comprueba('y el requisito NO_CUMPLE medido', vacio.requisito().status === 'NO_CUMPLE' && vacio.requisito().evidenced === true);
  comprueba('EV-04 sin nada que contrastar no sale CUMPLE', vacio.evidencia('EV-04')?.status === 'NO_EVALUABLE', estado(vacio, 'EV-04'));

  // La pasada de las 06:05 tenía las tres pruebas; la de las 12:05 ya no.
  const vaciado = evalua(eventos([
    ...pasada('2026-10-09T06:05'),
    ...pasada().filter(l => l.event !== 'continuity_test_recorded').map(l => (l.event === 'continuity_test_register_read' ? { ...l, filas: 0 } : l)),
  ]));
  comprueba(
    'un registro que se vació entre dos pasadas: las filas de la anterior no cuentan → NO_CUMPLE',
    vaciado.evidencia('EV-01')?.status === 'NO_CUMPLE',
    `${estado(vaciado, 'EV-01')} ${vaciado.de('EV-01')}`
  );

  const sinDeficiencias = evalua(hoy(l => (l.event === 'continuity_deficiency_register_read' ? { ...l, presente: 'no', legible: '-', cabecera: '-', filas: 0 } : l.event === 'continuity_deficiency_recorded' ? undefined : l)));
  comprueba('sin registro de deficiencias → EV-05 NO_EVALUABLE por CONFIGURATION', sinDeficiencias.evidencia('EV-05')?.status === 'NO_EVALUABLE' && sinDeficiencias.evidencia('EV-05')?.gapCause === 'CONFIGURATION', estado(sinDeficiencias, 'EV-05'));

  const sinFilas = (deficienciasDeclaradas: number) =>
    evalua(hoy(l => (l.event === 'continuity_deficiency_recorded' ? undefined : l.event === 'continuity_deficiency_register_read' ? { ...l, filas: 0 } : l.event === 'continuity_test_recorded' ? { ...l, deficiencias: deficienciasDeclaradas } : l)));
  comprueba('registro de deficiencias vacío y las pruebas declaran deficiencias → NO_CUMPLE', sinFilas(2).evidencia('EV-05')?.status === 'NO_CUMPLE');
  comprueba('REVERSIÓN: vacío y ninguna prueba declara deficiencias → CUMPLE (nada que corregir)', sinFilas(0).evidencia('EV-05')?.status === 'CUMPLE', sinFilas(0).de('EV-05'));

  const otra = evalua(hoy(), { ...BASE, 'P-04': 'Otra herramienta' });
  comprueba('P-04 declara otra herramienta → NO_EVALUABLE por CONFIGURATION (la integración no existe)', otra.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /la integración con esa herramienta no existe/.test(otra.de('EV-01')), otra.de('EV-01'));

  const cabecera = evalua(hoy(l => (l.event === 'continuity_test_register_read' ? { ...l, cabecera: 'distinta' } : l)));
  comprueba('la cabecera del registro no es la documentada → CONFIGURATION', cabecera.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /no es la cabecera documentada/.test(cabecera.de('EV-01')), cabecera.de('EV-01'));
}

// --- 8. sin parámetros ------------------------------------------------------------

bloque('8. Sin parámetros: NO_EVALUABLE con causa CONFIGURATION, nunca CUMPLE por vacío');

{
  const r = evalua(hoy(), SIN_PARAMETROS);

  comprueba('op.cont.3.1 no demostrado (NO_CUMPLE sin medir)', r.requisito().status === 'NO_CUMPLE' && r.requisito().evidenced === false, `${r.requisito().status} ${r.requisito().evidenced}`);
  ['EV-01', 'EV-02', 'EV-04', 'EV-05'].forEach(id =>
    comprueba(`${id} sin medir por CONFIGURATION`, r.evidencia(id)?.status === 'NO_EVALUABLE' && r.evidencia(id)?.gapCause === 'CONFIGURATION', estado(r, id))
  );
  comprueba('el motivo nombra el parámetro', /P-04 \(Registro de las pruebas realizadas\) está sin configurar/.test(r.de('EV-01')), r.de('EV-01'));

  const sinP07 = evalua(hoy(), { ...BASE, 'P-07': undefined });
  comprueba('falta solo P-07 → EV-04 CONFIGURATION, y el requisito no demostrado', sinP07.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && sinP07.requisito().evidenced === false, estado(sinP07, 'EV-04'));
  const sinP03 = evalua(hoy(), { ...BASE, 'P-03': undefined });
  comprueba('falta solo P-03 → EV-02 CONFIGURATION', sinP03.evidencia('EV-02')?.status === 'NO_EVALUABLE' && sinP03.evidencia('EV-02')?.gapCause === 'CONFIGURATION', estado(sinP03, 'EV-02'));
  comprueba('falta P-03 pero otra cosa está vencida → manda el NO_CUMPLE medido', evalua(hoy(), { ...BASE, 'P-03': undefined, 'P-02': ['escritorio | x | 1', 'simulacro | x | 12'] }).evidencia('EV-02')?.status === 'NO_CUMPLE');
  const sinRto028 = evalua(hoy(), { ...BASE, 'P-07': ['wazuh-real | 4 | 0'] });
  comprueba('P-07 sin RTO para el LDAP ni uno general (*) → CONFIGURATION nombrándolo', sinRto028.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /no declara el RTO de «28»/.test(sinRto028.de('EV-04')), sinRto028.de('EV-04'));

  const invalidos = configuracion(BASE)
    .parameters.map(p => ({ id: p.id, veredicto: validateParameterValue(p, p.value) }))
    .filter(v => !v.veredicto.valid);
  comprueba('los valores de BASE son válidos para la pantalla (selects y tablas)', invalidos.length === 0, invalidos.map(v => `${v.id}: ${v.veredicto.reason}`).join('; '));
  comprueba('«Otra herramienta» también es un valor válido de P-04', validateParameterValue(configuracion(BASE).parameters.find(p => p.id === 'P-04')!, 'Otra herramienta').valid);
}

// --- 9. sin recolector ------------------------------------------------------------

bloque('9. Sin recolector o con la fuente rota: NO_EVALUABLE por RECOGIDA');

{
  const nada = evalua([]);
  comprueba('sin ningún hecho → no demostrado', nada.requisito().evidenced === false && nada.requisito().status === 'NO_CUMPLE');
  comprueba('y por RECOGIDA, no por configuración', nada.evidencia('EV-01')?.gapCause === 'COLLECTION' && nada.evidencia('EV-05')?.gapCause === 'COLLECTION', `${estado(nada, 'EV-01')} ${estado(nada, 'EV-05')}`);

  const viejo = evalua(hoy(), BASE, 'ALTO', new Date('2026-10-11T12:30:00Z'));
  comprueba('dos días sin pasadas: los registros leídos no describen hoy → RECOGIDA', viejo.evidencia('EV-01')?.gapCause === 'COLLECTION' && /no está informando/.test(viejo.de('EV-01')), viejo.de('EV-01'));

  const conEstado = evalua(hoy(l => (l.event === 'continuity_test_register_read' ? undefined : l), [
    { ts: `${PASADA}:00Z`, event: 'evidence_state', evidence_id: 'EV-01', ...comun, estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'sin python3 en el manager: no se puede leer el registro de pruebas' },
  ]));
  comprueba('el recolector declara que no pudo leer → NO_EVALUABLE con SU motivo', conEstado.evidencia('EV-01')?.status === 'NO_EVALUABLE' && /sin python3/.test(conEstado.de('EV-01')), conEstado.de('EV-01'));

  const ilegible = evalua(hoy(l => (l.event === 'continuity_test_register_read' ? { ...l, legible: 'no' } : l)));
  comprueba('registro presente pero ilegible → RECOGIDA', ilegible.evidencia('EV-01')?.gapCause === 'COLLECTION', estado(ilegible, 'EV-01'));

  const ajeno = normalizeWazuhAlerts([alerta({ ...pasada()[0] })].map(a => ({ ...a, _source: { ...a._source, data: { ...a._source.data, ensfacil: 'op.cont.2' } } })));
  comprueba('un hecho de otro control no acredita op.cont.3', evalua(ajeno).evidencia('EV-01')?.status !== 'CUMPLE');
}

// --- 10. foco: los sistemas de la prueba por nombre o por ID -----------------------

bloque('10. Los sistemas de cada prueba se cruzan con los agentes por ID o por nombre EXACTO');

{
  const sistemas = (valor: string) => evalua(hoy(fila('continuity_test_recorded', simulacro, { sistemas: valor })));

  comprueba('«28» es el agente 028 (ID sin ceros)', sistemas('wazuh-real,28').evidencia('EV-04')?.status === 'CUMPLE');
  comprueba('«WAZUH-REAL» es wazuh-real (sin distinguir mayúsculas)', sistemas('WAZUH-REAL,28').evidencia('EV-04')?.status === 'CUMPLE');
  const id24 = evalua(hoy(fila('availability_event_observed', l => l.agente_id === '024', { agente_id: '24' }), []), BASE);
  comprueba('un hecho con agente_id «24» casa con «wazuh-real» y con «024» (normalizado en los dos lados)', id24.evidencia('EV-04')?.status === 'CUMPLE' && evalua(hoy(l => (l.event === 'availability_event_observed' && l.agente_id === '024' ? { ...l, agente_id: '24' } : l.event === 'continuity_test_recorded' && simulacro(l) ? { ...l, sistemas: '024,28' } : l))).evidencia('EV-04')?.status === 'CUMPLE');

  const parecido = sistemas('wazuh-rea,28');
  comprueba(
    '«wazuh-rea» NO es wazuh-real: no es un agente, su RTO no se puede medir → NO_EVALUABLE, nunca CUMPLE',
    parecido.evidencia('EV-04')?.status === 'NO_EVALUABLE' && /«wazuh-rea» no es un agente de Wazuh/.test(parecido.de('EV-04')),
    `${estado(parecido, 'EV-04')} ${parecido.de('EV-04')}`
  );

  // Dos agentes con el mismo nombre: el reinstalado (024) y el viejo (041).
  const dos = hoy(undefined, [disponibilidad(`${PASADA}:04Z`, SIMULACRO, SIMULACRO_FIN, 'wazuh-real', '041', 'wazuh-real', '-')]);
  const ambiguo = evalua(dos);
  comprueba(
    'un nombre con dos agentes (024 y 041) → no se elige: NO_EVALUABLE por CONFIGURATION pidiendo el ID',
    ambiguo.evidencia('EV-04')?.status === 'NO_EVALUABLE' && ambiguo.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /Decláralo por su ID/.test(ambiguo.de('EV-04')),
    `${estado(ambiguo, 'EV-04')} ${ambiguo.de('EV-04')}`
  );
  const porId = evalua(eventos([...pasada(), disponibilidad(`${PASADA}:04Z`, SIMULACRO, SIMULACRO_FIN, 'wazuh-real', '041', 'wazuh-real', '-')], fila('continuity_test_recorded', simulacro, { sistemas: '024,28' })));
  comprueba('REVERSIÓN: declarado por su ID (024) → CUMPLE', porId.evidencia('EV-04')?.status === 'CUMPLE', porId.de('EV-04'));
}

// --- 11. foco: gramática estricta, y lo que no se pudo medir de UNA prueba -------------

bloque('11. Celdas con gramática estricta; el hueco de una prueba no tapa lo medido en otra');

{
  const p02 = evalua(hoy(), { ...BASE, 'P-02': ['escritorio | x | cada año', 'simulacro | x | 12'] });
  comprueba(
    'P-02 con periodicidad «cada año» → no se adivina: CONFIGURATION nombrando la fila',
    p02.evidencia('EV-02')?.status === 'NO_EVALUABLE' && p02.evidencia('EV-02')?.gapCause === 'CONFIGURATION' && /fila «escritorio»: periodicidad «cada año»/.test(p02.de('EV-02')),
    `${estado(p02, 'EV-02')} ${p02.de('EV-02')}`
  );
  const p07 = evalua(hoy(), { ...BASE, 'P-07': ['* | cuatro horas | 0', '028 | 2 | 15'] });
  comprueba('P-07 con «cuatro horas» → CONFIGURATION nombrando la fila', p07.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /fila «\*»: RTO «cuatro horas»/.test(p07.de('EV-04')), p07.de('EV-04'));
  comprueba('P-07 admite decimales con coma («4,5»)', evalua(hoy(), { ...BASE, 'P-07': ['* | 4,5 | 0', '028 | 2 | 15'] }).evidencia('EV-04')?.status === 'CUMPLE');
  comprueba('P-01 no entero (12,5) → CONFIGURATION', evalua(hoy(), { ...BASE, 'P-01': '12.5' }).evidencia('EV-02')?.gapCause === 'CONFIGURATION');

  const descartadas = evalua(hoy(l => (l.event === 'continuity_test_register_read' ? { ...l, filas_invalidas: 2, lineas_invalidas: '5:inicio,7:tipo' } : l)));
  comprueba(
    'dos filas del registro descartadas por el recolector → NO_EVALUABLE por CONFIGURATION nombrando línea y columna',
    descartadas.evidencia('EV-01')?.status === 'NO_EVALUABLE' && descartadas.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /5:inicio; 7:tipo/.test(descartadas.de('EV-01')),
    `${estado(descartadas, 'EV-01')} ${descartadas.de('EV-01')}`
  );
  // Un hallazgo por AUSENCIA («vencido») no se afirma con filas descartadas:
  // la descartada puede ser la prueba que falta. Uno por PRESENCIA, sí.
  const descarta = (l: Linea) => (l.event === 'continuity_test_register_read' ? { ...l, filas_invalidas: 2, lineas_invalidas: '5:inicio,7:tipo' } : l);
  const vencidoConDescartes = evalua(hoy(descarta), { ...BASE, 'P-01': '3' });
  comprueba(
    'con filas descartadas, «vencido» pasa a NO_EVALUABLE por CONFIGURATION (la descartada puede ser la prueba que falta)',
    vencidoConDescartes.evidencia('EV-02')?.status === 'NO_EVALUABLE' && vencidoConDescartes.evidencia('EV-02')?.gapCause === 'CONFIGURATION' && /No se puede afirmar/.test(vencidoConDescartes.de('EV-02')),
    `${estado(vencidoConDescartes, 'EV-02')} ${vencidoConDescartes.de('EV-02')}`
  );
  comprueba(
    'pero una deficiencia abierta fuera de plazo (algo PRESENTE) sigue mandando: NO_CUMPLE',
    evalua(hoy(l => fila('continuity_deficiency_recorded', x => x.deficiencia_id === 'DEF-2026-04', { plazo: '2026-10-01' })(descarta(l)))).evidencia('EV-05')?.status === 'NO_CUMPLE'
  );
  comprueba(
    'y una discrepancia medida en EV-04, también',
    evalua(hoy(l => fila('availability_event_observed', x => x.agente_id === '024', { eventos: 'parada@2026-09-17T20:05:00Z,arranque@2026-09-18T00:52:00Z' })(descarta(l)))).evidencia('EV-04')?.status === 'NO_CUMPLE'
  );
  const declaraConDescartes = evalua(hoy(l =>
    fila('continuity_test_recorded', simulacro, { deficiencias: 3 })(l.event === 'continuity_deficiency_register_read' ? { ...l, filas_invalidas: 1, lineas_invalidas: '9:plazo' } : l)
  ));
  comprueba(
    '«declara 3, sigue 1» con una fila descartada en el registro de deficiencias → NO_EVALUABLE por CONFIGURATION',
    declaraConDescartes.evidencia('EV-05')?.status === 'NO_EVALUABLE' && declaraConDescartes.evidencia('EV-05')?.gapCause === 'CONFIGURATION',
    `${estado(declaraConDescartes, 'EV-05')} ${declaraConDescartes.de('EV-05')}`
  );

  // Faltan las alertas de un día de la ventana del simulacro (rotadas).
  const parcial = hoy(fila('continuity_test_recorded', simulacro, { medicion: 'parcial', dias_sin_alertas: '2026-09-18' }));
  const r = evalua(parcial);
  comprueba(
    'al simulacro le faltan las alertas del 18/09 → EV-04 NO_EVALUABLE por RECOGIDA nombrando el día',
    r.evidencia('EV-04')?.status === 'NO_EVALUABLE' && r.evidencia('EV-04')?.gapCause === 'COLLECTION' && /días sin alertas: 2026-09-18/.test(r.de('EV-04')),
    `${estado(r, 'EV-04')} ${r.de('EV-04')}`
  );
  // Y una prueba parcial de julio, declarada satisfactoria, con el LDAP 3 h caído.
  const julio = '2026-07-20T18:00:00Z';
  const conOtra = evalua(eventos([
    ...pasada(),
    prueba(`${PASADA}:01Z`, 5, julio, '2026-07-20T21:00:00Z', 'parcial', 'pérdida total de CPD', '028', 'satisfactorio', 0),
    disponibilidad(`${PASADA}:04Z`, julio, '2026-07-20T21:00:00Z', '028', '028', 'ldap-zimbra', 'parada@2026-07-20T18:10:00Z,arranque@2026-07-20T21:12:00Z'),
  ], fila('continuity_test_recorded', simulacro, { medicion: 'parcial', dias_sin_alertas: '2026-09-18' })));
  comprueba(
    'el hueco del simulacro no tapa la discrepancia medida en la prueba de julio → NO_CUMPLE',
    conOtra.evidencia('EV-04')?.status === 'NO_CUMPLE' && /028 \(ldap-zimbra, 028\) estuvo 3 h 2 min sin servicio/.test(conOtra.de('EV-04')) && /Además: La medición de la prueba simulacro/.test(conOtra.de('EV-04')),
    conOtra.de('EV-04')
  );

  const truncada = evalua(hoy(fila('availability_event_observed', l => l.agente_id === '024', { eventos_total: 57 })));
  comprueba('una cronología truncada sin caída que supere el RTO → no se puede afirmar: RECOGIDA', truncada.evidencia('EV-04')?.gapCause === 'COLLECTION', estado(truncada, 'EV-04'));

  const pendiente = evalua(
    eventos([
      ...pasada(),
      prueba(`${PASADA}:01Z`, 5, '2026-10-09T08:00:00Z', '2026-10-09T10:00:00Z', 'parcial', 'pérdida total de CPD', '028', 'satisfactorio', 0, { medicion: 'pendiente', medido_hasta: '2026-10-09T12:05:00Z' }),
      disponibilidad(`${PASADA}:04Z`, '2026-10-09T08:00:00Z', '2026-10-09T10:00:00Z', '028', '028', 'ldap-zimbra', 'parada@2026-10-09T09:30:00Z'),
    ])
  );
  comprueba(
    'una prueba de esta mañana con el LDAP aún caído 2 h 35 min y su RTO de 2 h 15 min → ya lo supera: NO_CUMPLE aunque la medición siga abierta',
    pendiente.evidencia('EV-04')?.status === 'NO_CUMPLE',
    pendiente.de('EV-04')
  );
  const pendienteCorta = evalua(
    eventos([
      ...pasada(),
      prueba(`${PASADA}:01Z`, 5, '2026-10-09T08:00:00Z', '2026-10-09T11:00:00Z', 'parcial', 'pérdida total de CPD', '028', 'satisfactorio', 0, { medicion: 'pendiente', medido_hasta: '2026-10-09T12:05:00Z' }),
      disponibilidad(`${PASADA}:04Z`, '2026-10-09T08:00:00Z', '2026-10-09T11:00:00Z', '028', '028', 'ldap-zimbra', 'parada@2026-10-09T11:00:00Z'),
    ])
  );
  comprueba(
    'REVERSIÓN: caído desde las 11:00 (1 h 5 min, por debajo de su RTO) con la medición abierta → todavía no se sabe: NO_EVALUABLE, nunca CUMPLE',
    pendienteCorta.evidencia('EV-04')?.status === 'NO_EVALUABLE' && /todavía no se sabe/.test(pendienteCorta.de('EV-04')),
    `${estado(pendienteCorta, 'EV-04')} ${pendienteCorta.de('EV-04')}`
  );
}

// --- 11 bis. filas perdidas, repetidas o mal formadas ---------------------------

bloque('11 bis. Filas perdidas por el camino, repetidas o con celdas que no se entienden');

{
  const perdida = evalua(hoy(l => (l.event === 'continuity_test_recorded' && l.linea === 3 ? undefined : l)));
  comprueba(
    'la lectura anuncia 3 pruebas y llegan 2 → NO_EVALUABLE por RECOGIDA, diciendo cuántas faltan',
    perdida.evidencia('EV-01')?.status === 'NO_EVALUABLE' && perdida.evidencia('EV-01')?.gapCause === 'COLLECTION' && /faltan 1/.test(perdida.de('EV-01')),
    `${estado(perdida, 'EV-01')} ${perdida.de('EV-01')}`
  );
  comprueba(
    'y con una prueba perdida, «escenario nunca probado» no se afirma',
    evalua(hoy(l => (l.event === 'continuity_test_recorded' && l.linea === 3 ? undefined : l))).evidencia('EV-02')?.status === 'NO_EVALUABLE'
  );

  const def04 = pasada().find(l => l.deficiencia_id === 'DEF-2026-04')!;
  const repetida = evalua(
    hoy(fila('continuity_test_recorded', simulacro, { deficiencias: 2 }), [{ ...def04 }])
  );
  comprueba(
    'una deficiencia repetida en la pasada cuenta una vez: el simulacro declara 2 y se sigue 1 → NO_CUMPLE',
    repetida.evidencia('EV-05')?.status === 'NO_CUMPLE' && /declara 2, en seguimiento 1/.test(repetida.de('EV-05')),
    `${estado(repetida, 'EV-05')} ${repetida.de('EV-05')}`
  );
  const pruebaRepetida = evalua(hoy(undefined, [pasada().find(l => l.event === 'continuity_test_recorded' && l.linea === 4)!]));
  comprueba('una prueba repetida en la pasada no descuadra nada → CUMPLE', pruebaRepetida.requisito().status === 'CUMPLE', pruebaRepetida.motivo());

  const resultado = evalua(hoy(fila('continuity_test_recorded', simulacro, { resultado: 'ok' })));
  comprueba(
    'un resultado fuera del vocabulario («ok») → la fila no se interpreta: RECOGIDA, nombrando línea y columna',
    resultado.evidencia('EV-01')?.status === 'NO_EVALUABLE' && /línea 4 \(resultado «ok»\)/.test(resultado.de('EV-01')),
    `${estado(resultado, 'EV-01')} ${resultado.de('EV-01')}`
  );
  const deficiencias = evalua(hoy(fila('continuity_test_recorded', simulacro, { deficiencias: 'tres' })));
  comprueba('unas deficiencias que no son un número («tres») → igual', /deficiencias «tres»/.test(deficiencias.de('EV-01')), deficiencias.de('EV-01'));

  const sinCierre = evalua(hoy(fila('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-03', { cierre: '-' })));
  comprueba(
    'DEF-2026-03 «cerrada» sin fecha de cierre se juzga abierta: su plazo del 31/08 venció → NO_CUMPLE',
    sinCierre.evidencia('EV-05')?.status === 'NO_CUMPLE' && /DEF-2026-03 .*declarada cerrada sin fecha de cierre: se juzga abierta/.test(sinCierre.de('EV-05')),
    sinCierre.de('EV-05')
  );
  const cierreFuturo = evalua(hoy(fila('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-03', { cierre: '2026-12-01' })));
  comprueba('«cerrada» con un cierre posterior a la lectura (01/12) → abierta, y vencida: NO_CUMPLE', cierreFuturo.evidencia('EV-05')?.status === 'NO_CUMPLE' && /posterior a la lectura/.test(cierreFuturo.de('EV-05')), cierreFuturo.de('EV-05'));
  comprueba('REVERSIÓN: cerrada el 28/08 → CUMPLE', evalua(hoy()).evidencia('EV-05')?.status === 'CUMPLE');
}

// --- 12. foco: los plazos, en el instante de la lectura --------------------------------

bloque('12. Los plazos se juzgan cuando se leyó el registro, no al evaluar');

{
  // DEF-2026-04 con plazo el 08/10: vence al acabar ese día (09/10 00:00 UTC).
  const conPlazo = (l: Linea) => (l.event === 'continuity_deficiency_recorded' && l.deficiencia_id === 'DEF-2026-04' ? { ...l, plazo: '2026-10-08' } : l);
  const ayer = '2026-10-08T18:05';
  const leidaAyer = evalua(eventos(pasada(ayer), conPlazo), BASE, 'ALTO', new Date('2026-10-09T12:30:00Z'));
  comprueba(
    'leído el 08/10 a las 18:05 (hace 18 h; se ha perdido una pasada): aún estaba en plazo → CUMPLE',
    leidaAyer.evidencia('EV-05')?.status === 'CUMPLE',
    `${estado(leidaAyer, 'EV-05')} ${leidaAyer.de('EV-05')}`
  );
  const leidaHoy = evalua(eventos([...pasada(ayer), ...pasada('2026-10-09T00:05')], conPlazo), BASE, 'ALTO', new Date('2026-10-09T12:30:00Z'));
  comprueba('REVERSIÓN: leído el 09/10 a las 00:05 → fuera de plazo: NO_CUMPLE', leidaHoy.evidencia('EV-05')?.status === 'NO_CUMPLE', leidaHoy.de('EV-05'));
}

// --- 13. foco: el estado por la última pasada -----------------------------------------

bloque('13. Hechos de estado: una deficiencia cerrada a mediodía deja de contar como abierta');

{
  const abierta = (l: Linea) => (l.event === 'continuity_deficiency_recorded' && l.deficiencia_id === 'DEF-2026-03' ? { ...l, situacion: 'abierta', cierre: '-' } : l);
  const manana = eventos(pasada('2026-10-09T06:05'), abierta);
  const r0630 = evalua(manana, BASE, 'ALTO', new Date('2026-10-09T06:30:00Z'));
  comprueba('a las 06:30, DEF-2026-03 sigue abierta tras el simulacro → NO_CUMPLE', r0630.evidencia('EV-05')?.status === 'NO_CUMPLE');
  const r1230 = evalua(manana.concat(eventos(pasada())));
  comprueba('a las 12:30, la pasada de las 12:05 la trae cerrada → CUMPLE', r1230.evidencia('EV-05')?.status === 'CUMPLE', r1230.de('EV-05'));
}

// --- 14. volumen --------------------------------------------------------------------

bloque('14. Volumen: el presupuesto de hechos');

{
  // Un día del laboratorio: cuatro pasadas completas de la fixture.
  const dia = [0, 6, 12, 18].flatMap(h => pasada(`2026-10-09T${String(h).padStart(2, '0')}:05`));
  comprueba(`un día del laboratorio son ${dia.length} hechos, muy por debajo de los 300 del presupuesto`, dia.length <= 300, dia.length);

  // Una organización con historia: 8 pruebas (4 medidas, 3 sistemas cada una),
  // 20 deficiencias, 3 restauraciones y 4 agentes con cambios posteriores.
  const porPasada = 2 + 8 + 20 + 4 * 3 + 3 + 4 + 1;
  comprueba(`una organización con historia: ${porPasada} por pasada, ${porPasada * 4} al día (≤ 300)`, porPasada * 4 <= 300, porPasada * 4);

  // La cronología más larga (40 eventos) cabe holgada en una línea.
  const cuarenta = Array.from({ length: 40 }, (_, k) => `${k % 2 ? 'arranque' : 'parada'}@2026-09-17T2${k % 4}:${String(k).padStart(2, '0')}:00Z`).join(',');
  const bytes = new TextEncoder().encode(JSON.stringify({ ensfacil: 'op.cont.3', host: 'Wazuh-4', ...disponibilidad(`${PASADA}:04Z`, SIMULACRO, SIMULACRO_FIN, 'wazuh-real', '024', 'wazuh-real', cuarenta) })).length;
  comprueba(`una cronología de 40 eventos ocupa ${bytes} bytes, lejos de los 64 KiB de logcollector`, bytes < 4096, bytes);
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
