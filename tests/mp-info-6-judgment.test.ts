/**
 * mp.info.6 · el juicio de las copias de seguridad a partir de hechos.
 *
 *     npx tsx tests/mp-info-6-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. El recolector de mp.info.6 (PBS o Zimbra) solo emite HECHOS
 * con el contrato común (`backup_run`, `backup_schedule`, `backup_retention`,
 * `backup_access`, `backup_storage`, `restore_test`, `evidence_state` solo con
 * NO_EVALUABLE y el latido `collector_run`); el veredicto lo pone la policy
 * del plugin contra los parámetros de la pantalla. Y el control solo se mide
 * en las máquinas que la organización declara en P-04.
 *
 * Una misma máquina puede tener dos recolectores (el del PBS y el de Zimbra),
 * cada uno con su latido: ninguno puede esconder los hechos del otro. Un
 * veredicto antiguo del recolector no llega a la tabla de evidencias, y el
 * informe del control enseña los valores que la policy ha medido.
 *
 * Los hechos se construyen a mano con el contrato y pasan por el normalizador
 * real como alertas de alerts.json. Cada caso mueve UN eje y lleva al lado la
 * REVERSIÓN que demuestra que el veredicto no sale siempre igual.
 *
 * El caso 11 compara los otros 16 controles con y sin mp.info.6 sobre datos
 * reales descargados del índice. La carpeta se indica con ENSFACIL_REAL_DATA
 * (con `data/a-<control>.json`, `data/now.txt` y, si existe,
 * `params/active.clean.json`); sin ella se usa una muestra mínima de dos
 * controles.
 *
 * El motor arrastra `kibana-services`, que solo existe en el árbol del plugin
 * `main` de Wazuh: se sustituye por un módulo vacío antes de cargarlo, igual
 * que en `measurement-planes.test.ts`.
 */
import { ENSCatalog } from '../dashboard/ens/catalog';
import { mpInfo6CatalogDefinition } from '../dashboard/ens/catalog/mp-info-6';
import { mpInfo6Configuration } from '../dashboard/ens/configuration/data/mp-info-6-parameters';
import { defaultENSConfigurationTemplate } from '../dashboard/ens/configuration/data/default-configuration';
import { ensConfigurationRepository } from '../dashboard/ens/configuration/repository';
import { assertENSConfigurationVersion } from '../dashboard/ens/configuration/services/configuration-structure-validator';
import { normalizeWazuhAlerts } from '../dashboard/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../dashboard/ens/core/evidence/engine';
import { keepLatestRunStateFacts } from '../dashboard/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../dashboard/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../dashboard/ens/core/evaluation/requirement/requirement-evaluator';
import { buildPolicyContext } from '../dashboard/ens/core/policy-runtime/policy-context-builder';
import { runPolicyRuntime } from '../dashboard/ens/core/policy-runtime/policy-runtime';
import { buildENSReportModel } from '../dashboard/ens/reports/registry';
import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../dashboard/ens/configuration/types';
import type { ENSNormalizedEvent } from '../dashboard/ens/core/data-source/types';
import type { ENSAgentScope } from '../dashboard/ens/core/scope/types';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
declare const require: (id: string) => any;

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

const {
  getENSComplianceResultByControl,
  getENSComplianceState,
} = require('../dashboard/ens/core/ens-engine') as typeof import('../dashboard/ens/core/ens-engine');

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

const CONTROL = 'mp.info.6';
const AHORA = new Date('2026-09-30T12:00:00Z');
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

const hace = (horas: number): string =>
  new Date(AHORA.getTime() - horas * HORA).toISOString().replace('.000Z', 'Z');

// La pasada del recolector de la que salen los hechos: hace 55 minutos.
const PASADA = hace(55 / 60);

const REGLA: Record<string, string> = {
  backup_run: '106601',
  backup_schedule: '106602',
  backup_retention: '106603',
  backup_access: '106604',
  backup_storage: '106605',
  restore_test: '106606',
  evidence_state: '106650',
  collector_run: '106797',
  collector_warning: '106798',
  collector_missing: '106799',
};

const EVIDENCIA: Record<string, string> = {
  backup_run: 'EV-01,EV-02',
  backup_schedule: 'EV-02',
  backup_retention: 'EV-03',
  backup_access: 'EV-04',
  backup_storage: 'EV-06',
  restore_test: 'EV-05',
};

type Linea = Record<string, string | number>;

// Una línea del NDJSON del recolector con los campos comunes del contrato.
const linea = (event: string, campos: Linea = {}, ts: string = PASADA): Linea => ({
  ensfacil: CONTROL,
  ts,
  host: 'srv-01',
  event,
  ...(EVIDENCIA[event] ? { evidence_id: EVIDENCIA[event] } : {}),
  origen: 'pbs',
  objeto: 'fichero',
  ...campos,
});

const latido = (ts: string = PASADA, campos: Linea = {}): Linea =>
  linea(
    'collector_run',
    {
      resultado: 'completada',
      evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-06',
      evidencias_miradas: 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-06',
      rol: 'pbs',
      ...campos,
    },
    ts
  );

const copia = (campos: Linea = {}, ts: string = PASADA): Linea =>
  linea(
    'backup_run',
    {
      ultima_correcta: hace(10),
      ultima_fallida: '-',
      resultado_ultima: 'ok',
      tipo: 'completa',
      tamano_bytes: 1073741824,
      destino: 'pbs01:datastore1',
      ...campos,
    },
    ts
  );

let contador = 0;

type Agente = { id: string; name: string };

const SRV01: Agente = { id: '001', name: 'srv-01' };
const SRV02: Agente = { id: '002', name: 'srv-02' };

// Una línea tal como la deja el manager en el índice.
const alerta = (l: Linea, agente: Agente) => {
  contador += 1;

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': l.ts,
      agent: agente,
      rule: { id: REGLA[String(l.event)] || '106600', description: 'mp.info.6' },
      location: '/var/log/ensfacil/mp_info_6.json',
      data: Object.fromEntries(Object.entries(l).map(([k, v]) => [k, String(v)])),
    },
  };
};

const eventos = (lineas: Linea[], agente: Agente = SRV01): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(lineas.map(l => alerta(l, agente)));

// --- la configuración ------------------------------------------------------

type Valores = Record<string, string | string[] | undefined>;

// Lo que declararía el responsable para una máquina con PBS.
const BASE: Valores = {
  'P-01': '24',
  'P-02': '4',
  'P-03': '30',
  'P-04': 'srv-01',
  'P-05': '7',
  'P-06': '/backup',
  'P-07': 'root,backup',
  'P-10': 'pbs',
};

