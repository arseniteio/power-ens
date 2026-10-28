/** op.exp.9: judgment of the incident management log. */
import { opExp9PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-9.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opExp9CatalogDefinition } from '../common/ens/catalog/op-exp-9';
import { opExp9Configuration } from '../common/ens/configuration/data/op-exp-9-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';
import { keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import type { ENSControlConfiguration } from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

declare const process: { exit(code: number): void };

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

const NOW = new Date('2026-09-26T12:00:00Z');
const ago = (hours: number): string =>
  new Date(NOW.getTime() - hours * 3600 * 1000).toISOString().replace('.000Z', 'Z');

let counter = 0;

const alert = (data: Record<string, unknown>, ts = ago(1)) => {
  counter += 1;

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts,
      agent: { id: '000', name: 'Wazuh-4' },
      rule: { id: '111000', description: 'op.exp.9' },
      location: '/var/log/power-ens/op_exp_9.json',
      data: Object.fromEntries(
        Object.entries({ power_ens: 'op.exp.9', ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

const ALL_OF_THEM = 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-06,EV-07,EV-08,EV-09';

const heartbeat = (ts = ago(0.5), covered = ALL_OF_THEM) =>
  alert({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: covered, perfil: 'manager' }, ts);

const readOne = (record: string, extra: Record<string, unknown> = {}, ts = ago(0.6)) =>
  alert({
    event: 'register_read',
    evidence_id: ALL_OF_THEM,
    registro: record,
    fichero: `/etc/power-ens/${record}.tsv`,
    presente: 'si',
    legible: 'si',
    formato: 'ok',
    filas_validas: 1,
    filas_invalidas: 0,
    ...extra,
  }, ts);

const records = (extra: Record<string, Record<string, unknown>> = {}, ts = ago(0.6)) =>
  ['incidentes', 'actuaciones', 'custodia', 'custodia_accesos'].map(r => readOne(r, extra[r] || {}, ts));

const row = (id: string, phase: string, date: string, extra: Record<string, unknown> = {}, ts = ago(0.6)) =>
  alert({
    event: 'incident_report_registered',
    evidence_id: 'EV-02,EV-09',
    incidente_id: id,
    fase: phase,
    fecha: date,
    severidad: 'alta',
    sistemas: 'wazuh-real',
    clasificacion: 'acceso-no-autorizado',
    escalado_a: '-',
    notificado_a: '-',
    datos_personales: 'no',
    notificacion_ccn_cert: '-',
    relevancia_juridica: 'no',
    medidas_mejora: '-',
    referencia: `https://expedientes.invalido/${id}`,
    ...extra,
  }, ts);

const window = (id: string, extra: Record<string, unknown> = {}, ts = ago(0.6)) =>
  alert({
    event: 'incident_source_events_available',
    evidence_id: 'EV-01,EV-07',
    incidente_id: id,
    sistema: 'wazuh-real',
    agente_id: '024',
    agente_conocido: 'si',
    desde: '2026-09-09T10:00:00Z',
    inicio: '2026-09-10T10:00:00Z',
    hasta: '2026-09-12T10:00:00Z',
    abierto: 'no',
    alertas: 812,
    nivel_max: 12,
    dias: 4,
    dias_sin_archivo: '-',
    dias_alterados: '-',
    dias_sin_suma: '-',
    acciones: 0,
    acciones_emitidas: 0,
    cambios: 0,
    cambios_emitidos: 0,
    ...extra,
  }, ts);

const events = (...alerts: ReturnType<typeof alert>[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(alerts);

const BASIC_ONES: Record<string, string[] | string> = {
  'P-01': 'Registro Power ENS (/etc/power-ens/incident-register.tsv)',
  'P-02': ['inicial | detección, alcance |', 'intermedio | evolución, medidas | 24', 'final | causa, impacto, cierre |'],
  'P-03': ['logs sellados del período | repositorio-custodia', 'acta de recogida |'],
  'P-04': ['acceso no autorizado por empleado', 'exfiltración'],
  'P-05': ['repositorio-custodia | SHA-256 + sellado de tiempo | solo RSeg'],
  'P-06': ['disciplinaria | 1095', 'contractual | 1825'],
  'P-07': ['alta | 30 | PRO-07', 'critica | 15 | PRO-07'],
  'P-08': '12',
};

const configuration = (values: Record<string, string[] | string | undefined>): ENSControlConfiguration => ({
  ...opExp9Configuration,
  parameters: opExp9Configuration.parameters.map(p => {
    const value = values[p.id];
    const copy = { ...p };

    if (value === undefined) {
      delete copy.value;
    } else {
      copy.value = value;
    }

    return copy;
  }),
});

const evaluate = (
  evs: ENSNormalizedEvent[],
  values: Record<string, string[] | string | undefined> = BASIC_ONES,
  now: Date = NOW
) => {
  const cfg = configuration(values);
  const cutOnes = keepLatestRunStateFacts('op.exp.9', evs, now);
  const evidences = resolveEvidenceForControl('op.exp.9', cutOnes, '000', 'MEDIO', cfg, now);
  const context = buildPolicyContext(opExp9CatalogDefinition, cfg, 'MEDIO', cutOnes, evidences, now);
  const { decisions } = opExp9PolicyDefinition.evaluator!(context);
  const principal = (requirement: string) => decisions.find(d => d.requirementId === requirement)!;
  const from = (id: string) => decisions.find(d => d.trace.ruleId.endsWith(`/${id}`))!;
  const bridge = applyPolicyDecisionsToEvidences(evidences, decisions, opExp9CatalogDefinition.requirements);
  const requirement = (id: string) =>
    evaluateRequirement(
      opExp9CatalogDefinition.requirements.find(r => r.id === id)!,
      'MEDIO',
      bridge,
      false,
      decisions,
      opExp9CatalogDefinition.status
    );

  return { decisions, principal, de: from, puente: bridge, requisito: requirement };
};

const closedIncident = (id = 'INC-2026-001', extra: Record<string, unknown> = {}) => [
  row(id, 'inicial', '2026-09-10T10:00:00Z', extra),
  row(id, 'intermedio', '2026-09-11T10:00:00Z', extra),
  row(id, 'final', '2026-09-12T10:00:00Z', extra),
];

section('1. Catalog: three base requirements, active, state by the last pass');

{
  check('op.exp.9 is ACTIVE', opExp9CatalogDefinition.status === 'ACTIVE');

  check(
    'the three requirements apply at BAJO, MEDIO and ALTO (no reinforcements)',
    opExp9CatalogDefinition.requirements.every(r => r.applicability.levels.join(',') === 'BAJO,MEDIO,ALTO') &&
      opExp9CatalogDefinition.requirements.length === 3
  );

  const definitions = getEvidenceDefinitions('op.exp.9');

  check('nine evidences in the catalog', definitions.length === 9, definitions.length);

  check(
    'no evidence carries `judgment`: the policy judges them',
    definitions.every(d => !d.judgment)
  );

  check(
    'every evidence with state facts accredits rules in band 111000-111099',
    definitions.every(d => d.relatedRules.length > 0 && d.relatedRules.every(r => /^1110\d\d$/.test(r)))
  );

  const tables = ['P-02', 'P-03', 'P-05', 'P-06', 'P-07'];

  check(
    'P-02, P-03, P-05, P-06 and P-07 are tables with columns',
    tables.every(id => {
      const p = opExp9Configuration.parameters.find(x => x.id === id)!;

      return p.type === 'table' && (p.columns || []).length >= 2;
    })
  );

  check(
    'no parameter declares `value` (empty = absent key)',
    opExp9Configuration.parameters.every(p => !Object.prototype.hasOwnProperty.call(p, 'value'))
  );

  check(
    'P-ATT and P-08 are optional',
    ['P-ATT', 'P-08'].every(id => opExp9Configuration.parameters.find(p => p.id === id)!.required === false)
  );
}

section('2. Without a heartbeat nothing is judged; an ABSENT record is not an EMPTY record');

{
  const withoutHeartbeat = evaluate(events(...records(), ...closedIncident(), window('INC-2026-001')));

  check(
    'without a collector heartbeat: the three requirements NO_EVALUABLE',
    ['op.exp.9.1', 'op.exp.9.2', 'op.exp.9.3'].every(r => withoutHeartbeat.principal(r).status === 'NO_EVALUABLE'),
    withoutHeartbeat.principal('op.exp.9.1').reason
  );

  const old = evaluate(events(heartbeat(ago(30)), ...records({}, ago(30.1)), ...closedIncident()));

  check(
    'heartbeat from 30 h ago: NO_EVALUABLE saying the state is not today\'s',
    old.de('EV-02').status === 'NO_EVALUABLE' && /no describe el estado de hoy/.test(old.de('EV-02').reason),
    old.de('EV-02').reason
  );

  const absent = evaluate(events(heartbeat(), ...records({ incidentes: { presente: 'no', legible: 'no', formato: '-', filas_validas: 0 } })));

  check(
    'absent record: NO_EVALUABLE with cause CONFIGURATION',
    absent.de('EV-02').status === 'NO_EVALUABLE' && /CONFIGURATION/.test(absent.de('EV-02').reason),
    absent.de('EV-02').reason
  );

  const volume = (byLevel: string, rules: number) =>
    alert({ event: 'alert_volume_observed', evidence_id: 'EV-02', desde: '2026-08-27T12:00:00Z', hasta: '2026-09-26T11:00:00Z', dias: 30, por_nivel: byLevel, nivel_detalle: 7, reglas: rules, dias_sin_archivo: '-' }, ago(0.6));

  const rule = (id: string, level: number, alerts: number, groups: string) =>
    alert({ event: 'alert_rule_volume_observed', evidence_id: 'EV-02', regla: id, nivel: level, alertas: alerts, grupos: groups, descripcion: `regla ${id}`, agentes: 'wazuh-real' }, ago(0.6));

  const empty = events(
    heartbeat(),
    ...records({ incidentes: { filas_validas: 0 } }),
    volume('7=40,10=12,12=3,13=1760', 4),
    rule('5712', 7, 40, 'syslog,sshd'),
    rule('23505', 10, 12, 'vulnerability-detector'),
    rule('108130', 12, 3, 'yara,malware'),
    rule('23506', 13, 1760, 'vulnerability-detector')
  );

  const with12 = evaluate(empty);

  check(
    'empty record with P-08=12 and without P-09: the 1760 CVEs count too → NO_CUMPLE for 1763',
    with12.de('EV-02').status === 'NO_CUMPLE' && /1763 alertas/.test(with12.de('EV-02').reason),
    with12.de('EV-02').reason
  );

  const withoutCve = evaluate(empty, { ...BASIC_ONES, 'P-09': ['vulnerability-detector'] });

  check(
    'vulnerability-detector excluded in P-09: the 3 from YARA remain → still NO_CUMPLE, and the motive says what was excluded',
    withoutCve.de('EV-02').status === 'NO_CUMPLE' && /3 alertas/.test(withoutCve.de('EV-02').reason) && /Excluidas por P-09/.test(withoutCve.de('EV-02').reason),
    withoutCve.de('EV-02').reason
  );

  const incomplete = evaluate(events(heartbeat(), ...records({ incidentes: { filas_validas: 0 } }), volume('12=3', 2), rule('108130', 12, 3, 'yara')));

  check(
    'the collector declares 2 rules and 1 arrives: the contrast is not made on a part',
    incomplete.de('EV-02').status === 'NO_EVALUABLE'
  );

  check(
    '... and EV-01 NO_EVALUABLE: there is no file to examine',
    with12.de('EV-01').status === 'NO_EVALUABLE'
  );

  const with13 = evaluate(empty, { ...BASIC_ONES, 'P-08': '13', 'P-09': ['vulnerability-detector'] });

  check(
    'REVERSAL: the SAME empty record with P-08=13 and the CVEs excluded → EV-02 CUMPLE and op.exp.9.1 CUMPLE',
    with13.de('EV-02').status === 'CUMPLE' && with13.principal('op.exp.9.1').status === 'CUMPLE',
    `${with13.de('EV-02').reason} | ${with13.principal('op.exp.9.1').reason}`
  );

  const withoutP08 = evaluate(empty, { ...BASIC_ONES, 'P-08': undefined });

  check(
    'empty record without P-08: NO_EVALUABLE, nothing to contrast against',
    withoutP08.de('EV-02').status === 'NO_EVALUABLE' && /P-08/.test(withoutP08.de('EV-02').reason)
  );

  const otherTool = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001')), { ...BASIC_ONES, 'P-01': 'TheHive' });

  check(
    'P-01 = TheHive: NO_EVALUABLE saying the integration does not exist',
    otherTool.de('EV-02').status === 'NO_EVALUABLE' && /integración con esa herramienta no existe/.test(otherTool.de('EV-02').reason)
  );

  const notCovered = evaluate(events(heartbeat(ago(0.5), 'EV-02,EV-09'), ...records(), ...closedIncident(), window('INC-2026-001')));

  check(
    'the last pass did not cover EV-01: EV-01 NO_EVALUABLE even with facts',
    notCovered.de('EV-01').status === 'NO_EVALUABLE' && /no declara haber leído/.test(notCovered.de('EV-01').reason)
  );
}

section('3. EV-02: P-02\'s phases, with the exception of duration and open end');

{
  const closingOnly = evaluate(events(heartbeat(), ...records(), row('INC-1', 'inicial', '2026-09-10T10:00:00Z'), row('INC-1', 'final', '2026-09-13T10:00:00Z'), window('INC-1')));

  check(
    '3-day incident without an intermediate report (P-02 requires it from 24 h): NO_CUMPLE',
    closingOnly.de('EV-02').status === 'NO_CUMPLE' && /INC-1.*intermedio/.test(closingOnly.de('EV-02').reason),
    closingOnly.de('EV-02').reason
  );

  const largo = evaluate(
    events(heartbeat(), ...records(), row('INC-1', 'inicial', '2026-09-10T10:00:00Z'), row('INC-1', 'final', '2026-09-13T10:00:00Z'), window('INC-1')),
    { ...BASIC_ONES, 'P-02': ['inicial | |', 'intermedio | | 100', 'final | |'] }
  );

  check(
    'REVERSAL: the SAME incident with the intermediate required from 100 h → CUMPLE',
    largo.de('EV-02').status === 'CUMPLE',
    largo.de('EV-02').reason
  );

  const opened = evaluate(events(heartbeat(), ...records(), row('INC-2', 'inicial', ago(10)), window('INC-2')));

  check(
    'incident open 10 h ago, with initial only: the final is not required yet → CUMPLE',
    opened.de('EV-02').status === 'CUMPLE',
    opened.de('EV-02').reason
  );

  const longOpened = evaluate(events(heartbeat(), ...records(), row('INC-2', 'inicial', ago(48)), window('INC-2')));

  check(
    'the SAME open 48 h ago: the intermediate is already required → NO_CUMPLE',
    longOpened.de('EV-02').status === 'NO_CUMPLE'
  );

  const withoutSeverity = evaluate(events(heartbeat(), ...records(), row('INC-3', 'inicial', ago(5), { severidad: '-' }), window('INC-3')));

  check(
    'initial report without severity: NO_CUMPLE for completion',
    withoutSeverity.de('EV-02').status === 'NO_CUMPLE' && /sin severidad/.test(withoutSeverity.de('EV-02').reason)
  );

  const invalidOnes = evaluate(events(heartbeat(), ...records({ incidentes: { filas_invalidas: 2 } }), ...closedIncident('INC-1'), window('INC-1')));

  check(
    'with 2 uninterpretable rows a CUMPLE drops to NO_EVALUABLE, never to NO_CUMPLE',
    invalidOnes.de('EV-02').status === 'NO_EVALUABLE' && /no se pudieron interpretar/.test(invalidOnes.de('EV-02').reason)
  );
}

section('4. EV-01 and EV-07: the period\'s events, on disk and with their sum');

{
  const good = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001')));

  check('window with alerts and all days verified: EV-01 CUMPLE', good.de('EV-01').status === 'CUMPLE', good.de('EV-01').reason);

  check(
    'incident closed without legal relevance: EV-07 CUMPLE, there is no period to protect',
    good.de('EV-07').status === 'CUMPLE'
  );

  const lost2 = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001', { dias_sin_archivo: '2026-09-10' })));

  check(
    'the 10/09 archive is missing: EV-01 NO_CUMPLE naming the day',
    lost2.de('EV-01').status === 'NO_CUMPLE' && /2026-09-10/.test(lost2.de('EV-01').reason)
  );

  const tamperedOne = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001', { dias_alterados: '2026-09-11' })));

  check('the 11/09 archive does not match its sum: NO_CUMPLE', tamperedOne.de('EV-01').status === 'NO_CUMPLE');

  const mute = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001', { alertas: 0 })));

  check('no alert of the system in the window: NO_EVALUABLE', mute.de('EV-01').status === 'NO_EVALUABLE');

  const foreignOne = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001', { agente_conocido: 'no', alertas: 0 })));

  check('the system is not a manager agent: NO_EVALUABLE', foreignOne.de('EV-01').status === 'NO_EVALUABLE' && /no es un agente/.test(foreignOne.de('EV-01').reason));

  const opened = evaluate(events(heartbeat(), ...records(), row('INC-9', 'inicial', ago(5)), window('INC-9', { abierto: 'si' })));

  check(
    'open incident with its period on disk: EV-07 NO_EVALUABLE with cause CONFIGURATION (indexer without credentials)',
    opened.de('EV-07').status === 'NO_EVALUABLE' && /CONFIGURATION/.test(opened.de('EV-07').reason) && /ISM/.test(opened.de('EV-07').reason),
    opened.de('EV-07').reason
  );

  const lostOpened = evaluate(events(heartbeat(), ...records(), row('INC-9', 'inicial', ago(50)), window('INC-9', { abierto: 'si', dias_sin_archivo: '2026-09-24' })));

  check('REVERSAL: the SAME open one with a lost day → EV-07 NO_CUMPLE', lostOpened.de('EV-07').status === 'NO_CUMPLE');
}

section('5. EV-03 and EV-04: what Wazuh saw in the window, against the file');

{
  const ar = alert({ event: 'emergency_action_observed', evidence_id: 'EV-03', incidente_id: 'INC-2026-001', sistema: 'wazuh-real', programa: 'firewall-drop', veces: 2, primera: '2026-09-10T10:05:00Z', ultima: '2026-09-10T10:06:00Z', regla: '651' }, ago(0.6));

  const action = (type: string, object: string, system = 'wazuh-real') =>
    alert({ event: 'incident_action_registered', evidence_id: 'EV-03,EV-04,EV-08', incidente_id: 'INC-2026-001', fecha: '2026-09-10T10:30:00Z', sistema: system, tipo: type, objeto: object, descripcion: 'x', referencia: 'y' }, ago(0.6));

  const withAr = (extra: ReturnType<typeof alert>[] = []) =>
    events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001', { acciones: 1, acciones_emitidas: 1 }), ar, ...extra);

  const unregistered2 = evaluate(withAr());

  check(
    'firewall-drop active response without a recorded action: EV-03 NO_CUMPLE',
    unregistered2.de('EV-03').status === 'NO_CUMPLE' && /firewall-drop/.test(unregistered2.de('EV-03').reason),
    unregistered2.de('EV-03').reason
  );

  const recorded = evaluate(withAr([action('emergencia', 'firewall-drop')]));

  check('REVERSAL: the SAME one with its emergency action recorded → CUMPLE', recorded.de('EV-03').status === 'CUMPLE', recorded.de('EV-03').reason);

  const otherType = evaluate(withAr([action('modificacion', 'firewall-drop')]));

  check('recorded as a modification, not as an emergency: still NO_CUMPLE', otherType.de('EV-03').status === 'NO_CUMPLE');

  const incomplete = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001', { acciones: 2, acciones_emitidas: 2 }), ar, action('emergencia', '*')));

  check('the sweep declares 2 and only 1 arrives: NO_EVALUABLE', incomplete.de('EV-03').status === 'NO_EVALUABLE');

  const nothing = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001')));

  check('windows swept without any active response: EV-03 CUMPLE', nothing.de('EV-03').status === 'CUMPLE', nothing.de('EV-03').reason);

  const change = alert({ event: 'system_change_observed', evidence_id: 'EV-04', incidente_id: 'INC-2026-001', sistema: 'wazuh-real', origen: 'fim', objeto: '/etc/ssh/sshd_config', veces: 1, primera: '2026-09-11T09:00:00Z', ultima: '2026-09-11T09:00:00Z', regla: '550' }, ago(0.6));

  const withChange = (extra: ReturnType<typeof alert>[]) =>
    events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001', { cambios: 1, cambios_emitidos: 1 }), change, ...extra);

  const otherPrefix = evaluate(withChange([action('modificacion', '/etc/nginx/')]));

  check(
    'change of /etc/ssh/sshd_config and only /etc/nginx/ was recorded: EV-04 NO_CUMPLE',
    otherPrefix.de('EV-04').status === 'NO_CUMPLE' && /sshd_config/.test(otherPrefix.de('EV-04').reason)
  );

  const prefix = evaluate(withChange([action('modificacion', '/etc/ssh/')]));

  check('REVERSAL: prefix /etc/ssh/ recorded → CUMPLE', prefix.de('EV-04').status === 'CUMPLE', prefix.de('EV-04').reason);

  const otherSystem = evaluate(withChange([action('modificacion', '/etc/ssh/', 'zimbraHldap')]));

  check('the recorded prefix belongs to ANOTHER system: NO_CUMPLE', otherSystem.de('EV-04').status === 'NO_CUMPLE');
}

section('6. EV-05 and EV-06: the jurisdictional evidence, conditioned by the record\'s mark');

{
  const HASH = 'a'.repeat(64);
  const sealed = (type: string, file: string, extra: Record<string, unknown> = {}) =>
    alert({ event: 'evidence_export_sealed', evidence_id: 'EV-05,EV-06', incidente_id: 'INC-7', fecha: '2026-09-11T12:00:00Z', tipo_evidencia: type, fichero: file, sha256: HASH, destino: 'repositorio-custodia', referencia: 'z', ...extra }, ago(0.6));
  const verified = (file: string, extra: Record<string, unknown> = {}) =>
    alert({ event: 'custody_integrity_checked', evidence_id: 'EV-06', incidente_id: 'INC-7', fichero: file, sha256_declarado: HASH, sha256_actual: HASH, verificable: 'si', coincide: 'si', motivo: '-', verificado: '2026-09-26T11:00:00Z', ...extra }, ago(0.6));
  const noted = (file: string) =>
    alert({ event: 'custody_access_recorded', evidence_id: 'EV-06', fecha: '2026-09-11T12:05:00Z', incidente_id: 'INC-7', fichero: file, usuario: 'rseg', finalidad: 'deposito', referencia: 'z' }, ago(0.6));

  const relevant = [
    row('INC-7', 'inicial', '2026-09-10T10:00:00Z', { relevancia_juridica: 'si' }),
    row('INC-7', 'intermedio', '2026-09-11T10:00:00Z', { relevancia_juridica: 'si' }),
    row('INC-7', 'final', '2026-09-12T10:00:00Z', { relevancia_juridica: 'si' }),
    window('INC-7'),
  ];

  const logs = '/srv/custodia/INC-7/logs.tar.gz';
  const acta = '/srv/custodia/INC-7/acta.pdf';

  const media = evaluate(events(heartbeat(), ...records(), ...relevant, sealed('logs sellados del período', logs), verified(logs), noted(logs)));

  check(
    'incident with legal relevance without the collection record that P-03 requires: EV-05 NO_CUMPLE',
    media.de('EV-05').status === 'NO_CUMPLE' && /acta de recogida/.test(media.de('EV-05').reason),
    media.de('EV-05').reason
  );

  const complete = evaluate(events(heartbeat(), ...records(), ...relevant,
    sealed('logs sellados del período', logs), verified(logs), noted(logs),
    sealed('Acta de recogida', acta), verified(acta), noted(acta)));

  check('REVERSAL: with the sealed record → EV-05 CUMPLE', complete.de('EV-05').status === 'CUMPLE', complete.de('EV-05').reason);
  check('... and EV-06 CUMPLE: P-05\'s destination, custody noted and hash intact', complete.de('EV-06').status === 'CUMPLE', complete.de('EV-06').reason);

  const withoutRelevance = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001')));

  check('no incident with legal relevance: EV-05 CUMPLE saying why', withoutRelevance.de('EV-05').status === 'CUMPLE' && /relevancia jurídica/.test(withoutRelevance.de('EV-05').reason));

  const withoutP03 = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001')), { ...BASIC_ONES, 'P-03': undefined });

  check('without P-03 (legal determination): EV-05 NO_EVALUABLE even if there are no relevant incidents', withoutP03.de('EV-05').status === 'NO_EVALUABLE' && /asesoramiento legal/.test(withoutP03.de('EV-05').reason));

  const tampered = evaluate(events(heartbeat(), ...records(), ...relevant,
    sealed('logs sellados del período', logs), verified(logs, { sha256_actual: 'b'.repeat(64), coincide: 'no' }), noted(logs),
    sealed('acta de recogida', acta), verified(acta), noted(acta)));

  check('the logs\' SHA-256 no longer matches: EV-06 NO_CUMPLE', tampered.de('EV-06').status === 'NO_CUMPLE' && /alterado/.test(tampered.de('EV-06').reason));

  const destroyed = (now: Date) =>
    evaluate(events(heartbeat(new Date(now.getTime() - 1800e3).toISOString()),
      ...records({}, new Date(now.getTime() - 2000e3).toISOString()),
      ...[
        row('INC-7', 'inicial', '2026-09-10T10:00:00Z', { relevancia_juridica: 'si' }, new Date(now.getTime() - 2000e3).toISOString()),
      ],
      alert({ event: 'evidence_export_sealed', evidence_id: 'EV-05,EV-06', incidente_id: 'INC-7', fecha: '2026-09-11T12:00:00Z', tipo_evidencia: 'acta de recogida', fichero: acta, sha256: HASH, destino: 'repositorio-custodia', referencia: 'z' }, new Date(now.getTime() - 2000e3).toISOString()),
      alert({ event: 'custody_integrity_checked', evidence_id: 'EV-06', incidente_id: 'INC-7', fichero: acta, sha256_declarado: HASH, sha256_actual: '-', verificable: 'no', coincide: '-', motivo: 'ausente' }, new Date(now.getTime() - 2000e3).toISOString()),
      alert({ event: 'custody_access_recorded', evidence_id: 'EV-06', fecha: '2026-09-11T12:05:00Z', incidente_id: 'INC-7', fichero: acta, usuario: 'rseg', finalidad: 'deposito', referencia: 'z' }, new Date(now.getTime() - 2000e3).toISOString())
    ), BASIC_ONES, now);

  check('evidence missing within P-06\'s longest deadline: NO_CUMPLE', destroyed(NOW).de('EV-06').status === 'NO_CUMPLE');

  const late = destroyed(new Date('2031-09-20T12:00:00Z'));

  check(
    'REVERSAL: the SAME disappearance after P-06\'s 1825 days → no longer premature destruction',
    late.de('EV-06').status === 'CUMPLE',
    late.de('EV-06').reason
  );

  const outside = evaluate(events(heartbeat(), ...records(), ...relevant,
    sealed('logs sellados del período', logs, { destino: 'nas-oficina' }), verified(logs), noted(logs),
    sealed('acta de recogida', acta), verified(acta), noted(acta)));

  check('deposited at a destination that is not P-05\'s: EV-06 NO_CUMPLE (and EV-05 because P-03 asks for another destination)',
    outside.de('EV-06').status === 'NO_CUMPLE' && outside.de('EV-05').status === 'NO_CUMPLE');
}

section('7. EV-08: review of auditable events, with the clock starting at closing');

{
  const closed = [
    row('INC-5', 'inicial', '2026-08-01T10:00:00Z'),
    row('INC-5', 'intermedio', '2026-08-02T10:00:00Z'),
    row('INC-5', 'final', '2026-08-03T10:00:00Z'),
    window('INC-5'),
  ];

  const expired2 = evaluate(events(heartbeat(), ...records(), ...closed));

  check(
    'high incident closed on 03/08 without review and with P-07 alta=30: NO_CUMPLE',
    expired2.de('EV-08').status === 'NO_CUMPLE' && /INC-5/.test(expired2.de('EV-08').reason),
    expired2.de('EV-08').reason
  );

  const the20 = new Date('2026-08-20T12:00:00Z');
  const pass20 = '2026-08-20T11:30:00Z';
  const before20 = '2026-08-20T11:29:00Z';

  const onTime2 = evaluate(
    events(
      heartbeat(pass20),
      ...records({}, before20),
      row('INC-5', 'inicial', '2026-08-01T10:00:00Z', {}, before20),
      row('INC-5', 'intermedio', '2026-08-02T10:00:00Z', {}, before20),
      row('INC-5', 'final', '2026-08-03T10:00:00Z', {}, before20),
      window('INC-5', {}, before20)
    ),
    BASIC_ONES,
    the20
  );

  check('REVERSAL: the SAME incident on 20/08, within the deadline → CUMPLE (pending)', onTime2.de('EV-08').status === 'CUMPLE' && /Dentro de plazo/.test(onTime2.de('EV-08').reason), onTime2.de('EV-08').reason);

  const withChange = evaluate(events(heartbeat(), ...records(), ...closed,
    alert({ event: 'auditable_events_revised', evidence_id: 'EV-08', fichero: '/var/ossec/etc/rules/local_rules.xml', modificado: '2026-08-10T09:00:00Z', sha256: 'c'.repeat(64), origen: 'cambio_detectado' }, ago(0.6))));

  check('rules change on 10/08: CUMPLE by temporal correlation', withChange.de('EV-08').status === 'CUMPLE' && /correlación temporal/.test(withChange.de('EV-08').reason));

  const withReview = evaluate(events(heartbeat(), ...records(), ...closed,
    alert({ event: 'incident_action_registered', evidence_id: 'EV-03,EV-04,EV-08', incidente_id: 'INC-5', fecha: '2026-08-15T09:00:00Z', sistema: '*', tipo: 'revision_eventos', objeto: '-', descripcion: 'sin cambios necesarios', referencia: 'acta' }, ago(0.6))));

  check('review recorded on 15/08 without changes: CUMPLE', withReview.de('EV-08').status === 'CUMPLE');

  const lowOne = evaluate(events(heartbeat(), ...records(), ...closed.map(a => a), ), { ...BASIC_ONES, 'P-07': ['critica | 15 |'] });

  check('P-07 binds only at critical severity: the high incident requires no review → CUMPLE', lowOne.de('EV-08').status === 'CUMPLE');

  const downgraded = evaluate(events(heartbeat(), ...records(),
    row('INC-5', 'inicial', '2026-08-01T10:00:00Z', { severidad: 'alta' }),
    row('INC-5', 'intermedio', '2026-08-02T10:00:00Z', { severidad: 'Crítica' }),
    row('INC-5', 'final', '2026-08-03T10:00:00Z', { severidad: 'baja' }),
    window('INC-5')), { ...BASIC_ONES, 'P-07': ['critica | 15 |'] });

  check(
    'critical in one phase and downgraded to low on closing: the highest counts → EV-08 NO_CUMPLE (severidad critica)',
    downgraded.de('EV-08').status === 'NO_CUMPLE' && /INC-5 \(severidad critica/.test(downgraded.de('EV-08').reason),
    downgraded.de('EV-08').reason
  );

  const withoutP07 = evaluate(events(heartbeat(), ...records(), ...closed), { ...BASIC_ONES, 'P-07': undefined });

  check('sin P-07: NO_EVALUABLE', withoutP07.de('EV-08').status === 'NO_EVALUABLE');
}

section('8. EV-09 and the requirement decisions');

{
  const withoutReference = evaluate(events(heartbeat(), ...records(),
    row('INC-1', 'inicial', '2026-09-10T10:00:00Z'),
    row('INC-1', 'intermedio', '2026-09-11T10:00:00Z', { referencia: '-' }),
    row('INC-1', 'final', '2026-09-12T10:00:00Z'),
    window('INC-1')));

  check('a row without a file reference: EV-09 NO_CUMPLE', withoutReference.de('EV-09').status === 'NO_CUMPLE');

  check(
    '... and it drags the three requirements, which rest on the file',
    ['op.exp.9.1', 'op.exp.9.2', 'op.exp.9.3'].every(r => withoutReference.principal(r).status === 'NO_CUMPLE')
  );

  const good = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001'),
    alert({ event: 'incident_action_registered', evidence_id: 'EV-03,EV-04,EV-08', incidente_id: 'INC-2026-001', fecha: '2026-09-20T09:00:00Z', sistema: '*', tipo: 'revision_eventos', objeto: '-', descripcion: 'x', referencia: 'y' }, ago(0.6))));

  check('well-run incident: op.exp.9.1 CUMPLE', good.principal('op.exp.9.1').status === 'CUMPLE', good.principal('op.exp.9.1').reason);
  check('op.exp.9.2 CUMPLE (no legal relevance or open incidents)', good.principal('op.exp.9.2').status === 'CUMPLE', good.principal('op.exp.9.2').reason);
  check('op.exp.9.3 CUMPLE (review recorded)', good.principal('op.exp.9.3').status === 'CUMPLE', good.principal('op.exp.9.3').reason);

  check(
    'the evaluated requirement comes out CUMPLE and measured',
    good.requisito('op.exp.9.1').status === 'CUMPLE' && good.requisito('op.exp.9.1').evidenced === true
  );

  check(
    'the bridge carries the measurement to the evidence table (EV-02 stops being grey)',
    good.puente.find(e => e.id === 'EV-02')?.status === 'CUMPLE'
  );

  const opened = evaluate(events(heartbeat(), ...records(), row('INC-9', 'inicial', ago(5)), window('INC-9', { abierto: 'si' })));

  check(
    'with an open incident, op.exp.9.2 stays NO_EVALUABLE because of EV-07 (indexer) and its verdict is not-evidenced NO_CUMPLE',
    opened.principal('op.exp.9.2').status === 'NO_EVALUABLE' &&
      opened.requisito('op.exp.9.2').status === 'NO_CUMPLE' &&
      opened.requisito('op.exp.9.2').evidenced === false
  );
}

section('9. Records are judged with the last pass, not with the 30-day window');

{
  const yesterday = ago(24);
  const antes = ago(24.1);
  const evs = events(
    heartbeat(yesterday),
    ...records({}, antes),
    row('INC-1', 'inicial', ago(30), { severidad: '-' }, antes),
    window('INC-1', {}, antes),
    heartbeat(),
    ...records(),
    row('INC-1', 'inicial', ago(30)),
    window('INC-1')
  );

  const r = evaluate(evs, { ...BASIC_ONES, 'P-02': ['inicial | |'] });

  check(
    'today\'s corrected row prevails: EV-02 CUMPLE even though yesterday the severity was missing',
    r.de('EV-02').status === 'CUMPLE',
    r.de('EV-02').reason
  );

  const onlyYesterday = evaluate(events(heartbeat(yesterday), ...records({}, antes), row('INC-1', 'inicial', ago(30), { severidad: '-' }, antes), window('INC-1', {}, antes), heartbeat()), { ...BASIC_ONES, 'P-02': ['inicial | |'] });

  check(
    'REVERSAL: if today\'s pass does not re-emit the record, it is not judged on yesterday\'s snapshot',
    onlyYesterday.de('EV-02').status !== 'CUMPLE',
    onlyYesterday.de('EV-02').reason
  );
}

section('10. The cause of what cannot be measured reaches the evidence and the requirement');

{
  const absent = evaluate(events(heartbeat(), ...records({ incidentes: { presente: 'no', legible: 'no', formato: '-', filas_validas: 0 } })));
  const ev01 = absent.puente.find(e => e.id === 'EV-01');

  check(
    'incident record absent: EV-01 unmeasured with cause CONFIGURATION, not EVIDENCE',
    ev01?.status === 'NO_EVALUABLE' && ev01?.gapCause === 'CONFIGURATION',
    `${ev01?.status} ${ev01?.gapCause}`
  );
  check(
    'and the op.exp.9.1 decision declares the same cause',
    absent.principal('op.exp.9.1').status === 'NO_EVALUABLE' && absent.principal('op.exp.9.1').cause === 'CONFIGURATION',
    `${absent.principal('op.exp.9.1').status} ${absent.principal('op.exp.9.1').cause}`
  );

  const withoutHeartbeat = evaluate(events(...records(), ...closedIncident(), window('INC-2026-001')));
  const ev02 = withoutHeartbeat.puente.find(e => e.id === 'EV-02');

  check(
    'without a collector heartbeat: EV-02 unmeasured with cause COLLECTION',
    ev02?.status === 'NO_EVALUABLE' && ev02?.gapCause === 'COLLECTION',
    `${ev02?.status} ${ev02?.gapCause}`
  );

  const withoutP07 = evaluate(events(heartbeat(), ...records(), ...closedIncident(), window('INC-2026-001')), { ...BASIC_ONES, 'P-07': undefined });
  const ev08 = withoutP07.puente.find(e => e.id === 'EV-08');

  check(
    'without P-07: EV-08 unmeasured with cause CONFIGURATION',
    ev08?.status === 'NO_EVALUABLE' && ev08?.gapCause === 'CONFIGURATION',
    `${ev08?.status} ${ev08?.gapCause}`
  );
}

console.log(`\n${failures.length ? `${failures.length} check(s) FAIL:\n  - ${failures.join('\n  - ')}` : 'all checks pass'}`);

process.exit(failures.length ? 1 : 0);
