/** op.mon.1: judgment of intrusion detection. */
import { opMon1PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-mon-1.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opMon1CatalogDefinition } from '../common/ens/catalog/op-mon-1';
import { opMon1Configuration } from '../common/ens/configuration/data/op-mon-1-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import { parseRequirementAttestations } from '../common/ens/configuration/services/attestation-service';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import { buildOpMon1ReportModel } from '../public/ens/reports/op-mon-1-report-model';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../common/ens/configuration/types';
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

type Line = Record<string, unknown>;

const HOURLY = '2026-10-09T11:05';
const COMPLETE = '2026-10-09T12:05';

const NOW = new Date('2026-10-09T12:30:00Z');

const motor = (ts: string, extra: Line = {}): Line => ({
  ts, event: 'detection_engine_status', evidence_id: 'EV-01', requisito: 'op.mon.1.1,op.mon.1.r1.1', plano: 'central',
  activo: 'si', eventos_recibidos: 1203345, eventos_procesados: 1203300, eventos_descartados: 0, alertas_escritas: 45210,
  fuente_contadores: '/var/ossec/var/run/wazuh-analysisd.state', alertas_nuevas: 812, ...extra,
});

const heartbeat = (ts: string, covered: string): Line => ({
  ts, event: 'collector_run', resultado: 'completada', evidencias_cubiertas: covered, tipo_servidor: 'manager', emisor: 'recolector',
});

const FULL_COVER = 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-07,EV-08';

const coverage = (ts: string, id: string, agent: string, estado: string, extra: Line = {}): Line => ({
  ts, event: 'detection_coverage_observed', evidence_id: 'EV-02', requisito: 'op.mon.1.1', plano: 'central',
  agente_id: id, agente: agent, estado_conexion: estado, ultimo_keepalive: '2026-10-09T12:04:50Z', version_agente: 'v4.14.7',
  grupos: 'default,ens', fim_ultimo_fin: '2026-10-09T06:02:11Z', sca_ultimo_fin: '2026-10-09T05:59:40Z',
  inventario_ultimo: '2026-10-09T11:20:03Z', ...extra,
});

const activity = (ts: string, id: string, agent: string, ultima: string, extra: Line = {}): Line => ({
  ts, event: 'detection_activity_observed', evidence_id: 'EV-03', requisito: 'op.mon.1.1', plano: 'central',
  agente_id: id, agente: agent, ultima_alerta: ultima, alertas_24h: 120, nivel_max_24h: 7, reglas_distintas_24h: 14,
  tecnicas_mitre: 'T1078,T1110', observado_desde: '2026-10-01T00:00:00Z', ...extra,
});

const whole = (ts: string, name: string, ruta: string, ids: string, rules: number, part = 1, parts = 1): Line => ({
  ts, event: 'ruleset_rules_loaded', evidence_id: 'EV-04', requisito: 'op.mon.1.1', plano: 'central',
  conjunto: name, ruta, ids, reglas: rules, parte: part, partes: parts,
});

const completePass = (ts = COMPLETE): Line[] => {
  const t = (s: number) => `${ts}:${String(s).padStart(2, '0')}Z`;

  return [
    motor(t(10), { eventos_procesados: 1210450, eventos_recibidos: 1210500, alertas_escritas: 45390 }),
    { ts: t(12), event: 'ruleset_version_observed', evidence_id: 'EV-01', requisito: 'op.mon.1.1,op.mon.1.r1.1', plano: 'central',
      version_wazuh: '4.14.7', origen_version: 'dpkg', fecha_ruleset: '2026-07-10T08:12:44Z', fichero_mas_reciente: '0580-win-security_rules.xml',
      ficheros: 167, reglas: 4510, reglas_mitre: 1013 },
    coverage(t(14), '000', 'Wazuh-4', 'active', { grupos: '-', fim_ultimo_fin: '2026-10-09T07:40:00Z', sca_ultimo_fin: '2026-10-09T03:15:00Z' }),
    coverage(t(14), '024', 'wazuh-real', 'active'),
    coverage(t(14), '027', 'srv-prueba', 'disconnected', { ultimo_keepalive: '2026-09-04T10:00:12Z', fim_ultimo_fin: '2026-09-04T09:40:00Z', sca_ultimo_fin: '2026-09-04T03:00:00Z' }),
    coverage(t(14), '028', 'ldap-zimbra', 'active', { fim_ultimo_fin: '2026-10-09T08:30:00Z', sca_ultimo_fin: '2026-10-09T08:31:00Z' }),
    coverage(t(14), '033', 'win-prueba', 'never_connected', { ultimo_keepalive: '-', version_agente: '-', grupos: '-', fim_ultimo_fin: '-', sca_ultimo_fin: '-', inventario_ultimo: '-' }),
    activity(t(16), '000', 'Wazuh-4', '2026-10-09T12:01:07Z', { alertas_24h: 866, nivel_max_24h: 10, reglas_distintas_24h: 41 }),
    activity(t(16), '024', 'wazuh-real', '2026-10-09T11:58:30Z', { alertas_24h: 2875 }),
    activity(t(16), '027', 'srv-prueba', '2026-09-04T09:58:00Z', { alertas_24h: 0, nivel_max_24h: 0, reglas_distintas_24h: 0, tecnicas_mitre: '-' }),
    activity(t(16), '028', 'ldap-zimbra', '2026-10-09T09:30:00Z', { alertas_24h: 64, tecnicas_mitre: '-' }),
    activity(t(16), '033', 'win-prueba', '-', { alertas_24h: 0, nivel_max_24h: 0, reglas_distintas_24h: 0, tecnicas_mitre: '-' }),
    whole(t(18), 'wazuh', '/var/ossec/ruleset/rules', '1002-1010,2501-2504,5104-5108,5401-5407,5501-5557,5701-5799,80700-80799,87100-87105', 4510),
    whole(t(18), 'local', '/var/ossec/etc/rules', '100001-100002', 2),
    whole(t(18), 'quersystem', '/var/ossec/etc/rules', '107201-107226', 26),
    { ts: t(20), event: 'network_detection_observed', evidence_id: 'EV-05', requisito: 'op.mon.1.1', plano: 'central',
      producto: 'ninguno', fuente: '-', ultima_alerta: '-', alertas_24h: 0 },
    { ts: t(22), event: 'active_response_configured', evidence_id: 'EV-07', requisito: 'op.mon.1.r3.1', plano: 'central',
      comando: 'firewall-drop', comando_definido: 'si', ubicacion: 'local', agente_id: '-', reglas_id: '5763', grupos: '-', nivel: '-', timeout: '180', deshabilitada: 'no' },
    { ts: t(22), event: 'active_response_configured', evidence_id: 'EV-07', requisito: 'op.mon.1.r3.1', plano: 'central',
      comando: 'quersystem-yara-linux', comando_definido: 'si', ubicacion: 'local', agente_id: '-', reglas_id: '108100,108101', grupos: '-', nivel: '-', timeout: '-', deshabilitada: 'no' },
    { ts: t(24), event: 'rule_silenced', evidence_id: 'EV-08', requisito: 'op.mon.1.r1.1', plano: 'central',
      tipo: 'fichero_excluido', objeto: '0215-policy_rules.xml', fichero: '/var/ossec/etc/ossec.conf' },
    heartbeat(t(40), FULL_COVER),
  ];
};

const hourlyPass = (ts = HOURLY, extra: Line = {}): Line[] => [
  motor(`${ts}:10Z`, extra),
  heartbeat(`${ts}:12Z`, 'EV-01'),
];

