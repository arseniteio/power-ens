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
 * El caso 11 compara los otros 18 controles con y sin mp.info.6 sobre datos
 * reales descargados del índice. La carpeta se indica con ENSFACIL_REAL_DATA
 * (con `data/a-<control>.json`, `data/now.txt` y, si existe,
 * `params/active.clean.json`); sin ella se usa una muestra mínima de dos
 * controles.
 *
 * El motor arrastra `kibana-services`, que solo existe en el árbol del plugin
 * `main` de Wazuh: se sustituye por un módulo vacío antes de cargarlo, igual
 * que en `measurement-planes.test.ts`.
 */
import { ENSCatalog } from '../public/ens/catalog';
import { mpInfo6CatalogDefinition } from '../public/ens/catalog/mp-info-6';
import { mpInfo6Configuration } from '../public/ens/configuration/data/mp-info-6-parameters';
import { defaultENSConfigurationTemplate } from '../public/ens/configuration/data/default-configuration';
import { ensConfigurationRepository } from '../public/ens/configuration/repository';
import { assertENSConfigurationVersion } from '../public/ens/configuration/services/configuration-structure-validator';
import { validateControlConfiguration } from '../public/ens/configuration/services/validation-engine';
import { normalizeWazuhAlerts } from '../public/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { keepLatestRunStateFacts } from '../public/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../public/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { runPolicyRuntime } from '../public/ens/core/policy-runtime/policy-runtime';
import {
  MP_INFO_6_REQUISITOS,
  mpInfo6PolicyDefinition,
} from '../public/ens/core/policy-runtime/policies/mp-info-6.policy';
import { buildENSReportModel } from '../public/ens/reports/registry';
import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../public/ens/configuration/types';
import type { ENSNormalizedEvent } from '../public/ens/core/data-source/types';
import type { ENSAgentScope } from '../public/ens/core/scope/types';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
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

const {
  getENSComplianceResultByControl,
  getENSComplianceState,
} = require('../public/ens/core/ens-engine') as typeof import('../public/ens/core/ens-engine');

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

  // La clave no la puede leer nadie más que su dueño: 0600 o 0400, como piden
  // las guías de los dos runbooks. Que la lea el GRUPO ya incumple: el grupo
  // de una clave suele ser el de un servicio, y quien la lee descifra todas
  // las copias.
  const conClave = (modo: string) => evalua(eventos([{ ...acceso('root,backup'), clave_modo: modo }, latido()]));
  const RUTA_CLAVE = /\/etc\/proxmox-backup-client\/encryption-key\.json/;

  const grupo = conClave('0640');
  comprueba(
    'la clave de cifrado legible por su grupo (0640) → NO_CUMPLE nombrando la clave y el modo',
    grupo.estado('EV-04') === 'NO_CUMPLE' && RUTA_CLAVE.test(grupo.motivo('EV-04')) && /0640/.test(grupo.motivo('EV-04')),
    `${grupo.estado('EV-04')} ${grupo.motivo('EV-04')}`
  );

  const otros = conClave('0644');
  comprueba(
    'la clave de cifrado legible por grupo y otros (0644) → NO_CUMPLE nombrando la clave y el modo',
    otros.estado('EV-04') === 'NO_CUMPLE' && RUTA_CLAVE.test(otros.motivo('EV-04')) && /0644/.test(otros.motivo('EV-04')),
    `${otros.estado('EV-04')} ${otros.motivo('EV-04')}`
  );

  const soloOtros = conClave('0604');
  comprueba(
    'la clave de cifrado legible solo por otros (0604) → NO_CUMPLE',
    soloOtros.estado('EV-04') === 'NO_CUMPLE' && /0604/.test(soloOtros.motivo('EV-04')),
    `${soloOtros.estado('EV-04')} ${soloOtros.motivo('EV-04')}`
  );

  const duena = conClave('0600');
  comprueba('REVERSIÓN: la clave con 0600 → CUMPLE', duena.estado('EV-04') === 'CUMPLE', `${duena.estado('EV-04')} ${duena.motivo('EV-04')}`);

  const soloLectura = conClave('0400');
  comprueba('REVERSIÓN: la clave con 0400 → CUMPLE', soloLectura.estado('EV-04') === 'CUMPLE', `${soloLectura.estado('EV-04')} ${soloLectura.motivo('EV-04')}`);

  // Escribir sin leer no da la clave: el eje es la lectura, no cualquier bit.
  const escrituraGrupo = conClave('0620');
  comprueba('REVERSIÓN: escritura de grupo sin lectura (0620) no cuenta como lectura → CUMPLE', escrituraGrupo.estado('EV-04') === 'CUMPLE', `${escrituraGrupo.estado('EV-04')} ${escrituraGrupo.motivo('EV-04')}`);
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

bloque('16. EV-02 · la planificación del cron vale para todos los backup-id');

{
  // El recolector del PBS emite un backup_run por backup-id y la planificación
  // una sola vez, sin backup_id: sale de la línea del cron que lanza la copia.
  const plan = (cada: string, planificacion = '17 2 * * *') =>
    linea('backup_schedule', { planificacion, intervalo_horas: cada, fuente: 'cron' });
  const dosCopias = [copia({ backup_id: 'srv01_root', ultima_correcta: hace(10) }), copia({ backup_id: 'srv01_opt-zimbra', ultima_correcta: hace(12) })];

  const diario = evalua(eventos([...dosCopias, plan('24'), latido()]));
  comprueba(
    'dos backup-id y una planificación sin backup_id cada 24 h → EV-02 CUMPLE',
    diario.estado('EV-02') === 'CUMPLE' && !/no el estado/.test(diario.motivo('EV-02')),
    `${diario.estado('EV-02')} ${diario.motivo('EV-02')}`
  );
  comprueba(
    'y la planificación se aplica a las dos copias',
    (diario.motivo('EV-02').match(/planificada cada 24 h/g) || []).length === 2,
    diario.motivo('EV-02')
  );

  const semanal = evalua(eventos([...dosCopias, plan('168', '@weekly'), latido()]));
  comprueba(
    'planificada cada 168 h con P-01 = 24 h → EV-02 NO_CUMPLE',
    semanal.estado('EV-02') === 'NO_CUMPLE' && /cada 168 h/.test(semanal.motivo('EV-02')),
    `${semanal.estado('EV-02')} ${semanal.motivo('EV-02')}`
  );

  const semanalHolgado = evalua(eventos([...dosCopias, plan('168', '@weekly'), latido()]), { ...BASE, 'P-01': '168' });
  comprueba('REVERSIÓN: la misma planificación con P-01 = 168 h → CUMPLE', semanalHolgado.estado('EV-02') === 'CUMPLE', semanalHolgado.motivo('EV-02'));

  const lasDos = evalua(eventos([...dosCopias, plan('168', '@weekly'), plan('24'), latido()]));
  comprueba(
    'una semanal y una diaria: manda la más frecuente → CUMPLE',
    lasDos.estado('EV-02') === 'CUMPLE' && /cada 24 h/.test(lasDos.motivo('EV-02')),
    lasDos.motivo('EV-02')
  );

  const soloPlan = evalua(eventos([plan('24'), latido()]));
  comprueba(
    'una planificación sin ninguna copia informada → EV-02 NO_EVALUABLE, nunca CUMPLE',
    soloPlan.estado('EV-02') === 'NO_EVALUABLE' && /no el estado de la última copia/.test(soloPlan.motivo('EV-02')),
    `${soloPlan.estado('EV-02')} ${soloPlan.motivo('EV-02')}`
  );
}

// ---------------------------------------------------------------------------

bloque('17. Las degradaciones sin backup_id son del par (origen y objeto)');

