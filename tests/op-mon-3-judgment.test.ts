/** op.mon.3: judgment of monitoring. */
import { opMon3PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-mon-3.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opMon3CatalogDefinition } from '../common/ens/catalog/op-mon-3';
import { opMon3Configuration } from '../common/ens/configuration/data/op-mon-3-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import { parseRequirementAttestations } from '../common/ens/configuration/services/attestation-service';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import { buildOpMon3ReportModel } from '../public/ens/reports/op-mon-3-report-model';
import type { ENSControlConfiguration, ENSLevel } from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

const failures: string[] = [];

const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail !== '' ? ` — ${String(detail)}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

type Linea = Record<string, unknown>;

const MACHINES: Record<string, string> = {
  '000': 'Wazuh-4',
  '024': 'wazuh-real',
  '027': 'srv-prueba',
  '028': 'ldap-zimbra',
  '030': 'srv-copias',
  '033': 'win-prueba',
};

const HOURLY = '2026-10-09T11:05';
const COMPLETE = '2026-10-09T12:05';
const AGENT_024 = '2026-10-09T12:20';
const AGENT_028 = '2026-10-09T12:25';

const NOW = new Date('2026-10-09T12:30:00Z');

const t = (base: string, s: number): string => `${base}:${String(s).padStart(2, '0')}Z`;

const collection = (ts: string, extra: Linea = {}): Linea => ({
  _a: '000', ts, event: 'event_collection_status', evidence_id: 'EV-01', requisito: 'op.mon.3.1', plano: 'central',
  activo: 'si', eventos_recibidos: 1203345, eventos_procesados: 1203300, eventos_descartados: 0,
  fuente_contadores: '/var/ossec/var/run/wazuh-analysisd.state', mensajes_remoted: 990210, descartados_remoted: 0, sesiones_tcp: 4,
  conexiones: 'secure:1514/tcp', agentes_registrados: 4, agentes_activos: 2, alertas_observadas_desde: '2026-09-01T00:00:00Z', ...extra,
});

const heartbeat = (a: string, ts: string, covered: string, type = 'manager'): Linea => ({
  _a: a, ts, event: 'collector_run', resultado: 'completada', evidencias_cubiertas: covered, tipo_servidor: type, emisor: 'recolector',
});

const FULL_COVER = 'EV-01,EV-02,EV-03,EV-04,EV-06,EV-07,EV-08,EV-09,EV-12,EV-13';

const source = (a: string, ts: string, location: string, extra: Linea = {}): Linea => ({
  _a: a, ts, event: 'log_source_observed', evidence_id: 'EV-02', requisito: 'op.mon.3.1', plano: a === '000' ? 'central' : 'agente',
  ubicacion: location, eventos: 18250, bytes: 2410200, descartes: 0, descartes_periodo: 0, contador_desde: '2026-10-01T07:00:00Z',
  ultimo_evento: '2026-10-09T12:00:00Z', observado_desde: '2026-10-01T08:00:00Z', lectura: 'ok', ...extra,
});

const delivery = (a: string, ts: string, extra: Linea = {}): Linea => ({
  _a: a, ts, event: 'agent_forwarding_observed', evidence_id: 'EV-02', requisito: 'op.mon.3.1', plano: 'agente',
  conexion: 'connected', ultimo_keepalive: '2026-10-09T12:19:50Z', ultimo_ack: '2026-10-09T12:19:55Z',
  mensajes_generados: 88120, mensajes_enviados: 88120, mensajes_en_buffer: 0, lectura: 'ok', ...extra,
});

const sca = (ts: string, id: string, policy: string, fin: string, extra: Linea = {}): Linea => ({
  _a: '000', ts, event: 'config_assessment_observed', evidence_id: 'EV-04', requisito: 'op.mon.3.r2.1', plano: 'central',
  agente_id: id, agente: MACHINES[id] || id, politica: policy, politica_nombre: `CIS ${policy}`, ultimo_fin: fin,
  aprobados: 120, fallos: 61, puntuacion: 66, lectura: 'ok', ...extra,
});

const inventory = (ts: string, id: string, connection: string, ultimo: string, extra: Linea = {}): Linea => ({
  _a: '000', ts, event: 'package_inventory_observed', evidence_id: 'EV-04', requisito: 'op.mon.3.r2.1', plano: 'central',
  agente_id: id, agente: MACHINES[id] || id, estado_conexion: connection, ultimo_keepalive: '2026-10-09T12:04:50Z',
  inventario_ultimo: ultimo, paquetes: 812, recolector_agente_ultimo: '-', lectura: 'ok', ...extra,
});

const detector = (ts: string, extra: Linea = {}): Linea => ({
  _a: '000', ts, event: 'vulnerability_detection_status', evidence_id: 'EV-04', requisito: 'op.mon.3.r2.1', plano: 'central',
  habilitado: 'si', intervalo_feed: '60m', feed_actualizado: '2026-10-09T11:46:00Z', inventario_vd_actualizado: '2026-10-09T11:50:00Z',
  errores_indexacion_24h: 0, errores_desde: '2026-10-08T12:05:18Z', ultimo_error_indexacion: '-', muestra_error: '-', errores_conector_24h: 0, cve_por_activo: 'sin_medir', ...extra,
});

const completePass = (ts = COMPLETE, extra: { coleccion?: Linea; detector?: Linea } = {}): Linea[] => [
  collection(t(ts, 10), { eventos_procesados: 1210450, eventos_recibidos: 1210500, mensajes_remoted: 995300, ...extra.coleccion }),
  source('000', t(ts, 11), '/var/log/auth.log', { ultimo_evento: '2026-10-09T12:00:00Z' }),
  source('000', t(ts, 11), 'journald', { eventos: 99120 }),
  source('000', t(ts, 11), '/var/ossec/logs/active-responses.log', { eventos: 3, ultimo_evento: '2026-10-02T09:00:00Z' }),
  { _a: '000', ts: t(ts, 12), event: 'syslog_source_observed', evidence_id: 'EV-02', requisito: 'op.mon.3.1', plano: 'central',
    ubicacion: 'ninguna', ultima_alerta: '-', alertas_24h: 0, nivel_max_24h: 0 },
  { _a: '000', ts: t(ts, 14), event: 'correlation_rules_inventory', evidence_id: 'EV-03', requisito: 'op.mon.3.r1.1', plano: 'central',
    conjunto: 'wazuh', ruta: '/var/ossec/ruleset/rules', ficheros: 167, reglas: 4515, reglas_con_mitre: 1188, tecnicas_mitre: 214,
    reglas_correlacion: 361, reglas_frecuencia: 158, reglas_if_matched: 211, tecnicas_correlacion: 63 },
  { _a: '000', ts: t(ts, 14), event: 'correlation_rules_inventory', evidence_id: 'EV-03', requisito: 'op.mon.3.r1.1', plano: 'central',
    conjunto: 'quersystem', ruta: '/var/ossec/etc/rules', ficheros: 6, reglas: 41, reglas_con_mitre: 12, tecnicas_mitre: 9,
    reglas_correlacion: 3, reglas_frecuencia: 3, reglas_if_matched: 0, tecnicas_correlacion: 2 },
  { _a: '000', ts: t(ts, 14), event: 'correlation_rules_inventory', evidence_id: 'EV-03', requisito: 'op.mon.3.r1.1', plano: 'central',
    conjunto: 'ensfacil', ruta: '/var/ossec/etc/rules', ficheros: 19, reglas: 300, reglas_con_mitre: 0, tecnicas_mitre: 0,
    reglas_correlacion: 0, reglas_frecuencia: 0, reglas_if_matched: 0, tecnicas_correlacion: 0 },
  { _a: '000', ts: t(ts, 15), event: 'correlation_alert_observed', evidence_id: 'EV-03', requisito: 'op.mon.3.r1.1', plano: 'central',
    regla: '5712', dia: '2026-10-09', veces: 3, nivel: 10, descripcion: 'sshd: brute force trying to get access to the system', grupos: 'syslog,sshd',
    tecnicas_mitre: 'T1110', agentes: 1, primera: '2026-10-09T07:12:00Z', ultima: '2026-10-09T09:40:00Z' },
  sca(t(ts, 16), '000', 'cis_ubuntu22-04', '2026-10-09T03:15:00Z'),
  sca(t(ts, 16), '024', 'cis_ubuntu24-04', '2026-10-09T05:59:40Z'),
  sca(t(ts, 16), '027', 'cis_ubuntu22-04', '2026-09-04T03:00:00Z'),
  sca(t(ts, 16), '028', 'cis_ubuntu22-04', '2026-10-09T08:31:00Z'),
  sca(t(ts, 16), '033', '-', '-', { politica_nombre: '-', aprobados: '-', fallos: '-', puntuacion: '-', lectura: 'ausente' }),
  inventory(t(ts, 17), '000', 'active', '2026-10-09T11:30:00Z'),
  inventory(t(ts, 17), '024', 'active', '2026-10-09T11:20:03Z', { recolector_agente_ultimo: '2026-10-09T06:20:14Z' }),
  inventory(t(ts, 17), '027', 'disconnected', '2026-09-04T09:00:00Z', { ultimo_keepalive: '2026-09-04T10:00:12Z', recolector_agente_ultimo: '2026-09-04T06:20:00Z' }),
  inventory(t(ts, 17), '028', 'active', '2026-10-09T11:40:00Z', { recolector_agente_ultimo: '2026-10-09T06:25:14Z' }),
  inventory(t(ts, 17), '030', 'active', '2026-10-09T11:10:00Z'),
  inventory(t(ts, 17), '033', 'never_connected', '-', { ultimo_keepalive: '-', paquetes: '-', lectura: 'ausente' }),
  detector(t(ts, 18), extra.detector),
  { _a: '000', ts: t(ts, 19), event: 'network_detection_observed', evidence_id: 'EV-06', requisito: 'op.mon.3.r3.2', plano: 'central',
    producto: 'ninguno', fuente: '-', ultima_alerta: '-', alertas_24h: 0 },
  { _a: '000', ts: t(ts, 20), event: 'ioc_list_observed', evidence_id: 'EV-07', requisito: 'op.mon.3.r4.1', plano: 'central',
    lista: 'etc/lists/malicious-ioc/malicious-ip', entradas: 1520, actualizada: '2026-06-02T10:00:00Z', reglas_que_la_usan: 1 },
  { _a: '000', ts: t(ts, 21), event: 'query_volume_rules_observed', evidence_id: 'EV-08', requisito: 'op.mon.3.r5.1', plano: 'central',
    ids: '5551,5712,5720,5763,107215-107217', reglas_umbral: 161, parte: 1, partes: 1 },
  { _a: '000', ts: t(ts, 22), event: 'notification_channel_configured', evidence_id: 'EV-09', requisito: 'op.mon.3.r5.2', plano: 'central',
    canal: 'correo', habilitado: 'no', nivel_minimo: 12, grupos: '-', formato: '-', destinatarios: 0, errores_24h: '-' },
  { _a: '000', ts: t(ts, 23), event: 'security_inspection_recorded', evidence_id: 'EV-12', requisito: 'op.mon.3.r6.1,op.mon.3.r6.2,op.mon.3.r6.3', plano: 'central',
    fila: 0, fecha: '-', tipo: 'ninguna', alcance: '-', ejecutor: '-', hallazgos: '-', estado_remediacion: '-', motivo: '-', incidente_id: '-', referencia: '-', formato: 'ok' },
  { _a: '000', ts: t(ts, 24), event: 'incident_registered', evidence_id: 'EV-13', requisito: 'op.mon.3.r6.1,op.mon.3.r6.2,op.mon.3.r6.3', plano: 'central',
    incidente_id: 'ninguno', fecha: '-', severidad: '-', sistemas: '-', clasificacion: '-', referencia: '-', fila: 0 },
  heartbeat('000', t(ts, 40), FULL_COVER),
];

const hourlyPass = (ts = HOURLY, extra: Linea = {}): Linea[] => [
  collection(t(ts, 10), extra),
  heartbeat('000', t(ts, 12), 'EV-01'),
];

const agentPass = (a: '024' | '028', ts = a === '024' ? AGENT_024 : AGENT_028, extra: { fuentes?: Linea; envio?: Linea } = {}): Linea[] => [
  ...(a === '024'
    ? [
        source(a, t(ts, 10), '/var/log/auth.log', { ultimo_evento: '2026-10-09T12:00:00Z', ...extra.fuentes }),
        source(a, t(ts, 10), '/var/log/syslog', { eventos: 66010 }),
        source(a, t(ts, 10), 'journald', { eventos: 120001 }),
      ]
    : [
        source(a, t(ts, 10), '/var/log/zimbra.log', { eventos: 403221, ultimo_evento: '2026-10-09T12:00:00Z', ...extra.fuentes }),
        source(a, t(ts, 10), '/var/log/auth.log', { eventos: 1022 }),
      ]),
  delivery(a, t(ts, 12), extra.envio),
  heartbeat(a, t(ts, 14), 'EV-02', 'agente'),
];

let counter = 0;

const RULE: Record<string, string> = {
  event_collection_status: '111401', log_source_observed: '111402', agent_forwarding_observed: '111403',
  syslog_source_observed: '111404', correlation_rules_inventory: '111405', correlation_alert_observed: '111406',
  config_assessment_observed: '111407', package_inventory_observed: '111408', vulnerability_detection_status: '111409',
  network_detection_observed: '111410', ioc_list_observed: '111411', query_volume_rules_observed: '111412',
  notification_channel_configured: '111413', security_inspection_recorded: '111414', incident_registered: '111415',
  evidence_state: '111450', collector_run: '111497',
};

const alert = (linea: Linea, control = 'op.mon.3') => {
  counter += 1;
  const { ts, _a, host: _host, ...data } = linea as Linea & { ts: string; _a: string };

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts,
      agent: { id: _a, name: MACHINES[_a] || _a },
      rule: { id: RULE[String(data.event)] || '111400', description: control },
      location: `/var/log/ensfacil/${control.replace(/\./g, '_')}.json`,
      data: Object.fromEntries(Object.entries({ ensfacil: control, ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const events = (lineas: Linea[], changes: (l: Linea) => Linea | undefined = l => l): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lineas
      .map(l => changes({ ...l }))
      .filter((l): l is Linea => Boolean(l))
      .map(l => alert(l))
  );

const hoy = (changes?: (l: Linea) => Linea | undefined, extra: { coleccion?: Linea; detector?: Linea } = {}) =>
  events([...hourlyPass(), ...completePass(COMPLETE, extra), ...agentPass('024'), ...agentPass('028')], changes);

const en = (event: string, changesList: Linea, filter: (l: Linea) => boolean = () => true) => (l: Linea): Linea =>
  l.event === event && filter(l) ? { ...l, ...changesList } : l;

const sin = (event: string, filter: (l: Linea) => boolean = () => true) => (l: Linea): Linea | undefined =>
  l.event === event && filter(l) ? undefined : l;

type Valores = Record<string, string[] | string | undefined>;

const configuration = (valores: Valores): ENSControlConfiguration => ({
  ...opMon3Configuration,
  parameters: opMon3Configuration.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

const BASE: Valores = {
  'P-01': [
    'auth.log de wazuh-real | Linux auth | agente | wazuh-real | /var/log/auth.log | 24',
    'zimbra.log del LDAP | Zimbra | agente | 028 | /var/log/zimbra.log | ',
    'auth.log del manager | Linux auth | agente | Wazuh-4 | /var/log/auth.log | 24',
  ],
  'P-02': ['wazuh | 4515 | técnicas del ruleset oficial'],
  'P-03': ['Wazuh-4 | interna | ', 'wazuh-real | Internet | cis_ubuntu24-04', '028 | interna | '],
  'P-11': '26',
};

const HIGH: Valores = {
  ...BASE,
  'P-04': ['accesos fuera de horario | 7-20 h | cualquier acceso a otra hora'],
  'P-05': ['Suricata | TAP del perímetro → syslog a Wazuh | 2'],
  'P-06': ['cibervigilancia externa | Proveedor S.L. | dominios similares'],
  'P-07': ['BD expedientes | gestor | 500 registros | 1 h | 107215'],
  'P-08': ['RSI | correo | 10 | 24x7'],
  'P-09': ['verificacion_configuracion | continua | Wazuh SCA', 'analisis_vulnerabilidades | continua | Wazuh VD', 'pentest | 365 | externo'],
  'P-10': ['Registro ENSFácil del manager | /etc/ensfacil/security-inspection-register.tsv | Responsable de Seguridad'],
  'P-ATT': [
    'op.mon.3.r3.1 | Línea base de comportamiento validada | https://intranet.cliente-prueba.es/seguridad/linea-base.pdf | 2026-05-12 | RSI',
    'op.mon.3.r4.1 | Contrato de cibervigilancia 2026 | https://intranet.cliente-prueba.es/contratos/cibervigilancia-2026.pdf | 2026-05-12 | RSI',
  ],
};

const NO_PARAMETERS: Valores = {};

const evaluate = (
  evs: ENSNormalizedEvent[],
  valores: Valores = BASE,
  level: ENSLevel = 'MEDIO',
  now: Date = NOW,
  row = '000'
) => {
  const cfg = configuration(valores);
  const ofRow = evs.filter(e => e.agentId === row);
  const delControl = keepLatestRunStateFacts('op.mon.3', ofRow, now);
  const evidences = resolveEvidenceForControl('op.mon.3', delControl, row, level, cfg, now);
  const context = buildPolicyContext(opMon3CatalogDefinition, cfg, level, delControl, evidences, now);
  const { decisions, runtimeVariables } = opMon3PolicyDefinition.evaluator!(context);
  const tabla = applyPolicyDecisionsToEvidences(evidences, decisions, opMon3CatalogDefinition.requirements);
  const attestations = parseRequirementAttestations(cfg);
  const requirement = (id: string) =>
    evaluateRequirement(
      opMon3CatalogDefinition.requirements.find(q => q.id === id)!,
      level,
      tabla,
      false,
      decisions,
      'ACTIVE',
      attestations.get(id)
    );
  const evidence = (id: string) => tabla.find(e => e.id === id);
  const decision = (req: string) => decisions.find(d => d.trace.ruleId === req);
  const motive = (req: string) => decision(req)?.reason || '';
  const ofEvidence = (req: string, ev: string) => decisions.find(d => d.trace.ruleId === `${req}/${ev}`);
  const motor = () =>
    evaluateENSControl(
      opMon3CatalogDefinition,
      cfg,
      level,
      evidences,
      {
        controlId: 'op.mon.3',
        policyId: opMon3PolicyDefinition.id,
        evaluatedAt: now.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      delControl
    );

  return { decisions, runtimeVariables, requisito: requirement, evidencia: evidence, decision, motivo: motive, deEvidencia: ofEvidence, motor };
};

const estado = (r: ReturnType<typeof evaluate>, req: string): string => r.decision(req)?.status || 'SIN_DECISION';
const cause = (r: ReturnType<typeof evaluate>, req: string): string => r.decision(req)?.cause || '';
const ev = (r: ReturnType<typeof evaluate>, req: string, id: string): string => r.deEvidencia(req, id)?.status || 'SIN_DECISION';
const evMotive2 = (r: ReturnType<typeof evaluate>, req: string, id: string): string => r.deEvidencia(req, id)?.reason || '';

section('1. Catalog: system category, two planes and seven reinforcements');

{
  const reqs = new Map(opMon3CatalogDefinition.requirements.map(r => [r.id, r]));
  const levels = (id: string) => JSON.stringify(reqs.get(id)?.applicability.levels);

  check('ACTIVE and in both planes', opMon3CatalogDefinition.status === 'ACTIVE' && JSON.stringify(opMon3CatalogDefinition.measurementPlanes) === '["agent","manager"]');
  check('base in the three categories; R1 and R2 from MEDIA', levels('op.mon.3.1') === '["BAJO","MEDIO","ALTO"]' && levels('op.mon.3.r1.1') === '["MEDIO","ALTO"]' && levels('op.mon.3.r2.1') === '["MEDIO","ALTO"]');
  check(
    'R3 to R6 only at ALTA; R7 without levels',
    ['op.mon.3.r3.1', 'op.mon.3.r3.2', 'op.mon.3.r4.1', 'op.mon.3.r5.1', 'op.mon.3.r5.2', 'op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'].every(id => levels(id) === '["ALTO"]') &&
      levels('op.mon.3.r7.1') === '[]'
  );
  check(
    'R3.1 and R4 without evidences (documentary, P-ATT)',
    reqs.get('op.mon.3.r3.1')!.evidenceIds.length === 0 && reqs.get('op.mon.3.r4.1')!.evidenceIds.length === 0
  );
  check(
    'the policy declares the same requirements, levels and evidences as the catalog',
    opMon3PolicyDefinition.requirements.every(p => {
      const r = reqs.get(p.requirementId);

      return r && JSON.stringify(r.applicability.levels) === JSON.stringify(p.levels) && JSON.stringify(r.evidenceIds) === JSON.stringify(p.evidenceIds);
    }) && opMon3PolicyDefinition.requirements.length === reqs.size
  );

  const definitions = getEvidenceDefinitions('op.mon.3');
  const estados = getStateFactEventTypes('op.mon.3');

  check('13 evidences, all «the agent only declares gaps»', definitions.length === 13 && definitions.every(d => d.agentDeclaresOnlyGaps));
  check(
    'state facts are the contract\'s; the series and the action are not',
    estados.size === 13 && !estados.has('event_collection_status') && !estados.has('correlation_alert_observed') && estados.has('agent_forwarding_observed')
  );
  check(
    'each relatedRule is in band 111400-111499',
    definitions.every(d => (d.relatedRules || []).every(r => Number(r) >= 111401 && Number(r) <= 111449))
  );
  check(
    'each expected event has its rule in the contract',
    definitions.every(d => d.expectedEventTypes.every(e => e === 'evidence_state' || RULE[e]))
  );
  check(
    'only P-01 is mandatory',
    JSON.stringify(opMon3Configuration.parameters.filter(p => p.required).map(p => p.id)) === '["P-01"]'
  );
  check(
    'the BASE and ALTA values are valid for the table validator',
    configuration(HIGH).parameters.filter(p => p.value !== undefined).every(p => validateParameterValue(p, p.value).valid),
    configuration(HIGH).parameters.filter(p => p.value !== undefined && !validateParameterValue(p, p.value).valid).map(p => p.id).join(', ')
  );
}

section('2. Green: the lab\'s MEDIA ceiling (spec §3.5), in the three rows');

{
  const evs = hoy();
  const m = evaluate(evs);

  check('manager · op.mon.3.1 CUMPLE', estado(m, 'op.mon.3.1') === 'CUMPLE', m.motivo('op.mon.3.1'));
  check('manager · EV-01: collects (the series rises) and without discards', ev(m, 'op.mon.3.1', 'EV-01') === 'CUMPLE' && /procesó 7150 eventos/.test(evMotive2(m, 'op.mon.3.1', 'EV-01')));
  check(
    'manager · EV-02: its auth.log, and wazuh-real and the LDAP connected (their detail in their row)',
    ev(m, 'op.mon.3.1', 'EV-02') === 'CUMPLE' && /wazuh-real \(024\) conectado/.test(evMotive2(m, 'op.mon.3.1', 'EV-02')) && /Se juzgan en la fila de su máquina/.test(evMotive2(m, 'op.mon.3.1', 'EV-02')),
    evMotive2(m, 'op.mon.3.1', 'EV-02')
  );
  check('manager · R1 CUMPLE with the wazuh set', estado(m, 'op.mon.3.r1.1') === 'CUMPLE' && /5712: 3/.test(m.motivo('op.mon.3.r1.1')), m.motivo('op.mon.3.r1.1'));
  check('manager · R2 CUMPLE by capability, with the CVE count «sin medir»', estado(m, 'op.mon.3.r2.1') === 'CUMPLE' && /sin medir/.test(m.motivo('op.mon.3.r2.1')), m.motivo('op.mon.3.r2.1'));
  check('manager · the three MEDIA requirements comply in the engine', ['op.mon.3.1', 'op.mon.3.r1.1', 'op.mon.3.r2.1'].every(id => m.requisito(id).status === 'CUMPLE'));
  check('manager · R3 to R6 do not apply at MEDIA', ['op.mon.3.r3.2', 'op.mon.3.r5.1', 'op.mon.3.r6.3'].every(id => m.requisito(id).status === 'NO_APLICA'));

  const r24 = evaluate(evs, BASE, 'MEDIO', NOW, '024');

  check('wazuh-real · op.mon.3.1 CUMPLE with its auth.log and its connected agent', estado(r24, 'op.mon.3.1') === 'CUMPLE' && /último evento 2026-10-09T12:00:00Z/.test(r24.motivo('op.mon.3.1')), r24.motivo('op.mon.3.1'));
  check('wazuh-real · R1 and R2 NO_APLICA («se mide en el manager»)', r24.requisito('op.mon.3.r1.1').status === 'NO_APLICA' && /manager/.test(r24.motivo('op.mon.3.r2.1')));
  check('wazuh-real · EV-01 NO_APLICA in its row', ev(r24, 'op.mon.3.1', 'EV-01') === 'NO_APLICA');

  const r28 = evaluate(evs, BASE, 'MEDIO', NOW, '028');

  check('LDAP · op.mon.3.1 CUMPLE with zimbra.log (no maximum hours: presence and discards)', estado(r28, 'op.mon.3.1') === 'CUMPLE', r28.motivo('op.mon.3.1'));

  const basic = evaluate(evs, BASE, 'BAJO');

  check('BÁSICA · only the base, and it complies', estado(basic, 'op.mon.3.1') === 'CUMPLE' && basic.requisito('op.mon.3.r1.1').status === 'NO_APLICA' && !basic.decision('op.mon.3.r2.1'));

  const report = buildOpMon3ReportModel(m.motor());

  check(
    'report · 12 fields, R2 «sin medir» and at MEDIA without external components',
    report.fields.length === 12 &&
      /sin medir/.test(report.fields[3].value) &&
      report.fields[10].status === 'NO_APLICA' &&
      report.fields[3].status === 'CUMPLE'
  );

  const raw = evs.find(e => e.eventType === 'agent_forwarding_observed');
  const record = evs.find(e => e.eventType === 'security_inspection_recorded');

  check(
    'normalizer · `conexion` and `estado_remediacion` are not read as a verdict (without `estado`, the fact asserts nothing)',
    raw !== undefined && raw.status === 'NO_EVALUABLE' && raw.attributes?.status === undefined &&
      record !== undefined && record.status === 'NO_EVALUABLE' && record.attributes?.status === undefined
  );
}

section('3. R2 (exposure surface): the indexer, each axis and its reversal');

{
  const roto = evaluate(hoy(undefined, { detector: { errores_indexacion_24h: 37, ultimo_error_indexacion: '2026-10-09T09:12:00Z', muestra_error: 'circuit_breaking_exception' } }));

  check(
    'circuit_breaking_exception when writing the vulnerabilities → measured NO_CUMPLE',
    estado(roto, 'op.mon.3.r2.1') === 'NO_CUMPLE' && /circuit_breaking_exception/.test(roto.motivo('op.mon.3.r2.1')) && roto.requisito('op.mon.3.r2.1').evidenced === true,
    roto.motivo('op.mon.3.r2.1')
  );
  check('reversal · with 0 errors in 24 h (heap at 2 GB), CUMPLE', estado(evaluate(hoy()), 'op.mon.3.r2.1') === 'CUMPLE');

  const disabledOne = evaluate(hoy(undefined, { detector: { habilitado: 'no' } }));

  check('detector disabled → NO_CUMPLE', estado(disabledOne, 'op.mon.3.r2.1') === 'NO_CUMPLE' && /no está habilitado/.test(disabledOne.motivo('op.mon.3.r2.1')));

  const oldFeed = hoy(undefined, { detector: { feed_actualizado: '2026-10-07T11:46:00Z' } });

  check('detector source from 48 h ago with P-11 = 26 → NO_CUMPLE', estado(evaluate(oldFeed), 'op.mon.3.r2.1') === 'NO_CUMPLE');
  check('reversal · the same source with P-11 = 72 → CUMPLE', estado(evaluate(oldFeed, { ...BASE, 'P-11': '72' }), 'op.mon.3.r2.1') === 'CUMPLE');

  const rotated = (ultimo: string) =>
    evaluate(hoy(undefined, { detector: { errores_indexacion_24h: 0, ultimo_error_indexacion: ultimo, muestra_error: 'circuit_breaking_exception' } }));

  check(
    'rotation · 0 errors in the window but the last, preserved, from 9 h ago → NO_CUMPLE',
    estado(rotated('2026-10-09T03:00:00Z'), 'op.mon.3.r2.1') === 'NO_CUMPLE' && /último error del conector es del 2026-10-09T03:00:00Z/.test(rotated('2026-10-09T03:00:00Z').motivo('op.mon.3.r2.1'))
  );
  check('reversal · the last error from 30 h ago → CUMPLE', estado(rotated('2026-10-08T06:00:00Z'), 'op.mon.3.r2.1') === 'CUMPLE');

  const shortWindow = evaluate(hoy(undefined, { detector: { errores_desde: '2026-10-09T07:00:00Z' } }));

  check(
    'rotation · 0 errors reading only 5 h of ossec.log → NO_EVALUABLE (COLLECTION), saying the hours',
    estado(shortWindow, 'op.mon.3.r2.1') === 'NO_EVALUABLE' && cause(shortWindow, 'op.mon.3.r2.1') === 'COLLECTION' && /solo ha podido leer 5\.1 h/.test(shortWindow.motivo('op.mon.3.r2.1')),
    shortWindow.motivo('op.mon.3.r2.1')
  );
  check(
    'without errores_desde, a 0 proves nothing → NO_EVALUABLE (COLLECTION)',
    estado(evaluate(hoy(undefined, { detector: { errores_desde: '-' } })), 'op.mon.3.r2.1') === 'NO_EVALUABLE'
  );

  const uncounted = evaluate(hoy(undefined, { detector: { errores_indexacion_24h: '-' } }));

  check('unable to count the errors → NO_EVALUABLE (COLLECTION), never CUMPLE', estado(uncounted, 'op.mon.3.r2.1') === 'NO_EVALUABLE' && cause(uncounted, 'op.mon.3.r2.1') === 'COLLECTION');

  const oldSca = hoy(en('config_assessment_observed', { ultimo_fin: '2026-10-08T03:00:00Z' }, l => l.agente_id === '024'));

  check('wazuh-real\'s SCA from 33 h ago → NO_CUMPLE naming it', estado(evaluate(oldSca), 'op.mon.3.r2.1') === 'NO_CUMPLE' && /wazuh-real \(024\)/.test(evaluate(oldSca).motivo('op.mon.3.r2.1')));
  check('reversal · with P-11 = 48, CUMPLE', estado(evaluate(oldSca, { ...BASE, 'P-11': '48' }), 'op.mon.3.r2.1') === 'CUMPLE');

  const late = new Date('2026-10-10T08:30:00Z');

  check(
    'age at the fact\'s instant: 20 h later, the same SCA is still within P-11',
    estado(evaluate(hoy(), BASE, 'MEDIO', late), 'op.mon.3.r2.1') === 'CUMPLE'
  );

  const apache = { ...BASE, 'P-03': ['Wazuh-4 | interna | ', 'wazuh-real | Internet | cis_ubuntu24-04, cis_apache_24', '028 | interna | '] };

  check('P-03 requires cis_apache_24 on wazuh-real and it is not evaluated → NO_CUMPLE', estado(evaluate(hoy(), apache), 'op.mon.3.r2.1') === 'NO_CUMPLE' && /cis_apache_24/.test(evaluate(hoy(), apache).motivo('op.mon.3.r2.1')));

  const free = { ...BASE, 'P-03': ['wazuh-real | Internet | CIS Apache + CVE feed'] };

  check('politicas_sca in free text → CONFIGURATION naming the asset', estado(evaluate(hoy(), free), 'op.mon.3.r2.1') === 'NO_EVALUABLE' && cause(evaluate(hoy(), free), 'op.mon.3.r2.1') === 'CONFIGURATION' && /activo «wazuh-real»/.test(evaluate(hoy(), free).motivo('op.mon.3.r2.1')));

  check(
    'empty key cells → CONFIGURATION naming the row: P-03 without asset, P-02 without set',
    cause(evaluate(hoy(), { ...BASE, 'P-03': ['Wazuh-4 | interna | ', ' | Internet | '] }), 'op.mon.3.r2.1') === 'CONFIGURATION' &&
      /P-03, fila 2: falta el activo/.test(evaluate(hoy(), { ...BASE, 'P-03': ['Wazuh-4 | interna | ', ' | Internet | '] }).motivo('op.mon.3.r2.1')) &&
      cause(evaluate(hoy(), { ...BASE, 'P-02': ['wazuh | 4515 | -', ' | 3 | -'] }), 'op.mon.3.r1.1') === 'CONFIGURATION' &&
      /P-02, fila 2: falta el conjunto/.test(evaluate(hoy(), { ...BASE, 'P-02': ['wazuh | 4515 | -', ' | 3 | -'] }).motivo('op.mon.3.r1.1'))
  );

  const withoutInventory = hoy(en('package_inventory_observed', { inventario_ultimo: '-' }, l => l.agente_id === '028'));

  check('the LDAP without package inventory → NO_CUMPLE', estado(evaluate(withoutInventory), 'op.mon.3.r2.1') === 'NO_CUMPLE');

  check(
    'a disconnected test asset in P-03 (027) → NO_CUMPLE; one that never connected (033) → NO_CUMPLE',
    estado(evaluate(hoy(), { ...BASE, 'P-03': ['27 | interna | '] }), 'op.mon.3.r2.1') === 'NO_CUMPLE' &&
      estado(evaluate(hoy(), { ...BASE, 'P-03': ['win-prueba | interna | '] }), 'op.mon.3.r2.1') === 'NO_CUMPLE'
  );
  check('an asset that is not on the manager → NO_CUMPLE', /no figura en la base de agentes/.test(evaluate(hoy(), { ...BASE, 'P-03': ['srv-web01 | Internet | '] }).motivo('op.mon.3.r2.1')));

  const unreadable = hoy(l =>
    (l.event === 'package_inventory_observed' || l.event === 'config_assessment_observed') && l.agente_id === '028' ? { ...l, lectura: 'error' } : l
  );

  check('the LDAP\'s unreadable database → NO_EVALUABLE (COLLECTION) naming it', estado(evaluate(unreadable), 'op.mon.3.r2.1') === 'NO_EVALUABLE' && cause(evaluate(unreadable), 'op.mon.3.r2.1') === 'COLLECTION' && /queue\/db\/028\.db/.test(evaluate(unreadable).motivo('op.mon.3.r2.1')));
  check(
    'and a measured NO_CUMPLE of another asset still prevails',
    estado(evaluate(hoy(l => (l.event === 'package_inventory_observed' && l.agente_id === '028' ? { ...l, lectura: 'error' } : l.event === 'config_assessment_observed' && l.agente_id === '024' ? { ...l, ultimo_fin: '2026-10-01T00:00:00Z' } : l))), 'op.mon.3.r2.1') === 'NO_CUMPLE'
  );
}

section('4. op.mon.3.1 (collection): each source, each axis, with its reversal');

{
  const row24 = (evs: ENSNormalizedEvent[], valores: Valores = BASE) => evaluate(evs, valores, 'MEDIO', NOW, '024');
  const withP01 = (...rows: string[]): Valores => ({ ...BASE, 'P-01': rows });

  const secure = withP01('secure de wazuh-real | Linux auth | agente | 24 | /var/log/secure | ');

  check('a declared source the logcollector does not read → NO_CUMPLE (and says what it reads)', estado(row24(hoy(), secure), 'op.mon.3.1') === 'NO_CUMPLE' && /no lee \/var\/log\/secure \(lee: \/var\/log\/auth\.log/.test(row24(hoy(), secure).motivo('op.mon.3.1')));
  check('reversal · with the wildcard /var/log/auth*, CUMPLE', estado(row24(hoy(), withP01('auth de wazuh-real | Linux auth | agente | 24 | /var/log/auth* | ')), 'op.mon.3.1') === 'CUMPLE');

  const withoutSources = hoy(l =>
    l.event === 'log_source_observed' && l._a === '024'
      ? l.ubicacion === '/var/log/auth.log'
        ? { ...l, ubicacion: 'ninguna', eventos: 0, bytes: 0, descartes: 0, descartes_periodo: 0, ultimo_evento: '-', observado_desde: '-' }
        : undefined
      : l
  );
  const all = withP01('todo de wazuh-real | Linux | agente | 24 | * | 24');
  check(
    'a row with the * wildcard and the logcollector with no source (ubicacion=ninguna) → NO_CUMPLE, not NO_EVALUABLE forever',
    estado(row24(withoutSources, all), 'op.mon.3.1') === 'NO_CUMPLE' && /no lee \* \(no lee ninguna fuente\)/.test(row24(withoutSources, all).motivo('op.mon.3.1')),
    `${estado(row24(withoutSources, all), 'op.mon.3.1')} ${row24(withoutSources, all).motivo('op.mon.3.1')}`
  );
  check(
    'and auth.log\'s exact row, the same: «ninguna» matches nothing',
    estado(row24(withoutSources), 'op.mon.3.1') === 'NO_CUMPLE' && /no lee ninguna fuente/.test(row24(withoutSources).motivo('op.mon.3.1'))
  );
  check('reversal · with its sources, the * row → CUMPLE', estado(row24(hoy(), all), 'op.mon.3.1') === 'CUMPLE', row24(hoy(), all).motivo('op.mon.3.1'));

  const withDiscards = hoy(en('log_source_observed', { descartes: 5, descartes_periodo: 5 }, l => l._a === '024' && l.ubicacion === '/var/log/auth.log'));

  check('5 events discarded in the period → measured NO_CUMPLE', estado(row24(withDiscards), 'op.mon.3.1') === 'NO_CUMPLE' && /descartados/.test(row24(withDiscards).motivo('op.mon.3.1')));
  check(
    'reversal · discards from before the period (descartes=5, descartes_periodo=0) → CUMPLE',
    estado(row24(hoy(en('log_source_observed', { descartes: 5, descartes_periodo: 0 }, l => l._a === '024'))), 'op.mon.3.1') === 'CUMPLE'
  );

  const lacuna = hoy(en('log_source_observed', { ultimo_evento: '2026-10-08T06:00:00Z' }, l => l._a === '024' && l.ubicacion === '/var/log/auth.log'));

  check('30 h without events in auth.log with maximum 24 → NO_CUMPLE (gap)', estado(row24(lacuna), 'op.mon.3.1') === 'NO_CUMPLE' && /laguna/.test(row24(lacuna).motivo('op.mon.3.1')));
  check('reversal · without a declared maximum, continuity is not judged → CUMPLE', estado(row24(lacuna, withP01('auth.log de wazuh-real | Linux auth | agente | wazuh-real | /var/log/auth.log | ')), 'op.mon.3.1') === 'CUMPLE');

  const never = (since: string) => hoy(en('log_source_observed', { ultimo_evento: '-', observado_desde: since }, l => l._a === '024' && l.ubicacion === '/var/log/auth.log'));

  check('no event since it is observed 3 days ago, maximum 24 → NO_CUMPLE', estado(row24(never('2026-10-06T12:00:00Z')), 'op.mon.3.1') === 'NO_CUMPLE');
  check('no event, but observed since 2 h ago → NO_EVALUABLE, never CUMPLE', estado(row24(never('2026-10-09T10:20:00Z')), 'op.mon.3.1') === 'NO_EVALUABLE');

  const withoutDiscards = hoy(en('log_source_observed', { descartes_periodo: '-' }, l => l._a === '024' && l.ubicacion === '/var/log/auth.log'));

  check(
    'good read but descartes_periodo «-» → NO_EVALUABLE (COLLECTION), never a zero',
    estado(row24(withoutDiscards), 'op.mon.3.1') === 'NO_EVALUABLE' && cause(row24(withoutDiscards), 'op.mon.3.1') === 'COLLECTION'
  );

  const silent = hoy(en('log_source_observed', { eventos: 0, bytes: 0, ultimo_evento: '-' }, l => l._a === '028' && l.ubicacion === '/var/log/zimbra.log'));
  const row28 = (evs: ENSNormalizedEvent[], valores: Valores = BASE) => evaluate(evs, valores, 'MEDIO', NOW, '028');

  check(
    'read without any event and without max_horas_sin_eventos → NO_EVALUABLE (CONFIGURATION), asking to declare it',
    estado(row28(silent), 'op.mon.3.1') === 'NO_EVALUABLE' && cause(row28(silent), 'op.mon.3.1') === 'CONFIGURATION' && /Declara max_horas_sin_eventos/.test(row28(silent).motivo('op.mon.3.1'))
  );
  check(
    'reversal · with max_horas_sin_eventos = 24 and observed since 01/10 → measured NO_CUMPLE',
    estado(row28(silent, withP01('zimbra.log del LDAP | Zimbra | agente | 028 | /var/log/zimbra.log | 24')), 'op.mon.3.1') === 'NO_CUMPLE'
  );

  const disconnected = hoy(en('agent_forwarding_observed', { conexion: 'disconnected' }, l => l._a === '024'));

  check('the agent disconnected when read → NO_CUMPLE', estado(row24(disconnected), 'op.mon.3.1') === 'NO_CUMPLE' && /no está conectado/.test(row24(disconnected).motivo('op.mon.3.1')));

  const sinEstado = hoy(l =>
    l.event === 'log_source_observed' && l._a === '024'
      ? l.ubicacion === '/var/log/auth.log'
        ? { ...l, ubicacion: '-', eventos: '-', bytes: '-', descartes: '-', descartes_periodo: '-', lectura: 'error' }
        : undefined
      : l
  );

  check('wazuh-logcollector.state unreadable → NO_EVALUABLE (COLLECTION) in that row', estado(row24(sinEstado), 'op.mon.3.1') === 'NO_EVALUABLE' && cause(row24(sinEstado), 'op.mon.3.1') === 'COLLECTION');

  const parado = events([...hourlyPass(HOURLY, { eventos_procesados: 1210450 }), ...completePass()]);

  check('the engine counter stopped between two passes → NO_CUMPLE («no recolecta»)', ev(evaluate(parado), 'op.mon.3.1', 'EV-01') === 'NO_CUMPLE' && /no recolecta/.test(evMotive2(evaluate(parado), 'op.mon.3.1', 'EV-01')));

  const discards = hoy(undefined, { coleccion: { eventos_descartados: 412 } });

  check('412 events discarded between the two passes → NO_CUMPLE', ev(evaluate(discards), 'op.mon.3.1', 'EV-01') === 'NO_CUMPLE' && /descartado 412/.test(evMotive2(evaluate(discards), 'op.mon.3.1', 'EV-01')));

  const restart = hoy(undefined, { coleccion: { eventos_procesados: 5300, eventos_descartados: 0 } });

  check('restart (the counter drops) with events since → CUMPLE', ev(evaluate(restart), 'op.mon.3.1', 'EV-01') === 'CUMPLE' && /se reinició/.test(evMotive2(evaluate(restart), 'op.mon.3.1', 'EV-01')));

  const soloRemoted = hoy(l => (l.event === 'event_collection_status' ? { ...l, eventos_procesados: '-', eventos_recibidos: '-', eventos_descartados: '-', fuente_contadores: '-' } : l));

  check('without wazuh-analysisd.state, the wazuh-remoted series → CUMPLE', ev(evaluate(soloRemoted), 'op.mon.3.1', 'EV-01') === 'CUMPLE' && /wazuh-remoted/.test(evMotive2(evaluate(soloRemoted), 'op.mon.3.1', 'EV-01')));

  const withoutCounters = hoy(l => (l.event === 'event_collection_status' ? { ...l, eventos_procesados: '-', eventos_descartados: '-', mensajes_remoted: '-', fuente_contadores: '-' } : l));

  check('without any counter → NO_EVALUABLE (COLLECTION)', ev(evaluate(withoutCounters), 'op.mon.3.1', 'EV-01') === 'NO_EVALUABLE' && evaluate(withoutCounters).deEvidencia('op.mon.3.1', 'EV-01')?.cause === 'COLLECTION');
  check('wazuh-manager not active → NO_CUMPLE', ev(evaluate(hoy(undefined, { coleccion: { activo: 'no' } })), 'op.mon.3.1', 'EV-01') === 'NO_CUMPLE');
  check('without any connection in <remote> → NO_CUMPLE', ev(evaluate(hoy(undefined, { coleccion: { conexiones: '-' } })), 'op.mon.3.1', 'EV-01') === 'NO_CUMPLE');
  check(
    '3 h freshness: the same state at 15:30 → NO_EVALUABLE (COLLECTION); at 14:30, CUMPLE',
    ev(evaluate(hoy(), BASE, 'MEDIO', new Date('2026-10-09T15:30:00Z')), 'op.mon.3.1', 'EV-01') === 'NO_EVALUABLE' &&
      ev(evaluate(hoy(), BASE, 'MEDIO', new Date('2026-10-09T14:30:00Z')), 'op.mon.3.1', 'EV-01') === 'CUMPLE'
  );

  const ofAnother2 = (system: string) => withP01(`auth.log de ${system} | Linux auth | agente | ${system} | /var/log/auth.log | `);

  check('manager row · a source of the disconnected test agent (027) → NO_CUMPLE', estado(evaluate(hoy(), ofAnother2('srv-prueba')), 'op.mon.3.1') === 'NO_CUMPLE' && /desconnected|disconnected/.test(evaluate(hoy(), ofAnother2('srv-prueba')).motivo('op.mon.3.1')));
  check('manager row · a machine the manager does not know → NO_CUMPLE', /no figura en la base de agentes/.test(evaluate(hoy(), ofAnother2('srv-web01')).motivo('op.mon.3.1')));
  check(
    'manager row · a source of an active agent without an agent collector (outside scope) → NO_EVALUABLE (COLLECTION), never CUMPLE',
    estado(evaluate(hoy(), ofAnother2('srv-copias')), 'op.mon.3.1') === 'NO_EVALUABLE' &&
      cause(evaluate(hoy(), ofAnother2('srv-copias')), 'op.mon.3.1') === 'COLLECTION' &&
      /su recolector de agente de op\.mon\.3 no informa/.test(evaluate(hoy(), ofAnother2('srv-copias')).motivo('op.mon.3.1'))
  );

  const oldHeartbeat = hoy(en('package_inventory_observed', { recolector_agente_ultimo: '2026-10-07T06:20:14Z' }, l => l.agente_id === '024'));

  check(
    'manager row · wazuh-real\'s collector\'s last heartbeat from 54 h ago → NO_EVALUABLE (COLLECTION)',
    estado(evaluate(oldHeartbeat), 'op.mon.3.1') === 'NO_EVALUABLE' && cause(evaluate(oldHeartbeat), 'op.mon.3.1') === 'COLLECTION'
  );

  const duplicated = hoy(l => l);
  const old = events([inventory(t(COMPLETE, 17), '041', 'disconnected', '2026-08-01T00:00:00Z', { agente: 'wazuh-real' })]);
  const withDuplicate = [...duplicated, ...old];

  check('manager row · «wazuh-real» matches 024 and 041 → CONFIGURATION, «decláralo por su ID»', estado(evaluate(withDuplicate), 'op.mon.3.1') === 'NO_EVALUABLE' && /Decláralo por su ID/.test(evaluate(withDuplicate).motivo('op.mon.3.1')));
  check(
    'reversal · declared by its ID (24) → CUMPLE; declaring the old one (41) → NO_CUMPLE',
    estado(evaluate(withDuplicate, withP01('auth.log de wazuh-real | Linux auth | agente | 24 | /var/log/auth.log | 24')), 'op.mon.3.1') === 'CUMPLE' &&
      estado(evaluate(withDuplicate, withP01('auth.log viejo | Linux auth | agente | 41 | /var/log/auth.log | ')), 'op.mon.3.1') === 'NO_CUMPLE'
  );

  const fw = withP01('Cortafuegos perimetral | syslog | syslog | 192.0.2.10 |  | 2');
  const conFw = (ultima: string) => hoy(en('syslog_source_observed', { ubicacion: '192.0.2.10', ultima_alerta: ultima, alertas_24h: 480, nivel_max_24h: 6 }));

  check('syslog · the sender with alerts 1 h ago, maximum 2 → CUMPLE', estado(evaluate(conFw('2026-10-09T11:05:00Z'), fw), 'op.mon.3.1') === 'CUMPLE');
  check('syslog · its last alert from 5 h ago, maximum 2 → NO_CUMPLE', estado(evaluate(conFw('2026-10-09T07:05:00Z'), fw), 'op.mon.3.1') === 'NO_CUMPLE');
  check('syslog · no alerts from the sender and 38 days observing → NO_CUMPLE', estado(evaluate(hoy(), fw), 'op.mon.3.1') === 'NO_CUMPLE' && /30 días/.test(evaluate(hoy(), fw).motivo('op.mon.3.1')));
  check(
    'syslog · no alerts and observing since 2 days ago → NO_EVALUABLE, never CUMPLE',
    estado(evaluate(hoy(undefined, { coleccion: { alertas_observadas_desde: '2026-10-07T12:00:00Z' } }), fw), 'op.mon.3.1') === 'NO_EVALUABLE'
  );
  const degradedSyslog = [
    ...conFw('2026-10-09T11:05:00Z').filter(e => !(e.eventType === 'log_source_observed' && e.agentId === '000')),
    ...events([{ _a: '000', ts: '2026-10-09T12:28:00Z', event: 'evidence_state', evidence_id: 'EV-02', requisito: 'op.mon.3.1', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede seguir la rotación de alerts.json' }]),
  ];

  check(
    'syslog · an alerts.json degradation after its fact counts (machine-fact pairs) → NO_EVALUABLE',
    estado(evaluate(degradedSyslog, fw), 'op.mon.3.1') === 'NO_EVALUABLE' && /rotación de alerts\.json/.test(evaluate(degradedSyslog, fw).motivo('op.mon.3.1'))
  );
  check('syslog · in an agent\'s row it is not judged', estado(row24(hoy(), withP01(...(BASE['P-01'] as string[]), 'Cortafuegos | syslog | syslog | 192.0.2.10 |  | ')), 'op.mon.3.1') === 'CUMPLE');

  const badMethod = withP01('ftp del NAS | ficheros | ftp | wazuh-real | /var/log/auth.log | ');

  check('P-01 with a method that is neither agent nor syslog → CONFIGURATION naming the source', estado(row24(hoy(), badMethod), 'op.mon.3.1') === 'NO_EVALUABLE' && cause(row24(hoy(), badMethod), 'op.mon.3.1') === 'CONFIGURATION' && /fuente «ftp del NAS»/.test(row24(hoy(), badMethod).motivo('op.mon.3.1')));

  const malMax = withP01('auth.log | Linux | agente | wazuh-real | /var/log/auth.log | muchas', 'secure | Linux | agente | wazuh-real | /var/log/secure | ');

  check('and a measured NO_CUMPLE of another source still prevails over the badly written row', estado(row24(hoy(), malMax), 'op.mon.3.1') === 'NO_CUMPLE' && /max_horas_sin_eventos dice «muchas»/.test(row24(hoy(), malMax).motivo('op.mon.3.1')));

  const undeclaredOne = evaluate(hoy(), withP01('auth.log del manager | Linux auth | agente | 000 | /var/log/auth.log | '), 'MEDIO', NOW, '024');

  check('an agent P-01 does not name → op.mon.3.1 NO_APLICA in its row', undeclaredOne.requisito('op.mon.3.1').status === 'NO_APLICA' && /no es una fuente declarada/.test(undeclaredOne.motivo('op.mon.3.1')));
}

section('5. Without parameters: NO_EVALUABLE by CONFIGURATION, never CUMPLE');

{
  const m = evaluate(hoy(), NO_PARAMETERS);

  check('without P-01 → op.mon.3.1 unproven, EV-02 by CONFIGURATION', estado(m, 'op.mon.3.1') === 'NO_EVALUABLE' && m.deEvidencia('op.mon.3.1', 'EV-02')?.cause === 'CONFIGURATION' && m.requisito('op.mon.3.1').status === 'NO_CUMPLE');
  check('and EV-01 is measured all the same', ev(m, 'op.mon.3.1', 'EV-01') === 'CUMPLE');
  check('without P-02 → R1 by CONFIGURATION', estado(m, 'op.mon.3.r1.1') === 'NO_EVALUABLE' && cause(m, 'op.mon.3.r1.1') === 'CONFIGURATION');
  check('without P-03 → R2 by CONFIGURATION', estado(m, 'op.mon.3.r2.1') === 'NO_EVALUABLE' && cause(m, 'op.mon.3.r2.1') === 'CONFIGURATION');
  check('without P-11 (with P-03) → R2 by CONFIGURATION', cause(evaluate(hoy(), { ...BASE, 'P-11': undefined }), 'op.mon.3.r2.1') === 'CONFIGURATION');
  check(
    'no applicable requirement comes out CUMPLE in the engine',
    ['op.mon.3.1', 'op.mon.3.r1.1', 'op.mon.3.r2.1'].every(id => m.requisito(id).status === 'NO_CUMPLE' && m.requisito(id).evidenced === false)
  );

  const high = evaluate(hoy(), NO_PARAMETERS, 'ALTO');

  check(
    'ALTA without parameters: R5.1, R5.2 and R6 by CONFIGURATION',
    ['op.mon.3.r5.1', 'op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'].every(id => estado(high, id) === 'NO_EVALUABLE' && cause(high, id) === 'CONFIGURATION'),
    ['op.mon.3.r5.1', 'op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'].map(id => `${id}=${estado(high, id)}/${cause(high, id)}`).join(' ')
  );
  check('R5.2 without P-08 but with no channel enabled → measured NO_CUMPLE', estado(high, 'op.mon.3.r5.2') === 'NO_CUMPLE');
  check('R3.2 without P-05 but with no NIDS → measured NO_CUMPLE', estado(high, 'op.mon.3.r3.2') === 'NO_CUMPLE');
  check('R3.1 and R4 without P-ATT → not proven', high.requisito('op.mon.3.r3.1').status === 'NO_CUMPLE' && high.requisito('op.mon.3.r4.1').status === 'NO_CUMPLE');
}

section('6. Without a collector, or with what the collector declares it could not measure');

{
  const nothing = evaluate([], BASE, 'MEDIO', NOW, '024');

  check(
    'a row without any fact → all NO_EVALUABLE (COLLECTION), never NO_APLICA or CUMPLE',
    ['op.mon.3.1', 'op.mon.3.r1.1', 'op.mon.3.r2.1'].every(id => estado(nothing, id) === 'NO_EVALUABLE' && cause(nothing, id) === 'COLLECTION'),
    ['op.mon.3.1', 'op.mon.3.r1.1', 'op.mon.3.r2.1'].map(id => `${id}=${estado(nothing, id)}`).join(' ')
  );

  const ofOtherControl = normalizeWazuhAlerts([alert({ _a: '024', ts: t(AGENT_024, 0), event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-01' }, 'op.exp.8')]);
  const withoutCollector = evaluate(ofOtherControl, BASE, 'MEDIO', NOW, '024');

  check('wazuh-real without the op.mon.3 collector → op.mon.3.1 NO_EVALUABLE (COLLECTION)', estado(withoutCollector, 'op.mon.3.1') === 'NO_EVALUABLE' && cause(withoutCollector, 'op.mon.3.1') === 'COLLECTION');
  check('and R2 NO_APLICA in its row (it is known to be an agent)', withoutCollector.requisito('op.mon.3.r2.1').status === 'NO_APLICA');
  check('an op.exp.8 fact does not accredit op.mon.3', estado(withoutCollector, 'op.mon.3.1') !== 'CUMPLE');

  const twoDays = new Date('2026-10-11T13:00:00Z');

  check('two days without passes → COLLECTION on the manager and on the agent', cause(evaluate(hoy(), BASE, 'MEDIO', twoDays), 'op.mon.3.r2.1') === 'COLLECTION' && cause(evaluate(hoy(), BASE, 'MEDIO', twoDays, '024'), 'op.mon.3.1') === 'COLLECTION');

  const degraded = (ts: string) => ({ _a: '000', ts, event: 'evidence_state', evidence_id: 'EV-02,EV-04', requisito: 'op.mon.3.1,op.mon.3.r2.1', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer /var/ossec/queue/db/global.db' });

  const after = [...hoy(), ...events([degraded('2026-10-09T12:28:00Z')])];

  check(
    'global.db unreadable AFTER the last pass: what complied becomes NO_EVALUABLE with the collector\'s motive',
    estado(evaluate(after), 'op.mon.3.r2.1') === 'NO_EVALUABLE' && /global\.db/.test(evaluate(after).motivo('op.mon.3.r2.1'))
  );

  const afterBroken = [...hoy(undefined, { detector: { errores_indexacion_24h: 37, muestra_error: 'circuit_breaking_exception' } }), ...events([degraded('2026-10-09T12:28:00Z')])];

  check('and a measured NO_CUMPLE still prevails', estado(evaluate(afterBroken), 'op.mon.3.r2.1') === 'NO_CUMPLE');

  const stale = [...hoy(), ...events([degraded('2026-10-08T06:00:00Z')])];

  check('a degradation over 26 h old, or earlier than the pass, does not count', estado(evaluate(stale), 'op.mon.3.r2.1') === 'CUMPLE');

  const absentRecord = [
    ...hoy(sin('security_inspection_recorded')),
    ...events([{ _a: '000', ts: t(COMPLETE, 23), event: 'evidence_state', evidence_id: 'EV-12,EV-13', requisito: 'op.mon.3.r6.1,op.mon.3.r6.2,op.mon.3.r6.3', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe el registro de inspecciones /etc/ensfacil/security-inspection-register.tsv' }]),
  ];
  const r6 = evaluate(absentRecord, HIGH, 'ALTO');

  check('without an inspection record → R6.3 NO_EVALUABLE (CONFIGURATION), never CUMPLE by emptiness', estado(r6, 'op.mon.3.r6.3') === 'NO_EVALUABLE' && cause(r6, 'op.mon.3.r6.3') === 'CONFIGURATION');
}

section('7. ALTA: reinforcements R3 to R6, documentary ones and inspections');

{
  const suricata = (ultima: string) =>
    en('network_detection_observed', { producto: 'suricata', fuente: 'syslog', ultima_alerta: ultima, alertas_24h: 2210 });
  const slack = (level: number, errores = 0): Linea[] => [
    { _a: '000', ts: t(COMPLETE, 22), event: 'notification_channel_configured', evidence_id: 'EV-09', requisito: 'op.mon.3.r5.2', plano: 'central',
      canal: 'slack', habilitado: 'si', nivel_minimo: level, grupos: '-', formato: 'json', destinatarios: '-', errores_24h: errores },
  ];
  const inspection = (date: string, type: string, extra: Linea = {}): Linea => ({
    _a: '000', ts: t(COMPLETE, 23), event: 'security_inspection_recorded', evidence_id: 'EV-12', requisito: 'op.mon.3.r6.1,op.mon.3.r6.2,op.mon.3.r6.3', plano: 'central',
    fila: 2, fecha: date, tipo: type, alcance: 'perímetro y aplicaciones web', ejecutor: 'Proveedor S.L.', hallazgos: '12 hallazgos, 2 críticos', estado_remediacion: 'en_remediacion', motivo: 'periodica', incidente_id: '-', referencia: 'pentest-2026', formato: 'ok', ...extra,
  });
  const withPentest = (date = '2026-03-12T00:00:00Z', extra: Linea = {}) =>
    [...hoy(l => (l.event === 'security_inspection_recorded' ? undefined : suricata('2026-10-09T11:50:00Z')(l))), ...events([inspection(date, 'pentest', extra)])];
  const mailYes = (evs: ENSNormalizedEvent[]) => evs;
  const green = (evs = withPentest()) =>
    mailYes([
      ...evs.filter(e => e.eventType !== 'notification_channel_configured'),
      ...events([{ _a: '000', ts: t(COMPLETE, 22), event: 'notification_channel_configured', evidence_id: 'EV-09', requisito: 'op.mon.3.r5.2', plano: 'central', canal: 'correo', habilitado: 'si', nivel_minimo: 10, grupos: '-', formato: '-', destinatarios: 2, errores_24h: '-' }]),
    ]);

  const a = evaluate(green(), HIGH, 'ALTO');
  const all = opMon3CatalogDefinition.requirements.filter(r => r.applicability.levels.includes('ALTO')).map(r => r.id);

  check(
    'ALTA with everything declared and operational → the 11 requirements comply',
    all.every(id => a.requisito(id).status === 'CUMPLE'),
    all.map(id => `${id}=${a.requisito(id).status}`).join(' ')
  );
  check('R3.1 and R4 · documentarily accredited (P-ATT), never as measured', a.requisito('op.mon.3.r3.1').attested === true && a.requisito('op.mon.3.r4.1').attested === true);
  check('R3.1 and R4 · their decision is NO_EVALUABLE (CONFIGURATION), so P-ATT can accredit', estado(a, 'op.mon.3.r3.1') === 'NO_EVALUABLE' && cause(a, 'op.mon.3.r4.1') === 'CONFIGURATION');
  check('EV-05 and EV-07 · NO_APLICA, report datum', ev(a, 'op.mon.3.r3.1', 'EV-05') === 'NO_APLICA' && /malicious-ip/.test(evMotive2(a, 'op.mon.3.r4.1', 'EV-07')));
  check(
    'R6.1 and R6.2 continuous · with SCA and the detector; the record is not required',
    estado(a, 'op.mon.3.r6.1') === 'CUMPLE' && ev(a, 'op.mon.3.r6.1', 'EV-12') === 'NO_APLICA' && ev(a, 'op.mon.3.r6.2', 'EV-11') === 'CUMPLE'
  );
  check('R6.3 · the pentest of 12/03 within 365 days', estado(a, 'op.mon.3.r6.3') === 'CUMPLE' && /2026-03-12/.test(a.motivo('op.mon.3.r6.3')));

  check('R3.2 · without NIDS → NO_CUMPLE even if P-05 declares Suricata', estado(evaluate(green([...hoy(sin('security_inspection_recorded')), ...events([inspection('2026-03-12', 'pentest')])]), HIGH, 'ALTO'), 'op.mon.3.r3.2') === 'NO_CUMPLE');
  check(
    'R3.2 · Suricata with its last alert 4 days ago and maximum 2 → NO_CUMPLE; reversal with maximum 7',
    estado(evaluate(green(withPentest().map(e => (e.eventType === 'network_detection_observed' ? { ...e, attributes: { ...e.attributes, ultima_alerta: '2026-10-05T11:50:00Z' } } : e))), HIGH, 'ALTO'), 'op.mon.3.r3.2') === 'NO_CUMPLE' &&
      estado(evaluate(green(withPentest().map(e => (e.eventType === 'network_detection_observed' ? { ...e, attributes: { ...e.attributes, ultima_alerta: '2026-10-05T11:50:00Z' } } : e))), { ...HIGH, 'P-05': ['Suricata | TAP | 7'] }, 'ALTO'), 'op.mon.3.r3.2') === 'CUMPLE'
  );

  check(
    'R3.2 · a P-05 row without product → CONFIGURATION naming the row',
    cause(evaluate(green(), { ...HIGH, 'P-05': ['Suricata | TAP | 2', ' | core | 2'] }, 'ALTO'), 'op.mon.3.r3.2') === 'CONFIGURATION' &&
      /P-05, fila 2: falta el producto/.test(evaluate(green(), { ...HIGH, 'P-05': ['Suricata | TAP | 2', ' | core | 2'] }, 'ALTO').motivo('op.mon.3.r3.2'))
  );

  check('R5.1 · P-07\'s rule is not a threshold one → NO_CUMPLE', estado(evaluate(green(), { ...HIGH, 'P-07': ['BD expedientes | gestor | 500 | 1 h | 100510'] }, 'ALTO'), 'op.mon.3.r5.1') === 'NO_CUMPLE');
  check('R5.1 · «ninguna» → NO_CUMPLE (unwatched query)', /ninguna regla vigila/.test(evaluate(green(), { ...HIGH, 'P-07': ['BD expedientes | gestor | 500 | 1 h | ninguna'] }, 'ALTO').motivo('op.mon.3.r5.1')));
  check('R5.1 · «pendiente 2026-12» is not read as a range → CONFIGURATION', cause(evaluate(green(), { ...HIGH, 'P-07': ['BD expedientes | gestor | 500 | 1 h | pendiente 2026-12'] }, 'ALTO'), 'op.mon.3.r5.1') === 'CONFIGURATION');
  check('R5.1 · a range that covers the rule → CUMPLE', estado(evaluate(green(), { ...HIGH, 'P-07': ['BD expedientes | gestor | 500 | 1 h | 107210-107220'] }, 'ALTO'), 'op.mon.3.r5.1') === 'CUMPLE');

  check('R5.2 · mail disabled (the lab) → NO_CUMPLE', estado(evaluate(withPentest(), HIGH, 'ALTO'), 'op.mon.3.r5.2') === 'NO_CUMPLE');
  check(
    'R5.2 · mail enabled without knowing its recipients («-») → NO_EVALUABLE, never CUMPLE',
    estado(evaluate(green().map(e => (e.eventType === 'notification_channel_configured' ? { ...e, attributes: { ...e.attributes, destinatarios: '-' } } : e)), HIGH, 'ALTO'), 'op.mon.3.r5.2') === 'NO_EVALUABLE'
  );

  const conSlack = (level: number, errores = 0) => [...withPentest(), ...events(slack(level, errores))];
  const bySlack = { ...HIGH, 'P-08': ['SOC | slack | 10 | 24x7'] };

  check('R5.2 · slack from level 12 and P-08 requires it from 10 → NO_CUMPLE', estado(evaluate(conSlack(12), bySlack, 'ALTO'), 'op.mon.3.r5.2') === 'NO_CUMPLE');
  check('reversal · slack from level 7 → CUMPLE', estado(evaluate(conSlack(7), bySlack, 'ALTO'), 'op.mon.3.r5.2') === 'CUMPLE');
  check('R5.2 · slack with 3 delivery errors in 24 h → NO_CUMPLE', estado(evaluate(conSlack(7, 3), bySlack, 'ALTO'), 'op.mon.3.r5.2') === 'NO_CUMPLE');
  check('R5.2 · nivel_minimo «alto» in P-08 → CONFIGURATION', cause(evaluate(conSlack(7), { ...HIGH, 'P-08': ['SOC | slack | alto | 24x7'] }, 'ALTO'), 'op.mon.3.r5.2') === 'CONFIGURATION');

  check('R6.3 · the same pentest with periodicity 180 → NO_CUMPLE (expired)', estado(evaluate(green(), { ...HIGH, 'P-09': ['verificacion_configuracion | continua | -', 'analisis_vulnerabilidades | continua | -', 'pentest | 180 | externo'] }, 'ALTO'), 'op.mon.3.r6.3') === 'NO_CUMPLE');
  check('R6.3 · empty record → NO_CUMPLE («no consta ninguna»)', /No consta ninguna prueba de penetración/.test(evaluate(hoy(suricata('2026-10-09T11:50:00Z')), HIGH, 'ALTO').motivo('op.mon.3.r6.3')));
  check('R6.3 · pentest «continua» in P-09 → CONFIGURATION', cause(evaluate(green(), { ...HIGH, 'P-09': ['pentest | continua | externo'] }, 'ALTO'), 'op.mon.3.r6.3') === 'CONFIGURATION');
  check('R6.3 · periodicity «anual» (not a number of days) → CONFIGURATION', cause(evaluate(green(), { ...HIGH, 'P-09': ['pentest | anual | externo'] }, 'ALTO'), 'op.mon.3.r6.3') === 'CONFIGURATION');

  const badRow = [...withPentest(), ...events([inspection('03/2026', 'pentest', { fila: 3, formato: 'fecha «03/2026» no es AAAA-MM-DD' })])];

  check(
    'R6 · a row with an invalid format does not count and is reported (CONFIGURATION), and the good one still accredits',
    /línea 3: fecha «03\/2026»/.test(evaluate(green(badRow), HIGH, 'ALTO').motivo('op.mon.3.r6.3')) && estado(evaluate(green(badRow), HIGH, 'ALTO'), 'op.mon.3.r6.3') === 'NO_EVALUABLE'
  );

  const periodic = { ...HIGH, 'P-09': ['verificacion_configuracion | 90 | interno', 'analisis_vulnerabilidades | continua | -', 'pentest | 365 | externo'] };
  const brokenSca = withPentest().map(e => (e.eventType === 'config_assessment_observed' && e.attributes?.agente_id === '024' ? { ...e, attributes: { ...e.attributes, ultimo_fin: '2026-10-01T00:00:00Z' } } : e));

  check('R6.1 periodic · old SCA and no record row → NO_CUMPLE', estado(evaluate(green(brokenSca), periodic, 'ALTO'), 'op.mon.3.r6.1') === 'NO_CUMPLE');

  const conRevision = [...brokenSca, ...events([inspection('2026-08-20', 'verificacion_configuracion', { fila: 4, ejecutor: 'interno', motivo: 'periodica' })])];

  check('reversal · with a verification of 20/08 within 90 days → CUMPLE with the record', estado(evaluate(green(conRevision), periodic, 'ALTO'), 'op.mon.3.r6.1') === 'CUMPLE' && /Acreditada con el registro/.test(evaluate(green(conRevision), periodic, 'ALTO').motivo('op.mon.3.r6.1')));
  check('and R2 (MEDIA) stays NO_CUMPLE because of that SCA: the inspection does not cover R2\'s measurement', estado(evaluate(green(conRevision), periodic, 'ALTO'), 'op.mon.3.r2.1') === 'NO_CUMPLE');

  const withIncident = [
    ...green(),
    ...events([
      { _a: '000', ts: t(COMPLETE, 24), event: 'incident_registered', evidence_id: 'EV-13', requisito: 'op.mon.3.r6.1', plano: 'central', incidente_id: 'INC-2026-007', fecha: '2026-09-18T08:00:00Z', severidad: 'alta', sistemas: 'wazuh-real', clasificacion: 'malware', referencia: '-', fila: 5 },
      inspection('2026-09-20', 'analisis_vulnerabilidades', { fila: 6, motivo: 'post_incidente', incidente_id: 'INC-2026-007' }),
    ]),
  ].filter(e => !(e.eventType === 'incident_registered' && e.attributes?.incidente_id === 'ninguno'));
  const e13 = evaluate(withIncident, HIGH, 'ALTO');

  check(
    'EV-13 · NO_APLICA with the cross: the incident and its later inspection',
    ev(e13, 'op.mon.3.r6.1', 'EV-13') === 'NO_APLICA' && /INC-2026-007 \(analisis_vulnerabilidades del 2026-09-20/.test(evMotive2(e13, 'op.mon.3.r6.1', 'EV-13')),
    evMotive2(e13, 'op.mon.3.r6.1', 'EV-13')
  );

  const report = buildOpMon3ReportModel(evaluate(green(), HIGH, 'ALTO').motor());

  check(
    'ALTA report · R3.1 and R4 «acreditado documentalmente»; external components with their state',
    /Acreditado documentalmente/.test(report.fields[4].value) &&
      /Sonda de detección en red \(R3\.2\): desplegado y operativo/.test(report.fields[10].details.join(' ')) &&
      /Servicio de cibervigilancia \(R4\): acreditado documentalmente/.test(report.fields[10].details.join(' ')),
    report.fields[10].details.join(' | ')
  );

  const withoutProbe = buildOpMon3ReportModel(evaluate(green([...hoy(sin('security_inspection_recorded')), ...events([inspection('2026-03-12', 'pentest')])]), HIGH, 'ALTO').motor());

  check('ALTA report · without a probe, «no cubierto»', /R3\.2\): no cubierto/.test(withoutProbe.fields[10].details.join(' ')) && withoutProbe.fields[10].status === 'NO_CUMPLE');
}

section('8. State and two cadences; id parts; fact budget');

{
  const hourlyOnes = ['13:05', '14:05', '15:05', '16:05', '17:05'].flatMap(h =>
    hourlyPass(`2026-10-09T${h}`, { eventos_procesados: 1210450 + Number(h.slice(0, 2)) * 1000 })
  );
  const a1730 = new Date('2026-10-09T17:30:00Z');
  const withHourly = events([...hourlyPass(), ...completePass(), ...hourlyOnes]);

  check('five hourly passes do not delete the 6 h facts (R2 stays measured)', estado(evaluate(withHourly, BASE, 'MEDIO', a1730), 'op.mon.3.r2.1') === 'CUMPLE');

  const next = completePass('2026-10-09T18:05').map(l =>
    l.event === 'config_assessment_observed' && l.agente_id === '024' ? { ...l, ultimo_fin: '2026-10-08T01:00:00Z' } : l
  );
  const withNext = events([...hourlyPass(), ...completePass(), ...hourlyOnes, ...next]);

  check('the next complete one replaces them: 024\'s SCA from the 18:05 one prevails', estado(evaluate(withNext, BASE, 'MEDIO', new Date('2026-10-09T18:30:00Z')), 'op.mon.3.r2.1') === 'NO_CUMPLE');

  check(
    'wazuh-real\'s pass (12:20) does not delete the manager\'s (12:05), nor the LDAP\'s (12:25) wazuh-real\'s',
    estado(evaluate(hoy()), 'op.mon.3.r2.1') === 'CUMPLE' && estado(evaluate(hoy(), BASE, 'MEDIO', NOW, '024'), 'op.mon.3.1') === 'CUMPLE'
  );

  const many = Array.from({ length: 1500 }, (_, i) => String(200000 + i * 2));
  const corta = (ids: string[], max = 6000): string[] => {
    const partes: string[] = [];
    let actual = '';

    ids.forEach(id => {
      if (actual && actual.length + id.length + 1 > max) {
        partes.push(actual);
        actual = id;
      } else {
        actual = actual ? `${actual},${id}` : id;
      }
    });

    return actual ? [...partes, actual] : partes;
  };
  const partes = corta([...many, '107215']);
  const lineasUmbral = partes.map((ids, i) => ({
    _a: '000', ts: t(COMPLETE, 21), event: 'query_volume_rules_observed', evidence_id: 'EV-08', requisito: 'op.mon.3.r5.1', plano: 'central',
    ids, reglas_umbral: many.length + 1, parte: i + 1, partes: partes.length,
  }));
  const conPartes = (which: number[]) => [...hoy(sin('query_volume_rules_observed')), ...events(lineasUmbral.filter((_, i) => which.includes(i)))];
  const jsonMasLargo = Math.max(...lineasUmbral.map(l => JSON.stringify({ ensfacil: 'op.mon.3', host: 'wazuh-4', ...l }).length));

  check(`1501 loose ids in ${partes.length} parts; no line exceeds 8 KiB (${jsonMasLargo})`, partes.length >= 2 && jsonMasLargo < 8192);
  check('the parts join: P-07\'s rule in the last part is found', estado(evaluate(conPartes(partes.map((_, i) => i)), HIGH, 'ALTO'), 'op.mon.3.r5.1') === 'CUMPLE');
  check('if the part carrying it is missing → NO_EVALUABLE (COLLECTION), not NO_CUMPLE', estado(evaluate(conPartes([0]), HIGH, 'ALTO'), 'op.mon.3.r5.1') === 'NO_EVALUABLE' && cause(evaluate(conPartes([0]), HIGH, 'ALTO'), 'op.mon.3.r5.1') === 'COLLECTION');

  const day: Linea[] = [];

  for (let h = 0; h < 24; h += 1) {
    const ts = `2026-10-09T${String(h).padStart(2, '0')}:05`;

    day.push(...(h % 6 === 0 ? completePass(ts) : hourlyPass(ts)));
  }

  ['00:20', '06:20', '12:20', '18:20'].forEach(h => {
    day.push(...agentPass('024', `2026-10-09T${h}`), ...agentPass('028', `2026-10-09T${h.replace('20', '25')}`));
  });

  check(`a fixture lab day: ${day.length} facts, fewer than 300`, day.length < 300);
}

section('9. The engine: op.mon.3 in the manager row and the agent rows, and the consolidated');

{
  const Module = require('module');
  const load = Module._load;

  Module._load = function (request: string, ...rest: unknown[]) {
    if (/kibana-services$/.test(request)) {
      return {};
    }

    return load.call(this, request, ...rest);
  };

  const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
  const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
  const { getENSComplianceState } = require('../common/ens/core/ens-engine');

  const conValores = (valores: Valores) =>
    ensConfigurationRepository.replaceActive({
      ...defaultENSConfigurationTemplate,
      global: { ...defaultENSConfigurationTemplate.global, clientName: 'Cliente de prueba', organization: 'Organización de prueba', scope: 'Laboratorio', ensLevel: 'MEDIO' },
      controls: defaultENSConfigurationTemplate.controls.map((control: { controlId: string }) =>
        control.controlId === 'op.mon.3' ? configuration(valores) : control
      ),
    });

  const scope = [
    { id: '000', name: 'Wazuh-4', groups: [], isManager: true },
    { id: '024', name: 'wazuh-real', groups: ['ens'] },
    { id: '028', name: 'ldap-zimbra', groups: ['ens'] },
  ];
  const result = (evs: ENSNormalizedEvent[]) => {
    const estadoMotor = getENSComplianceState('MEDIO', evs, undefined, scope, NOW);
    const byRow = (id: string) =>
      estadoMotor.agents.find((a: { agentId: string }) => a.agentId === id)?.results.find((r: { control: { id: string } }) => r.control.id === 'op.mon.3');
    const consolidated = estadoMotor.results.find((r: { control: { id: string } }) => r.control.id === 'op.mon.3');
    const req = (r: any, id: string) => r?.requirements.find((q: { id: string }) => q.id === id)?.status;

    return { porFila: byRow, consolidado: consolidated, req };
  };

  conValores(BASE);

  const green = result(hoy());

  check(
    'op.mon.3 is in the three rows and the consolidated complies at MEDIA',
    ['000', '024', '028'].every(id => green.porFila(id)) && green.consolidado?.status === 'CUMPLE',
    `${green.consolidado?.status} · ${['op.mon.3.1', 'op.mon.3.r1.1', 'op.mon.3.r2.1'].map(id => `${id}=${green.req(green.consolidado, id)}`).join(' ')}`
  );
  check('in an agent\'s row, R2 does not apply; in the consolidated, R2 is the manager\'s', green.req(green.porFila('024'), 'op.mon.3.r2.1') === 'NO_APLICA' && green.req(green.consolidado, 'op.mon.3.r2.1') === 'CUMPLE');

  const down = result(hoy(en('agent_forwarding_observed', { conexion: 'disconnected' }, l => l._a === '028')));

  check(
    'the LDAP disconnected when read: its row and the consolidated do not comply with op.mon.3.1; the manager\'s does',
    down.req(down.porFila('028'), 'op.mon.3.1') === 'NO_CUMPLE' && down.req(down.consolidado, 'op.mon.3.1') === 'NO_CUMPLE' && down.req(down.porFila('000'), 'op.mon.3.1') === 'CUMPLE'
  );

  conValores({ ...BASE, 'P-01': [...(BASE['P-01'] as string[]), 'copias de srv-copias | Linux | agente | srv-copias | /var/log/syslog | 24'] });

  const outside = result(hoy());

  check(
    'a P-01 source on an active agent OUTSIDE the scope: no row measures it and the consolidated does not comply with op.mon.3.1',
    !outside.porFila('030') && outside.req(outside.porFila('000'), 'op.mon.3.1') === 'NO_CUMPLE' && outside.req(outside.consolidado, 'op.mon.3.1') === 'NO_CUMPLE',
    `${outside.req(outside.porFila('000'), 'op.mon.3.1')} / ${outside.req(outside.consolidado, 'op.mon.3.1')}`
  );

  conValores(BASE);

  const lab = result(hoy(undefined, { detector: { errores_indexacion_24h: 37, muestra_error: 'circuit_breaking_exception' } }));

  check('today\'s lab (indexer without memory): the consolidated does not comply with R2', lab.req(lab.consolidado, 'op.mon.3.r2.1') === 'NO_CUMPLE');
}

console.log(`\n${failures.length ? `${failures.length} FAIL` : 'ALL OK'}`);

if (failures.length) {
  process.exit(1);
}