let counter = 0;

const RULE: Record<string, string> = {
  detection_engine_status: '111201', ruleset_version_observed: '111202', detection_coverage_observed: '111203',
  detection_activity_observed: '111204', ruleset_rules_loaded: '111205', network_detection_observed: '111206',
  active_response_configured: '111207', active_response_executed: '111208', rule_silenced: '111209',
  evidence_state: '111250', collector_run: '111297',
};

const MANAGER = { id: '000', name: 'Wazuh-4' };

const alert = (line: Line) => {
  counter += 1;
  const { ts, host: _host, ...data } = line as Line & { ts: string };

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts,
      agent: MANAGER,
      rule: { id: RULE[String(data.event)] || '111200', description: 'op.mon.1' },
      location: '/var/log/ensfacil/op_mon_1.json',
      data: Object.fromEntries(Object.entries({ ensfacil: 'op.mon.1', ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const events = (lines: Line[], changes: (l: Line) => Line | undefined = l => l): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lines
      .map(l => changes({ ...l }))
      .filter((l): l is Line => Boolean(l))
      .map(alert)
  );

const hoy = (changes?: (l: Line) => Line | undefined) =>
  events([...hourlyPass(), ...completePass()], changes);

type Values = Record<string, string[] | string | undefined>;

const configuration = (values: Values): ENSControlConfiguration => ({
  ...opMon1Configuration,
  parameters: opMon1Configuration.parameters.map(p => {
    const { value: _anterior, ...withoutValue } = p;

    return values[p.id] === undefined ? withoutValue : { ...withoutValue, value: values[p.id] };
  }),
});

const BASE: Values = {
  'P-01': ['Wazuh-4 | Ubuntu 22.04 | alta', 'wazuh-real | Ubuntu 24.04 | alta', '028 | Ubuntu 22.04 | alta'],
  'P-02': ['no | - | AR-2026 §4.2: sin amenazas de red que exijan inspección de tráfico'],
  'P-03': ['wazuh | ruleset oficial de Wazuh | 4510'],
  'P-04': ['acceso no autorizado por SSH | servidores Linux | 5710, 5712, 5720', 'escalada con sudo | servidores Linux | 5401-5403'],
  'P-05': ['intrusión en servidor | PR-18 Respuesta a intrusión | Responsable de Seguridad'],
  'P-06': ['0215-policy_rules.xml | exclusión de fábrica de Wazuh | RSI'],
  'P-07': ['firewall-drop | fuerza bruta SSH (5763) | agente | 180 s'],
  'P-08': '180',
  'P-09': '7',
  'P-10': '26',
};

const NO_PARAMETERS: Values = {};

const evaluate = (
  evs: ENSNormalizedEvent[],
  values: Values = BASE,
  level: ENSLevel = 'MEDIO',
  now: Date = NOW
) => {
  const cfg = configuration(values);
  const ofTheControl = keepLatestRunStateFacts('op.mon.1', evs, now);
  const evidences = resolveEvidenceForControl('op.mon.1', ofTheControl, '000', level, cfg, now);
  const context = buildPolicyContext(opMon1CatalogDefinition, cfg, level, ofTheControl, evidences, now);
  const { decisions, runtimeVariables } = opMon1PolicyDefinition.evaluator!(context);
  const tabla = applyPolicyDecisionsToEvidences(evidences, decisions, opMon1CatalogDefinition.requirements);
  const attestations = parseRequirementAttestations(cfg);
  const requirement = (id: string) =>
    evaluateRequirement(
      opMon1CatalogDefinition.requirements.find(q => q.id === id)!,
      level,
      tabla,
      false,
      decisions,
      'ACTIVE',
      attestations.get(id)
    );
  const evidence = (id: string) => tabla.find(e => e.id === id);
  const motive = (req: string) => decisions.find(d => d.requirementId === req)?.reason || '';
  const ofEvidence = (req: string, ev: string) => decisions.find(d => d.trace.ruleId === `${req}/${ev}`);
  const motor = () =>
    evaluateENSControl(
      opMon1CatalogDefinition,
      cfg,
      level,
      evidences,
      {
        controlId: 'op.mon.1',
        policyId: opMon1PolicyDefinition.id,
        evaluatedAt: now.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      ofTheControl
    );

  return { decisions, runtimeVariables, requisito: requirement, evidencia: evidence, motivo: motive, deEvidencia: ofEvidence, motor };
};

section('1. Catalog: system category, manager plane and reinforcements');

{
  const levels = (id: string) =>
    opMon1CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  check('op.mon.1 is governed by the category (no dimension of its own)', opMon1CatalogDefinition.levelDimension === undefined);
  check('se mide solo en el manager', JSON.stringify(opMon1CatalogDefinition.measurementPlanes) === '["manager"]');
  check('the base applies in the three categories', levels('op.mon.1.1') === 'BAJO,MEDIO,ALTO');
  check('R1 from MEDIA', levels('op.mon.1.r1.1') === 'MEDIO,ALTO');
  check('R2 only at ALTA', levels('op.mon.1.r2.1') === 'ALTO');
  check('R3 at none (defined, not required)', levels('op.mon.1.r3.1') === '');
  check('the control is ACTIVE', opMon1CatalogDefinition.status === 'ACTIVE', opMon1CatalogDefinition.status);
  check(
    'R2 declares no technical evidence (documentary: P-05 or P-ATT)',
    opMon1CatalogDefinition.requirements.find(r => r.id === 'op.mon.1.r2.1')!.evidenceIds.length === 0
  );
  check(
    'EV-06 is judged by no requirement (report datum)',
    opMon1CatalogDefinition.requirements.every(r => !r.evidenceIds.includes('EV-06'))
  );
  check(
    'the policy declares the same levels and evidences as the catalog',
    opMon1PolicyDefinition.requirements.every(r => {
      const c = opMon1CatalogDefinition.requirements.find(q => q.id === r.requirementId)!;

      return r.levels.join(',') === c.applicability.levels.join(',') && r.evidenceIds.join(',') === c.evidenceIds.join(',');
    })
  );
  check(
    'the engine and the series facts are not state facts; the 6 h ones are',
    !getStateFactEventTypes('op.mon.1').has('detection_engine_status') &&
      !getStateFactEventTypes('op.mon.1').has('ruleset_version_observed') &&
      !getStateFactEventTypes('op.mon.1').has('active_response_executed') &&
      ['detection_coverage_observed', 'detection_activity_observed', 'ruleset_rules_loaded', 'network_detection_observed', 'active_response_configured', 'rule_silenced'].every(t => getStateFactEventTypes('op.mon.1').has(t))
  );
}

section('2. Green: P-01 with the real systems, ruleset of 10/07 under P-08 = 180');

{
  const r = evaluate(hoy());

  check('op.mon.1.1 CUMPLE at MEDIA', r.requisito('op.mon.1.1').status === 'CUMPLE' && r.requisito('op.mon.1.1').evidenced === true, r.motivo('op.mon.1.1'));
  check('op.mon.1.r1.1 CUMPLE: 91-day ruleset, 0215-policy_rules.xml declared in P-06', r.requisito('op.mon.1.r1.1').status === 'CUMPLE', r.motivo('op.mon.1.r1.1'));
  check('R2 NO_APLICA at MEDIA', r.requisito('op.mon.1.r2.1').status === 'NO_APLICA', r.requisito('op.mon.1.r2.1').status);
  check('R3 NO_APLICA always', r.requisito('op.mon.1.r3.1').status === 'NO_APLICA', r.requisito('op.mon.1.r3.1').status);
  check('EV-01: the engine processes (7150 events between the two passes)', r.evidencia('EV-01')?.status === 'CUMPLE' && /7150 eventos entre/.test(r.motivo('op.mon.1.1')), r.motivo('op.mon.1.1'));
  check('EV-02 CUMPLE and names the declared LDAP by its ID', r.evidencia('EV-02')?.status === 'CUMPLE' && /028 \(ldap-zimbra, 028\)/.test(r.deEvidencia('op.mon.1.1', 'EV-02')?.reason || ''), r.deEvidencia('op.mon.1.1', 'EV-02')?.reason);
  check(
    'the test agents outside P-01 do not count, but are mentioned',
    /Fuera de P-01 hay 2 agente\(s\)/.test(r.deEvidencia('op.mon.1.1', 'EV-02')?.reason || '') && /srv-prueba 027 disconnected/.test(r.deEvidencia('op.mon.1.1', 'EV-02')?.reason || ''),
    r.deEvidencia('op.mon.1.1', 'EV-02')?.reason
  );
  check('EV-04 CUMPLE: 5710 and 5401-5403 loaded in the wazuh set', r.evidencia('EV-04')?.status === 'CUMPLE' && /5710 \(wazuh\)/.test(r.deEvidencia('op.mon.1.1', 'EV-04')?.reason || ''), r.deEvidencia('op.mon.1.1', 'EV-04')?.reason);
  check('EV-05 NO_APLICA: P-02 = no with the risk-analysis reference', r.evidencia('EV-05')?.status === 'NO_APLICA' && /AR-2026/.test(r.deEvidencia('op.mon.1.1', 'EV-05')?.reason || ''), r.evidencia('EV-05')?.status);
  check('EV-06 NO_APLICA at MEDIA (not of its category)', r.evidencia('EV-06')?.status === 'NO_APLICA', r.evidencia('EV-06')?.status);
  check(
    'EV-07 NO_APLICA with what there is: R3 is reported, without a verdict',
    r.evidencia('EV-07')?.status === 'NO_APLICA' && (r.evidencia('EV-07')?.observations || []).some(o => /se informa, sin veredicto/.test(o) && /firewall-drop/.test(o)),
    (r.evidencia('EV-07')?.observations || []).join(' | ')
  );
  check(
    'and R3\'s fact coverage travels as a variable (CUMPLE: firewall-drop with 180 s reversion)',
    r.runtimeVariables.find(v => v.name === 'cobertura_de_hecho_R3')?.value === 'CUMPLE',
    r.runtimeVariables.find(v => v.name === 'cobertura_de_hecho_R3')?.description
  );

  const basic = evaluate(hoy(), BASE, 'BAJO');
  check('at BÁSICA, R1 NO_APLICA and EV-08 too', basic.requisito('op.mon.1.r1.1').status === 'NO_APLICA' && basic.evidencia('EV-08')?.status === 'NO_APLICA', `${basic.requisito('op.mon.1.r1.1').status} ${basic.evidencia('EV-08')?.status}`);
  check(
    'at BÁSICA without P-03, EV-01 stays CUMPLE: P-03\'s sets belong to R1',
    evaluate(hoy(), { ...BASE, 'P-03': undefined }, 'BAJO').evidencia('EV-01')?.status === 'CUMPLE'
  );
  check('the report shows the requirements with their verdict', buildOpMon1ReportModel(r.motor()).fields[0].details.some(d => /op\.mon\.1\.1 .*: CUMPLE/.test(d)));
}

section('3. R2 at ALTA: P-05 accredits it documentarily; P-ATT if there is no P-05');

{
  const r = evaluate(hoy(), BASE, 'ALTO');
  const r2 = r.requisito('op.mon.1.r2.1');

  check('complete P-05 → R2 CUMPLE marked `attested`', r2.status === 'CUMPLE' && r2.attested === true && r2.evidenced === true, `${r2.status} ${r2.attested}`);
  check('and it reads «Acreditado documentalmente», not as measured', /^Acreditado documentalmente/.test(r2.observations[0] || ''), r2.observations[0]);
  check(
    'EV-06 comes out NO_APLICA as a report datum, not grey',
    r.evidencia('EV-06')?.status === 'NO_APLICA' && (r.evidencia('EV-06')?.observations || []).some(o => /Dato del informe/.test(o)),
    r.evidencia('EV-06')?.status
  );
  check(
    'the accreditation fills no evidence (the bridge ignores it)',
    r.decisions.filter(d => d.attested).every(d => d.evidenceIds.length === 0)
  );

  const report = buildOpMon1ReportModel(r.motor());
  const campoR2 = report.fields.find(f => f.id === 'op.mon.1.campo9')!;
  check('the report says «Acreditado documentalmente» in R2', campoR2.status === 'CUMPLE' && /Acreditado documentalmente/.test(campoR2.value), campoR2.value);

  const incompleteOne = evaluate(hoy(), { ...BASE, 'P-05': ['intrusión en servidor | PR-18 Respuesta a intrusión | '] }, 'ALTO');
  check(
    'a P-05 row without an owner does not accredit: R2 not proven, cause CONFIGURATION',
    incompleteOne.requisito('op.mon.1.r2.1').status === 'NO_CUMPLE' && incompleteOne.requisito('op.mon.1.r2.1').evidenced === false && incompleteOne.decisions.find(d => d.requirementId === 'op.mon.1.r2.1')?.cause === 'CONFIGURATION',
    incompleteOne.motivo('op.mon.1.r2.1')
  );

  const withoutP05 = evaluate(hoy(), { ...BASE, 'P-05': undefined }, 'ALTO');
  check('without P-05 or P-ATT → R2 not proven', withoutP05.requisito('op.mon.1.r2.1').status === 'NO_CUMPLE' && withoutP05.requisito('op.mon.1.r2.1').evidenced === false, withoutP05.requisito('op.mon.1.r2.1').status);

  const withAtt = evaluate(hoy(), { ...BASE, 'P-05': undefined, 'P-ATT': ['op.mon.1.r2.1 | PR-18 Respuesta a intrusión | https://intranet.ejemplo/pr-18.pdf | 2026-05-12 | Responsable de Seguridad'] }, 'ALTO');
  check('REVERSAL: without P-05 but with P-ATT → R2 accredited CUMPLE', withAtt.requisito('op.mon.1.r2.1').status === 'CUMPLE' && withAtt.requisito('op.mon.1.r2.1').attested === true, withAtt.requisito('op.mon.1.r2.1').status);
}

section('4. `attested` and P-ATT never cover a technical measure in NO_CUMPLE');

{
  const att = ['op.mon.1.1 | Plan de despliegue de agentes | https://intranet.ejemplo/despliegue.pdf | 2026-05-12 | Responsable de Seguridad'];
  const withTest = evaluate(hoy(), { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), '027 | Ubuntu 22.04 | baja'], 'P-ATT': att }, 'ALTO');

  check(
    'P-ATT for op.mon.1.1 with EV-02 in NO_CUMPLE → measured NO_CUMPLE, without the mark',
    withTest.requisito('op.mon.1.1').status === 'NO_CUMPLE' && withTest.requisito('op.mon.1.1').evidenced === true && !withTest.requisito('op.mon.1.1').attested,
    `${withTest.requisito('op.mon.1.1').status} ${withTest.requisito('op.mon.1.1').attested}`
  );
  check(
    'and R2\'s accreditation stays on its own, without dragging the base',
    withTest.requisito('op.mon.1.r2.1').status === 'CUMPLE' && withTest.requisito('op.mon.1.r2.1').attested === true
  );
}

section('5. Red: each axis with its reversal');

{
  const withTest = evaluate(hoy(), { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), 'srv-prueba | Ubuntu 22.04 | baja'] });
  check(
    'P-01 with the test agent disconnected → op.mon.1.1 NO_CUMPLE naming it',
    withTest.requisito('op.mon.1.1').status === 'NO_CUMPLE' && /srv-prueba \(027\): agente disconnected/.test(withTest.motivo('op.mon.1.1')),
    withTest.motivo('op.mon.1.1')
  );
  check(
    'and EV-03 does not count it twice: it leaves it to EV-02',
    withTest.evidencia('EV-03')?.status === 'CUMPLE' && /no están conectados \(los juzga EV-02\): srv-prueba \(027\)/.test(withTest.deEvidencia('op.mon.1.1', 'EV-03')?.reason || ''),
    withTest.deEvidencia('op.mon.1.1', 'EV-03')?.reason
  );

  const never = evaluate(hoy(), { ...BASE, 'P-01': ['033 | Windows | media'] });
  check('an agent that never connected → NO_CUMPLE (keepalive «nunca»)', never.evidencia('EV-02')?.status === 'NO_CUMPLE' && /never_connected, último keepalive nunca/.test(never.motivo('op.mon.1.1')), never.motivo('op.mon.1.1'));

  const nonexistent = evaluate(hoy(), { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), 'srv-web01 | Linux | alta'] });
  check('a P-01 system without an agent → NO_CUMPLE', nonexistent.evidencia('EV-02')?.status === 'NO_CUMPLE' && /srv-web01: no figura en la base de agentes/.test(nonexistent.motivo('op.mon.1.1')), nonexistent.motivo('op.mon.1.1'));

  const short = evaluate(hoy(), { ...BASE, 'P-10': '4' });
  check('P-10 = 4 h and wazuh-real\'s FIM ended at 06:02 → NO_CUMPLE', short.evidencia('EV-02')?.status === 'NO_CUMPLE' && /wazuh-real \(024\): la última pasada de FIM terminó/.test(short.motivo('op.mon.1.1')), short.motivo('op.mon.1.1'));
  check('REVERSAL: the same fact with P-10 = 26 h → CUMPLE', evaluate(hoy(), { ...BASE, 'P-10': '26' }).evidencia('EV-02')?.status === 'CUMPLE');
  const late = evaluate(hoy(), { ...BASE, 'P-10': '12' }, 'MEDIO', new Date('2026-10-10T08:00:00Z'));
  check(
    'the 12:05 read seen 20 h later, with P-10 = 12 h: the 06:02 FIM was 6 h old when read → EV-02 CUMPLE',
    late.evidencia('EV-02')?.status === 'CUMPLE',
    `${late.evidencia('EV-02')?.status} ${late.deEvidencia('op.mon.1.1', 'EV-02')?.reason}`
  );

  const withoutSca = evaluate(hoy(l => (l.event === 'detection_coverage_observed' && l.agente_id === '028' ? { ...l, sca_ultimo_fin: '-' } : l)));
  check('the LDAP with no SCA pass → the analysis is not active', withoutSca.evidencia('EV-02')?.status === 'NO_CUMPLE' && /ninguna pasada de SCA completada/.test(withoutSca.motivo('op.mon.1.1')), withoutSca.motivo('op.mon.1.1'));

  const silent2 = evaluate(hoy(l => (l.event === 'detection_activity_observed' && l.agente_id === '024' ? { ...l, ultima_alerta: '2026-09-29T08:00:00Z', alertas_24h: 0 } : l)));
  check('wazuh-real connected and 10 days without detections (P-09 = 7) → NO_CUMPLE', silent2.evidencia('EV-03')?.status === 'NO_CUMPLE' && /wazuh-real \(024\): 10 días sin ninguna detección/.test(silent2.motivo('op.mon.1.1')), silent2.motivo('op.mon.1.1'));
  check('REVERSAL: the same fact with P-09 = 15 → CUMPLE', evaluate(hoy(l => (l.event === 'detection_activity_observed' && l.agente_id === '024' ? { ...l, ultima_alerta: '2026-09-29T08:00:00Z', alertas_24h: 0 } : l)), { ...BASE, 'P-09': '15' }).evidencia('EV-03')?.status === 'CUMPLE');

  const mute = (since: string) => hoy(l => (l.event === 'detection_activity_observed' && l.agente_id === '028' ? { ...l, ultima_alerta: '-', alertas_24h: 0, observado_desde: since } : l));
  check('the LDAP with no detection since it is observed (09/09) → NO_CUMPLE', evaluate(mute('2026-09-09T00:00:00Z')).evidencia('EV-03')?.status === 'NO_CUMPLE');
  check(
    'REVERSAL: no detections but observed only since yesterday → cannot be asserted: NO_EVALUABLE, never CUMPLE',
    evaluate(mute('2026-10-08T12:00:00Z')).evidencia('EV-03')?.status === 'NO_EVALUABLE',
    evaluate(mute('2026-10-08T12:00:00Z')).evidencia('EV-03')?.status
  );

  const blind = evaluate(hoy(), { ...BASE, 'P-04': [...(BASE['P-04'] as string[]), 'alteración del directorio LDAP | ldap-zimbra | ninguna'] });
  check('a situation declared without a rule (blind spot) → NO_CUMPLE', blind.evidencia('EV-04')?.status === 'NO_CUMPLE' && /puntos ciegos declarados: «alteración del directorio LDAP»/.test(blind.motivo('op.mon.1.1')), blind.motivo('op.mon.1.1'));
  const withDate = (cell: string) => evaluate(hoy(), { ...BASE, 'P-04': [...(BASE['P-04'] as string[]), `alteración del directorio LDAP | ldap-zimbra | ${cell}`] });
  ['pendiente 2026-12', 'CVE-2021-44228', 'AR-2026-04'].forEach(cell => {
    const r = withDate(cell);

    check(
      `«${cell}» in the rules column is not read as a range: NO_EVALUABLE by CONFIGURATION naming the situation, never CUMPLE`,
      r.evidencia('EV-04')?.status === 'NO_EVALUABLE' && r.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /situación «alteración del directorio LDAP»/.test(r.motivo('op.mon.1.1')),
      `${r.evidencia('EV-04')?.status} ${r.evidencia('EV-04')?.gapCause} ${r.motivo('op.mon.1.1')}`
    );
  });
  ['2026-12', '5710, 2026-12'].forEach(cell => {
    const r = withDate(cell);

    check(
      `«${cell}»: a reversed range (12-2026 is not read) → NO_EVALUABLE by CONFIGURATION naming the situation, never CUMPLE`,
      r.evidencia('EV-04')?.status === 'NO_EVALUABLE' && r.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /situación «alteración del directorio LDAP»: «2026-12» no es un rango de reglas/.test(r.motivo('op.mon.1.1')),
      `${r.evidencia('EV-04')?.status} ${r.evidencia('EV-04')?.gapCause} ${r.motivo('op.mon.1.1')}`
    );
  });
  check('REVERSAL: the same range from lower to higher («12-2026») is read and covers → CUMPLE', withDate('12-2026').evidencia('EV-04')?.status === 'CUMPLE');
  const cve = withDate('2021-44228');
  check(
    '«2021-44228» (a CVE) spans 42,208 ids → NO_EVALUABLE by CONFIGURATION naming the situation and asking to split it, never CUMPLE',
    cve.evidencia('EV-04')?.status === 'NO_EVALUABLE' && cve.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /situación «alteración del directorio LDAP»: «2021-44228» abarca más de 10000 ids/.test(cve.motivo('op.mon.1.1')) && /parte el rango/.test(cve.motivo('op.mon.1.1')),
    `${cve.evidencia('EV-04')?.status} ${cve.motivo('op.mon.1.1')}`
  );
  check('REVERSAL: «5700-5799», a real band, is accepted and covers → CUMPLE', withDate('5700-5799').evidencia('EV-04')?.status === 'CUMPLE');
  check('and the limit is inclusive: «5000-14999» (10,000 ids) is accepted', withDate('5000-14999').evidencia('EV-04')?.status === 'CUMPLE');
  check('REVERSAL: «ninguna» is the declared blind spot → measured NO_CUMPLE', withDate('ninguna').evidencia('EV-04')?.status === 'NO_CUMPLE');
  check('and «5710; 5712 80700 - 80799» is a valid list → CUMPLE', withDate('5710; 5712 80700 - 80799').evidencia('EV-04')?.status === 'CUMPLE');

  const notLoaded = evaluate(hoy(), { ...BASE, 'P-04': ['exfiltración por DNS | perímetro | 99001, 99002'] });
  check('a situation with rules the manager does not load → NO_CUMPLE', notLoaded.evidencia('EV-04')?.status === 'NO_CUMPLE' && /99001, 99002/.test(notLoaded.motivo('op.mon.1.1')), notLoaded.motivo('op.mon.1.1'));
  const range = evaluate(hoy(), { ...BASE, 'P-04': ['exfiltración por DNS | perímetro | 99001, 80700-80705'] });
  check('REVERSAL: one loaded rule is enough, also by range → CUMPLE, and names the missing one', range.evidencia('EV-04')?.status === 'CUMPLE' && /declaradas y no cargadas: 99001/.test(range.deEvidencia('op.mon.1.1', 'EV-04')?.reason || ''), range.deEvidencia('op.mon.1.1', 'EV-04')?.reason);

  const parado = evaluate(events([...hourlyPass(HOURLY, { eventos_procesados: 1210450 }), ...completePass()]));
  check('the engine counter does not move between passes → NO_CUMPLE (running, but not analyzing)', parado.evidencia('EV-01')?.status === 'NO_CUMPLE' && /no ha procesado ningún evento/.test(parado.motivo('op.mon.1.1')), parado.motivo('op.mon.1.1'));
  const restart = evaluate(events([...hourlyPass(HOURLY, { eventos_procesados: 9999999 }), ...completePass()]));
  check('REVERSAL: the counter drops (restart) and there are events since → CUMPLE', restart.evidencia('EV-01')?.status === 'CUMPLE' && /se reinició/.test(restart.motivo('op.mon.1.1')), restart.motivo('op.mon.1.1'));
  const down = evaluate(hoy(l => (l.event === 'detection_engine_status' && String(l.ts).startsWith(COMPLETE) ? { ...l, activo: 'no' } : l)));
  check('wazuh-manager not active → NO_CUMPLE', down.evidencia('EV-01')?.status === 'NO_CUMPLE' && /no está activo/.test(down.motivo('op.mon.1.1')), down.motivo('op.mon.1.1'));
  const withoutCounters = evaluate(hoy(l => (l.event === 'detection_engine_status' ? { ...l, eventos_procesados: '-', fuente_contadores: '-' } : l)));
  check('without engine counters, alerts.json grows → CUMPLE by the alerts', withoutCounters.evidencia('EV-01')?.status === 'CUMPLE' && /812 alertas de detección nuevas en alerts.json desde la pasada anterior, sin contar las de ENSFácil/.test(withoutCounters.motivo('op.mon.1.1')), withoutCounters.motivo('op.mon.1.1'));
  const ensfacilOnly = evaluate(hoy(l => (l.event === 'detection_engine_status' ? { ...l, eventos_procesados: '-', fuente_contadores: '-', alertas_nuevas: 0 } : l)));
  check(
    'without counters and without new detection alerts (ENSFácil facts do not count) → NO_EVALUABLE, never CUMPLE',
    ensfacilOnly.evidencia('EV-01')?.status === 'NO_EVALUABLE' && /no hay alertas de detección nuevas/.test(ensfacilOnly.motivo('op.mon.1.1')),
    ensfacilOnly.motivo('op.mon.1.1')
  );
  const blindOne = evaluate(hoy(l => (l.event === 'detection_engine_status' ? { ...l, eventos_procesados: '-', fuente_contadores: '-', alertas_nuevas: '-' } : l)));
  check('without counters or readable alerts → NO_EVALUABLE by COLLECTION, never CUMPLE', blindOne.evidencia('EV-01')?.status === 'NO_EVALUABLE' && blindOne.evidencia('EV-01')?.gapCause === 'COLLECTION', `${blindOne.evidencia('EV-01')?.status} ${blindOne.evidencia('EV-01')?.gapCause}`);

  const old = evaluate(hoy(), { ...BASE, 'P-08': '60' });
  check('ruleset of 10/07 (91 days) with P-08 = 60 → R1 NO_CUMPLE', old.requisito('op.mon.1.r1.1').status === 'NO_CUMPLE' && /91 días, más que los 60 de P-08/.test(old.motivo('op.mon.1.r1.1')), old.motivo('op.mon.1.r1.1'));
  const silence = evaluate(hoy(l => l), { ...BASE, 'P-06': ['5715 | escáner interno autorizado | RSI'] });
  check('0215-policy_rules.xml excluded and not declared in P-06 → R1 NO_CUMPLE', silence.requisito('op.mon.1.r1.1').status === 'NO_CUMPLE' && /Silenciamientos que P-06 no declara: 0215-policy_rules.xml/.test(silence.motivo('op.mon.1.r1.1')), silence.motivo('op.mon.1.r1.1'));
  const unapproved = evaluate(hoy(), { ...BASE, 'P-06': ['0215-policy_rules.xml | exclusión de fábrica de Wazuh | '] });
  check('declared without who approved it → R1 NO_CUMPLE', unapproved.requisito('op.mon.1.r1.1').status === 'NO_CUMPLE' && /sin quién lo aprobó/.test(unapproved.motivo('op.mon.1.r1.1')), unapproved.motivo('op.mon.1.r1.1'));
  const level0 = evaluate(hoy(l => (l.event === 'rule_silenced' ? { ...l, tipo: 'regla_nivel0', objeto: '5710', fichero: '/var/ossec/etc/rules/local_rules.xml' } : l)));
  check('5710 rewritten to level 0 without P-06 → R1 NO_CUMPLE', level0.requisito('op.mon.1.r1.1').status === 'NO_CUMPLE' && /5710 \(regla a nivel 0/.test(level0.motivo('op.mon.1.r1.1')), level0.motivo('op.mon.1.r1.1'));
  const nothing = evaluate(hoy(l => (l.event === 'rule_silenced' ? { ...l, tipo: 'ninguno', objeto: '-', fichero: '-' } : l)), { ...BASE, 'P-06': undefined });
  check('REVERSAL: without silencing, P-06 is not needed → R1 CUMPLE', nothing.requisito('op.mon.1.r1.1').status === 'CUMPLE', nothing.motivo('op.mon.1.r1.1'));

  const missingSet = evaluate(hoy(), { ...BASE, 'P-03': ['wazuh | x | x', 'sigma | x | x'] });
  check('a P-03 set that the manager does not load → R1 NO_CUMPLE', missingSet.requisito('op.mon.1.r1.1').status === 'NO_CUMPLE' && /no carga: sigma/.test(missingSet.motivo('op.mon.1.r1.1')), missingSet.motivo('op.mon.1.r1.1'));

  const requires = { ...BASE, 'P-02': ['sí | Suricata | AR-2026 §4.2: segmento DMZ'] };
  check('P-02 requires Suricata and the manager ingests no NIDS → NO_CUMPLE', evaluate(hoy(), requires).evidencia('EV-05')?.status === 'NO_CUMPLE');
  const withSuricata = (ultima: string) =>
    hoy(l => (l.event === 'network_detection_observed' ? { ...l, producto: 'suricata', fuente: '/var/log/suricata/eve.json', ultima_alerta: ultima, alertas_24h: 31 } : l));
  check('REVERSAL: with Suricata via eve.json and today\'s alerts → CUMPLE', evaluate(withSuricata('2026-10-09T10:00:00Z'), requires).evidencia('EV-05')?.status === 'CUMPLE');
  check('Suricata with its last alert 20 days ago (P-09 = 7) → NO_CUMPLE', evaluate(withSuricata('2026-09-19T10:00:00Z'), requires).evidencia('EV-05')?.status === 'NO_CUMPLE');
  const unjustified = evaluate(hoy(), { ...BASE, 'P-02': ['no |  | '] });
  check('P-02 = no without a risk-analysis reference → not proven, cause CONFIGURATION', unjustified.evidencia('EV-05')?.status === 'NO_EVALUABLE' && unjustified.evidencia('EV-05')?.gapCause === 'CONFIGURATION', `${unjustified.evidencia('EV-05')?.status} ${unjustified.evidencia('EV-05')?.gapCause}`);
}