{
  const noPudo = (evidencia: string, causa: string, motivo: string, ts: string = PASADA, campos: Linea = {}) =>
    linea('evidence_state', { evidence_id: evidencia, estado: 'NO_EVALUABLE', causa, motivo, ...campos }, ts);
  const antes = hace(2);

  const reemplazada = evalua(
    eventos([
      noPudo('EV-01', 'COLLECTION', 'el PBS no respondió', antes),
      latido(antes, { resultado: 'parcial', evidencias_cubiertas: 'EV-04' }),
      copia({ backup_id: 'srv01_root' }),
      copia({ backup_id: 'srv01_opt-zimbra' }),
      latido(),
    ])
  );
  comprueba(
    'una degradación del par de hace 2 h y una pasada posterior con los backup-id → EV-01 CUMPLE',
    reemplazada.estado('EV-01') === 'CUMPLE',
    `${reemplazada.estado('EV-01')} ${reemplazada.motivo('EV-01')}`
  );

  const posterior = evalua(
    eventos([
      copia({ backup_id: 'srv01_root' }, antes),
      copia({ backup_id: 'srv01_opt-zimbra' }, antes),
      latido(antes),
      noPudo('EV-01', 'COLLECTION', 'el PBS no respondió'),
      latido(PASADA, { resultado: 'parcial', evidencias_cubiertas: 'EV-04' }),
    ])
  );
  comprueba(
    'REVERSIÓN: la degradación de la pasada posterior sustituye a los hechos → NO_EVALUABLE por RECOGIDA',
    posterior.estado('EV-01') === 'NO_EVALUABLE' && posterior.causa('EV-01') === 'COLLECTION' && /no respondió/.test(posterior.motivo('EV-01')),
    `${posterior.estado('EV-01')} ${posterior.causa('EV-01')} ${posterior.motivo('EV-01')}`
  );

  const mismaPasada = evalua(
    eventos([
      linea('backup_retention', { backup_id: 'srv01_root', retencion_dias: '-', copia_mas_antigua: hace(40 * 24) }),
      noPudo('EV-03', 'EVIDENCE', 'el PBS no conserva ninguna copia de srv01_nuevo'),
      latido(),
    ])
  );
  comprueba(
    'en la misma pasada, una copia medida y una degradación del par → EV-03 NO_EVALUABLE (una parte no se midió)',
    mismaPasada.estado('EV-03') === 'NO_EVALUABLE' && /srv01_nuevo/.test(mismaPasada.motivo('EV-03')),
    `${mismaPasada.estado('EV-03')} ${mismaPasada.motivo('EV-03')}`
  );

  const conFallo = evalua(
    eventos([
      linea('backup_retention', { backup_id: 'srv01_root', retencion_dias: '14', copia_mas_antigua: hace(10 * 24) }),
      noPudo('EV-03', 'EVIDENCE', 'el PBS no conserva ninguna copia de srv01_nuevo'),
      latido(),
    ])
  );
  comprueba('pero un incumplimiento medido en la misma pasada manda → EV-03 NO_CUMPLE', conFallo.estado('EV-03') === 'NO_CUMPLE', conFallo.motivo('EV-03'));

  // Una degradación sin origen (del recolector anterior) de hace tres días.
  const vieja = linea('evidence_state', { evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'sin PBS_REPO', origen: '', objeto: '' }, hace(72));
  const conVieja = evalua(eventos([vieja]));
  comprueba(
    'una degradación sin origen (vocabulario anterior) no se lee: EV-01 dice que no consta nada de esta máquina (RECOGIDA), no su CONFIGURATION',
    conVieja.estado('EV-01') === 'NO_EVALUABLE' && conVieja.causa('EV-01') === 'COLLECTION' && /No consta ningún/.test(conVieja.motivo('EV-01')),
    `${conVieja.estado('EV-01')} ${conVieja.causa('EV-01')} ${conVieja.motivo('EV-01')}`
  );
}

// ---------------------------------------------------------------------------

bloque('18. EV-05 · el plazo primero, y la ventana sin pruebas');

{
  const prueba = linea('restore_test', { fecha: hace(3 * 24), testigo: '/etc/ensfacil/mpinfo6-witness.txt', resultado: 'ok', coincide: 'si', limpieza: 'ok' }, hace(3 * 24));

  const sinPlazo = evalua(eventos([prueba, latido()]), { ...BASE, 'P-05': undefined });
  comprueba('sin P-05 → EV-05 NO_EVALUABLE por CONFIGURACIÓN aunque haya pruebas', sinPlazo.estado('EV-05') === 'NO_EVALUABLE' && sinPlazo.causa('EV-05') === 'CONFIGURATION', `${sinPlazo.estado('EV-05')} ${sinPlazo.causa('EV-05')}`);

  const ilegible = evalua(eventos([prueba, latido()]), { ...BASE, 'P-05': 'cada semana' });
  comprueba('P-05 ilegible → CONFIGURACIÓN', ilegible.estado('EV-05') === 'NO_EVALUABLE' && ilegible.causa('EV-05') === 'CONFIGURATION', `${ilegible.estado('EV-05')} ${ilegible.causa('EV-05')}`);

  const ventanaVacia = evalua(eventos([latido()]));
  comprueba(
    'ninguna prueba en la ventana con el recolector latiendo → NO_EVALUABLE por EVIDENCIA, sin culpar a la recogida',
    ventanaVacia.estado('EV-05') === 'NO_EVALUABLE' && ventanaVacia.causa('EV-05') === 'EVIDENCE' && /ventana consultada/.test(ventanaVacia.motivo('EV-05')),
    `${ventanaVacia.estado('EV-05')} ${ventanaVacia.causa('EV-05')} ${ventanaVacia.motivo('EV-05')}`
  );

  const sinNada = evalua([]);
  comprueba('sin ningún hecho ni latido → RECOGIDA', sinNada.estado('EV-05') === 'NO_EVALUABLE' && sinNada.causa('EV-05') === 'COLLECTION', `${sinNada.estado('EV-05')} ${sinNada.causa('EV-05')}`);

  const copiaSinPrueba = evalua(eventos([copia()]));
  comprueba(
    'una copia que el recolector informa y nunca se ha probado → NO_EVALUABLE por EVIDENCIA nombrándola',
    copiaSinPrueba.estado('EV-05') === 'NO_EVALUABLE' && copiaSinPrueba.causa('EV-05') === 'EVIDENCE' && /no consta ninguna prueba de restauración de los ficheros \(pbs\)/i.test(copiaSinPrueba.motivo('EV-05')),
    `${copiaSinPrueba.estado('EV-05')} ${copiaSinPrueba.causa('EV-05')} ${copiaSinPrueba.motivo('EV-05')}`
  );
}

// ---------------------------------------------------------------------------

bloque('19. P-04 con un nombre que no es de ningún agente');

{
  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuracion({ ...BASE, 'P-04': 'srv-99' }) : c)),
  });

  const alcance: ENSAgentScope[] = [
    { id: SRV01.id, name: SRV01.name, groups: ['ens'] },
    { id: SRV02.id, name: SRV02.name, groups: ['ens'] },
  ];
  const estado = getENSComplianceState('MEDIO', eventos([copia(), latido()]), undefined, alcance, AHORA);
  const consolidado = estado.results.find(r => r.control.id === CONTROL);
  const hallazgos = (consolidado?.nonConformities || []).filter(n => n.id !== 'NC-CFG');

  comprueba('ninguna fila lo mide', estado.agents.every(a => !a.results.some(r => r.control.id === CONTROL)));
  comprueba(
    'el consolidado dice CONFIGURACIÓN, no RECOGIDA',
    hallazgos.length > 0 && hallazgos.every(n => n.origin === 'NO_EVIDENCIADA' && n.cause === 'CONFIGURATION'),
    hallazgos.map(n => `${n.requirementId}:${n.cause}`).join(' ')
  );
  comprueba(
    'y el motivo nombra la máquina declarada que no existe',
    (consolidado?.evidences || []).some(e => e.observations.some(o => /srv-99/.test(o) && /no es ninguna máquina del alcance ENS/.test(o))),
    (consolidado?.evidences || [])[0]?.observations[0]
  );

  ensConfigurationRepository.reset();
}

// ---------------------------------------------------------------------------

bloque('20. Ramas de EV-03, EV-04, EV-06 y EV-07');