const configuracion = (valores: Valores): ENSControlConfiguration => ({
  ...mpInfo6Configuration,
  parameters: mpInfo6Configuration.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

// --- el juicio de una fila -------------------------------------------------

const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Valores = BASE,
  nivel: ENSLevel = 'MEDIO',
  ahora: Date = AHORA
) => {
  const cfg = configuracion(valores);
  const delControl = keepLatestRunStateFacts(CONTROL, evs, ahora);
  const evidencias = resolveEvidenceForControl(CONTROL, delControl, SRV01.id, nivel, cfg, ahora);
  const contexto = buildPolicyContext(mpInfo6CatalogDefinition, cfg, nivel, delControl, evidencias, ahora);
  const { decisions } = runPolicyRuntime(contexto);
  const tabla = applyPolicyDecisionsToEvidences(evidencias, decisions, mpInfo6CatalogDefinition.requirements);
  const requisito = (id: string) =>
    evaluateRequirement(
      mpInfo6CatalogDefinition.requirements.find(q => q.id === id)!,
      nivel,
      tabla,
      false,
      decisions,
      'ACTIVE'
    );
  const evidencia = (id: string) => tabla.find(e => e.id === id);
  // El motivo con el que la policy midió ESA evidencia.
  const motivo = (id: string) =>
    decisions.find(d => d.evidenceIds.length === 1 && d.evidenceIds[0] === id)?.reason || '';
  const estado = (id: string) => evidencia(id)?.status;
  const causa = (id: string) => evidencia(id)?.gapCause;
  // La medida de la policy, antes de llevarla a la tabla.
  const medida = (id: string) =>
    decisions.find(d => d.evidenceIds.length === 1 && d.evidenceIds[0] === id)?.status;

  return { decisions, requisito, evidencia, motivo, estado, causa, medida };
};

// ---------------------------------------------------------------------------

bloque('0. El catálogo');

{
  comprueba('mp.info.6 declara su alcance en P-04', mpInfo6CatalogDefinition.scopeParameter === 'P-04', mpInfo6CatalogDefinition.scopeParameter);
  comprueba('y sigue midiéndose en el plano de los agentes', mpInfo6CatalogDefinition.measurementPlanes === undefined);
}

// ---------------------------------------------------------------------------

bloque('1. La última copia correcta, hace 10 h');

{
  const r = evalua(eventos([copia(), latido()]));

  comprueba('EV-01 CUMPLE: hay copia correcta y la última pasada no la contradice', r.estado('EV-01') === 'CUMPLE', `${r.estado('EV-01')} ${r.motivo('EV-01')}`);
  comprueba('EV-02 CUMPLE: 10 h dentro de P-01 + P-02 = 28 h', r.estado('EV-02') === 'CUMPLE', `${r.estado('EV-02')} ${r.motivo('EV-02')}`);
  comprueba('mp.info.6.2.a CUMPLE medido', r.requisito('mp.info.6.2.a').status === 'CUMPLE' && r.requisito('mp.info.6.2.a').evidenced === true, r.requisito('mp.info.6.2.a').status);
  comprueba('EV-07 CUMPLE: latido reciente con cobertura declarada', r.estado('EV-07') === 'CUMPLE', `${r.estado('EV-07')} ${r.motivo('EV-07')}`);

  const sinLatido = evalua(eventos([copia()]));
  comprueba('REVERSIÓN: sin latido, EV-07 no se puede afirmar (NO_EVALUABLE por RECOGIDA)', sinLatido.estado('EV-07') === 'NO_EVALUABLE' && sinLatido.causa('EV-07') === 'COLLECTION', `${sinLatido.estado('EV-07')} ${sinLatido.causa('EV-07')}`);
}

// ---------------------------------------------------------------------------

bloque('2. La última copia correcta, hace 30 h (> 24 + 4)');

{
  const r = evalua(eventos([copia({ ultima_correcta: hace(30) }), latido()]));

  comprueba('EV-02 NO_CUMPLE', r.estado('EV-02') === 'NO_CUMPLE', `${r.estado('EV-02')} ${r.motivo('EV-02')}`);
  comprueba('el motivo cita las horas medidas y el plazo', /30\.0 h/.test(r.motivo('EV-02')) && /28 h/.test(r.motivo('EV-02')), r.motivo('EV-02'));
  comprueba('EV-01 sigue CUMPLE: la copia existe y la última pasada no la contradice', r.estado('EV-01') === 'CUMPLE', r.motivo('EV-01'));

  const holgado = evalua(eventos([copia({ ultima_correcta: hace(30) }), latido()]), { ...BASE, 'P-02': '8' });
  comprueba('REVERSIÓN: el mismo hecho con P-02 = 8 h (plazo 32 h) → CUMPLE', holgado.estado('EV-02') === 'CUMPLE', holgado.motivo('EV-02'));

  const sinP01 = evalua(eventos([copia({ ultima_correcta: hace(30) }), latido()]), { ...BASE, 'P-01': undefined });
  comprueba('sin P-01 → EV-02 NO_EVALUABLE por CONFIGURACIÓN, nunca un veredicto', sinP01.estado('EV-02') === 'NO_EVALUABLE' && sinP01.causa('EV-02') === 'CONFIGURATION', `${sinP01.estado('EV-02')} ${sinP01.causa('EV-02')}`);
}

// ---------------------------------------------------------------------------

bloque('3. Nunca hubo una copia correcta (ultima_correcta=-, resultado_ultima=error)');

{
  const r = evalua(eventos([copia({ ultima_correcta: '-', ultima_fallida: hace(2), resultado_ultima: 'error' }), latido()]));

  comprueba('EV-01 NO_CUMPLE medido', r.estado('EV-01') === 'NO_CUMPLE', `${r.estado('EV-01')} ${r.motivo('EV-01')}`);
  comprueba('EV-02 NO_CUMPLE medido', r.estado('EV-02') === 'NO_CUMPLE', `${r.estado('EV-02')} ${r.motivo('EV-02')}`);
  comprueba(
    'mp.info.6.2.a NO_CUMPLE y DEMOSTRADO (no es un hueco de medida)',
    r.requisito('mp.info.6.2.a').status === 'NO_CUMPLE' && r.requisito('mp.info.6.2.a').evidenced === true,
    `${r.requisito('mp.info.6.2.a').status} evidenced=${r.requisito('mp.info.6.2.a').evidenced}`
  );

  const fallidaDespues = evalua(eventos([copia({ ultima_fallida: hace(2), resultado_ultima: 'error' }), latido()]));
  comprueba('una copia correcta de hace 10 h y la última con error hace 2 h → EV-01 NO_CUMPLE (la última pasada la contradice)', fallidaDespues.estado('EV-01') === 'NO_CUMPLE', fallidaDespues.motivo('EV-01'));
}

// ---------------------------------------------------------------------------

bloque('4. Solo evidence_state NO_EVALUABLE (CONFIGURATION) para EV-01');

{
  const degradado = linea('evidence_state', {
    evidence_id: 'EV-01',
    estado: 'NO_EVALUABLE',
    causa: 'CONFIGURATION',
    motivo: 'no hay datastore del PBS declarado en /etc/ensfacil/mpinfo6.env',
  });
  const r = evalua(eventos([degradado, latido()]));

  comprueba('EV-01 NO_EVALUABLE con la causa que declara el recolector', r.estado('EV-01') === 'NO_EVALUABLE' && r.causa('EV-01') === 'CONFIGURATION', `${r.estado('EV-01')} ${r.causa('EV-01')}`);
  comprueba('y su motivo', /datastore del PBS/.test(r.motivo('EV-01')), r.motivo('EV-01'));
  comprueba('mp.info.6.1 no demostrado, nunca un NO_CUMPLE medido', r.requisito('mp.info.6.1').evidenced === false, `${r.requisito('mp.info.6.1').status} evidenced=${r.requisito('mp.info.6.1').evidenced}`);

  // Un recolector antiguo que se pusiera nota a sí mismo no manda: la policy
  // solo lee su NO_EVALUABLE.
  const veredicto = linea('evidence_state', { evidence_id: 'EV-03', estado: 'CUMPLE', motivo: 'retención correcta' });
  const conVeredicto = evalua(eventos([veredicto, latido()]));
  comprueba(
    'un evidence_state con veredicto no lo lee la policy: EV-03 queda sin medir',
    conVeredicto.medida('EV-03') === 'NO_EVALUABLE' && !/retención correcta/.test(conVeredicto.motivo('EV-03')),
    `${conVeredicto.medida('EV-03')} ${conVeredicto.motivo('EV-03')}`
  );
}

// ---------------------------------------------------------------------------

bloque('5. EV-03 · retención configurada contra P-03');

{
  const retencion = (dias: string) =>
    linea('backup_retention', { retencion_dias: dias, copia_mas_antigua: hace(20 * 24) });

  const corta = evalua(eventos([retencion('14'), latido()]));
  comprueba('retencion_dias=14 con P-03=30 → EV-03 NO_CUMPLE', corta.estado('EV-03') === 'NO_CUMPLE' && /14/.test(corta.motivo('EV-03')), `${corta.estado('EV-03')} ${corta.motivo('EV-03')}`);

  const larga = evalua(eventos([retencion('45'), latido()]));
  comprueba('REVERSIÓN: retencion_dias=45 → CUMPLE', larga.estado('EV-03') === 'CUMPLE', larga.motivo('EV-03'));
}

// ---------------------------------------------------------------------------

bloque('6. EV-04 · cuentas con lectura contra P-07');

{
  const acceso = (cuentas: string) =>
    linea('backup_access', {
      ruta: '/backup',
      modo: '750',
      propietario: 'root',
      grupo: 'backup',
      cuentas_con_lectura: cuentas,
      clave_ruta: '/etc/proxmox-backup-client/encryption-key.json',
      clave_modo: '600',
    });

  const ajena = evalua(eventos([acceso('root,backup,www-data'), latido()]));
  comprueba('root,backup,www-data con P-07=root,backup → NO_CUMPLE nombrando www-data', ajena.estado('EV-04') === 'NO_CUMPLE' && /www-data/.test(ajena.motivo('EV-04')), `${ajena.estado('EV-04')} ${ajena.motivo('EV-04')}`);

  const propia = evalua(eventos([acceso('root,backup'), latido()]));
  comprueba('REVERSIÓN: root,backup → CUMPLE', propia.estado('EV-04') === 'CUMPLE', propia.motivo('EV-04'));

  const clave = evalua(eventos([{ ...acceso('root,backup'), clave_modo: '644' }, latido()]));
  comprueba('la clave de cifrado legible por otros (644) → NO_CUMPLE', clave.estado('EV-04') === 'NO_CUMPLE' && /clave/.test(clave.motivo('EV-04')), clave.motivo('EV-04'));
}

// ---------------------------------------------------------------------------

bloque('7. EV-05 · la prueba de restauración contra P-05');

{
  const prueba = (dias: number, campos: Linea = {}) =>
    linea(
      'restore_test',
      {
        origen: 'zimbra-ne',
        objeto: 'buzones',
        fecha: hace(dias * 24),
        testigo: 'testigo@ejemplo.invalid',
        resultado: 'ok',
        coincide: 'si',
        limpieza: 'ok',
        detalle: 'mensaje de control presente',
        ...campos,
      },
      hace(dias * 24)
    );

  const reciente = evalua(eventos([prueba(3), latido()]));
  comprueba('ok y coincide hace 3 días con P-05=7 → EV-05 CUMPLE', reciente.estado('EV-05') === 'CUMPLE', `${reciente.estado('EV-05')} ${reciente.motivo('EV-05')}`);

  const vieja = evalua(eventos([prueba(9), latido()]));
  comprueba('REVERSIÓN: la misma prueba hace 9 días → NO_CUMPLE', vieja.estado('EV-05') === 'NO_CUMPLE', `${vieja.estado('EV-05')} ${vieja.motivo('EV-05')}`);

  const sucia = evalua(eventos([prueba(3, { limpieza: 'error' }), latido()]));
  comprueba(
    'ok y coincide pero limpieza=error → NO_EVALUABLE por EVIDENCIA, nunca CUMPLE',
    sucia.estado('EV-05') === 'NO_EVALUABLE' && sucia.causa('EV-05') === 'EVIDENCE',
    `${sucia.estado('EV-05')} ${sucia.causa('EV-05')}`
  );
  comprueba(
    'con el motivo «restauración correcta pero la cuenta restaurada no se pudo borrar»',
    sucia.motivo('EV-05').includes('restauración correcta pero la cuenta restaurada no se pudo borrar'),
    sucia.motivo('EV-05')
  );

  const fallida = evalua(eventos([prueba(3), prueba(1, { resultado: 'ok', coincide: 'no' }), latido()]));
  comprueba('la prueba más reciente no coincide → NO_CUMPLE aunque la anterior fuera buena', fallida.estado('EV-05') === 'NO_CUMPLE', fallida.motivo('EV-05'));

  const bajo = evalua(eventos([prueba(9), latido()]), BASE, 'BAJO');
  comprueba('en nivel BAJO, R1 no aplica', bajo.requisito('mp.info.6.r1.1').status === 'NO_APLICA', bajo.requisito('mp.info.6.r1.1').status);

  const porCriticidad = evalua(eventos([prueba(9), latido()]), { ...BASE, 'P-04': 'srv-01 | MEDIA', 'P-05': 'ALTA=7; MEDIA=14' });
  comprueba('P-05 por criticidad: srv-01 es MEDIA en P-04, plazo 14 días → la prueba de hace 9 días CUMPLE', porCriticidad.estado('EV-05') === 'CUMPLE', porCriticidad.motivo('EV-05'));
}

// ---------------------------------------------------------------------------

bloque('8. EV-06 · la copia fuera de la máquina (nivel ALTO)');

{
  const destino = (misma: string, activo: string, nombre: string) =>
    linea('backup_storage', { destino: nombre, misma_maquina: misma, tipo: misma === 'si' ? 'local' : 'remoto', activo });

  const soloLocal = evalua(eventos([destino('si', 'si', '/backup'), latido()]), BASE, 'ALTO');
  comprueba('solo misma_maquina=si → EV-06 NO_CUMPLE', soloLocal.estado('EV-06') === 'NO_CUMPLE', `${soloLocal.estado('EV-06')} ${soloLocal.motivo('EV-06')}`);

  const conRemoto = evalua(eventos([destino('si', 'si', '/backup'), destino('no', 'si', 'pbs-dr:datastore2'), latido()]), BASE, 'ALTO');
  comprueba('REVERSIÓN: con uno misma_maquina=no y activo=si → CUMPLE', conRemoto.estado('EV-06') === 'CUMPLE', conRemoto.motivo('EV-06'));

  const inactivo = evalua(eventos([destino('si', 'si', '/backup'), destino('no', 'no', 'pbs-dr:datastore2'), latido()]), BASE, 'ALTO');
  comprueba('el destino remoto inactivo no cuenta → NO_CUMPLE', inactivo.estado('EV-06') === 'NO_CUMPLE', inactivo.motivo('EV-06'));
}

// ---------------------------------------------------------------------------

bloque('9. Alcance por P-04');

{
  const NIVEL: ENSLevel = 'MEDIO';
  const ALCANCE: ENSAgentScope[] = [
    { id: SRV01.id, name: SRV01.name, groups: ['ens'] },
    { id: SRV02.id, name: SRV02.name, groups: ['ens'] },
  ];

  const activa = (valores: Valores): void => {
    ensConfigurationRepository.replaceActive({
      ...defaultENSConfigurationTemplate,
      global: { ...defaultENSConfigurationTemplate.global, ensLevel: NIVEL },
      scope: { mode: 'group', agentIds: [], groupIds: ['ens'] },
      controls: defaultENSConfigurationTemplate.controls.map(c =>
        c.controlId === CONTROL ? configuracion(valores) : c
      ),
    } as ENSConfigurationVersion);
  };

  // srv-01 no envía NADA. srv-02 sí envía hechos de mp.info.6 (una copia que
  // nunca ha salido bien) y un latido de op.exp.1, pero no está en P-04.
  const HECHOS = [
    ...eventos(
      [
        copia({ host: 'srv-02', ultima_correcta: '-', ultima_fallida: hace(2), resultado_ultima: 'error' }),
        latido(PASADA, { host: 'srv-02' }),
      ],
      SRV02
    ),
    ...normalizeWazuhAlerts([
      {
        _id: 'op-exp-1-latido',
        _source: {
          '@timestamp': PASADA,
          agent: SRV02,
          rule: { id: '110299', description: 'op.exp.1' },
          data: { ensfacil: 'op.exp.1', event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-05' },
        },
      },
    ]),
  ];

  const deControl = (resultados: { control: { id: string } }[], id: string) =>
    resultados.find(r => r.control.id === id) as any;

  // Lo que el motor produce para un control medido en una máquina que no ha
  // enviado nada: NO_CUMPLE sin ningún requisito demostrado, todas sus
  // evidencias NO_EVALUABLE y los hallazgos de RECOGIDA.
  const sinDatos = (r: any): boolean =>
    Boolean(r) &&
    r.status === 'NO_CUMPLE' &&
    r.measuredRequirements === 0 &&
    r.evidences.filter((e: any) => e.status !== 'NO_APLICA').every((e: any) => e.status === 'NO_EVALUABLE') &&
    r.nonConformities
      .filter((n: any) => n.id !== 'NC-CFG')
      .every((n: any) => n.origin === 'NO_EVIDENCIADA' && n.cause === 'COLLECTION');

  activa(BASE);

  {
    const estado = getENSComplianceState(NIVEL, HECHOS, undefined, ALCANCE, AHORA);
    const fila01 = estado.agents.find(a => a.agentId === SRV01.id)!;
    const fila02 = estado.agents.find(a => a.agentId === SRV02.id)!;
    const suyo = deControl(fila01.results, CONTROL);

    comprueba('srv-01 está en P-04 y no ha enviado nada: mp.info.6 SALE en su fila', Boolean(suyo), fila01.results.map(r => r.control.id).join(', '));
    comprueba('y sale «sin datos»: NO_CUMPLE sin nada demostrado, evidencias NO_EVALUABLE, hallazgos de RECOGIDA', sinDatos(suyo), JSON.stringify(suyo && { status: suyo.status, medidos: suyo.measuredRequirements, nc: suyo.nonConformities.map((n: any) => `${n.id}:${n.origin}/${n.cause}`) }));
    comprueba(
      'igual que otro control medido por su policy en esa máquina sin hechos (op.exp.8)',
      sinDatos(deControl(fila01.results, 'op.exp.8')) &&
        deControl(fila01.results, 'op.exp.8').status === suyo?.status,
      deControl(fila01.results, 'op.exp.8')?.status
    );
    comprueba('srv-02 está fuera de P-04: mp.info.6 NO sale en su fila', !deControl(fila02.results, CONTROL), fila02.results.map(r => r.control.id).join(', '));
    comprueba('y su fila no cuenta mp.info.6 en el resumen', fila02.summary.totalControls === fila01.summary.totalControls - 1, `${fila02.summary.totalControls} frente a ${fila01.summary.totalControls}`);

    const consolidado = deControl(estado.results, CONTROL);
    comprueba(
      'el consolidado resume solo srv-01: la copia fallida de srv-02 no suma ni resta',
      JSON.stringify(consolidado?.consolidatedAgents?.map((a: any) => a.agentId)) === '["001"]' && consolidado.measuredRequirements === 0,
      JSON.stringify(consolidado?.consolidatedAgents)
    );

    comprueba('detalle del control en la vista de srv-02 → sin resultado', getENSComplianceResultByControl(CONTROL, NIVEL, HECHOS, SRV02.id, ALCANCE, AHORA) === undefined);
    comprueba('detalle del control en la vista de srv-01 → «sin datos»', sinDatos(getENSComplianceResultByControl(CONTROL, NIVEL, HECHOS, SRV01.id, ALCANCE, AHORA)));
    comprueba(
      'detalle del control, consolidado → solo srv-01',
      JSON.stringify(getENSComplianceResultByControl(CONTROL, NIVEL, HECHOS, undefined, ALCANCE, AHORA)?.consolidatedAgents?.map(a => a.agentId)) === '["001"]'
    );
  }

  // P-04 no distingue mayúsculas y admite la criticidad detrás de la barra.
  activa({ ...BASE, 'P-04': 'SRV-01 | ALTA' });

  {
    const estado = getENSComplianceState(NIVEL, HECHOS, undefined, ALCANCE, AHORA);

    comprueba(
      'P-04 = «SRV-01 | ALTA» también incluye a srv-01',
      Boolean(deControl(estado.agents.find(a => a.agentId === SRV01.id)!.results, CONTROL))
    );
  }

  // REVERSIÓN: con srv-02 declarado, su copia fallida sí se juzga.
  activa({ ...BASE, 'P-04': ['srv-01', 'srv-02'] });

  {
    const estado = getENSComplianceState(NIVEL, HECHOS, undefined, ALCANCE, AHORA);
    const suyo = deControl(estado.agents.find(a => a.agentId === SRV02.id)!.results, CONTROL);

    comprueba(
      'REVERSIÓN: con srv-02 en P-04, su copia fallida sale NO_CUMPLE medido en su fila',
      Boolean(suyo) && suyo.requirements.some((q: any) => q.id === 'mp.info.6.2.a' && q.status === 'NO_CUMPLE' && q.evidenced === true),
      suyo && suyo.requirements.map((q: any) => `${q.id}:${q.status}/${q.evidenced}`).join(' ')
    );
  }

  // P-04 vacío: ninguna máquina declarada.
  activa({ ...BASE, 'P-04': undefined });

  {
    const estado = getENSComplianceState(NIVEL, HECHOS, undefined, ALCANCE, AHORA);
    const consolidado = deControl(estado.results, CONTROL);
    const requisitos = (consolidado?.nonConformities || []).filter((n: any) => n.id !== 'NC-CFG');

    comprueba('P-04 vacío: mp.info.6 no sale en ninguna fila', estado.agents.every(a => !deControl(a.results, CONTROL)));
    comprueba('pero sí en el consolidado: el panel tiene el catálogo entero', Boolean(consolidado));
    comprueba(
      'la MEDIDA del consolidado es NO_EVALUABLE: ninguna evidencia medida, ningún requisito demostrado',
      Boolean(consolidado) &&
        consolidado.measuredRequirements === 0 &&
        consolidado.evidences.filter((e: any) => e.status !== 'NO_APLICA').every((e: any) => e.status === 'NO_EVALUABLE'),
      consolidado && consolidado.evidences.map((e: any) => `${e.id}:${e.status}`).join(' ')
    );
    comprueba(
      'con causa CONFIGURACIÓN, nunca un NO_CUMPLE medido ni un fallo de recogida',
      requisitos.length > 0 &&
        requisitos.every((n: any) => n.origin === 'NO_EVIDENCIADA' && n.cause === 'CONFIGURATION'),
      requisitos.map((n: any) => `${n.requirementId}:${n.origin}/${n.cause}`).join(' ')
    );
    comprueba(
      'y el veredicto del control es el de la convención común: no demostrado, NO_CUMPLE al 0 %',
      Boolean(consolidado) && consolidado.status === 'NO_CUMPLE' && consolidado.score === 0,
      consolidado && `${consolidado.status} ${consolidado.score}`
    );
    comprueba(
      'el detalle del control dice lo mismo',
      (getENSComplianceResultByControl(CONTROL, NIVEL, HECHOS, undefined, ALCANCE, AHORA)?.nonConformities || [])
        .filter(n => n.id !== 'NC-CFG')
        .every(n => n.cause === 'CONFIGURATION')
    );
  }

  ensConfigurationRepository.reset();
}

// ---------------------------------------------------------------------------

bloque('10. Zimbra NE: buzones y directorio en la misma máquina, el peor manda');

{
  const zimbra = (objeto: string, campos: Linea = {}) =>
    copia({ origen: 'zimbra-ne', objeto, tipo: objeto === 'buzones' ? 'incremental' : 'volcado', destino: '/opt/zimbra/backup', ...campos });

  const dosBien = evalua(eventos([zimbra('buzones'), zimbra('directorio'), latido(PASADA, { rol: 'buzones,directorio' })]));
  comprueba('buzones y directorio con copia correcta → EV-01 CUMPLE', dosBien.estado('EV-01') === 'CUMPLE', dosBien.motivo('EV-01'));
  comprueba('y el motivo nombra los dos objetos', /buzones/.test(dosBien.motivo('EV-01')) && /directorio/.test(dosBien.motivo('EV-01')), dosBien.motivo('EV-01'));

  const directorioMal = evalua(
    eventos([
      zimbra('buzones'),
      zimbra('directorio', { ultima_correcta: '-', ultima_fallida: hace(3), resultado_ultima: 'error' }),
      latido(PASADA, { rol: 'buzones,directorio' }),
    ])
  );
  comprueba('el directorio sin copia correcta → EV-01 NO_CUMPLE aunque los buzones estén bien', directorioMal.estado('EV-01') === 'NO_CUMPLE' && /directorio/.test(directorioMal.motivo('EV-01')), directorioMal.motivo('EV-01'));

  const directorioSinMedir = evalua(
    eventos([
      zimbra('buzones'),
      linea('evidence_state', { origen: 'zimbra-ne', objeto: 'directorio', evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'zmslapcat no responde' }),
      latido(PASADA, { rol: 'buzones,directorio' }),
    ])
  );
  comprueba(
    'los buzones bien y el directorio sin poder medirse → EV-01 NO_EVALUABLE, nunca CUMPLE',
    directorioSinMedir.estado('EV-01') === 'NO_EVALUABLE' && directorioSinMedir.causa('EV-01') === 'COLLECTION',
    `${directorioSinMedir.estado('EV-01')} ${directorioSinMedir.motivo('EV-01')}`
  );
}

bloque('10b. Dos copias del mismo objeto en la misma pasada (backup_id)');

{
  const dosCopias = evalua(
    eventos([
      copia({ backup_id: 'host_opt-zimbra', ultima_correcta: hace(10) }),
      copia({ backup_id: 'host_root', ultima_correcta: hace(40), cuentas: 'root', campo_que_nadie_espera: 'x' }),
      latido(),
    ])
  );
  comprueba('host_opt-zimbra hace 10 h y host_root hace 40 h → EV-02 NO_CUMPLE', dosCopias.estado('EV-02') === 'NO_CUMPLE', `${dosCopias.estado('EV-02')} ${dosCopias.motivo('EV-02')}`);
  comprueba('nombrando host_root', /host_root/.test(dosCopias.motivo('EV-02')), dosCopias.motivo('EV-02'));

  const lasDosAlDia = evalua(
    eventos([
      copia({ backup_id: 'host_opt-zimbra', ultima_correcta: hace(10) }),
      copia({ backup_id: 'host_root', ultima_correcta: hace(12), cuentas: 'root', campo_que_nadie_espera: 'x' }),
      latido(),
    ])
  );
  comprueba('REVERSIÓN: las dos al día → CUMPLE (y los campos desconocidos no molestan)', lasDosAlDia.estado('EV-02') === 'CUMPLE', lasDosAlDia.motivo('EV-02'));
}

// ---------------------------------------------------------------------------

bloque('12. Dos recolectores en la misma máquina: PBS y Zimbra NE');

{
  // Un servidor de buzones con copia de ficheros por PBS y copias de Zimbra
  // NE: dos recolectores que pasan cada hora a minutos distintos, cada uno con
  // su latido. Ninguno puede esconder los hechos del otro.
  const PBS = hace(2);
  const ZIMBRA = hace(80 / 60);
  const zimbra = (objeto: string) =>
    copia({ origen: 'zimbra-ne', objeto, tipo: 'incremental', destino: '/opt/zimbra/backup' }, ZIMBRA);
  const latidoZimbra = latido(ZIMBRA, { origen: 'zimbra-ne', rol: 'buzones,directorio' });
  const pasadaZimbra = [zimbra('buzones'), zimbra('directorio'), latidoZimbra];

  const pbsViejo = evalua(eventos([copia({ ultima_correcta: hace(40) }, PBS), latido(PBS), ...pasadaZimbra]));
  comprueba(
    'PBS a las 10:00 con la copia de hace 40 h y Zimbra a las 10:40 al día → EV-02 NO_CUMPLE por la copia de ficheros',
    pbsViejo.estado('EV-02') === 'NO_CUMPLE' && /copia de ficheros \(pbs\)/.test(pbsViejo.motivo('EV-02')),
    `${pbsViejo.estado('EV-02')} ${pbsViejo.motivo('EV-02')}`
  );
  comprueba('y los hechos de Zimbra también se juzgan', /buzones/.test(pbsViejo.motivo('EV-02')) || /buzones/.test(pbsViejo.motivo('EV-01')), pbsViejo.motivo('EV-01'));

  const pbsBien = evalua(eventos([copia({ ultima_correcta: hace(12) }, PBS), latido(PBS), ...pasadaZimbra]));
  comprueba(
    'REVERSIÓN: la copia de ficheros de hace 12 h → EV-02 CUMPLE con los tres objetos',
    pbsBien.estado('EV-02') === 'CUMPLE' && ['ficheros', 'buzones', 'directorio'].every(o => pbsBien.motivo('EV-02').includes(o)),
    `${pbsBien.estado('EV-02')} ${pbsBien.motivo('EV-02')}`
  );
  comprueba(
    'EV-07: los dos latidos, cada uno con su origen → CUMPLE nombrando los dos',
    pbsBien.estado('EV-07') === 'CUMPLE' && /pbs/.test(pbsBien.motivo('EV-07')) && /zimbra-ne/.test(pbsBien.motivo('EV-07')),
    pbsBien.motivo('EV-07')
  );

  // El recorte de la última pasada sigue funcionando DENTRO de cada origen: la
  // pasada anterior del PBS (una copia que nunca había salido bien) no cuenta.
  const pbsAnterior = hace(3);
  const conPasadaAnterior = evalua(
    eventos([
      copia({ ultima_correcta: '-', ultima_fallida: hace(3.1), resultado_ultima: 'error' }, pbsAnterior),
      latido(pbsAnterior),
      copia({ ultima_correcta: hace(12) }, PBS),
      latido(PBS),
      ...pasadaZimbra,
    ])
  );
  comprueba('la pasada anterior del PBS la recorta su propio latido → EV-01 CUMPLE', conPasadaAnterior.estado('EV-01') === 'CUMPLE', conPasadaAnterior.motivo('EV-01'));

  // Otra cadencia: el PBS pasa tres horas antes que Zimbra.
  const cadencia = evalua(eventos([copia({ ultima_correcta: hace(40) }, hace(4)), latido(hace(4)), ...pasadaZimbra]));
  comprueba('el PBS pasó 3 h antes que Zimbra: su copia de hace 40 h sigue contando → EV-02 NO_CUMPLE', cadencia.estado('EV-02') === 'NO_CUMPLE', cadencia.motivo('EV-02'));

  // El recolector del PBS lleva 30 h sin pasar: su copia no se puede dar por
  // buena aunque Zimbra informe cada hora.
  const pbsParado = evalua(eventos([copia({ ultima_correcta: hace(31) }, hace(30)), latido(hace(30)), ...pasadaZimbra]));
  comprueba(
    'PBS parado 30 h y Zimbra al día → EV-01 NO_EVALUABLE por RECOGIDA, nunca CUMPLE',
    pbsParado.estado('EV-01') === 'NO_EVALUABLE' && pbsParado.causa('EV-01') === 'COLLECTION' && /pbs/.test(pbsParado.motivo('EV-01')),
    `${pbsParado.estado('EV-01')} ${pbsParado.causa('EV-01')} ${pbsParado.motivo('EV-01')}`
  );

  // Y por el motor entero, fila de la máquina.
  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuracion(BASE) : c)),
  });

  const fila = getENSComplianceResultByControl(
    CONTROL,
    'MEDIO',
    eventos([copia({ ultima_correcta: hace(40) }, PBS), latido(PBS), ...pasadaZimbra]),
    SRV01.id,
    [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }],
    AHORA
  );
  comprueba(
    'en el motor, la fila de la máquina: mp.info.6.2.a NO_CUMPLE medido por la copia del PBS',
    Boolean(fila) && fila!.requirements.some(q => q.id === 'mp.info.6.2.a' && q.status === 'NO_CUMPLE' && q.evidenced === true),
    fila && fila.requirements.map(q => `${q.id}:${q.status}/${q.evidenced}`).join(' ')
  );

  ensConfigurationRepository.reset();
}

