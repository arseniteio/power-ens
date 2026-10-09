/**
 * op.mon.2 · el juicio del sistema de métricas.
 *
 *     npx tsx tests/op-mon-2-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. op.mon.2 es un metacontrol: el grado de implantación, los
 * grises y el art. 32 van al informe sin veredicto, y los requisitos se juzgan
 * con lo que deja huella en el manager (agent.id=000): el registro de ciclos de
 * métricas, el registro de incidentes de op.exp.7, la base de agentes y los
 * latidos de todos los recolectores. Cada caso mueve UN eje y lleva al lado la
 * REVERSIÓN: el MISMO hecho con otro parámetro, u otro `now`, cambia el
 * veredicto.
 *
 * Los hechos siguen el contrato de eventos de op.mon.2 (el que documentará el
 * runbook `linux/op.mon.2`), con los agentes de wazuh4 del 09/10/2026. El
 * recolector todavía no existe: cuando exista, se sustituyen por su salida real
 * en modo --prueba. Pasan por el normalizador real como alertas de alerts.json.
 */
import * as fs from 'fs';
import * as path from 'path';
import { opMon2PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-mon-2.policy';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { opMon2CatalogDefinition } from '../public/ens/catalog/op-mon-2';
import { opMon2Configuration } from '../public/ens/configuration/data/op-mon-2-parameters';
import { normalizeWazuhAlerts } from '../public/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { getEvidenceDefinitions } from '../public/ens/core/evidence/registry';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../public/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../public/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../public/ens/core/evaluation/evaluation-engine';
import { parseRequirementAttestations } from '../public/ens/configuration/services/attestation-service';
import { validateParameterValue } from '../public/ens/configuration/services/parameter-value-validator';
import { buildOpMon2ReportModel } from '../public/ens/reports/op-mon-2-report-model';
import { getENSReportModelDefinition } from '../public/ens/reports/registry';
import type { ENSControlConfiguration, ENSLevel } from '../public/ens/configuration/types';
import type { ENSNormalizedEvent } from '../public/ens/core/data-source/types';
import type { ENSComplianceResult } from '../public/ens/core/evaluation/types';

declare const process: { exit(code: number): void };
declare const __dirname: string;

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

// La pasada de 6 h de las 12:05 (la anterior, a las 06:05).
const COMPLETA = '2026-10-09T12:05';
const ANTERIOR = '2026-10-09T06:05';

const AHORA = new Date('2026-10-09T12:30:00Z');

const comun = (ts: string, event: string, evidence: string, requisito: string): Linea => ({
  ts, event, evidence_id: evidence, requisito, plano: 'central',
});

// Dos ciclos anotados: el segundo trimestre (validado por el RSEG con su nombre)
// y el tercero, consolidado el 02/10 y validado con su cargo.
const ciclo = (ts: string, linea: number, periodo: string, fecha: string, extra: Linea = {}): Linea => ({
  ...comun(ts, 'metrics_cycle_recorded', 'EV-02', 'op.mon.2.1,op.mon.2.r2.1'),
  periodo, fecha_consolidacion: fecha, implantacion_global: 82.4, horas_internas: 118, horas_externas: 36,
  presupuesto_ejecutado: 8100, validado_por: 'Responsable de Seguridad', referencia: `https://intranet.ejemplo/metricas/${periodo}.pdf`,
  linea, ...extra,
});

const CICLOS = (ts: string): Linea[] => [
  ciclo(ts, 3, '2026-T2', '2026-07-08T09:00:00Z'),
  ciclo(ts, 4, '2026-T3', '2026-10-02T10:00:00Z', { implantacion_global: 87.1, horas_internas: 130, horas_externas: 35, presupuesto_ejecutado: 9200, validado_por: 'RSEG' }),
];

// Una fila (fase) del registro de incidentes de op.exp.7, con sus 13 columnas.
const fase = (ts: string, linea: number, id: string, nombre: string, fecha: string, extra: Linea = {}): Linea => ({
  ...comun(ts, 'incident_registered', 'EV-03', 'op.mon.2.r1.1'),
  incidente_id: id, fase: nombre, fecha, severidad: 'alta', sistemas: 'wazuh-real', clasificacion: 'acceso no autorizado',
  escalado_a: '-', notificado_a: '-', datos_personales: 'no', notificacion_ccn_cert: '-', relevancia_juridica: 'no',
  medidas_mejora: '-', referencia: `https://intranet.ejemplo/expedientes/${id}`, linea, ...extra,
});

// Dos incidentes del trimestre: uno cerrado (notificado al CCN-CERT) y otro
// abierto con datos personales, comunicado a la AEPD.
const INCIDENTES = (ts: string): Linea[] => [
  fase(ts, 2, 'INC-2026-014', 'inicial', '2026-09-10T08:15:00Z'),
  fase(ts, 3, 'INC-2026-014', 'intermedio', '2026-09-10T11:40:00Z', { notificacion_ccn_cert: '2026-09-10T12:00:00Z', escalado_a: 'RSI' }),
  fase(ts, 4, 'INC-2026-014', 'final', '2026-09-11T16:30:00Z', { medidas_mejora: 'bloqueo de la cuenta genérica' }),
  fase(ts, 5, 'INC-2026-015', 'inicial', '2026-10-01T09:00:00Z', { severidad: 'media', sistemas: 'ldap-zimbra', clasificacion: 'código dañino', datos_personales: 'si' }),
  fase(ts, 6, 'INC-2026-015', 'intermedio', '2026-10-01T10:30:00Z', { severidad: 'media', sistemas: 'ldap-zimbra', clasificacion: 'código dañino', datos_personales: 'si', notificado_a: 'AEPD,Responsable de la Información' }),
];

// wazuh4: el manager, wazuh-real y el LDAP en el grupo ens; un agente de prueba
// desconectado y otro de Windows que nunca conectó, fuera del grupo.
const AGENTES: [string, string, string, string, string][] = [
  ['000', 'Wazuh-4', 'active', '2026-10-09T12:05:30Z', '-'],
  ['024', 'wazuh-real', 'active', '2026-10-09T12:04:50Z', 'default,ens'],
  ['027', 'srv-prueba', 'disconnected', '2026-09-04T10:00:12Z', 'default'],
  ['028', 'ldap-zimbra', 'active', '2026-10-09T12:04:40Z', 'default,ens'],
  ['033', 'win-prueba', 'never_connected', '-', 'default'],
];

// La última pasada de cada recolector que ha informado desde cada agente, como
// la deja el recolector después de leer los collector_run de alerts.json.
const PASADAS: Record<string, string> = {
  '000': 'op.exp.7|2026-10-09T12:00:10Z|completada,op.exp.8|2026-10-09T12:00:40Z|completada,op.exp.9|2026-10-09T12:01:05Z|completada,op.mon.1|2026-10-09T12:05:20Z|completada,op.mon.2|2026-10-09T06:05:50Z|completada',
  '024': 'mp.info.6|2026-10-09T02:00:31Z|completada,op.acc.1|2026-10-09T11:30:02Z|completada,op.exp.1|2026-10-09T11:31:10Z|completada,op.exp.2|2026-10-09T11:32:00Z|parcial',
  '027': 'op.acc.1|2026-09-04T09:30:00Z|completada',
  '028': 'op.acc.1|2026-10-09T11:45:00Z|completada,op.exp.8|2026-10-09T11:50:00Z|completada',
  '033': '-',
};

interface Opciones {
  ciclos?: Linea[];
  incidentes?: Linea[];
  lecturaCiclos?: Linea;
  lecturaIncidentes?: Linea;
  cubiertas?: string;
}

const lectura = (ts: string, event: string, evidence: string, fichero: string, filas: number, extra: Linea = {}): Linea => ({
  ...comun(ts, event, evidence, evidence === 'EV-02' ? 'op.mon.2.1,op.mon.2.r1.1,op.mon.2.r2.1' : 'op.mon.2.r1.1'),
  fichero, presente: 'si', legible: 'si', formato: 'ok', filas_validas: filas, filas_descartadas: 0, filas_emitidas: filas, ...extra,
});

const pasada = (hhmm = COMPLETA, o: Opciones = {}): Linea[] => {
  const t = (s: number) => `${hhmm}:${String(s).padStart(2, '0')}Z`;
  const ciclos = (o.ciclos ?? CICLOS(t(11))).map(l => ({ ...l, ts: t(11) }));
  const incidentes = (o.incidentes ?? []).map(l => ({ ...l, ts: t(21) }));

  return [
    lectura(t(10), 'metrics_register_read', 'EV-02', '/etc/ensfacil/metrics-cycle-register.tsv', ciclos.length, o.lecturaCiclos),
    ...ciclos,
    lectura(t(20), 'incident_register_read', 'EV-03', '/etc/ensfacil/incident-register.tsv', incidentes.length, o.lecturaIncidentes),
    ...incidentes,
    ...AGENTES.map(([id, agente, estado, keep, grupos]) => ({
      ...comun(t(30), 'agent_keepalive_observed', 'EV-04', 'op.mon.2.1'),
      agente_id: id, agente, estado_conexion: estado, ultimo_keepalive: keep, grupos,
    })),
    ...AGENTES.map(([id, agente]) => ({
      ...comun(t(35), 'collector_heartbeat_observed', 'EV-04', 'op.mon.2.1'),
      agente_id: id, agente, recolectores: PASADAS[id] === '-' ? 0 : PASADAS[id].split(',').length, pasadas: PASADAS[id],
      observado_desde: '2026-09-20T00:00:00Z',
    })),
    { ts: t(50), event: 'collector_run', resultado: 'completada', evidencias_cubiertas: o.cubiertas ?? 'EV-02,EV-03,EV-04', tipo_servidor: 'manager', emisor: 'recolector' },
  ];
};

let contador = 0;

const REGLA: Record<string, string> = {
  metrics_register_read: '111301', metrics_cycle_recorded: '111302', incident_register_read: '111303',
  incident_registered: '111304', agent_keepalive_observed: '111305', collector_heartbeat_observed: '111306',
  evidence_state: '111350', collector_run: '111397',
};

const MANAGER = { id: '000', name: 'Wazuh-4' };

// Una línea del NDJSON del recolector tal como la deja el manager en el índice.
const alerta = (linea: Linea) => {
  contador += 1;
  const { ts, ...data } = linea as Linea & { ts: string };

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': ts,
      agent: MANAGER,
      rule: { id: REGLA[String(data.event)] || '111300', description: 'op.mon.2' },
      location: '/var/log/ensfacil/op_mon_2.json',
      data: Object.fromEntries(Object.entries({ ensfacil: 'op.mon.2', ...data }).map(([k, v]) => [k, String(v)])),
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

// Lo que hoy está en wazuh4 (con el registro de incidentes vacío): la pasada
// de las 06:05 y la de las 12:05.
const hoy = (cambia?: (l: Linea) => Linea | undefined, o: Opciones = {}) =>
  eventos([...pasada(ANTERIOR, o), ...pasada(COMPLETA, o)], cambia);

const conIncidentes = (incidentes: Linea[] = INCIDENTES(COMPLETA), cambia?: (l: Linea) => Linea | undefined) =>
  eventos([...pasada(COMPLETA, { incidentes })], cambia);

// --- la configuración --------------------------------------------------------

type Valores = Record<string, string[] | string | undefined>;

const configuracion = (valores: Valores): ENSControlConfiguration => ({
  ...opMon2Configuration,
  parameters: opMon2Configuration.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    // Un parámetro vacío es la clave `value` AUSENTE, nunca `null`.
    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

// Lo que el responsable declararía para el laboratorio.
const BASE: Valores = {
  'P-01': [
    'op.acc.1 | sí | MEDIO | R1',
    'op.exp.7 | sí | MEDIO | R1 R2',
    'op.mon.1 | sí | MEDIO | R1',
    'op.mon.2 | sí | MEDIO | R1 R2',
    'org.1 | sí | MEDIO | ',
    'op.cont.2 | no |  | ',
  ],
  'P-02': ['trimestral | 15 | 12-31'],
  'P-03': ['incidentes_por_tipo', 'incidentes_por_severidad', 'tiempo_medio_contencion', 'tiempo_medio_resolucion', 'notificados_ccn_cert', 'notificados_aepd'],
  'P-04': [
    'Personal TIC propio | horas_internas | partes de dedicación al sistema de seguridad',
    'Soporte del integrador | horas_externas | horas facturadas',
    'Licencias y servicios de seguridad | presupuesto_ejecutado | contabilidad analítica',
  ],
  'P-05': ['Responsable de Seguridad | RSEG | ambos'],
  'P-06': ['cobertura_monitorizacion | 95 | 5', 'implantacion_global | 90 | ', 'controles_no_evaluables | 0 | ', 'tiempo_medio_resolucion | 72 | '],
};

const SIN_PARAMETROS: Valores = {};

const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Valores = BASE,
  nivel: ENSLevel = 'MEDIO',
  ahora: Date = AHORA
) => {
  const cfg = configuracion(valores);
  const delControl = keepLatestRunStateFacts('op.mon.2', evs, ahora);
  const evidencias = resolveEvidenceForControl('op.mon.2', delControl, '000', nivel, cfg, ahora);
  const contexto = buildPolicyContext(opMon2CatalogDefinition, cfg, nivel, delControl, evidencias, ahora);
  const { decisions, runtimeVariables } = opMon2PolicyDefinition.evaluator!(contexto);
  const tabla = applyPolicyDecisionsToEvidences(evidencias, decisions, opMon2CatalogDefinition.requirements);
  const atestaciones = parseRequirementAttestations(cfg);
  const requisito = (id: string) =>
    evaluateRequirement(
      opMon2CatalogDefinition.requirements.find(q => q.id === id)!,
      nivel,
      tabla,
      false,
      decisions,
      'ACTIVE',
      atestaciones.get(id)
    );
  const evidencia = (id: string) => tabla.find(e => e.id === id);
  const motivo = (req: string) => decisions.find(d => d.requirementId === req)?.reason || '';
  // La decisión de UNA evidencia (la del requisito lleva `trace.ruleId` sin barra).
  const deEvidencia = (req: string, ev: string) => decisions.find(d => d.trace.ruleId === `${req}/${ev}`);
  const decision = (req: string) => decisions.find(d => d.trace.ruleId === req);
  const variable = (nombre: string) => runtimeVariables.find(v => v.name === nombre);
  const motor = () =>
    evaluateENSControl(
      opMon2CatalogDefinition,
      cfg,
      nivel,
      evidencias,
      {
        controlId: 'op.mon.2',
        policyId: opMon2PolicyDefinition.id,
        evaluatedAt: ahora.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      delControl
    );

  return { decisions, runtimeVariables, requisito, evidencia, motivo, deEvidencia, decision, variable, motor };
};

// Un requisito NO demostrado, con la causa de su decisión.
const sinDemostrar = (r: ReturnType<typeof evalua>, req: string, causa: string): boolean =>
  r.requisito(req).status !== 'CUMPLE' && r.requisito(req).evidenced === false && r.decision(req)?.status === 'NO_EVALUABLE' && r.decision(req)?.cause === causa;

// --- 1. catálogo ------------------------------------------------------------

bloque('1. Catálogo: categoría del sistema, plano del manager y datos del informe');

{
  const niveles = (id: string) =>
    opMon2CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  comprueba('op.mon.2 se rige por la categoría (sin dimensión propia)', opMon2CatalogDefinition.levelDimension === undefined);
  comprueba('se mide solo en el manager', JSON.stringify(opMon2CatalogDefinition.measurementPlanes) === '["manager"]');
  comprueba('la base rige en las tres categorías', niveles('op.mon.2.1') === 'BAJO,MEDIO,ALTO');
  comprueba('R1 y R2 desde MEDIA (MEDIA y ALTA exigen lo mismo)', niveles('op.mon.2.r1.1') === 'MEDIO,ALTO' && niveles('op.mon.2.r2.1') === 'MEDIO,ALTO');
  comprueba('el control está ACTIVE', opMon2CatalogDefinition.status === 'ACTIVE', opMon2CatalogDefinition.status);
  comprueba(
    'EV-01, EV-05 y EV-07 no las juzga ningún requisito (datos del informe)',
    ['EV-01', 'EV-05', 'EV-07'].every(ev => opMon2CatalogDefinition.requirements.every(r => !r.evidenceIds.includes(ev)))
  );
  comprueba(
    'la policy declara los mismos niveles y evidencias que el catálogo',
    opMon2PolicyDefinition.requirements.every(r => {
      const c = opMon2CatalogDefinition.requirements.find(q => q.id === r.requirementId)!;

      return r.levels.join(',') === c.applicability.levels.join(',') && r.evidenceIds.join(',') === c.evidenceIds.join(',');
    })
  );
  comprueba(
    'los seis hechos del recolector son de estado (se reemiten enteros cada 6 h)',
    ['metrics_register_read', 'metrics_cycle_recorded', 'incident_register_read', 'incident_registered', 'agent_keepalive_observed', 'collector_heartbeat_observed'].every(t =>
      getStateFactEventTypes('op.mon.2').has(t)
    )
  );
}

// --- 2. verde ----------------------------------------------------------------

bloque('2. Verde: el último ciclo validado en plazo, cobertura al 100 %, registro de incidentes vacío');

{
  const r = evalua(hoy());

  comprueba('op.mon.2.1 CUMPLE en MEDIA', r.requisito('op.mon.2.1').status === 'CUMPLE' && r.requisito('op.mon.2.1').evidenced === true, r.motivo('op.mon.2.1'));
  comprueba(
    'EV-02: el último ciclo validado es 2026-T3, de hace 7 días, en el plazo trimestral + 15',
    r.evidencia('EV-02')?.status === 'CUMPLE' && /2026-T3 \(consolidado el 2026-10-02.*validado por RSEG\), hace 7 días/.test(r.deEvidencia('op.mon.2.1', 'EV-02')?.reason || '') && /92 días \+ 15 de margen = 107/.test(r.deEvidencia('op.mon.2.1', 'EV-02')?.reason || ''),
    r.deEvidencia('op.mon.2.1', 'EV-02')?.reason
  );
  comprueba('y enseña la tendencia de la implantación (82.4 % → 87.1 %)', /2026-T2 82\.4 % → 2026-T3 87\.1 %/.test(r.deEvidencia('op.mon.2.1', 'EV-02')?.reason || ''), r.deEvidencia('op.mon.2.1', 'EV-02')?.reason);
  comprueba(
    'EV-04: cobertura del 100 % (3 de 3 del alcance: el manager y los dos del grupo ens)',
    r.evidencia('EV-04')?.status === 'CUMPLE' && /100 % \(3 de 3 sistemas del alcance ENS/.test(r.deEvidencia('op.mon.2.1', 'EV-04')?.reason || ''),
    r.deEvidencia('op.mon.2.1', 'EV-04')?.reason
  );
  comprueba(
    'los agentes de prueba fuera del grupo ens no cuentan, pero se dicen',
    /Fuera del alcance ENS \(sin el grupo ens\) hay 2 agente\(s\)/.test(r.deEvidencia('op.mon.2.1', 'EV-04')?.reason || '') && /srv-prueba \(027\) disconnected/.test(r.deEvidencia('op.mon.2.1', 'EV-04')?.reason || ''),
    r.deEvidencia('op.mon.2.1', 'EV-04')?.reason
  );
  comprueba('la cobertura viaja como variable para el informe (100)', r.variable('cobertura_monitorizacion')?.value === 100, r.variable('cobertura_monitorizacion')?.value);

  comprueba(
    'R1 CUMPLE con cero incidentes: el registro existe y el último ciclo está en plazo (decisión 7)',
    r.requisito('op.mon.2.r1.1').status === 'CUMPLE' && /Ningún incidente registrado/.test(r.motivo('op.mon.2.r1.1')) && /decisión del responsable 7/.test(r.motivo('op.mon.2.r1.1')) && /Se consolidan en el ciclo 2026-T3/.test(r.motivo('op.mon.2.r1.1')),
    r.motivo('op.mon.2.r1.1')
  );

  const r2 = r.requisito('op.mon.2.r2.1');
  comprueba('R2 CUMPLE marcado `attested`: dato declarado, no medido', r2.status === 'CUMPLE' && r2.attested === true && r2.evidenced === true, `${r2.status} ${r2.attested}`);
  comprueba('y su motivo dice DATO DECLARADO con las cifras del último ciclo', /130 h internas, 35 h externas y 9200 € de presupuesto ejecutado, validado por RSEG/.test(r.motivo('op.mon.2.r2.1')) && /DATO DECLARADO/.test(r.motivo('op.mon.2.r2.1')), r.motivo('op.mon.2.r2.1'));
  comprueba('la acreditación de R2 no tapa nada: R2 es el único requisito `attested`', r.decisions.filter(d => d.attested).map(d => d.requirementId).join(',') === 'op.mon.2.r2.1');

  ['EV-01', 'EV-05', 'EV-07'].forEach(id =>
    comprueba(
      `${id} sale NO_APLICA como dato del informe, no en gris`,
      r.evidencia(id)?.status === 'NO_APLICA' && (r.evidencia(id)?.observations || []).some(o => /Dato del informe, sin veredicto/.test(o)),
      `${r.evidencia(id)?.status} ${(r.evidencia(id)?.observations || []).join(' | ')}`
    )
  );

  const motor = r.motor();
  comprueba('el motor puntúa el control al 100 % en MEDIA', motor.status === 'CUMPLE' && motor.score === 100, `${motor.status} ${motor.score}`);

  const basica = evalua(hoy(), BASE, 'BAJO');
  comprueba('en BÁSICA, R1 y R2 NO_APLICA y la base sigue CUMPLE', basica.requisito('op.mon.2.r1.1').status === 'NO_APLICA' && basica.requisito('op.mon.2.r2.1').status === 'NO_APLICA' && basica.requisito('op.mon.2.1').status === 'CUMPLE');
  comprueba(
    'en BÁSICA no hacen falta P-03 ni P-04',
    evalua(hoy(), { ...BASE, 'P-03': undefined, 'P-04': undefined }, 'BAJO').motor().status === 'CUMPLE'
  );
  comprueba('ALTA exige lo mismo que MEDIA', evalua(hoy(), BASE, 'ALTO').motor().score === 100);
}

// --- 3. R1 con incidentes ------------------------------------------------------

bloque('3. R1 con incidentes: los indicadores de P-03 salen del registro, y falta un dato → NO_CUMPLE');

{
  const r = evalua(conIncidentes());

  comprueba('con los datos completos → R1 CUMPLE', r.requisito('op.mon.2.r1.1').status === 'CUMPLE', r.motivo('op.mon.2.r1.1'));
  comprueba(
    'y calcula los indicadores: resolución 32.3 h, contención 2.5 h, 1 de 2 al CCN-CERT, 1 de 1 a la AEPD',
    /tiempo_medio_resolucion: 32\.3 h \(1 cerrados\)/.test(r.motivo('op.mon.2.r1.1')) &&
      /tiempo_medio_contencion: 2\.5 h \(2 contenidos\)/.test(r.motivo('op.mon.2.r1.1')) &&
      /notificados_ccn_cert: 1 de 2/.test(r.motivo('op.mon.2.r1.1')) &&
      /notificados_aepd: 1 de 1 con datos personales/.test(r.motivo('op.mon.2.r1.1')) &&
      /incidentes_por_severidad: alta 1, media 1/.test(r.motivo('op.mon.2.r1.1')),
    r.motivo('op.mon.2.r1.1')
  );
  comprueba(
    'los indicadores del periodo y del año viajan al informe',
    (r.variable('indicadores_incidentes_periodo')?.value as string[]).some(x => /2 incidente\(s\)/.test(x)) &&
      (r.variable('indicadores_incidentes_anual')?.value as string[]).some(x => /tiempo_medio_resolucion: 32\.3 h/.test(x)),
    JSON.stringify(r.variable('indicadores_incidentes_periodo')?.value)
  );

  // Un incidente cerrado sin fase intermedia: no se sabe cuándo se contuvo.
  const sinContencion = INCIDENTES(COMPLETA).filter(l => !(l.incidente_id === 'INC-2026-014' && l.fase === 'intermedio'));
  const roja = evalua(conIncidentes(sinContencion));
  comprueba(
    'INC-2026-014 cerrado sin fase intermedia y P-03 pide la contención → R1 NO_CUMPLE nombrándolo',
    roja.requisito('op.mon.2.r1.1').status === 'NO_CUMPLE' && roja.requisito('op.mon.2.r1.1').evidenced === true && /tiempo_medio_contencion: INC-2026-014 cerrado sin fase intermedia/.test(roja.motivo('op.mon.2.r1.1')),
    roja.motivo('op.mon.2.r1.1')
  );
  const sinPedirla = evalua(conIncidentes(sinContencion), { ...BASE, 'P-03': ['incidentes_por_tipo', 'tiempo_medio_resolucion'] });
  comprueba('REVERSIÓN: el mismo registro con P-03 sin la contención → CUMPLE', sinPedirla.requisito('op.mon.2.r1.1').status === 'CUMPLE', sinPedirla.motivo('op.mon.2.r1.1'));

  const sinClase = evalua(conIncidentes(INCIDENTES(COMPLETA).map(l => (l.incidente_id === 'INC-2026-015' ? { ...l, clasificacion: '-' } : l))));
  comprueba('un incidente sin clasificar → no se puede contar por tipo: NO_CUMPLE', sinClase.requisito('op.mon.2.r1.1').status === 'NO_CUMPLE' && /incidentes_por_tipo: INC-2026-015 sin clasificación/.test(sinClase.motivo('op.mon.2.r1.1')), sinClase.motivo('op.mon.2.r1.1'));

  const sinDatosPersonales = evalua(conIncidentes(INCIDENTES(COMPLETA).map(l => (l.incidente_id === 'INC-2026-015' ? { ...l, datos_personales: '-' } : l))));
  comprueba(
    'un incidente sin decir si afecta a datos personales → no se puede contar la AEPD: NO_CUMPLE',
    sinDatosPersonales.requisito('op.mon.2.r1.1').status === 'NO_CUMPLE' && /notificados_aepd: INC-2026-015 sin indicar si afecta a datos personales/.test(sinDatosPersonales.motivo('op.mon.2.r1.1')),
    sinDatosPersonales.motivo('op.mon.2.r1.1')
  );

  // Un incidente cerrado hace más de un trimestre no es del periodo.
  const viejo = [
    fase(COMPLETA, 2, 'INC-2026-003', 'inicial', '2026-03-02T08:00:00Z', { clasificacion: '-' }),
    fase(COMPLETA, 3, 'INC-2026-003', 'final', '2026-03-03T08:00:00Z', { clasificacion: '-' }),
  ];
  const fueraDelPeriodo = evalua(conIncidentes(viejo));
  comprueba(
    'un incidente sin clasificar cerrado en marzo no es del periodo: R1 CUMPLE con cero incidentes',
    fueraDelPeriodo.requisito('op.mon.2.r1.1').status === 'CUMPLE' && /Ningún incidente registrado/.test(fueraDelPeriodo.motivo('op.mon.2.r1.1')),
    fueraDelPeriodo.motivo('op.mon.2.r1.1')
  );

  const descartadas = evalua(conIncidentes(INCIDENTES(COMPLETA), l => (l.event === 'incident_register_read' ? { ...l, filas_descartadas: 1 } : l)));
  comprueba(
    'una fila descartada por el recolector → no se puede afirmar que los indicadores estén completos: NO_EVALUABLE, nunca CUMPLE',
    descartadas.requisito('op.mon.2.r1.1').status !== 'CUMPLE' && descartadas.decision('op.mon.2.r1.1')?.status === 'NO_EVALUABLE' && /1 fila\(s\) del registro de incidentes se descartaron/.test(descartadas.motivo('op.mon.2.r1.1')),
    descartadas.motivo('op.mon.2.r1.1')
  );

  // Cero incidentes no basta si el ciclo no está en plazo (decisión 7).
  const cicloViejo = (o: Opciones = {}) =>
    eventos(pasada(COMPLETA, { ...o, ciclos: [ciclo(COMPLETA, 3, '2026-T1', '2026-04-03T09:00:00Z', { validado_por: 'RSEG' })] }));
  const r1Viejo = evalua(cicloViejo());
  comprueba(
    'cero incidentes con el último ciclo del 03/04 (189 días) → R1 NO_CUMPLE: no se consolidan',
    r1Viejo.requisito('op.mon.2.r1.1').status === 'NO_CUMPLE' && /no se están consolidando/.test(r1Viejo.motivo('op.mon.2.r1.1')),
    r1Viejo.motivo('op.mon.2.r1.1')
  );
  comprueba('REVERSIÓN: el mismo ciclo con P-02 anual → R1 CUMPLE', evalua(cicloViejo(), { ...BASE, 'P-02': ['anual | 0 | 12-31'] }).requisito('op.mon.2.r1.1').status === 'CUMPLE');
}

// --- 4. rojo: op.mon.2.1 y R2, cada eje con su reversión ---------------------

bloque('4. Rojo: ciclos fuera de plazo o sin validar, cobertura baja, recursos incompletos');

{
  // EV-02 · fuera de plazo: dos trimestres atrás.
  const atrasados = [
    ciclo(COMPLETA, 3, '2026-T1', '2026-03-20T09:00:00Z', { validado_por: 'RSEG' }),
    ciclo(COMPLETA, 4, '2026-T2', '2026-06-20T09:00:00Z', { validado_por: 'RSEG' }),
  ];
  const tarde = evalua(eventos(pasada(COMPLETA, { ciclos: atrasados })));
  comprueba(
    'el último ciclo validado es del 20/06 (111 días) y el plazo trimestral + 15 es 107 → NO_CUMPLE',
    tarde.requisito('op.mon.2.1').status === 'NO_CUMPLE' && /de hace 111 días: fuera del plazo/.test(tarde.motivo('op.mon.2.1')),
    tarde.motivo('op.mon.2.1')
  );
  comprueba('REVERSIÓN: el mismo ciclo con 20 días de margen (112) → CUMPLE', evalua(eventos(pasada(COMPLETA, { ciclos: atrasados })), { ...BASE, 'P-02': ['trimestral | 20 | 12-31'] }).evidencia('EV-02')?.status === 'CUMPLE');

  // EV-02 · sin validar, o validado por quien P-05 no designa.
  const sinValidar = evalua(hoy(l => (l.event === 'metrics_cycle_recorded' ? { ...l, validado_por: '-' } : l)));
  comprueba('ningún ciclo validado → NO_CUMPLE', sinValidar.evidencia('EV-02')?.status === 'NO_CUMPLE' && /no tiene quién lo validó/.test(sinValidar.motivo('op.mon.2.1')), sinValidar.motivo('op.mon.2.1'));
  const otro = (l: Linea) => (l.event === 'metrics_cycle_recorded' ? { ...l, validado_por: 'Técnico de sistemas' } : l);
  const ajeno = evalua(hoy(otro));
  comprueba('validado por alguien que P-05 no designa → NO_CUMPLE', ajeno.evidencia('EV-02')?.status === 'NO_CUMPLE' && /lo validó «Técnico de sistemas», que P-05 no designa/.test(ajeno.motivo('op.mon.2.1')), ajeno.motivo('op.mon.2.1'));
  comprueba(
    'REVERSIÓN: el mismo ciclo con esa persona en P-05 (sin tildes ni mayúsculas) → CUMPLE',
    evalua(hoy(otro), { ...BASE, 'P-05': ['tecnico de SISTEMAS |  | metricas', 'Responsable de Seguridad | RSEG | recursos'] }).evidencia('EV-02')?.status === 'CUMPLE'
  );
  const pendiente = evalua(hoy(l => (l.event === 'metrics_cycle_recorded' && l.periodo === '2026-T3' ? { ...l, validado_por: '-' } : l)));
  comprueba(
    'el T3 sin validar y el T2 validado del 08/07 (93 días) todavía en plazo → CUMPLE, diciendo que el T3 está pendiente',
    pendiente.evidencia('EV-02')?.status === 'CUMPLE' && /2026-T3 .* está pendiente de validar/.test(pendiente.deEvidencia('op.mon.2.1', 'EV-02')?.reason || ''),
    pendiente.deEvidencia('op.mon.2.1', 'EV-02')?.reason
  );

  // EV-02 · registro vacío: es un dato medido.
  const vacio = evalua(eventos(pasada(COMPLETA, { ciclos: [] })));
  comprueba(
    'registro de ciclos presente y vacío → NO_CUMPLE medido (no hay serie), no un gris',
    vacio.requisito('op.mon.2.1').status === 'NO_CUMPLE' && vacio.requisito('op.mon.2.1').evidenced === true && /no tiene ningún ciclo anotado/.test(vacio.motivo('op.mon.2.1')),
    vacio.motivo('op.mon.2.1')
  );
  comprueba('y con él, R1 y R2 también NO_CUMPLE', vacio.requisito('op.mon.2.r1.1').status === 'NO_CUMPLE' && vacio.requisito('op.mon.2.r2.1').status === 'NO_CUMPLE');

  // EV-04 · el LDAP desconectado: 2 de 3.
  const ldapCaido = (l: Linea) => (l.event === 'agent_keepalive_observed' && l.agente_id === '028' ? { ...l, estado_conexion: 'disconnected', ultimo_keepalive: '2026-10-08T22:00:00Z' } : l);
  const caido = evalua(hoy(ldapCaido));
  comprueba(
    'el LDAP del grupo ens desconectado → cobertura 66.7 %, por debajo de 95 − 5 → NO_CUMPLE nombrándolo',
    caido.evidencia('EV-04')?.status === 'NO_CUMPLE' && /66\.7 % \(2 de 3/.test(caido.motivo('op.mon.2.1')) && /ldap-zimbra \(028\): agente disconnected/.test(caido.motivo('op.mon.2.1')),
    caido.motivo('op.mon.2.1')
  );
  comprueba('REVERSIÓN: el mismo estado con objetivo 70 y tolerancia 5 → CUMPLE dentro de la tolerancia', /dentro de la tolerancia/.test(evalua(hoy(ldapCaido), { ...BASE, 'P-06': ['cobertura_monitorizacion | 70 | 5'] }).deEvidencia('op.mon.2.1', 'EV-04')?.reason || '') && evalua(hoy(ldapCaido), { ...BASE, 'P-06': ['cobertura_monitorizacion | 70 | 5'] }).evidencia('EV-04')?.status === 'CUMPLE');
  comprueba('y sin la tolerancia, el mismo objetivo 70 → NO_CUMPLE', evalua(hoy(ldapCaido), { ...BASE, 'P-06': ['cobertura_monitorizacion | 70 | '] }).evidencia('EV-04')?.status === 'NO_CUMPLE');

  // EV-04 · un recolector parado o fallido en una máquina del alcance.
  const parado = (l: Linea) =>
    l.event === 'collector_heartbeat_observed' && l.agente_id === '024' ? { ...l, pasadas: String(l.pasadas).replace('op.acc.1|2026-10-09T11:30:02Z', 'op.acc.1|2026-10-08T10:00:00Z') } : l;
  const conParado = evalua(hoy(parado));
  comprueba(
    'op.acc.1 de wazuh-real sin pasada desde hace 26 h → la máquina no cuenta como cubierta: NO_CUMPLE',
    conParado.evidencia('EV-04')?.status === 'NO_CUMPLE' && /wazuh-real \(024\): op\.acc\.1 sin pasada desde 2026-10-08T10:00:00Z/.test(conParado.motivo('op.mon.2.1')),
    conParado.motivo('op.mon.2.1')
  );
  const fallida = evalua(hoy(l => (l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: String(l.pasadas).replace('11:50:00Z|completada', '11:50:00Z|fallida') } : l)));
  comprueba('op.exp.8 del LDAP falló en su última pasada → no cubierta: NO_CUMPLE', fallida.evidencia('EV-04')?.status === 'NO_CUMPLE' && /op\.exp\.8 falló en su última pasada/.test(fallida.motivo('op.mon.2.1')), fallida.motivo('op.mon.2.1'));
  comprueba('una pasada «parcial» sí cuenta como al día (op.exp.2 de wazuh-real)', evalua(hoy()).evidencia('EV-04')?.status === 'CUMPLE');
  const sinRecolectores = evalua(hoy(l => (l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: '-', recolectores: 0 } : l)));
  comprueba(
    'el LDAP sin ningún recolector desde que se observa (20/09) → no cubierta: NO_CUMPLE',
    sinRecolectores.evidencia('EV-04')?.status === 'NO_CUMPLE' && /ningún recolector de ENSFácil ha informado desde él desde 2026-09-20/.test(sinRecolectores.motivo('op.mon.2.1')),
    sinRecolectores.motivo('op.mon.2.1')
  );
  const recien = evalua(hoy(l => (l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: '-', recolectores: 0, observado_desde: '2026-10-09T06:00:00Z' } : l)));
  comprueba(
    'REVERSIÓN: sin recolectores pero observado solo desde hoy → no se puede afirmar: NO_EVALUABLE, nunca CUMPLE',
    recien.evidencia('EV-04')?.status === 'NO_EVALUABLE' && /todavía no ha informado ningún recolector/.test(recien.motivo('op.mon.2.1')),
    `${recien.evidencia('EV-04')?.status} ${recien.motivo('op.mon.2.1')}`
  );

  // R2 · recursos incompletos, sin validar o fuera de plazo.
  const sinExternas = evalua(hoy(l => (l.event === 'metrics_cycle_recorded' && l.periodo === '2026-T3' ? { ...l, horas_externas: '-' } : l)));
  comprueba('el último ciclo sin horas externas → R2 NO_CUMPLE', sinExternas.requisito('op.mon.2.r2.1').status === 'NO_CUMPLE' && !sinExternas.requisito('op.mon.2.r2.1').attested && /no anota horas externas/.test(sinExternas.motivo('op.mon.2.r2.1')), sinExternas.motivo('op.mon.2.r2.1'));
  const separados = { ...BASE, 'P-05': ['Responsable de Seguridad | RSEG | metricas', 'Gerencia | Dirección | recursos'] };
  const deGerencia = evalua(hoy(), separados);
  comprueba(
    'P-05 separa recursos (Gerencia) y el ciclo lo validó el RSEG → R2 NO_CUMPLE, la base sigue CUMPLE',
    deGerencia.requisito('op.mon.2.r2.1').status === 'NO_CUMPLE' && /no están validados por un responsable de recursos de P-05 \(Gerencia \(Dirección\)\)/.test(deGerencia.motivo('op.mon.2.r2.1')) && deGerencia.requisito('op.mon.2.1').status === 'CUMPLE',
    deGerencia.motivo('op.mon.2.r2.1')
  );
  comprueba(
    'REVERSIÓN: el mismo P-05 con el ciclo validado por «Dirección» → R2 CUMPLE y la base NO_CUMPLE (no es de métricas)',
    (() => {
      const d = evalua(hoy(l => (l.event === 'metrics_cycle_recorded' ? { ...l, validado_por: 'Dirección' } : l)), separados);

      return d.requisito('op.mon.2.r2.1').status === 'CUMPLE' && d.requisito('op.mon.2.1').status === 'NO_CUMPLE';
    })()
  );
  comprueba('el ciclo fuera de plazo → R2 NO_CUMPLE: los recursos no están al día', evalua(eventos(pasada(COMPLETA, { ciclos: atrasados }))).requisito('op.mon.2.r2.1').status === 'NO_CUMPLE');
}

// --- 5. sin registro y sin parámetros ----------------------------------------

bloque('5. Sin registro o sin parámetros: NO_EVALUABLE con causa CONFIGURATION, nunca CUMPLE por vacío');

{
  const sinCiclos = evalua(hoy(undefined, { ciclos: [], lecturaCiclos: { presente: 'no', legible: '-', formato: '-' } }));
  comprueba('sin registro de ciclos → op.mon.2.1 no demostrado, CONFIGURATION', sinDemostrar(sinCiclos, 'op.mon.2.1', 'CONFIGURATION') && /No existe el registro de ciclos de métricas/.test(sinCiclos.motivo('op.mon.2.1')), sinCiclos.motivo('op.mon.2.1'));
  comprueba('y R2 no demostrado, CONFIGURATION', sinDemostrar(sinCiclos, 'op.mon.2.r2.1', 'CONFIGURATION'), sinCiclos.motivo('op.mon.2.r2.1'));
  comprueba(
    'y R1 tampoco: sin ciclos no consta que los datos de incidentes se consoliden (CONFIGURATION)',
    sinDemostrar(sinCiclos, 'op.mon.2.r1.1', 'CONFIGURATION') && /no consta que los datos de incidentes se consoliden/.test(sinCiclos.motivo('op.mon.2.r1.1')),
    sinCiclos.motivo('op.mon.2.r1.1')
  );

  const sinIncidentes = evalua(hoy(undefined, { lecturaIncidentes: { presente: 'no', legible: '-', formato: '-' } }));
  comprueba(
    'sin registro de incidentes (wazuh4 solo tiene el .example) → R1 no demostrado, CONFIGURATION; nunca CUMPLE por cero incidentes',
    sinDemostrar(sinIncidentes, 'op.mon.2.r1.1', 'CONFIGURATION') && /No existe el registro de incidentes \(\/etc\/ensfacil\/incident-register\.tsv\)/.test(sinIncidentes.motivo('op.mon.2.r1.1')),
    sinIncidentes.motivo('op.mon.2.r1.1')
  );
  comprueba('REVERSIÓN: el registro presente y vacío → R1 CUMPLE', evalua(hoy()).requisito('op.mon.2.r1.1').status === 'CUMPLE');

  const cabecera = evalua(hoy(undefined, { ciclos: [], lecturaCiclos: { formato: 'cabecera_distinta', filas_validas: 0, filas_emitidas: 0 } }));
  comprueba('registro con otra cabecera → CONFIGURATION (no se interpreta ninguna fila)', sinDemostrar(cabecera, 'op.mon.2.1', 'CONFIGURATION') && /no es la cabecera exigida/.test(cabecera.motivo('op.mon.2.1')), cabecera.motivo('op.mon.2.1'));
  const ilegible = evalua(hoy(undefined, { incidentes: [], lecturaIncidentes: { legible: 'no', formato: '-' } }));
  comprueba('registro de incidentes ilegible → COLLECTION', sinDemostrar(ilegible, 'op.mon.2.r1.1', 'COLLECTION'), ilegible.motivo('op.mon.2.r1.1'));

  const r = evalua(hoy(), SIN_PARAMETROS, 'ALTO');
  ['op.mon.2.1', 'op.mon.2.r1.1', 'op.mon.2.r2.1'].forEach(id =>
    comprueba(`sin ningún parámetro, ${id} no demostrado por CONFIGURATION`, sinDemostrar(r, id, 'CONFIGURATION'), `${r.requisito(id).status} ${r.decision(id)?.cause} ${r.motivo(id)}`)
  );
  comprueba('y el control no puntúa como cumplido', r.motor().status !== 'CUMPLE');

  const falta = (id: string, req: string, patron: RegExp) => {
    const sin = evalua(hoy(), { ...BASE, [id]: undefined });

    comprueba(`falta solo ${id} → ${req} no demostrado por CONFIGURATION, nombrándolo`, sinDemostrar(sin, req, 'CONFIGURATION') && patron.test(sin.motivo(req)), sin.motivo(req));
  };
  falta('P-01', 'op.mon.2.1', /P-01 \(Declaración de aplicabilidad\) está sin configurar/);
  falta('P-02', 'op.mon.2.1', /P-02 \(Periodicidad de los ciclos de métricas\) está sin configurar/);
  falta('P-02', 'op.mon.2.r1.1', /P-02/);
  falta('P-02', 'op.mon.2.r2.1', /P-02/);
  falta('P-03', 'op.mon.2.r1.1', /P-03 \(Indicadores de la gestión de incidentes\) está sin configurar/);
  falta('P-04', 'op.mon.2.r2.1', /P-04 \(Partidas de los recursos consumidos\) está sin configurar/);
  falta('P-05', 'op.mon.2.1', /P-05 \(Responsables de validar las métricas\) está sin configurar/);
  falta('P-05', 'op.mon.2.r2.1', /P-05/);
  falta('P-06', 'op.mon.2.1', /P-06 \(Objetivos de las métricas\) está sin configurar.*Cobertura medida: 100 %/);

  const sinCobertura = evalua(hoy(), { ...BASE, 'P-06': ['implantacion_global | 90 | '] });
  comprueba('P-06 sin la fila de cobertura → CONFIGURATION, nombrando la métrica', sinCobertura.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /no declara el objetivo de cobertura_monitorizacion/.test(sinCobertura.motivo('op.mon.2.1')), sinCobertura.motivo('op.mon.2.1'));

  const p04Incompleta = evalua(hoy(), { ...BASE, 'P-04': ['Personal TIC propio | horas_internas | partes'] });
  comprueba('P-04 sin partidas de horas externas ni de presupuesto → R2 CONFIGURATION', sinDemostrar(p04Incompleta, 'op.mon.2.r2.1', 'CONFIGURATION') && /horas_externas, presupuesto_ejecutado/.test(p04Incompleta.motivo('op.mon.2.r2.1')), p04Incompleta.motivo('op.mon.2.r2.1'));

  const noAplicaNada = evalua(hoy(), { ...BASE, 'P-01': ['op.acc.1 | no |  | '] });
  comprueba('P-01 sin ninguna medida aplicable → op.mon.2.1 CONFIGURATION (sin base)', sinDemostrar(noAplicaNada, 'op.mon.2.1', 'CONFIGURATION'), noAplicaNada.motivo('op.mon.2.1'));

  const invalidos = configuracion(BASE)
    .parameters.map(p => ({ id: p.id, veredicto: validateParameterValue(p, p.value) }))
    .filter(v => !v.veredicto.valid);
  comprueba('los valores de BASE son válidos para sus tablas y su lista', invalidos.length === 0, invalidos.map(v => `${v.id}: ${v.veredicto.reason}`).join('; '));
}

// --- 6. sin recolector ---------------------------------------------------------

bloque('6. Sin recolector, hechos viejos o perdidos: NO_EVALUABLE por RECOGIDA');

{
  const nada = evalua([]);
  ['op.mon.2.r1.1', 'op.mon.2.r2.1'].forEach(id => comprueba(`sin ningún hecho → ${id} no demostrado por COLLECTION`, sinDemostrar(nada, id, 'COLLECTION'), nada.motivo(id)));
  comprueba('y EV-04 por COLLECTION', nada.evidencia('EV-04')?.gapCause === 'COLLECTION', nada.evidencia('EV-04')?.gapCause);

  const viejo = evalua(hoy(), BASE, 'MEDIO', new Date('2026-10-11T12:30:00Z'));
  comprueba('dos días sin pasadas: el estado no describe hoy → no demostrado', viejo.requisito('op.mon.2.1').evidenced === false && /no está informando/.test(viejo.motivo('op.mon.2.1')), viejo.motivo('op.mon.2.1'));

  const perdida = evalua(eventos(pasada(COMPLETA), l => (l.event === 'metrics_cycle_recorded' && l.periodo === '2026-T3' ? undefined : l)));
  comprueba(
    'el recolector emitió 2 ciclos y llega 1 (línea perdida) → no se afirma nada del registro: COLLECTION',
    perdida.evidencia('EV-02')?.status === 'NO_EVALUABLE' && perdida.evidencia('EV-02')?.gapCause === 'COLLECTION' && /han llegado 1/.test(perdida.motivo('op.mon.2.1')),
    perdida.motivo('op.mon.2.1')
  );

  const degradada = (ts: string, cambia?: (l: Linea) => Linea | undefined) =>
    evalua(hoy(cambia).concat(eventos([
      { ts, event: 'evidence_state', evidence_id: 'EV-04', requisito: 'op.mon.2.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer /var/ossec/logs/alerts/alerts.json: los latidos de los recolectores no se actualizan' },
    ])));
  const deg = degradada(`${COMPLETA}:45Z`);
  comprueba(
    'alerts.json ilegible en la última pasada, después de los hechos → lo que cumplía pasa a NO_EVALUABLE con el motivo del recolector',
    deg.evidencia('EV-04')?.status === 'NO_EVALUABLE' && deg.evidencia('EV-04')?.gapCause === 'COLLECTION' && /alerts\.json/.test(deg.motivo('op.mon.2.1')),
    deg.motivo('op.mon.2.1')
  );
  const degConFallo = degradada(`${COMPLETA}:45Z`, l => (l.event === 'agent_keepalive_observed' && l.agente_id === '028' ? { ...l, estado_conexion: 'disconnected' } : l));
  comprueba(
    'y con el LDAP desconectado medido, manda la medida → NO_CUMPLE, con la degradación aparte',
    degConFallo.evidencia('EV-04')?.status === 'NO_CUMPLE' && /Además: El recolector no ha podido medirlo/.test(degConFallo.motivo('op.mon.2.1')),
    degConFallo.motivo('op.mon.2.1')
  );
  comprueba('una degradación de hace dos días no se usa', degradada('2026-10-07T12:05:45Z').evidencia('EV-04')?.status === 'CUMPLE');

  const ajeno = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': `${COMPLETA}:30Z`,
      agent: MANAGER,
      data: { ensfacil: 'op.exp.8', event: 'agent_keepalive_observed', evidence_id: 'EV-04', agente_id: '024', agente: 'wazuh-real', estado_conexion: 'active', grupos: 'ens' },
    },
  }]);
  comprueba('un hecho de otro control (op.exp.8) no acredita op.mon.2', evalua(ajeno).evidencia('EV-04')?.status !== 'CUMPLE');
}