{
  const acceso = (cuentas: string, modo = '0640') =>
    linea('backup_access', { ruta: '/etc/ensfacil/mpinfo6.env', modo, propietario: 'root', grupo: 'root', cuentas_con_lectura: cuentas, clave_ruta: '-', clave_modo: '-' });

  const cualquiera = evalua(eventos([acceso('root,*'), latido()]));
  comprueba('cuentas_con_lectura con * → EV-04 NO_CUMPLE (cualquier cuenta)', cualquiera.estado('EV-04') === 'NO_CUMPLE' && /cualquier cuenta/.test(cualquiera.motivo('EV-04')), cualquiera.motivo('EV-04'));

  const mundo = evalua(eventos([acceso('root', '0644'), latido()]));
  comprueba('modo 0644 (lectura para otros) → EV-04 NO_CUMPLE', mundo.estado('EV-04') === 'NO_CUMPLE', mundo.motivo('EV-04'));

  const nadie = evalua(eventos([acceso('-', '0600'), latido()]));
  comprueba('cuentas_con_lectura = - es el conjunto vacío, no una cuenta llamada «-» → CUMPLE', nadie.estado('EV-04') === 'CUMPLE' && !/«-»|: -\./.test(nadie.motivo('EV-04')), `${nadie.estado('EV-04')} ${nadie.motivo('EV-04')}`);

  const sinInformar = evalua(eventos([acceso(''), latido()]));
  comprueba('cuentas_con_lectura vacío es que no se ha informado → NO_EVALUABLE', sinInformar.estado('EV-04') === 'NO_EVALUABLE', sinInformar.estado('EV-04'));

  const retencion = (antiguedadDias: number) =>
    linea('backup_retention', { backup_id: 'srv01_root', retencion_dias: '-', copia_mas_antigua: hace(antiguedadDias * 24) });

  const antigua = evalua(eventos([retencion(40), latido()]));
  comprueba('sin retención configurada y la copia más antigua de hace 40 días (≥ P-03) → EV-03 CUMPLE', antigua.estado('EV-03') === 'CUMPLE', antigua.motivo('EV-03'));

  const reciente = evalua(eventos([retencion(20), latido()]));
  comprueba('REVERSIÓN: la más antigua de hace 20 días (< P-03) → NO_EVALUABLE, nunca CUMPLE', reciente.estado('EV-03') === 'NO_EVALUABLE', `${reciente.estado('EV-03')} ${reciente.motivo('EV-03')}`);

  const dudoso = evalua(eventos([linea('backup_storage', { destino: 'nas:/copias', misma_maquina: 'desconocido', tipo: 'montaje', activo: 'si' }), latido()]), BASE, 'ALTO');
  comprueba('misma_maquina con un valor que no es si/no → EV-06 NO_EVALUABLE', dudoso.estado('EV-06') === 'NO_EVALUABLE', `${dudoso.estado('EV-06')} ${dudoso.motivo('EV-06')}`);

  const parcial = evalua(eventos([latido(PASADA, { resultado: 'parcial', evidencias_cubiertas: 'EV-01,EV-04' })]));
  comprueba('un latido parcial con cobertura declarada → EV-07 CUMPLE', parcial.estado('EV-07') === 'CUMPLE', `${parcial.estado('EV-07')} ${parcial.motivo('EV-07')}`);

  const fallida = evalua(eventos([latido(PASADA, { resultado: 'error' })]));
  comprueba('REVERSIÓN: un latido con resultado error → NO_EVALUABLE', fallida.estado('EV-07') === 'NO_EVALUABLE', fallida.estado('EV-07'));
}

// ---------------------------------------------------------------------------

bloque('21. La tabla de requisitos de la policy es la del catálogo');

{
  const ordena = (ids: string[]) => [...ids].sort().join(',');
  const catalogo = Object.fromEntries(mpInfo6CatalogDefinition.requirements.map(q => [q.id, ordena(q.evidenceIds)]));
  const policy = Object.fromEntries(Object.entries(MP_INFO_6_REQUISITOS).map(([id, q]) => [id, ordena(q.evidencias)]));
  const definicion = Object.fromEntries(mpInfo6PolicyDefinition.requirements.map(q => [q.requirementId, ordena(q.evidenceIds)]));

  comprueba('mismos requisitos y mismas evidencias que el catálogo', JSON.stringify(policy) === JSON.stringify(catalogo), `${JSON.stringify(policy)} ≠ ${JSON.stringify(catalogo)}`);
  comprueba('y que la definición de la policy', JSON.stringify(definicion) === JSON.stringify(catalogo), `${JSON.stringify(definicion)} ≠ ${JSON.stringify(catalogo)}`);
}

// ---------------------------------------------------------------------------

bloque('22. Una pasada real del recolector del PBS (tests/fixtures/mp-info-6-pbs-pass.ndjson)');

{
  // Salida tal cual de ens_mpinfo6_restore_test.sh y ens_mpinfo6_collect.sh
  // del runbook de Proxmox en modo --prueba, con un PBS simulado (ver
  // tests/fixtures/generate-mp-info-6-pbs-pass.sh): dos backup-id, la
  // planificación del cron, la retención con la copia más antigua, el acceso
  // a la credencial y a un directorio local, el repositorio y el latido.
  const fs = require('fs');
  const lineas: Linea[] = String(fs.readFileSync(`${__dirname}/fixtures/mp-info-6-pbs-pass.ndjson`, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l: string) => JSON.parse(l));
  const maquina = { id: SRV01.id, name: String(lineas[0].host) };
  const ahoraReal = new Date(Math.max(...lineas.map(l => Date.parse(String(l.ts)))) + 10 * 60 * 1000);
  const valores = { ...BASE, 'P-04': maquina.name };
  const real = evalua(eventos(lineas, maquina), valores, 'ALTO', ahoraReal);
  const todas = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'];

  comprueba(
    'las siete evidencias se miden: ninguna NO_EVALUABLE por cómo se cruzan los hechos',
    todas.every(id => real.estado(id) !== 'NO_EVALUABLE'),
    todas.map(id => `${id}:${real.estado(id)}`).join(' ')
  );
  comprueba('y con esta pasada, todas CUMPLE', todas.every(id => real.estado(id) === 'CUMPLE'), todas.filter(id => real.estado(id) !== 'CUMPLE').map(id => `${id}: ${real.motivo(id)}`).join(' | '));
  comprueba(
    'todos los requisitos de ALTO, demostrados',
    mpInfo6CatalogDefinition.requirements.every(q => real.requisito(q.id).evidenced === true),
    mpInfo6CatalogDefinition.requirements.map(q => `${q.id}:${real.requisito(q.id).status}/${real.requisito(q.id).evidenced}`).join(' ')
  );
  comprueba('EV-02 aplica la planificación del cron a los dos backup-id', (real.motivo('EV-02').match(/planificada cada 24 h/g) || []).length === 2, real.motivo('EV-02'));

  const nadie = evalua(eventos(lineas.map(l => (l.event === 'backup_access' ? { ...l, cuentas_con_lectura: '-' } : l)), maquina), valores, 'ALTO', ahoraReal);
  comprueba('con cuentas_con_lectura = - (nadie) → EV-04 sigue CUMPLE', nadie.estado('EV-04') === 'CUMPLE', nadie.motivo('EV-04'));

  const cualquiera = evalua(eventos(lineas.map(l => (l.event === 'backup_access' && l.tipo_ruta === 'directorio' ? { ...l, cuentas_con_lectura: 'backup,root,*' } : l)), maquina), valores, 'ALTO', ahoraReal);
  comprueba('con * en el directorio local → EV-04 NO_CUMPLE', cualquiera.estado('EV-04') === 'NO_CUMPLE', cualquiera.motivo('EV-04'));

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuracion(valores) : c)),
  });

  const fila = getENSComplianceResultByControl(CONTROL, 'ALTO', eventos(lineas, maquina), maquina.id, [{ ...maquina, groups: ['ens'] }], ahoraReal);
  comprueba(
    'y por el motor entero: la fila de la máquina, 100 % con todo demostrado',
    fila?.status === 'CUMPLE' && fila.measuredRequirements === fila.applicableRequirements,
    fila && `${fila.status} ${fila.score} ${fila.measuredRequirements}/${fila.applicableRequirements}`
  );

  ensConfigurationRepository.reset();
}

// ---------------------------------------------------------------------------

// Reescala TODAS las marcas de tiempo ISO-8601 de una pasada real para que su
// último hecho caiga en `destino`, conservando las distancias entre hechos
// que dejó el recolector real: solo se mueve el reloj, no la forma.
const reescala = (lineas: Linea[], destino: Date): Linea[] => {
  const maxTs = Math.max(...lineas.map(l => Date.parse(String(l.ts))));
  const delta = destino.getTime() - maxTs;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

  return lineas.map(l => {
    const desplazada: Linea = {};

    for (const [k, v] of Object.entries(l)) {
      desplazada[k] =
        typeof v === 'string' && iso.test(v)
          ? new Date(Date.parse(v) + delta).toISOString().replace('.000Z', 'Z')
          : v;
    }

    return desplazada;
  });
};

bloque('23. Una pasada real del recolector de Zimbra (tests/fixtures/mp-info-6-zimbra-pass.ndjson)');