section('6. Without parameters: NO_EVALUABLE with cause CONFIGURATION, never CUMPLE by emptiness');

{
  const r = evaluate(hoy(), NO_PARAMETERS, 'ALTO');

  ['op.mon.1.1', 'op.mon.1.r1.1', 'op.mon.1.r2.1'].forEach(id =>
    check(`${id} not proven (unmeasured NO_CUMPLE)`, r.requisito(id).status === 'NO_CUMPLE' && r.requisito(id).evidenced === false, `${r.requisito(id).status} ${r.requisito(id).evidenced}`)
  );
  ['EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-08'].forEach(id =>
    check(`${id} unmeasured by CONFIGURATION`, r.evidencia(id)?.status === 'NO_EVALUABLE' && r.evidencia(id)?.gapCause === 'CONFIGURATION', `${r.evidencia(id)?.status} ${r.evidencia(id)?.gapCause}`)
  );
  check('EV-01 is measured all the same (it depends on no parameter in the base)', r.deEvidencia('op.mon.1.1', 'EV-01')?.status === 'CUMPLE');
  const r1 = r.decisions.find(d => d.trace.ruleId === 'op.mon.1.r1.1');
  check(
    'and without P-03, R1 is left unmeasured by CONFIGURATION, naming P-03 and not EV-01',
    r1?.status === 'NO_EVALUABLE' && r1?.cause === 'CONFIGURATION' && r1?.evidenceIds.includes('P-03') && !r1?.evidenceIds.includes('EV-01'),
    `${r1?.status} ${r1?.cause} ${r1?.evidenceIds}`
  );

  const withoutP03 = evaluate(hoy(), { ...BASE, 'P-03': undefined });
  check(
    'without P-03 at MEDIA: op.mon.1.1 CUMPLE, EV-01 CUMPLE in the table and R1 not proven by CONFIGURATION',
    withoutP03.requisito('op.mon.1.1').status === 'CUMPLE' &&
      withoutP03.evidencia('EV-01')?.status === 'CUMPLE' &&
      withoutP03.requisito('op.mon.1.r1.1').status === 'NO_CUMPLE' &&
      withoutP03.requisito('op.mon.1.r1.1').evidenced === false &&
      withoutP03.motor().nonConformities.some(n => n.requirementId === 'op.mon.1.r1.1' && n.origin === 'NO_EVIDENCIADA'),
    `${withoutP03.requisito('op.mon.1.1').status} ${withoutP03.evidencia('EV-01')?.status} ${withoutP03.requisito('op.mon.1.r1.1').status}`
  );
  check('EV-02\'s motive names the parameter and what there is', /P-01 \(Alcance de la detección en host\) está sin configurar/.test(r.motivo('op.mon.1.1')) && /5 agentes registrados/.test(r.motivo('op.mon.1.1')), r.motivo('op.mon.1.1'));

  const onlyP09 = evaluate(hoy(), { ...BASE, 'P-09': undefined });
  check('only P-09 missing → op.mon.1.1 not proven, EV-03 CONFIGURATION', onlyP09.requisito('op.mon.1.1').evidenced === false && onlyP09.evidencia('EV-03')?.gapCause === 'CONFIGURATION');
  const onlyP10 = evaluate(hoy(), { ...BASE, 'P-10': undefined });
  check('only P-10 missing → EV-02 CONFIGURATION, naming the connected ones', onlyP10.evidencia('EV-02')?.gapCause === 'CONFIGURATION' && /con el agente conectado: Wazuh-4/.test(onlyP10.deEvidencia('op.mon.1.1', 'EV-02')?.reason || ''), onlyP10.deEvidencia('op.mon.1.1', 'EV-02')?.reason);
  const onlyP08 = evaluate(hoy(), { ...BASE, 'P-08': undefined });
  check('only P-08 missing → R1 not proven, CONFIGURATION', onlyP08.requisito('op.mon.1.r1.1').evidenced === false && onlyP08.evidencia('EV-08')?.gapCause === 'CONFIGURATION');
  const invalid = configuration(BASE)
    .parameters.map(p => ({ id: p.id, veredicto: validateParameterValue(p, p.value) }))
    .filter(v => !v.veredicto.valid);
  check(
    'the BASE values are valid for their tables (P-02 with the «sí»/«no» option of the dropdown)',
    invalid.length === 0,
    invalid.map(v => `${v.id}: ${v.veredicto.reason}`).join('; ')
  );
}