// --- 7. foco: lecciones de la revisión de op.mon.1 ---------------------------

bloque('7. Gramáticas estrictas, edades al leer, IDs normalizados y el estado por la última pasada');

{
  // Una celda que tiene que ser de un vocabulario se lee con su gramática.
  const p06 = (filas: string[]) => evalua(hoy(), { ...BASE, 'P-06': filas });
  const cobertura = p06(['cobertura | 95 | 5']);
  comprueba('P-06 «cobertura» (no es una métrica del vocabulario) → CONFIGURATION nombrando la fila', cobertura.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /«cobertura \| 95 \| 5»: la métrica no es ninguna de/.test(cobertura.motivo('op.mon.2.1')), cobertura.motivo('op.mon.2.1'));
  comprueba('P-06 objetivo «noventa» → CONFIGURATION', p06(['cobertura_monitorizacion | noventa | ']).evidencia('EV-04')?.gapCause === 'CONFIGURATION');
  comprueba('P-06 objetivo 150 % → CONFIGURATION', p06(['cobertura_monitorizacion | 150 | ']).evidencia('EV-04')?.gapCause === 'CONFIGURATION');
  comprueba('REVERSIÓN: «95 %» con su unidad sí vale → CUMPLE', p06(['cobertura_monitorizacion | 95 % | 5']).evidencia('EV-04')?.status === 'CUMPLE');
  comprueba('P-06 con la métrica dos veces → CONFIGURATION', p06(['cobertura_monitorizacion | 95 | 5', 'cobertura_monitorizacion | 90 | ']).evidencia('EV-04')?.gapCause === 'CONFIGURATION');

  const p01 = evalua(hoy(), { ...BASE, 'P-01': ['Control de acceso | sí | MEDIO | R1', 'op.acc.1 | sí | MEDIO | R1'] });
  comprueba('P-01 «Control de acceso» no es una medida del ENS → CONFIGURATION nombrándola', sinDemostrar(p01, 'op.mon.2.1', 'CONFIGURATION') && /«Control de acceso» no es el identificador de una medida del ENS/.test(p01.motivo('op.mon.2.1')), p01.motivo('op.mon.2.1'));
  const p01MedidaRota = evalua(hoy(l => (l.event === 'metrics_cycle_recorded' ? { ...l, validado_por: '-' } : l)), { ...BASE, 'P-01': ['Control de acceso | sí | | '] });
  comprueba('y con un ciclo sin validar medido, manda la medida: NO_CUMPLE', p01MedidaRota.requisito('op.mon.2.1').status === 'NO_CUMPLE' && p01MedidaRota.requisito('op.mon.2.1').evidenced === true, p01MedidaRota.motivo('op.mon.2.1'));

  const p03 = evalua(hoy(), { ...BASE, 'P-03': ['tiempo medio de detección', 'tiempo_medio_resolucion'] });
  comprueba('P-03 «tiempo medio de detección» (no se calcula con el registro) → R1 CONFIGURATION nombrándolo', sinDemostrar(p03, 'op.mon.2.r1.1', 'CONFIGURATION') && /«tiempo medio de detección»/.test(p03.motivo('op.mon.2.r1.1')), p03.motivo('op.mon.2.r1.1'));

  const p02 = (fila: string) => evalua(hoy(), { ...BASE, 'P-02': [fila] });
  comprueba('P-02 margen «quince» → CONFIGURATION nombrando la fila', sinDemostrar(p02('trimestral | quince | 12-31'), 'op.mon.2.1', 'CONFIGURATION') && /el margen «quince» no es un número entero de días/.test(p02('trimestral | quince | 12-31').motivo('op.mon.2.1')));
  comprueba('P-02 cierre «31/12» → CONFIGURATION', sinDemostrar(p02('trimestral | 15 | 31/12'), 'op.mon.2.1', 'CONFIGURATION'));
  comprueba('P-02 cierre «02-30» (no existe) → CONFIGURATION', sinDemostrar(p02('trimestral | 15 | 02-30'), 'op.mon.2.1', 'CONFIGURATION'));
  comprueba('P-02 «bienal» → CONFIGURATION', sinDemostrar(p02('bienal | 15 | 12-31'), 'op.mon.2.1', 'CONFIGURATION'));
  comprueba('REVERSIÓN: P-02 sin margen ni cierre vale (margen 0) → CUMPLE', p02('trimestral |  | ').requisito('op.mon.2.1').status === 'CUMPLE');
  comprueba('P-02 con dos filas → CONFIGURATION', sinDemostrar(evalua(hoy(), { ...BASE, 'P-02': ['trimestral | 15 | ', 'anual | 0 | '] }), 'op.mon.2.1', 'CONFIGURATION'));

  const p05 = evalua(hoy(), { ...BASE, 'P-05': ['Responsable de Seguridad | RSEG | todos'] });
  comprueba('P-05 con un ámbito fuera del vocabulario → CONFIGURATION', sinDemostrar(p05, 'op.mon.2.1', 'CONFIGURATION'), p05.motivo('op.mon.2.1'));

  // Edades juzgadas en el instante de la lectura, no con el reloj de la
  // evaluación: la pasada de las 12:05 vista 20 h después.
  const tarde = evalua(hoy(), BASE, 'MEDIO', new Date('2026-10-10T08:00:00Z'));
  comprueba(
    'la lectura de las 12:05 vista 20 h después: op.mon.2 del manager tenía 6 h al leerse → sigue cubierto, EV-04 CUMPLE',
    tarde.evidencia('EV-04')?.status === 'CUMPLE',
    `${tarde.evidencia('EV-04')?.status} ${tarde.motivo('op.mon.2.1')}`
  );

  // IDs normalizados a los dos lados.
  const sinCeros = evalua(hoy(l => (l.event === 'agent_keepalive_observed' && l.agente_id === '024' ? { ...l, agente_id: '24' } : l)));
  comprueba('un keepalive con «24» casa con el latido de «024»', sinCeros.evidencia('EV-04')?.status === 'CUMPLE', sinCeros.motivo('op.mon.2.1'));

  // Un fallo de lectura de UNA máquina va en su hecho, y no tapa lo medido.
  const ilegible = (l: Linea) => (l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: 'op.acc.1@ayer' } : l);
  const unaIlegible = evalua(hoy(ilegible));
  comprueba(
    'la lista de pasadas ilegible del LDAP → esa máquina sin determinar; con 2 de 3 cubiertas y objetivo 90, no se puede decidir: NO_EVALUABLE por COLLECTION',
    unaIlegible.evidencia('EV-04')?.status === 'NO_EVALUABLE' && unaIlegible.evidencia('EV-04')?.gapCause === 'COLLECTION' && /ldap-zimbra \(028\): su lista de pasadas no se puede interpretar/.test(unaIlegible.motivo('op.mon.2.1')),
    `${unaIlegible.evidencia('EV-04')?.status} ${unaIlegible.motivo('op.mon.2.1')}`
  );
  const conCaido = evalua(hoy(l => ilegible(l.event === 'agent_keepalive_observed' && l.agente_id === '024' ? { ...l, estado_conexion: 'disconnected' } : l)));
  comprueba(
    'y con wazuh-real desconectado, ni con el LDAP cubierto se llega (66.7 % < 90): NO_CUMPLE medido',
    conCaido.evidencia('EV-04')?.status === 'NO_CUMPLE' && /como mucho 66\.7 %/.test(conCaido.motivo('op.mon.2.1')),
    conCaido.motivo('op.mon.2.1')
  );

  // Un latido fechado después de la lectura (reloj adelantado) no prueba nada.
  const adelantado = (l: Linea) =>
    l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: String(l.pasadas).replace('op.acc.1|2026-10-09T11:45:00Z', 'op.acc.1|2026-10-09T18:45:00Z') } : l;
  const futuroLdap = evalua(hoy(adelantado));
  comprueba(
    'op.acc.1 del LDAP con su última pasada a las 18:45 y leída a las 12:05 → esa máquina sin determinar (reloj adelantado), nunca cubierta: NO_EVALUABLE',
    futuroLdap.evidencia('EV-04')?.status === 'NO_EVALUABLE' && futuroLdap.evidencia('EV-04')?.gapCause === 'EVIDENCE' && /ldap-zimbra \(028\): op\.acc\.1 con su última pasada en el futuro.*reloj adelantado/.test(futuroLdap.motivo('op.mon.2.1')),
    `${futuroLdap.evidencia('EV-04')?.status} ${futuroLdap.evidencia('EV-04')?.gapCause} ${futuroLdap.motivo('op.mon.2.1')}`
  );
  comprueba(
    'REVERSIÓN: la misma pasada dentro de la tolerancia de reloj (12:08) → cubierta, CUMPLE',
    evalua(hoy(l => (l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: String(l.pasadas).replace('op.acc.1|2026-10-09T11:45:00Z', 'op.acc.1|2026-10-09T12:08:00Z') } : l))).evidencia('EV-04')?.status === 'CUMPLE'
  );
  const futuroYParado = evalua(hoy(l => adelantado(l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: String(l.pasadas).replace('11:50:00Z|completada', '11:50:00Z|fallida') } : l)));
  comprueba('y con otro recolector del LDAP fallido, manda la medida: no cubierta, NO_CUMPLE', futuroYParado.evidencia('EV-04')?.status === 'NO_CUMPLE', futuroYParado.motivo('op.mon.2.1'));

  // Sin nada del alcance: nunca un CUMPLE por vacío.
  const sinAlcance = evalua(hoy(l => (l.event === 'agent_keepalive_observed' || l.event === 'collector_heartbeat_observed' ? (l.agente_id === '000' ? undefined : { ...l, grupos: 'default' }) : l)));
  comprueba('la base de agentes sin ningún sistema del alcance → NO_EVALUABLE, nunca CUMPLE', sinAlcance.evidencia('EV-04')?.status === 'NO_EVALUABLE', `${sinAlcance.evidencia('EV-04')?.status} ${sinAlcance.motivo('op.mon.2.1')}`);

  // El estado por la última pasada: un ciclo borrado del registro deja de
  // contar en cuanto una pasada lo cubre.
  const borrado = eventos([
    ...pasada(ANTERIOR),
    ...pasada(COMPLETA, { ciclos: [ciclo(COMPLETA, 3, '2026-T2', '2026-07-08T09:00:00Z')] }),
  ]);
  const sinT3 = evalua(borrado);
  comprueba(
    'el T3 estaba a las 06:05 y se borró a las 12:05: cuenta solo el T2 (93 días, aún en plazo)',
    sinT3.evidencia('EV-02')?.status === 'CUMPLE' && /2026-T2 \(consolidado el 2026-07-08.*hace 93 días/.test(sinT3.deEvidencia('op.mon.2.1', 'EV-02')?.reason || '') && !/2026-T3/.test(sinT3.deEvidencia('op.mon.2.1', 'EV-02')?.reason || ''),
    sinT3.deEvidencia('op.mon.2.1', 'EV-02')?.reason
  );

  // La plantilla .example no acredita; un ciclo del futuro tampoco.
  const ejemplo = evalua(eventos(pasada(COMPLETA, { ciclos: [ciclo(COMPLETA, 3, '2026-T3', '2026-10-02T10:00:00Z', { validado_por: 'RSEG', referencia: 'https://EJEMPLO.invalido/metricas.pdf' })] })));
  comprueba('un ciclo con la referencia de ejemplo de la plantilla no cuenta → no hay ningún ciclo: NO_CUMPLE', ejemplo.evidencia('EV-02')?.status === 'NO_CUMPLE' && /EJEMPLO\.invalido/.test(ejemplo.motivo('op.mon.2.1')), ejemplo.motivo('op.mon.2.1'));
  const futuro = evalua(eventos(pasada(COMPLETA, { ciclos: [ciclo(COMPLETA, 3, '2026-T4', '2026-12-31T10:00:00Z', { validado_por: 'RSEG' })] })));
  comprueba('un ciclo fechado en el futuro no cuenta', futuro.evidencia('EV-02')?.status === 'NO_CUMPLE' && /fechados en el futuro: 2026-T4/.test(futuro.motivo('op.mon.2.1')), futuro.motivo('op.mon.2.1'));
}