// ---------------------------------------------------------------------------

bloque('13. Un veredicto antiguo del recolector no llega a la tabla');

{
  const veredicto = linea('evidence_state', { evidence_id: 'EV-05', estado: 'CUMPLE', motivo: 'restauracion correcta' }, hace(24 * 5));
  const r = evalua(eventos([veredicto, latido()]));

  comprueba(
    'evidence_state estado=CUMPLE para EV-05 y ninguna restore_test → EV-05 no sale CUMPLE en la tabla',
    r.estado('EV-05') === 'NO_EVALUABLE',
    `${r.estado('EV-05')} ${r.evidencia('EV-05')?.resolvedEventType || ''}`
  );

  const noCumple = linea('evidence_state', { evidence_id: 'EV-06', estado: 'NO_CUMPLE', motivo: 'sin copia offsite' });
  const r6 = evalua(eventos([noCumple, latido()]), BASE, 'ALTO');
  comprueba('ni un NO_CUMPLE: EV-06 sin hechos sale NO_EVALUABLE', r6.estado('EV-06') === 'NO_EVALUABLE', r6.estado('EV-06'));

  const degradado = linea('evidence_state', { evidence_id: 'EV-05', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no hay cuenta testigo declarada' });
  const r2 = evalua(eventos([degradado, latido()]));
  comprueba('REVERSIÓN: su NO_EVALUABLE sí llega, con su causa', r2.estado('EV-05') === 'NO_EVALUABLE' && r2.causa('EV-05') === 'CONFIGURATION', `${r2.estado('EV-05')} ${r2.causa('EV-05')}`);
}

// ---------------------------------------------------------------------------

bloque('14. mp.info.6.2.c: almacenamiento en otros lugares (EV-06 y EV-07)');

{
  const requisito = mpInfo6CatalogDefinition.requirements.find(q => q.id === 'mp.info.6.2.c')!;
  comprueba('el catálogo acredita mp.info.6.2.c con EV-06 y EV-07', ['EV-06', 'EV-07'].every(id => requisito.evidenceIds.includes(id)), requisito.evidenceIds.join(','));

  const soloLocal = eventos([
    linea('backup_storage', { destino: '/backup', misma_maquina: 'si', tipo: 'local', activo: 'si' }),
    latido(),
  ]);

  const alto = evalua(soloLocal, BASE, 'ALTO');
  comprueba(
    'en ALTO, solo copia local → mp.info.6.2.c NO_CUMPLE medido aunque el latido esté bien',
    alto.requisito('mp.info.6.2.c').status === 'NO_CUMPLE' && alto.requisito('mp.info.6.2.c').evidenced === true,
    `${alto.requisito('mp.info.6.2.c').status} ${alto.requisito('mp.info.6.2.c').evidenced}`
  );

  const medio = evalua(soloLocal, BASE, 'MEDIO');
  comprueba(
    'en MEDIO, EV-06 no aplica (la copia separada es R2 de ALTO): mp.info.6.2.c la decide EV-07 → CUMPLE',
    medio.requisito('mp.info.6.2.c').status === 'CUMPLE' && medio.estado('EV-06') === 'NO_APLICA',
    `${medio.requisito('mp.info.6.2.c').status} EV-06 ${medio.estado('EV-06')}`
  );

  const conRemoto = evalua(
    eventos([
      linea('backup_storage', { destino: '/backup', misma_maquina: 'si', tipo: 'local', activo: 'si' }),
      linea('backup_storage', { destino: 'pbs-dr:datastore2', misma_maquina: 'no', tipo: 'remoto', activo: 'si' }),
      latido(),
    ]),
    BASE,
    'ALTO'
  );
  comprueba('REVERSIÓN: en ALTO con copia fuera de la máquina → CUMPLE', conRemoto.requisito('mp.info.6.2.c').status === 'CUMPLE', conRemoto.requisito('mp.info.6.2.c').status);
}

// ---------------------------------------------------------------------------

bloque('15. El informe de mp.info.6 enseña lo medido');

{
  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuracion(BASE) : c)),
  });

  const hechos = eventos([
    copia({ ultima_correcta: '2026-09-30T02:00:00Z' }),
    linea('backup_retention', { retencion_dias: '45', copia_mas_antigua: '2026-08-20T02:00:00Z' }),
    linea('backup_access', { ruta: '/backup', modo: '750', propietario: 'root', grupo: 'backup', cuentas_con_lectura: 'root,backup', clave_ruta: '-', clave_modo: '-' }),
    linea('backup_storage', { destino: 'pbs-dr:datastore2', misma_maquina: 'no', tipo: 'remoto', activo: 'si' }),
    linea('restore_test', { fecha: '2026-09-28T03:00:00Z', testigo: '/etc/hostname', resultado: 'ok', coincide: 'si', limpieza: 'ok' }, '2026-09-28T03:00:00Z'),
    latido(),
  ]);

  const resultado = getENSComplianceResultByControl(CONTROL, 'ALTO', hechos, SRV01.id, [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }], AHORA);
  const informe = buildENSReportModel(CONTROL, resultado);
  const campo = (id: string) => informe?.fields.find(f => f.id === id);
  const valor = (id: string) => campo(id)?.value || '';

  comprueba('REP-02 · la última copia correcta, con su fecha y su antigüedad', /2026-09-30T02:00:00Z/.test(valor('REP-02')) && /10\.0 h/.test(valor('REP-02')), valor('REP-02'));
  comprueba('REP-03 · la antigüedad frente al plazo de P-01 + P-02', /10\.0 h/.test(valor('REP-03')) && /28 h/.test(valor('REP-03')), valor('REP-03'));
  comprueba('REP-05 · la retención configurada', /45 días/.test(valor('REP-05')), valor('REP-05'));
  comprueba('REP-06 · quién puede leer las copias', /root, backup/.test(valor('REP-06')), valor('REP-06'));
  comprueba('REP-07 · la última prueba de restauración, su resultado y su limpieza', /2026-09-28T03:00:00Z/.test(valor('REP-07')) && /limpieza ok/.test(valor('REP-07')), valor('REP-07'));
  comprueba('REP-08 · el destino fuera de la máquina', /pbs-dr:datastore2/.test(valor('REP-08')), valor('REP-08'));
  comprueba('ningún campo del informe sale SIN_DATOS con todos los hechos', (informe?.fields || []).every(f => !/SIN_DATOS/.test(f.value) && f.status !== 'SIN_DATOS'), (informe?.fields || []).filter(f => /SIN_DATOS/.test(f.value) || f.status === 'SIN_DATOS').map(f => `${f.id}: ${f.value}`).join(' | '));
  comprueba('y el estado de cada campo es el de su evidencia', campo('REP-02')?.status === 'CUMPLE' && campo('REP-08')?.status === 'CUMPLE', `${campo('REP-02')?.status} ${campo('REP-08')?.status}`);

  ensConfigurationRepository.reset();
}