section('7. Without a collector or with the source broken: NO_EVALUABLE by COLLECTION');

{
  const nothing = evaluate([]);
  check('without any fact → op.mon.1.1 not proven', nothing.requisito('op.mon.1.1').evidenced === false);
  check('and EV-02 by COLLECTION, not by configuration', nothing.evidencia('EV-02')?.gapCause === 'COLLECTION', nothing.evidencia('EV-02')?.gapCause);

  const withoutEngine = evaluate(hoy(), BASE, 'MEDIO', new Date('2026-10-09T16:10:00Z'));
  check(
    'four hours without engine state (it passes every hour) → EV-01 NO_EVALUABLE by COLLECTION, naming analysisd',
    withoutEngine.evidencia('EV-01')?.status === 'NO_EVALUABLE' && withoutEngine.evidencia('EV-01')?.gapCause === 'COLLECTION' && /wazuh-analysisd/.test(withoutEngine.motivo('op.mon.1.1')),
    `${withoutEngine.evidencia('EV-01')?.status} ${withoutEngine.motivo('op.mon.1.1')}`
  );
  check('and op.mon.1.1 stops complying: not proven', withoutEngine.requisito('op.mon.1.1').status === 'NO_CUMPLE' && withoutEngine.requisito('op.mon.1.1').evidenced === false);
  check('while the 6 h facts, with four hours, are still valid', withoutEngine.evidencia('EV-02')?.status === 'CUMPLE' && withoutEngine.evidencia('EV-04')?.status === 'CUMPLE');
  const withEngine = evaluate(hoy(), BASE, 'MEDIO', new Date('2026-10-09T14:30:00Z'));
  check('REVERSAL: at 2 h 25 min from the last engine state → EV-01 CUMPLE', withEngine.evidencia('EV-01')?.status === 'CUMPLE', withEngine.evidencia('EV-01')?.status);

  const old = evaluate(hoy(), BASE, 'MEDIO', new Date('2026-10-11T12:30:00Z'));
  check('two days without passes: the state does not describe today → not proven', old.requisito('op.mon.1.1').evidenced === false && /no está informando/.test(old.motivo('op.mon.1.1')), old.motivo('op.mon.1.1'));

  const withoutBase = evaluate(hoy().concat(events([
    { ts: `${COMPLETE}:30Z`, event: 'evidence_state', evidence_id: 'EV-02', requisito: 'op.mon.1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer la base de agentes del manager /var/ossec/queue/db/global.db' },
  ])));
  check('global.db unreadable in the last pass → NO_EVALUABLE with the collector\'s motive', withoutBase.evidencia('EV-02')?.status === 'NO_EVALUABLE' && /global\.db/.test(withoutBase.motivo('op.mon.1.1')), withoutBase.motivo('op.mon.1.1'));

  const withTest = { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), '027 | x | x'] };
  const withoutBaseWithFailure = evaluate(hoy().concat(events([
    { ts: `${COMPLETE}:30Z`, event: 'evidence_state', evidence_id: 'EV-02', requisito: 'op.mon.1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer la base de agentes del manager /var/ossec/queue/db/global.db' },
  ])), withTest);
  check(
    'global.db unreadable after a pass with a P-01 system disconnected → the measurement prevails: NO_CUMPLE, and the degradation is stated apart',
    withoutBaseWithFailure.evidencia('EV-02')?.status === 'NO_CUMPLE' && /027.*disconnected/.test(withoutBaseWithFailure.motivo('op.mon.1.1')) && /Además: El recolector no ha podido medirlo/.test(withoutBaseWithFailure.motivo('op.mon.1.1')),
    withoutBaseWithFailure.motivo('op.mon.1.1')
  );

  const withoutCoverage = (ts: string) =>
    evaluate(hoy(l => (l.event === 'detection_coverage_observed' ? undefined : l)).concat(events([
      { ts, event: 'evidence_state', evidence_id: 'EV-02', requisito: 'op.mon.1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer la base de agentes del manager /var/ossec/queue/db/global.db' },
    ])));
  const old3 = withoutCoverage('2026-10-07T12:05:30Z');
  check(
    'an evidence_state from two days ago is not used as today\'s motive',
    old3.evidencia('EV-02')?.status === 'NO_EVALUABLE' && !/global\.db/.test(old3.motivo('op.mon.1.1')) && /No consta ningún estado de los agentes/.test(old3.motivo('op.mon.1.1')),
    old3.motivo('op.mon.1.1')
  );
  check('REVERSAL: the same evidence_state from today does give the motive', /global\.db/.test(withoutCoverage(`${COMPLETE}:30Z`).motivo('op.mon.1.1')));

  const readError = (id: string) =>
    hoy(l => (l.event === 'detection_coverage_observed' && l.agente_id === id ? { ...l, lectura: 'error', fim_ultimo_fin: '-', sca_ultimo_fin: '-', inventario_ultimo: '-' } : l));
  check('the unreadable database of an agent OUTSIDE P-01 (027) blocks nothing → EV-02 CUMPLE', evaluate(readError('027')).evidencia('EV-02')?.status === 'CUMPLE');
  const unreadableLdap = evaluate(readError('028'));
  check(
    'the unreadable database of a P-01 system (028) → NO_EVALUABLE by COLLECTION naming it, not NO_CUMPLE for «ninguna pasada»',
    unreadableLdap.evidencia('EV-02')?.status === 'NO_EVALUABLE' && unreadableLdap.evidencia('EV-02')?.gapCause === 'COLLECTION' && /028 \(ldap-zimbra, 028\): el recolector no ha podido leer su base/.test(unreadableLdap.motivo('op.mon.1.1')),
    `${unreadableLdap.evidencia('EV-02')?.status} ${unreadableLdap.motivo('op.mon.1.1')}`
  );
  const ambos = evaluate(readError('028'), withTest);
  check(
    'and with another P-01 system disconnected, the measurement prevails → NO_CUMPLE',
    ambos.evidencia('EV-02')?.status === 'NO_CUMPLE' && /027.*disconnected/.test(ambos.motivo('op.mon.1.1')),
    ambos.motivo('op.mon.1.1')
  );

  const foreignOne = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': `${COMPLETE}:14Z`,
      agent: MANAGER,
      data: { ensfacil: 'op.exp.8', event: 'detection_coverage_observed', evidence_id: 'EV-02', agente_id: '024', agente: 'wazuh-real', estado_conexion: 'active' },
    },
  }]);
  check('a fact from another control does not accredit op.mon.1', evaluate(foreignOne).evidencia('EV-02')?.status !== 'CUMPLE');
}