{
  // Salida tal cual de ens_mpinfo6zimbra_collect.sh y
  // ens_mpinfo6zimbra_restore_test.sh del runbook de Zimbra en modo --prueba,
  // con un nodo simulado con los DOS papeles (buzones y directorio), edición
  // Network y ocho sesiones de zmbackup correctas (ver
  // tests/fixtures/generate-mp-info-6-zimbra-pass.sh): la planificación del
  // cron, la retención, el acceso al directorio de copias, el destino local Y
  // uno fuera de la máquina, la prueba de restauración de cada papel y el
  // latido con los dos papeles cubiertos.
  const fs = require('fs');
  const lineas: Linea[] = String(fs.readFileSync(`${__dirname}/fixtures/mp-info-6-zimbra-pass.ndjson`, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l: string) => JSON.parse(l));
  const maquina = { id: SRV01.id, name: String(lineas[0].host) };
  const ahoraReal = new Date(Math.max(...lineas.map(l => Date.parse(String(l.ts)))) + 10 * 60 * 1000);
  // P-07 incluye la cuenta que de verdad posee el directorio de copias en un
  // Zimbra (zimbra), igual que P-04 recoge el nombre real de la máquina.
  const valores = { ...BASE, 'P-04': maquina.name, 'P-07': 'zimbra' };
  const real = evalua(eventos(lineas, maquina), valores, 'ALTO', ahoraReal);
  const todas = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'];

  comprueba(
    'las siete evidencias se miden: ninguna NO_EVALUABLE por cómo se cruzan los hechos de buzones y directorio',
    todas.every(id => real.estado(id) !== 'NO_EVALUABLE'),
    todas.map(id => `${id}:${real.estado(id)}`).join(' ')
  );
  comprueba(
    'y con esta pasada, todas CUMPLE',
    todas.every(id => real.estado(id) === 'CUMPLE'),
    todas.filter(id => real.estado(id) !== 'CUMPLE').map(id => `${id}: ${real.motivo(id)}`).join(' | ')
  );
  comprueba(
    'EV-01 nombra los dos objetos del nodo: buzones y directorio',
    /buzones/.test(real.motivo('EV-01')) && /directorio/.test(real.motivo('EV-01')),
    real.motivo('EV-01')
  );
  // EV-06 (copia fuera de la máquina, solo ALTO): el fixture declara
  // MPINFO6ZIMBRA_COPIA_REMOTA_DESTINO con su testigo de sincronización
  // recién tocado, así que el recolector emite un backup_storage remoto
  // (misma_maquina=no, activo=si) ADEMÁS del local, para cada objeto. Con uno
  // de los dos destinos fuera de la máquina y activo, el requisito se
  // demuestra igual que en el PBS (bloque 8): CUMPLE, no NO_APLICA, porque el
  // nivel es ALTO.
  comprueba(
    'EV-06 CUMPLE: la copia remota declarada está activa para los dos objetos',
    real.estado('EV-06') === 'CUMPLE' && /buzones/.test(real.motivo('EV-06')) && /directorio/.test(real.motivo('EV-06')),
    real.motivo('EV-06')
  );
  comprueba(
    'todos los requisitos de ALTO, demostrados',
    mpInfo6CatalogDefinition.requirements.every(q => real.requisito(q.id).evidenced === true),
    mpInfo6CatalogDefinition.requirements.map(q => `${q.id}:${real.requisito(q.id).status}/${real.requisito(q.id).evidenced}`).join(' ')
  );
  comprueba(
    'EV-07: el latido nombra los dos papeles cubiertos',
    /EV-01/.test(real.motivo('EV-07')) && /EV-06/.test(real.motivo('EV-07')),
    real.motivo('EV-07')
  );

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuracion(valores) : c)),
  });

  const fila = getENSComplianceResultByControl(CONTROL, 'ALTO', eventos(lineas, maquina), maquina.id, [{ ...maquina, groups: ['ens'] }], ahoraReal);
  comprueba(
    'y por el motor entero: la fila de la máquina, 100 % con todo demostrado',
    fila?.status === 'CUMPLE' && fila.measuredRequirements === fila.applicableRequirements,
    fila && `${fila.status} ${fila.score} ${fila.measuredRequirements}/${fila.applicableRequirements}`
  );

  ensConfigurationRepository.reset();
}

// ---------------------------------------------------------------------------

bloque('24. PBS y Zimbra reales en el mismo agente, a minutos distintos');

{
  // Las dos pasadas REALES (bloques 22 y 23) pero de UN mismo agente: cada
  // recolector con su propio latido, a minutos distintos dentro de la misma
  // hora -el PBS a la hora en punto, Zimbra 40 minutos más tarde-, igual que
  // el bloque 12 (hecho a mano) pero con la forma real de los dos runbooks.
  // Se reescala cada pasada sobre SU PROPIO último hecho: las distancias
  // internas de cada una -antigüedad de copias, retención- no cambian, solo
  // el instante en que "ahora" las mira.
  const fs = require('fs');
  const cargaLineas = (fichero: string): Linea[] =>
    String(fs.readFileSync(`${__dirname}/fixtures/${fichero}`, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l: string) => JSON.parse(l));

  const ahoraReal = new Date('2026-09-30T14:00:00Z');
  const pbsHora = new Date(ahoraReal.getTime() - 2 * HORA);
  const zimbraHora = new Date(ahoraReal.getTime() - 2 * HORA + 40 * 60 * 1000);

  const pbs = reescala(cargaLineas('mp-info-6-pbs-pass.ndjson'), pbsHora);
  const zimbra = reescala(cargaLineas('mp-info-6-zimbra-pass.ndjson'), zimbraHora);

  const maquina = SRV01;
  const valores = { ...BASE, 'P-04': maquina.name, 'P-07': 'root,backup,zimbra' };
  const real = evalua(eventos([...pbs, ...zimbra], maquina), valores, 'ALTO', ahoraReal);
  const todas = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'];

  comprueba(
    'las dos pasadas reales conviven: ninguna evidencia se queda sin medir por tener dos orígenes',
    todas.every(id => real.estado(id) !== 'NO_EVALUABLE'),
    todas.map(id => `${id}:${real.estado(id)}`).join(' ')
  );
  comprueba(
    'EV-01 (el peor manda) nombra los tres objetos: ficheros del PBS, buzones y directorio de Zimbra',
    ['ficheros', 'buzones', 'directorio'].every(o => real.motivo('EV-01').includes(o)),
    real.motivo('EV-01')
  );
  comprueba(
    'EV-07 nombra los dos orígenes, cada uno con su latido: ninguno tapa al otro',
    /pbs/.test(real.motivo('EV-07')) && /zimbra-ne/.test(real.motivo('EV-07')),
    real.motivo('EV-07')
  );
  comprueba('y con las dos pasadas al día, todas CUMPLE', todas.every(id => real.estado(id) === 'CUMPLE'), todas.filter(id => real.estado(id) !== 'CUMPLE').map(id => `${id}: ${real.motivo(id)}`).join(' | '));

  // REVERSIÓN: si el PBS se para 30 horas -su latido incluido, no solo sus
  // copias- su mitad falla y la de Zimbra -que sigue latiendo cada hora- no
  // la disimula.
  const pbsParado = reescala(cargaLineas('mp-info-6-pbs-pass.ndjson'), new Date(zimbraHora.getTime() - 30 * HORA));
  const paro = evalua(eventos([...pbsParado, ...zimbra], maquina), valores, 'ALTO', ahoraReal);
  comprueba(
    'REVERSIÓN: el PBS 30 h sin latir → EV-07 NO_EVALUABLE por RECOGIDA nombrando pbs, aunque Zimbra siga latiendo al día',
    paro.estado('EV-07') === 'NO_EVALUABLE' && paro.causa('EV-07') === 'COLLECTION' && /pbs/.test(paro.motivo('EV-07')),
    `${paro.estado('EV-07')} ${paro.causa('EV-07')} ${paro.motivo('EV-07')}`
  );
}

// ---------------------------------------------------------------------------

bloque('25. Una máquina actualizada con latidos del recolector anterior');