// ---------------------------------------------------------------------------

bloque('11. Ningún otro control cambia');

{
  const fs = require('fs');
  const carpeta = process.env.ENSFACIL_REAL_DATA;
  const reales = Boolean(carpeta && fs.existsSync(`${carpeta}/data/now.txt`));

  let base: ENSConfigurationVersion = defaultENSConfigurationTemplate;
  let hechos: ENSNormalizedEvent[];
  let ahora = AHORA;

  if (reales) {
    const parametros = `${carpeta}/params/active.clean.json`;

    if (fs.existsSync(parametros)) {
      base = assertENSConfigurationVersion(JSON.parse(fs.readFileSync(parametros, 'utf8'))._source.configuration);
    }

    ahora = new Date(fs.readFileSync(`${carpeta}/data/now.txt`, 'utf8').trim());

    const vistos = new Set<string>();
    const hits: any[] = [];

    ENSCatalog.forEach(c => {
      const fichero = `${carpeta}/data/a-${c.id}.json`;

      if (!fs.existsSync(fichero)) {
        return;
      }

      JSON.parse(fs.readFileSync(fichero, 'utf8')).hits.hits.forEach((h: any) => {
        if (!vistos.has(h._id)) {
          vistos.add(h._id);
          hits.push(h);
        }
      });
    });

    hechos = normalizeWazuhAlerts(hits).filter(e => e.controlId !== CONTROL);
  } else {
    // Muestra mínima: dos controles en dos máquinas.
    hechos = normalizeWazuhAlerts(
      [SRV01, SRV02].flatMap(agente => [
        {
          _id: `op-exp-1-${agente.id}`,
          _source: {
            '@timestamp': PASADA,
            agent: agente,
            rule: { id: '110299' },
            data: { ensfacil: 'op.exp.1', event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-05' },
          },
        },
        {
          _id: `op-exp-8-${agente.id}`,
          _source: {
            '@timestamp': PASADA,
            agent: agente,
            rule: { id: '110901' },
            data: { ensfacil: 'op.exp.8', event: 'audit_log_status', evidence_id: 'EV-01', fuente: 'auditd', activo: 'si', reglas_cargadas: '80' },
          },
        },
      ])
    );
  }

  // El alcance: las máquinas que aparecen en los hechos, con el manager marcado.
  const alcance: ENSAgentScope[] = Array.from(
    new Map(hechos.filter(e => e.agentId).map(e => [e.agentId as string, e.agentName])).entries()
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, name]) => ({ id, name, groups: id === '000' ? [] : ['ens'], ...(id === '000' ? { isManager: true } : {}) }));

  const maquina = alcance.find(a => a.id !== '000')!;
  const nivel = base.global.ensLevel;

  const conMpInfo6 = (valores: Valores | undefined): void => {
    ensConfigurationRepository.replaceActive({
      ...base,
      controls: base.controls.map(c =>
        c.controlId !== CONTROL || !valores
          ? c
          : {
              ...c,
              parameters: c.parameters.map(p => {
                const { value: _anterior, ...sinValor } = p;

                return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
              }),
            }
      ),
    });
  };

  // Hechos de mp.info.6 de la primera máquina: una copia que nunca ha salido
  // bien, para que el control tenga algo que decir y no pase en vacío.
  const deMpInfo6 = eventos(
    [
      copia({ host: maquina.name || '', ultima_correcta: '-', ultima_fallida: ahora.toISOString(), resultado_ultima: 'error' }, ahora.toISOString()),
      latido(ahora.toISOString(), { host: maquina.name || '' }),
    ],
    { id: maquina.id, name: maquina.name || '' }
  );

  const huella = (valor: unknown): string =>
    JSON.stringify(valor, (clave, v) => (clave === 'evaluatedAt' ? undefined : v));

  const otros = ENSCatalog.map(c => c.id).filter(id => id !== CONTROL);

  const foto = (evs: ENSNormalizedEvent[]) => {
    const resultado: Record<string, string> = {};
    const vistas: Array<string | undefined> = [undefined, ...alcance.map(a => a.id)];

    vistas.forEach(vista => {
      const estado = getENSComplianceState(nivel, evs, vista, alcance, ahora);

      estado.results
        .filter(r => otros.includes(r.control.id))
        .forEach(r => {
          resultado[`vista ${vista || 'conjunto'} · ${r.control.id}`] = huella(r);
        });

      if (vista === undefined) {
        estado.agents.forEach(a =>
          a.results
            .filter(r => otros.includes(r.control.id))
            .forEach(r => {
              resultado[`fila ${a.agentId} · ${r.control.id}`] = huella(r);
            })
        );
      }
    });

    otros.forEach(id => {
      resultado[`detalle · ${id}`] = huella(getENSComplianceResultByControl(id, nivel, evs, undefined, alcance, ahora));
    });

    return resultado;
  };

  conMpInfo6({ 'P-04': undefined });
  const sin = foto(hechos);
  const filaSin = getENSComplianceState(nivel, hechos, undefined, alcance, ahora).agents.find(a => a.agentId === maquina.id)!;

  conMpInfo6({ ...BASE, 'P-04': maquina.name });
  const con = foto([...hechos, ...deMpInfo6]);
  const filaCon = getENSComplianceState(nivel, [...hechos, ...deMpInfo6], undefined, alcance, ahora).agents.find(a => a.agentId === maquina.id)!;

  comprueba(
    `${reales ? 'datos reales' : 'muestra mínima'}: sin P-04, mp.info.6 no está en la fila de ${maquina.name}; con P-04 y sus hechos, sí`,
    !filaSin.results.some(r => r.control.id === CONTROL) && filaCon.results.some(r => r.control.id === CONTROL)
  );

  const claves = Object.keys(sin);
  const distintos = claves.filter(k => sin[k] !== con[k]);

  comprueba(
    `los otros ${otros.length} controles no cambian (${claves.length} resultados comparados)`,
    otros.length === 16 && claves.length > otros.length && distintos.length === 0 && Object.keys(con).length === claves.length,
    distintos.slice(0, 5).join('; ')
  );

  ensConfigurationRepository.reset();
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