section('8. P-01 is matched by ID or EXACT name, without mixing agents');

{
  const via = (p01: string[]) => evaluate(hoy(), { ...BASE, 'P-01': p01 });

  check('«24» is agent 024 (ID without zeros)', via(['24 | Linux | alta']).evidencia('EV-02')?.status === 'CUMPLE');
  check('«WAZUH-REAL» is wazuh-real (ignoring case)', via(['WAZUH-REAL | Linux | alta']).evidencia('EV-02')?.status === 'CUMPLE');
  check('«000» es el manager', via(['000 | Linux | alta']).evidencia('EV-02')?.status === 'CUMPLE');
  const withoutZeros = evaluate(hoy(l => (l.agente_id === '028' ? { ...l, agente_id: '28' } : l)));
  check(
    'a fact with the ID without zeros («28») matches P-01 «028»: the fact\'s ID is normalized the same',
    withoutZeros.evidencia('EV-02')?.status === 'CUMPLE' && withoutZeros.evidencia('EV-03')?.status === 'CUMPLE',
    `${withoutZeros.evidencia('EV-02')?.status} ${withoutZeros.motivo('op.mon.1.1')}`
  );
  check(
    '«wazuh-rea» is NOT wazuh-real: never by similarity',
    via(['wazuh-rea | Linux | alta']).evidencia('EV-02')?.status === 'NO_CUMPLE' && /wazuh-rea: no figura/.test(via(['wazuh-rea | Linux | alta']).motivo('op.mon.1.1'))
  );

  const duplicated = (l: Line): Line[] =>
    (l.event === 'detection_coverage_observed' || l.event === 'detection_activity_observed') && l.agente_id === '024'
      ? [l, { ...l, agente_id: '041', ...(l.event === 'detection_coverage_observed' ? { estado_conexion: 'disconnected' } : {}) }]
      : [l];
  const twoNames = events([...hourlyPass(), ...completePass().flatMap(duplicated)]);
  const ambiguous = evaluate(twoNames);
  check(
    'a name with two agents (024 and 041) → not chosen: NO_EVALUABLE by CONFIGURATION asking for the ID',
    ambiguous.evidencia('EV-02')?.status === 'NO_EVALUABLE' && ambiguous.evidencia('EV-02')?.gapCause === 'CONFIGURATION' && /Decláralo por su ID/.test(ambiguous.motivo('op.mon.1.1')),
    `${ambiguous.evidencia('EV-02')?.status} ${ambiguous.motivo('op.mon.1.1')}`
  );
  const byId = evaluate(twoNames, { ...BASE, 'P-01': ['Wazuh-4 | x | x', '024 | x | x', '028 | x | x'] });
  check('REVERSAL: declared by its ID (024) → CUMPLE, and the old disconnected one does not count', byId.evidencia('EV-02')?.status === 'CUMPLE' && /041 disconnected/.test(byId.deEvidencia('op.mon.1.1', 'EV-02')?.reason || ''), byId.deEvidencia('op.mon.1.1', 'EV-02')?.reason);
  const byOldId = evaluate(twoNames, { ...BASE, 'P-01': ['Wazuh-4 | x | x', '041 | x | x', '028 | x | x'] });
  check('and declaring the old one (041) by its ID → NO_CUMPLE: it is disconnected', byOldId.evidencia('EV-02')?.status === 'NO_CUMPLE');
}