{
  // El recolector anterior (su score.py) latía con `collector_run` sin
  // `origen` (regla 106608) y ponía veredictos. Tras actualizar, esos eventos
  // siguen en la ventana un mes: no pueden contar como un recolector más.
  const MAQUINA = { id: '034', name: 'mp.info' };
  const T = hace(0.9);
  const nueva = (event: string, campos: Linea) => linea(event, { host: MAQUINA.name, ...campos }, T);
  const nuevos = [
    nueva('backup_run', { backup_id: 'r', ultima_correcta: hace(10), ultima_fallida: '-', resultado_ultima: 'ok', tipo: 'completa' }),
    nueva('backup_schedule', { planificacion: '17 2 * * *', intervalo_horas: '24', fuente: 'cron' }),
    nueva('backup_retention', { backup_id: 'r', retencion_dias: '-', copia_mas_antigua: hace(24 * 40) }),
    nueva('backup_access', { ruta: '/etc/ensfacil/mpinfo6.env', modo: '0640', propietario: 'root', grupo: 'root', cuentas_con_lectura: 'root', clave_ruta: '-', clave_modo: '-' }),
    nueva('backup_storage', { destino: 'pbs:ds', misma_maquina: 'no', tipo: 'remoto', activo: 'si' }),
    nueva('restore_test', { backup_id: 'r', fecha: hace(24), testigo: '/etc/w', resultado: 'ok', coincide: 'si', limpieza: 'ok' }),
    latido(T, { host: MAQUINA.name }),
  ];
  const viejos = normalizeWazuhAlerts([
    { _id: 'viejo-latido', _source: { '@timestamp': hace(72), agent: MAQUINA, rule: { id: '106608' }, data: { ensfacil: 'mp.info.6', event: 'collector_run', version: '1', resultado: 'completada', evidencias_cubiertas: 'EV-01,EV-02,EV-07' } } },
    { _id: 'viejo-estado', _source: { '@timestamp': hace(72), agent: MAQUINA, rule: { id: '106700' }, data: { ensfacil: 'mp.info.6', event: 'evidence_state', evidence_id: 'EV-07', estado: 'CUMPLE' } } },
  ]);

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuracion({ ...BASE, 'P-04': MAQUINA.name }) : c)),
  });

  const fila = getENSComplianceResultByControl(CONTROL, 'MEDIO', [...viejos, ...eventos(nuevos, MAQUINA)], MAQUINA.id, [{ ...MAQUINA, groups: ['ens', 'ens-copias'] }], AHORA);
  const ev07 = fila?.evidences.find(e => e.id === 'EV-07');

  comprueba('con el latido viejo sin origen en la ventana, EV-07 sigue CUMPLE', ev07?.status === 'CUMPLE', `${ev07?.status} ${ev07?.observations[0]}`);
  comprueba('y la máquina, al día, sale CUMPLE', fila?.status === 'CUMPLE', `${fila?.status} ${fila?.score}`);

  ensConfigurationRepository.reset();
}

// ---------------------------------------------------------------------------

bloque('26. EV-05 por origen y objeto: cada copia tiene que dar cuenta de su prueba');

{
  const zimbraRun = (objeto: string, origen = 'zimbra-ne') =>
    copia({ origen, objeto, tipo: 'incremental', destino: '/opt/zimbra/backup' });
  const latidoZimbra = latido(PASADA, { origen: 'zimbra-ne', rol: 'buzones,directorio' });
  const prueba = (origen: string, objeto: string, campos: Linea = {}) =>
    linea('restore_test', { origen, objeto, fecha: hace(72), testigo: 'testigo', resultado: 'ok', coincide: 'si', limpieza: 'ok', ...campos }, hace(72));
  const sinTestigo = linea(
    'evidence_state',
    { origen: 'zimbra-ne', objeto: 'buzones', evidence_id: 'EV-05', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'declara MPINFO6ZIMBRA_TESTIGO, la cuenta testigo' },
    hace(72)
  );

  const directorioSolo = evalua(eventos([zimbraRun('buzones'), zimbraRun('directorio'), latidoZimbra, prueba('zimbra-ne', 'directorio'), sinTestigo]));
  comprueba(
    'Zimbra: el directorio probado y los buzones nunca (sin testigo declarado) → EV-05 NO_EVALUABLE por CONFIGURACIÓN, nunca CUMPLE',
    directorioSolo.estado('EV-05') === 'NO_EVALUABLE' && directorioSolo.causa('EV-05') === 'CONFIGURATION' && /MPINFO6ZIMBRA_TESTIGO/.test(directorioSolo.motivo('EV-05')),
    `${directorioSolo.estado('EV-05')} ${directorioSolo.causa('EV-05')} ${directorioSolo.motivo('EV-05')}`
  );

  const lasDos = evalua(eventos([zimbraRun('buzones'), zimbraRun('directorio'), latidoZimbra, prueba('zimbra-ne', 'directorio'), prueba('zimbra-ne', 'buzones')]));
  comprueba('REVERSIÓN: con la prueba de los buzones también → CUMPLE', lasDos.estado('EV-05') === 'CUMPLE', lasDos.motivo('EV-05'));

  const ose = evalua(eventos([zimbraRun('buzones', 'zimbra-ose-declarada'), latido(PASADA, { origen: 'zimbra-ose-declarada', rol: 'buzones' })]));
  comprueba(
    'Zimbra Open Source: buzones sin zmrestore ni prueba → NO_EVALUABLE por EVIDENCIA, con un motivo que dice qué copia',
    ose.estado('EV-05') === 'NO_EVALUABLE' && ose.causa('EV-05') === 'EVIDENCE' && /no consta ninguna prueba de restauración de los buzones \(zimbra-ose-declarada\)/i.test(ose.motivo('EV-05')),
    `${ose.estado('EV-05')} ${ose.causa('EV-05')} ${ose.motivo('EV-05')}`
  );

  const pbsDos = evalua(
    eventos([
      copia({ backup_id: 'srv01_root' }),
      copia({ backup_id: 'srv01_opt-zimbra' }),
      latido(),
      prueba('pbs', 'fichero', { backup_id: 'srv01_root', testigo: '/etc/ensfacil/mpinfo6-witness.txt' }),
    ])
  );
  comprueba('PBS con dos backup-id y el testigo en uno de ellos → CUMPLE (la prueba es del par)', pbsDos.estado('EV-05') === 'CUMPLE', `${pbsDos.estado('EV-05')} ${pbsDos.motivo('EV-05')}`);

  const soloPbs = evalua(
    eventos([
      copia({ backup_id: 'srv01_root' }),
      latido(),
      zimbraRun('buzones'),
      zimbraRun('directorio'),
      latidoZimbra,
      prueba('pbs', 'fichero', { backup_id: 'srv01_root' }),
    ])
  );
  comprueba(
    'un servidor con PBS y Zimbra donde solo se probó el PBS → no CUMPLE',
    soloPbs.estado('EV-05') !== 'CUMPLE' && /buzones/.test(soloPbs.motivo('EV-05')) && /directorio/.test(soloPbs.motivo('EV-05')),
    `${soloPbs.estado('EV-05')} ${soloPbs.motivo('EV-05')}`
  );
}

// ---------------------------------------------------------------------------

bloque('27. P-04 con una máquina que no es del alcance ENS');