// --- 8. reglas y presupuesto -------------------------------------------------

bloque('8. Las reglas de la banda 111300 casan con el catálogo, y un día cabe en el presupuesto');

{
  const xml = fs.readFileSync(path.join(__dirname, '..', 'agent', 'rules', 'ensfacil_op_mon_2_json_rules.xml'), 'utf8');
  const reglas = new Map<string, string>();
  // Regla a regla: el bloque de cada <rule> hasta su cierre.
  Array.from(xml.matchAll(/<rule id="(\d+)"[^>]*>([\s\S]*?)<\/rule>/g)).forEach(([, id, cuerpo]) => {
    const evento = /<field name="event">([a-z_]+)<\/field>/.exec(cuerpo);

    if (evento) {
      reglas.set(evento[1], id);
    }
  });

  comprueba('todas las reglas están en la banda 111300-111399', Array.from(xml.matchAll(/<rule id="(\d+)"/g)).every(x => Number(x[1]) >= 111300 && Number(x[1]) <= 111399));
  comprueba('cada evento del contrato tiene su regla, la de la prueba', Object.entries(REGLA).every(([evento, id]) => reglas.get(evento) === id), JSON.stringify(Array.from(reglas.entries())));

  const definiciones = getEvidenceDefinitions('op.mon.2');
  comprueba(
    'el `relatedRules` de cada evidencia son las reglas de sus eventos (EV-06 lee la de los ciclos)',
    definiciones.every(d => {
      const propias = (d.expectedEventTypes || []).filter(t => t !== 'evidence_state').map(t => reglas.get(t));
      const esperadas = d.id === 'EV-06' ? ['111302'] : propias;

      return JSON.stringify([...(d.relatedRules || [])].sort()) === JSON.stringify([...esperadas].sort());
    }),
    definiciones.map(d => `${d.id}:${(d.relatedRules || []).join('/')}`).join(' ')
  );
  comprueba('ninguna regla lleva un campo `estado` salvo la de evidence_state', (xml.match(/<field name="estado">/g) || []).length === 1);

  // Un día del laboratorio: cuatro pasadas de 6 h con 14 ciclos mensuales y
  // 30 filas de incidentes.
  const mensuales = Array.from({ length: 14 }, (_, i) => ciclo(COMPLETA, i + 3, `2025-${String(i + 1).padStart(2, '0')}`, `2025-${String((i % 12) + 1).padStart(2, '0')}-05T09:00:00Z`));
  const filas = Array.from({ length: 30 }, (_, i) => fase(COMPLETA, i + 2, `INC-${Math.floor(i / 3)}`, ['inicial', 'intermedio', 'final'][i % 3], '2026-09-10T08:00:00Z'));
  const dia = ['00', '06', '12', '18'].flatMap(h => pasada(`2026-10-09T${h}:05`, { ciclos: mensuales, incidentes: filas }));
  comprueba(`un día del laboratorio son ${dia.length} hechos, por debajo de los 300 del presupuesto`, dia.length <= 300, dia.length);

  const largo = Array.from({ length: 30 }, (_, i) => `op.ctl.${i}|2026-10-09T11:30:02Z|completada`).join(',');
  const linea = JSON.stringify({ ...pasada()[0], event: 'collector_heartbeat_observed', pasadas: largo });
  comprueba(`un latido con 30 recolectores ocupa ${linea.length} bytes, muy por debajo de una línea de logcollector`, linea.length < 8192, linea.length);
}