section('9. State facts: the hourly pass does not delete the 6 h ones; the 6 h pass does replace the previous one');

{
  const morning = '2026-10-09T06:05';
  const hourlyOnes = ['07', '08', '09', '10', '11'].flatMap((h, i) =>
    hourlyPass(`2026-10-09T${h}:05`, { eventos_procesados: 1203300 + i * 1000 })
  );
  const connected = (l: Line) =>
    l.agente_id !== '027'
      ? l
      : l.event === 'detection_coverage_observed'
      ? { ...l, estado_conexion: 'active', ultimo_keepalive: '2026-10-09T06:04:30Z', fim_ultimo_fin: '2026-10-09T05:10:00Z', sca_ultimo_fin: '2026-10-09T05:12:00Z' }
      : l.event === 'detection_activity_observed'
      ? { ...l, ultima_alerta: '2026-10-09T05:30:00Z', alertas_24h: 40 }
      : l;
  const p01WithTest = { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), '027 | x | x'] };
  const morningEvs = events([...completePass(morning).map(connected), ...hourlyOnes]);
  const a1130 = evaluate(morningEvs, p01WithTest, 'MEDIO', new Date('2026-10-09T11:30:00Z'));

  check(
    'at 11:30, five hourly passes later: EV-02, EV-04 and EV-08 are still measured with the 06:05 pass',
    ['EV-02', 'EV-04'].every(id => a1130.evidencia(id)?.status === 'CUMPLE') && a1130.requisito('op.mon.1.r1.1').status === 'CUMPLE',
    ['EV-02', 'EV-04', 'EV-08'].map(id => `${id} ${a1130.evidencia(id)?.status}`).join(', ')
  );

  const late = evaluate(
    events([...completePass(morning).map(connected), ...hourlyOnes, ...completePass()]),
    p01WithTest
  );
  check(
    'at 12:30, the complete 12:05 pass replaces the 06:05 one: 027 is now disconnected → NO_CUMPLE',
    late.evidencia('EV-02')?.status === 'NO_CUMPLE' && /027.*disconnected/.test(late.motivo('op.mon.1.1')),
    late.motivo('op.mon.1.1')
  );
}