{
  const NIVEL: ENSLevel = 'ALTO';
  const COPIAS = { id: '003', name: 'srv-copias' };
  const alDia = (agente: Agente) =>
    eventos(
      [
        copia({ host: agente.name, backup_id: 'r' }),
        linea('backup_schedule', { host: agente.name, planificacion: '17 2 * * *', intervalo_horas: '24', fuente: 'cron' }),
        linea('backup_retention', { host: agente.name, backup_id: 'r', retencion_dias: '-', copia_mas_antigua: hace(24 * 40) }),
        linea('backup_access', { host: agente.name, ruta: '/etc/ensfacil/mpinfo6.env', modo: '0640', propietario: 'root', grupo: 'root', cuentas_con_lectura: 'root', clave_ruta: '-', clave_modo: '-' }),
        linea('backup_storage', { host: agente.name, destino: 'pbs:ds', misma_maquina: 'no', tipo: 'remoto', activo: 'si' }),
        linea('restore_test', { host: agente.name, backup_id: 'r', fecha: hace(24), testigo: '/etc/w', resultado: 'ok', coincide: 'si', limpieza: 'ok' }),
        latido(PASADA, { host: agente.name }),
      ],
      agente
    );
  const ALCANCE: ENSAgentScope[] = [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }];
  const activa = (p04: string[]) =>
    ensConfigurationRepository.replaceActive({
      ...defaultENSConfigurationTemplate,
      controls: defaultENSConfigurationTemplate.controls.map(c =>
        c.controlId === CONTROL ? configuracion({ ...BASE, 'P-04': p04, 'P-08': 'si' }) : c
      ),
    });
  const hallazgoQueNombra = (r: any, nombre: string) =>
    (r?.nonConformities || []).some(
      (n: any) => n.cause === 'CONFIGURATION' && n.finding.includes(nombre) && /no es ninguna máquina del alcance ENS/.test(n.finding)
    );

  activa(['srv-01']);
  const soloUna = getENSComplianceResultByControl(CONTROL, NIVEL, alDia(SRV01), undefined, ALCANCE, AHORA);
  comprueba('P-04 = srv-01 y srv-01 al día → CUMPLE 100', soloUna?.status === 'CUMPLE' && soloUna.score === 100, `${soloUna?.status} ${soloUna?.score}`);

  activa(['srv-01', 'srv-99']);
  const conErrata = getENSComplianceResultByControl(CONTROL, NIVEL, alDia(SRV01), undefined, ALCANCE, AHORA);
  comprueba('P-04 = srv-01, srv-99 (errata) → ya no CUMPLE 100', Boolean(conErrata) && conErrata!.status !== 'CUMPLE', `${conErrata?.status} ${conErrata?.score}`);
  comprueba('y un hallazgo de CONFIGURACIÓN nombra srv-99', hallazgoQueNombra(conErrata, 'srv-99'), (conErrata?.nonConformities || []).map(n => `${n.cause}: ${n.finding.slice(0, 160)}`).join(' | '));
  comprueba(
    'srv-99 cuenta como máquina declarada sin datos en el consolidado',
    JSON.stringify(conErrata?.consolidatedAgents?.map(a => a.agentName)) === '["srv-01","srv-99"]',
    JSON.stringify(conErrata?.consolidatedAgents)
  );

  const estado = getENSComplianceState(NIVEL, alDia(SRV01), undefined, ALCANCE, AHORA);
  const panel = estado.results.find(r => r.control.id === CONTROL);
  comprueba('el panel dice lo mismo', Boolean(panel) && panel!.status !== 'CUMPLE' && hallazgoQueNombra(panel, 'srv-99'), `${panel?.status}`);
  comprueba('pero srv-99 no aparece como una fila del panel: no es una máquina del alcance', estado.agents.every(a => a.agentName !== 'srv-99'), estado.agents.map(a => a.agentName).join(','));

  activa(['srv-01', 'srv-copias']);
  const soloEnCopias = getENSComplianceResultByControl(CONTROL, NIVEL, [...alDia(SRV01), ...alDia(COPIAS)], undefined, ALCANCE, AHORA);
  comprueba(
    'una máquina solo en ens-copias (fuera del alcance ENS) aunque envíe datos → hallazgo de CONFIGURACIÓN que la nombra, no CUMPLE',
    Boolean(soloEnCopias) && soloEnCopias!.status !== 'CUMPLE' && hallazgoQueNombra(soloEnCopias, 'srv-copias'),
    `${soloEnCopias?.status} ${(soloEnCopias?.nonConformities || []).map(n => n.cause).join(',')}`
  );

  ensConfigurationRepository.reset();
}

// ---------------------------------------------------------------------------

bloque('28. EV-02 · PBS caído más de 26 h: la causa sigue siendo la recogida');