// --- 9. el informe -------------------------------------------------------------

bloque('9. El informe: implantación y grises con el resultado de todos los controles, sin veredicto');

{
  const r = evalua(conIncidentes());
  const resultado = r.motor() as ENSComplianceResult;
  const de = (id: string, status: ENSComplianceResult['status'], score: number | undefined, extra: Partial<ENSComplianceResult> = {}) =>
    ({ ...resultado, control: { ...resultado.control, id }, status, score, missingParameters: [], nonConformities: [], ...extra } as ENSComplianceResult);
  const panorama: ENSComplianceResult[] = [
    de('op.acc.1', 'CUMPLE', 100),
    de('op.exp.7', 'PARCIAL', 60, {
      nonConformities: [{ id: 'nc', evidenceId: 'EV-07', requirementId: 'op.exp.7.2', finding: 'x', impact: 'x', requiredAction: 'x', origin: 'NO_EVIDENCIADA', cause: 'CONFIGURATION', evidenceIds: ['EV-07'], parameterIds: ['P-07'] }],
    }),
    de('op.mon.1', 'NO_CUMPLE', 80, { missingParameters: ['P-01'] }),
    de('op.mon.2', resultado.status, resultado.score),
  ];
  const informe = buildOpMon2ReportModel(resultado, panorama);
  const campo = (id: string) => informe.fields.find(f => f.id === id)!;

  comprueba(
    'grado de implantación: 80 % global sobre 3 de 5 medidas aplicables (op.mon.2 no se cuenta a sí mismo; org.1 no se evalúa)',
    campo('op.mon.2.campo2').status === 'NO_APLICA' && /^80 % global sobre 3 de 5 medidas aplicables/.test(campo('op.mon.2.campo2').value) && /DESVIACIÓN/.test(campo('op.mon.2.campo2').value),
    campo('op.mon.2.campo2').value
  );
  comprueba(
    'y desglosa por marco y por medida',
    campo('op.mon.2.campo2').details.some(d => /^Marco operacional: 80 % \(3 medidas\)/.test(d)) && campo('op.mon.2.campo2').details.some(d => /org\.1: sin evaluar en ENSFácil/.test(d)) && campo('op.mon.2.campo2').details.some(d => /op\.mon\.2: sin evaluar/.test(d)),
    campo('op.mon.2.campo2').details.join(' | ')
  );
  comprueba(
    'controles no evaluables: op.exp.7 (P-07) y op.mon.1 (P-01), sin veredicto',
    campo('op.mon.2.campo5').status === 'NO_APLICA' && /^2 control\(es\)/.test(campo('op.mon.2.campo5').value) && campo('op.mon.2.campo5').details.includes('op.exp.7: P-07') && campo('op.mon.2.campo5').details.includes('op.mon.1: P-01'),
    `${campo('op.mon.2.campo5').value} ${campo('op.mon.2.campo5').details.join(' | ')}`
  );
  comprueba('R2 se presenta como DATO DECLARADO', /DATO DECLARADO/.test(campo('op.mon.2.campo7').value) && campo('op.mon.2.campo7').status === 'CUMPLE', campo('op.mon.2.campo7').value);
  comprueba('la fiabilidad lleva la cobertura frente a su objetivo', /Cobertura de la monitorización 100 %.*objetivo ≥ 95 %: alcanzado/.test(campo('op.mon.2.campo4').value), campo('op.mon.2.campo4').value);
  comprueba('los indicadores de incidentes del periodo, con R1', campo('op.mon.2.campo6').status === 'CUMPLE' && /tiempo_medio_resolucion: 32\.3 h/.test(campo('op.mon.2.campo6').value), campo('op.mon.2.campo6').value);
  comprueba('la serie de ciclos, con el último delante', /el último: 2026-T3/.test(campo('op.mon.2.campo3').value) && campo('op.mon.2.campo3').details.some(d => /2026-T2/.test(d)), campo('op.mon.2.campo3').value);
  comprueba(
    'los datos del art. 32 llevan el origen de cada cifra',
    campo('op.mon.2.campo8').status === 'NO_APLICA' && campo('op.mon.2.campo8').details.some(d => /Grado de implantación: 80 % \(motor de ENSFácil sobre P-01/.test(d)) && campo('op.mon.2.campo8').details.some(d => /registro de incidentes de op\.exp\.7/.test(d)),
    campo('op.mon.2.campo8').details.join(' | ')
  );

  const sinPanorama = buildOpMon2ReportModel(resultado);
  comprueba(
    'sin el resultado de todos los controles: implantación, grises y art. 32 SIN_DATOS, nunca inventados',
    ['op.mon.2.campo2', 'op.mon.2.campo5', 'op.mon.2.campo8'].every(id => sinPanorama.fields.find(f => f.id === id)!.status === 'SIN_DATOS')
  );
  comprueba('el registro de informes pide el panorama para op.mon.2', getENSReportModelDefinition('op.mon.2')?.usesAllControls === true && !getENSReportModelDefinition('op.mon.1')?.usesAllControls);
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