section('10. Volume: the ids of a large set fit in logcollector lines');

{
  const ID_LIMIT = 6000;
  const compresses = (ids: number[]): string[] => {
    const output: string[] = [];
    let i = 0;

    while (i < ids.length) {
      let j = i;

      while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) {
        j += 1;
      }

      output.push(i === j ? String(ids[i]) : `${ids[i]}-${ids[j]}`);
      i = j + 1;
    }

    return output;
  };
  const part = (chunks: string[]): string[] => {
    const parts: string[] = [];
    let actual = '';

    chunks.forEach(t => {
      if (actual && actual.length + 1 + t.length > ID_LIMIT) {
        parts.push(actual);
        actual = t;
      } else {
        actual = actual ? `${actual},${t}` : t;
      }
    });

    return actual ? [...parts, actual] : parts;
  };

  const ids = Array.from({ length: 39667 }, (_, k) => 1000 + k * 3);
  const chunks = part(compresses(ids));
  const ts = `${COMPLETE}:18Z`;
  const lines = chunks.map((s, k) => whole(ts, 'wazuh', '/var/ossec/ruleset/rules', s, ids.length, k + 1, chunks.length));
  const bytes = lines.map(l => new TextEncoder().encode(JSON.stringify({ ensfacil: 'op.mon.1', host: 'Wazuh-4', ...l })).length);

  check(
    `${chunks.length} parts, no line exceeds 8 KiB (logcollector cuts at 64 KiB; the indexer does not index a term over 32 KiB)`,
    chunks.length > 1 && Math.max(...bytes) <= 8192,
    Math.max(...bytes)
  );

  const largo = (remove?: number) =>
    events([
      ...hourlyPass(),
      ...completePass().filter(l => !(l.event === 'ruleset_rules_loaded' && l.conjunto === 'wazuh')),
      ...lines.filter((_, k) => k !== remove),
    ]);
  const lastPart = ranges(chunks[chunks.length - 1])[0];
  const p04 = { ...BASE, 'P-04': [`situación de la última parte | x | ${lastPart}`] };

  const whole2 = evaluate(largo(), p04);
  check(`with all parts, rule ${lastPart} (the last one's) is loaded → CUMPLE`, whole2.evidencia('EV-04')?.status === 'CUMPLE', whole2.deEvidencia('op.mon.1.1', 'EV-04')?.reason);

  const withoutOne = evaluate(largo(chunks.length - 1), p04);
  check(
    'if a part is missing, a rule that does not appear is not taken as not loaded: NO_EVALUABLE by COLLECTION',
    withoutOne.evidencia('EV-04')?.status === 'NO_EVALUABLE' && withoutOne.evidencia('EV-04')?.gapCause === 'COLLECTION' && /faltan partes del inventario de wazuh/.test(withoutOne.motivo('op.mon.1.1')),
    `${withoutOne.evidencia('EV-04')?.status} ${withoutOne.motivo('op.mon.1.1')}`
  );
  const otherPart = ranges(chunks[0])[0];
  check(
    'and a rule that does appear in the parts that arrived still counts → CUMPLE',
    evaluate(largo(chunks.length - 1), { ...BASE, 'P-04': [`situación | x | ${otherPart}`] }).evidencia('EV-04')?.status === 'CUMPLE'
  );

  const day = [
    ...Array.from({ length: 24 }, (_, h) => h).filter(h => h % 6 !== 0).flatMap(h => hourlyPass(`2026-10-09T${String(h).padStart(2, '0')}:05`)),
    ...[0, 6, 12, 18].flatMap(h => completePass(`2026-10-09T${String(h).padStart(2, '0')}:05`)),
  ];
  check(`a lab day is ${day.length} facts, below the budget's 300`, day.length <= 300, day.length);
}

function ranges(text: string): string[] {
  return text.split(',').filter(Boolean);
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