{
  const ahora = PASADA;
  const noPudo = (evidencia: string) =>
    linea('evidence_state', { evidence_id: evidencia, estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se pudo listar las copias de pbs:ds: connection refused' }, ahora);
  const caido = evalua(
    eventos([
      copia({ backup_id: 'srv01_root', ultima_correcta: hace(40) }, hace(30)),
      ...['EV-01', 'EV-02', 'EV-03'].map(noPudo),
      linea('backup_schedule', { planificacion: '17 2 * * *', intervalo_horas: '24', fuente: 'cron' }, ahora),
      latido(ahora, { resultado: 'parcial', evidencias_cubiertas: 'EV-04' }),
    ])
  );
  comprueba(
    'con el plan del cron al día y el PBS sin responder → EV-02 NO_EVALUABLE por RECOGIDA, no por EVIDENCIA',
    caido.estado('EV-02') === 'NO_EVALUABLE' && caido.causa('EV-02') === 'COLLECTION',
    `${caido.estado('EV-02')} ${caido.causa('EV-02')} ${caido.motivo('EV-02')}`
  );
}

// ---------------------------------------------------------------------------

bloque('29. EV-02 · planificacion=- es que no hay ninguna copia planificada');

{
  const plan = (planificacion: string, cada: string) =>
    linea('backup_schedule', { origen: 'zimbra-ne', objeto: 'buzones', planificacion, intervalo_horas: cada, fuente: 'cron' });
  const buzones = copia({ origen: 'zimbra-ne', objeto: 'buzones', tipo: 'incremental', destino: '/opt/zimbra/backup' });

  const sinPlan = evalua(eventos([buzones, plan('-', '-'), latido(PASADA, { origen: 'zimbra-ne' })]));
  comprueba(
    'Zimbra con planificacion=- → EV-02 NO_CUMPLE «no hay ninguna copia planificada»',
    sinPlan.estado('EV-02') === 'NO_CUMPLE' && /no hay ninguna copia planificada/.test(sinPlan.motivo('EV-02')),
    `${sinPlan.estado('EV-02')} ${sinPlan.motivo('EV-02')}`
  );

  const conPlan = evalua(eventos([buzones, plan('completa 0 1 * * 6; incremental 0 1 * * 0-5', '24'), latido(PASADA, { origen: 'zimbra-ne' })]));
  comprueba('REVERSIÓN: con la planificación leída → CUMPLE', conPlan.estado('EV-02') === 'CUMPLE', conPlan.motivo('EV-02'));
}

// ---------------------------------------------------------------------------

bloque('30. El informe nombra cada copia una vez, con su último estado');

{
  // Durante la hora siguiente a una copia conviven la pasada horaria (con la
  // copia de ayer) y la del final de la copia (con la de ahora).
  const cfg = configuracion(BASE);
  const hechosPolicy = eventos([
    copia({ backup_id: 'srv01_root', ultima_correcta: hace(24.5) }, hace(0.9)),
    copia({ backup_id: 'srv01_root', ultima_correcta: hace(0.4) }, hace(0.3)),
  ]);
  const { runtimeVariables } = runPolicyRuntime(buildPolicyContext(mpInfo6CatalogDefinition, cfg, 'MEDIO', hechosPolicy, [], AHORA));
  const lista = runtimeVariables.find(v => v.name === 'copias_ultima_correcta')?.value as string[];
  const edad = runtimeVariables.find(v => v.name === 'copias_antiguedad_maxima_horas')?.value;

  comprueba('srv01_root sale una sola vez', Array.isArray(lista) && lista.filter(l => l.includes('srv01_root')).length === 1, JSON.stringify(lista));
  comprueba('con la copia de ahora, no la de ayer', edad === 0.4, String(edad));
}

// ---------------------------------------------------------------------------

bloque('31. EV-01 · A4, los puntos de montaje que la copia dejó fuera');

{
  const conOmision = evalua(eventos([copia({ montajes_omitidos: '/opt/zimbra/backup' }), latido()]));
  comprueba(
    'montajes_omitidos con un punto de montaje → EV-01 NO_CUMPLE nombrando el directorio',
    conOmision.estado('EV-01') === 'NO_CUMPLE' && /\/opt\/zimbra\/backup/.test(conOmision.motivo('EV-01')),
    `${conOmision.estado('EV-01')} ${conOmision.motivo('EV-01')}`
  );
  comprueba(
    'y el motivo dice que está en otro disco y que no se incluyó',
    /otro disco/.test(conOmision.motivo('EV-01')) && /no se incluyeron en la copia/.test(conOmision.motivo('EV-01')),
    conOmision.motivo('EV-01')
  );

  const desconocido = evalua(eventos([copia({ montajes_omitidos: '-' }), latido()]));
  comprueba(
    'REVERSIÓN: montajes_omitidos=- (sin log, desconocido) no cuenta → EV-01 sigue CUMPLE',
    desconocido.estado('EV-01') === 'CUMPLE',
    `${desconocido.estado('EV-01')} ${desconocido.motivo('EV-01')}`
  );

  const ninguno = evalua(eventos([copia({ montajes_omitidos: '' }), latido()]));
  comprueba(
    'montajes_omitidos vacío (ninguno) no cuenta → EV-01 sigue CUMPLE',
    ninguno.estado('EV-01') === 'CUMPLE',
    `${ninguno.estado('EV-01')} ${ninguno.motivo('EV-01')}`
  );

  const sinCampo = evalua(eventos([copia(), latido()]));
  comprueba(
    'un hecho sin el campo (recolector anterior) se juzga igual que antes → EV-01 CUMPLE',
    sinCampo.estado('EV-01') === 'CUMPLE',
    `${sinCampo.estado('EV-01')} ${sinCampo.motivo('EV-01')}`
  );

  const aceptado = evalua(eventos([copia({ montajes_omitidos: '', montajes_omitidos_aceptados: '/mnt/aceptado' }), latido()]));
  comprueba(
    'montajes_omitidos_aceptados se cita en el motivo',
    /\/mnt\/aceptado/.test(aceptado.motivo('EV-01')),
    aceptado.motivo('EV-01')
  );
  comprueba(
    'pero no cuenta: EV-01 sigue CUMPLE',
    aceptado.estado('EV-01') === 'CUMPLE',
    `${aceptado.estado('EV-01')} ${aceptado.motivo('EV-01')}`
  );

  const ambos = evalua(
    eventos([copia({ montajes_omitidos: '/opt/zimbra/backup', montajes_omitidos_aceptados: '/mnt/aceptado' }), latido()])
  );
  comprueba(
    'con una omisión no aceptada y otra aceptada → NO_CUMPLE nombrando la no aceptada y citando la aceptada',
    ambos.estado('EV-01') === 'NO_CUMPLE' && /\/opt\/zimbra\/backup/.test(ambos.motivo('EV-01')) && /\/mnt\/aceptado/.test(ambos.motivo('EV-01')),
    ambos.motivo('EV-01')
  );
}

// ---------------------------------------------------------------------------

bloque('32. EV-05 · A6, la prueba declarada por la organización en Zimbra Open Source');

{
  const declarada = linea(
    'restore_test',
    {
      origen: 'zimbra-ose-declarada',
      objeto: 'buzones',
      fecha: hace(3 * 24),
      testigo: 'declarado',
      resultado: 'ok',
      coincide: 'si',
      limpieza: 'no_aplica',
      detalle: 'declarada: se abrió el buzón ensfacil_testigo y se comprobaron los últimos 5 correos',
    },
    hace(3 * 24)
  );
  const r = evalua(eventos([declarada, latido(PASADA, { origen: 'zimbra-ose-declarada', rol: 'buzones' })]));

  comprueba(
    'ok+coincide dentro de P-05 → EV-05 CUMPLE, igual que cualquier otra prueba',
    r.estado('EV-05') === 'CUMPLE',
    `${r.estado('EV-05')} ${r.motivo('EV-05')}`
  );
  comprueba(
    'y el motivo dice que es una prueba declarada por la organización',
    /prueba declarada por la organización/.test(r.motivo('EV-05')),
    r.motivo('EV-05')
  );
  comprueba(
    'citando lo comprobado',
    /se abrió el buzón ensfacil_testigo/.test(r.motivo('EV-05')),
    r.motivo('EV-05')
  );

  const normal = evalua(
    eventos([
      linea(
        'restore_test',
        {
          origen: 'zimbra-ne',
          objeto: 'buzones',
          fecha: hace(3 * 24),
          testigo: 'testigo@ejemplo.invalid',
          resultado: 'ok',
          coincide: 'si',
          limpieza: 'ok',
          detalle: 'mensaje de control presente',
        },
        hace(3 * 24)
      ),
      latido(),
    ])
  );
  comprueba(
    'REVERSIÓN: una prueba normal (con testigo técnico) no lleva esa frase',
    !/prueba declarada por la organización/.test(normal.motivo('EV-05')),
    normal.motivo('EV-05')
  );

  const fallo = evalua(
    eventos([
      linea(
        'restore_test',
        {
          origen: 'zimbra-ose-declarada',
          objeto: 'buzones',
          fecha: hace(2 * 24),
          testigo: 'declarado',
          resultado: 'error',
          coincide: 'no',
          limpieza: 'no_aplica',
          detalle: 'declarada: no se pudo acceder a los correos migrados',
        },
        hace(2 * 24)
      ),
      latido(PASADA, { origen: 'zimbra-ose-declarada', rol: 'buzones' }),
    ])
  );
  comprueba(
    'una prueba declarada con resultado=error se juzga igual que cualquier otra → NO_CUMPLE',
    fallo.estado('EV-05') === 'NO_CUMPLE' && /prueba declarada por la organización/.test(fallo.motivo('EV-05')),
    `${fallo.estado('EV-05')} ${fallo.motivo('EV-05')}`
  );
}

// ---------------------------------------------------------------------------

bloque('33. El informe enseña los montajes omitidos y la prueba declarada');

{
  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuracion(BASE) : c)),
  });

  const hechos = eventos([
    copia({ ultima_correcta: hace(10), montajes_omitidos: '/opt/zimbra/backup', montajes_omitidos_aceptados: '/mnt/aceptado' }),
    latido(),
    linea(
      'restore_test',
      {
        origen: 'zimbra-ose-declarada',
        objeto: 'buzones',
        fecha: hace(3 * 24),
        testigo: 'declarado',
        resultado: 'ok',
        coincide: 'si',
        limpieza: 'no_aplica',
        detalle: 'declarada: se comprobó el buzón testigo',
      },
      hace(3 * 24)
    ),
    latido(PASADA, { origen: 'zimbra-ose-declarada', rol: 'buzones' }),
  ]);

  const resultado = getENSComplianceResultByControl(CONTROL, 'MEDIO', hechos, SRV01.id, [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }], AHORA);
  const informe = buildENSReportModel(CONTROL, resultado);
  const campo = (id: string) => informe?.fields.find(f => f.id === id);

  comprueba(
    'REP-02 nombra el punto de montaje que dejó fuera la copia',
    /\/opt\/zimbra\/backup/.test(campo('REP-02')?.value || ''),
    campo('REP-02')?.value
  );
  comprueba(
    'y su detalle cita la omisión aceptada',
    (campo('REP-02')?.details || []).some(d => /\/mnt\/aceptado/.test(d)),
    JSON.stringify(campo('REP-02')?.details)
  );
  comprueba(
    'REP-07 marca la prueba como declarada por la organización',
    /declarada por la organización/.test(campo('REP-07')?.value || ''),
    campo('REP-07')?.value
  );

  ensConfigurationRepository.reset();
}

// ---------------------------------------------------------------------------

bloque('34. La omisión aceptada de una copia no desaparece cuando otra copia falla');

{
  // El layout real: dos backup-id del mismo origen y objeto (dos discos de la
  // misma máquina). Uno cumple con una omisión aceptada; el otro no cumple
  // por una razón que no tiene nada que ver con los montajes. El peor manda
  // en el VEREDICTO de EV-01, pero el dato de la omisión aceptada de la copia
  // que sí cumple tiene que seguir viéndose en el informe: `combina` descarta
  // el motivo de las partes CUMPLE cuando el resultado final no lo es, así
  // que citarla solo en el motivo combinado no basta.
  const copiaA = copia({ backup_id: 'srv01_a', ultima_correcta: hace(10), montajes_omitidos: '', montajes_omitidos_aceptados: '/mnt/aceptado' });
  const copiaB = copia({ backup_id: 'srv01_b', ultima_correcta: '-', ultima_fallida: hace(2), resultado_ultima: 'error' });
  const hechos = eventos([copiaA, copiaB, latido()]);

  const r = evalua(hechos);
  comprueba(
    'dos backup-id, uno CUMPLE con una omisión aceptada y el otro NO_CUMPLE por otra razón → EV-01 NO_CUMPLE',
    r.estado('EV-01') === 'NO_CUMPLE',
    `${r.estado('EV-01')} ${r.motivo('EV-01')}`
  );

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuracion(BASE) : c)),
  });

  const resultado = getENSComplianceResultByControl(CONTROL, 'MEDIO', hechos, SRV01.id, [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }], AHORA);
  const informe = buildENSReportModel(CONTROL, resultado);
  const rep02 = informe?.fields.find(f => f.id === 'REP-02');

  comprueba(
    'pero el dato del informe (REP-02) sigue mostrando la omisión aceptada de srv01_a, aunque el motivo combinado de EV-01 la pierda',
    /srv01_a/.test(rep02?.value || '') && /\/mnt\/aceptado/.test(rep02?.value || ''),
    rep02?.value
  );

  ensConfigurationRepository.reset();
}

// ---------------------------------------------------------------------------

bloque('35. Sin P-06: la ruta de las copias la informa cada recolector');

{
  // Lo declarado en wazuh4 el 01/10/2026: sin P-06 (ni P-08 a P-13). El juicio
  // usa la ruta que informa cada recolector en backup_access, así que la falta
  // de P-06 no puede dejar ningún requisito sin demostrar por configuración.
  const fs = require('fs');
  const lineas: Linea[] = String(fs.readFileSync(`${__dirname}/fixtures/mp-info-6-pbs-pass.ndjson`, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l: string) => JSON.parse(l));
  const maquina = { id: SRV01.id, name: String(lineas[0].host) };
  const ahoraReal = new Date(Math.max(...lineas.map(l => Date.parse(String(l.ts)))) + 10 * 60 * 1000);
  const declarado: Valores = {
    'P-01': '24',
    'P-02': '4',
    'P-03': '30',
    'P-04': `${maquina.name} | MEDIA`,
    'P-05': '90',
    // La pasada real tiene un directorio local que también lee la cuenta backup.
    'P-07': 'root,backup',
    'P-14': '7',
  };

  const validacion = validateControlConfiguration(configuracion(declarado), 'MEDIO');
  comprueba(
    'la configuración declarada queda completa: P-06 no es obligatorio',
    validacion.status === 'CONFIGURED' && validacion.missingRequired.length === 0,
    `${validacion.status}: faltan ${validacion.missingRequired.map(p => p.id).join(', ') || 'ninguno'}`
  );

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuracion(declarado) : c)),
  });

  const fila = getENSComplianceResultByControl(CONTROL, 'MEDIO', eventos(lineas, maquina), maquina.id, [{ ...maquina, groups: ['ens'] }], ahoraReal);
  comprueba(
    'con la pasada real y sin P-06, la fila cumple con todo demostrado',
    fila?.status === 'CUMPLE' && fila.measuredRequirements === fila.applicableRequirements,
    fila && `${fila.status} ${fila.score} ${fila.measuredRequirements}/${fila.applicableRequirements}`
  );

  // P-06 es informativo también cuando algo falta. Si el recolector no pudo
  // medir la retención (EV-03), el hallazgo no puede mandar a rellenar P-06:
  // rellenarlo no mide nada.
  const ultimo = lineas.reduce((a, l) => (String(l.ts) > a ? String(l.ts) : a), '');
  const sinRetencion = [
    ...lineas.filter(l => l.event !== 'backup_retention'),
    {
      ensfacil: CONTROL,
      ts: ultimo,
      host: maquina.name,
      event: 'evidence_state',
      evidence_id: 'EV-03',
      origen: 'pbs',
      objeto: 'fichero',
      estado: 'NO_EVALUABLE',
      causa: 'EVIDENCE',
      motivo: 'el PBS no devuelve la poda del datastore',
    },
  ];
  const sinMedirRetencion = getENSComplianceResultByControl(CONTROL, 'MEDIO', eventos(sinRetencion, maquina), maquina.id, [{ ...maquina, groups: ['ens'] }], ahoraReal);
  const conservacion = (sinMedirRetencion?.nonConformities || []).find(n => n.requirementId === 'mp.info.6.2.b');
  comprueba(
    'EV-03 sin medir y sin P-06: el hallazgo de mp.info.6.2.b no manda a configurar P-06',
    !!conservacion && !/P-06/.test(conservacion.finding),
    conservacion && `${conservacion.cause}: ${conservacion.finding}`
  );

  ensConfigurationRepository.reset();
}

// ---------------------------------------------------------------------------

bloque('36. Los parámetros que el juicio no lee nunca se piden en un hallazgo');

{
  // P-06 y P-08 a P-14 documentan lo que declara la organización o lo que el
  // agente lee de su .env; el juicio no los lee (P-08 solo se cita en el
  // motivo de EV-06). Sin valor no pueden convertir un hueco en uno de
  // CONFIGURACIÓN ni aparecer en un «falta configurar»: rellenarlos no mide
  // nada. Se prueba con TODO pendiente en ALTO, donde aplican todos.
  const INFORMATIVOS = ['P-06', 'P-08', 'P-09', 'P-10', 'P-11', 'P-12', 'P-13', 'P-14'];
  const NOMBRA = new RegExp(`\\b(${INFORMATIVOS.join('|')})\\b`);
  const obligatorios: Valores = {
    'P-01': '24',
    'P-02': '4',
    'P-03': '30',
    'P-04': 'srv-01',
    'P-05': '7',
    'P-07': 'root,backup',
  };
  const sinMedir = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06'].map(id =>
    linea('evidence_state', { evidence_id: id, estado: 'NO_EVALUABLE', causa: 'EVIDENCE', motivo: `el PBS no responde (${id})` })
  );
  const hallazgos = (valores: Valores) => {
    ensConfigurationRepository.replaceActive({
      ...defaultENSConfigurationTemplate,
      controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuracion(valores) : c)),
    });

    const fila = getENSComplianceResultByControl(CONTROL, 'ALTO', eventos([...sinMedir, latido()]), SRV01.id, [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }], AHORA);

    ensConfigurationRepository.reset();

    return (fila?.nonConformities || []).filter(n => n.id !== 'NC-CFG');
  };

  const informativosVacios = hallazgos(obligatorios);
  const culpables = informativosVacios.filter(
    n => NOMBRA.test(`${n.finding} ${n.requiredAction}`) || (n.parameterIds || []).some(p => INFORMATIVOS.includes(p))
  );
  comprueba(
    'todo pendiente en ALTO y P-06, P-08…P-14 sin valor: hay hallazgos de todos los requisitos',
    informativosVacios.length === mpInfo6CatalogDefinition.requirements.length,
    informativosVacios.map(n => n.requirementId).join(', ')
  );
  comprueba(
    'y ninguno nombra ni pide configurar un parámetro informativo',
    culpables.length === 0,
    culpables.map(n => `${n.requirementId}: ${n.requiredAction} [${(n.parameterIds || []).join(',')}]`).join(' | ')
  );
  comprueba(
    'ni convierte el hueco en uno de CONFIGURACIÓN: es de EVIDENCIA, como declara el recolector',
    informativosVacios.every(n => n.cause === 'EVIDENCE'),
    informativosVacios.map(n => `${n.requirementId}:${n.cause}`).join(' ')
  );

  // REVERSIÓN: un parámetro que el juicio SÍ lee, sin valor, se sigue pidiendo.
  const { 'P-07': _p07, ...sinP07 } = obligatorios;
  const acceso = hallazgos(sinP07).find(n => n.requirementId === 'mp.info.6.2.d');
  comprueba(
    'REVERSIÓN: sin P-07 el hallazgo de mp.info.6.2.d sí pide configurarlo',
    !!acceso && acceso.cause === 'CONFIGURATION' && /P-07/.test(acceso.requiredAction),
    acceso && `${acceso.cause}: ${acceso.requiredAction}`
  );

  // P-08 se sigue citando en el motivo de EV-06: la policy lee su valor de la
  // configuración, no de la ficha.
  const soloLocal = [linea('backup_storage', { destino: '/backup', misma_maquina: 'si', tipo: 'local', activo: 'si' }), latido()];
  const declarada = evalua(eventos(soloLocal), { ...BASE, 'P-08': 'sí' }, 'ALTO');
  comprueba(
    'P-08 = sí sin copia fuera → EV-06 NO_CUMPLE y su motivo cita P-08',
    declarada.estado('EV-06') === 'NO_CUMPLE' && /P-08 declara que existe copia en ubicación alternativa, y no se observa/.test(declarada.motivo('EV-06')),
    `${declarada.estado('EV-06')} ${declarada.motivo('EV-06')}`
  );
  const sinDeclarar = evalua(eventos(soloLocal), BASE, 'ALTO');
  comprueba(
    'REVERSIÓN: sin P-08, el mismo NO_CUMPLE y sin la cita',
    sinDeclarar.estado('EV-06') === 'NO_CUMPLE' && !/P-08/.test(sinDeclarar.motivo('EV-06')),
    `${sinDeclarar.estado('EV-06')} ${sinDeclarar.motivo('EV-06')}`
  );
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
    otros.length === 18 && claves.length > otros.length && distintos.length === 0 && Object.keys(con).length === claves.length,
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
