/** op.nub.1: judgment of cloud service protection. */
import { opNub1PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-nub-1.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opNub1CatalogDefinition } from '../common/ens/catalog/op-nub-1';
import { opNub1Configuration } from '../common/ens/configuration/data/op-nub-1-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import { markEvidencesStale, markPolicyRuntimeStale } from '../common/ens/core/evidence/stale-collector';
import { parseRequirementAttestations } from '../common/ens/configuration/services/attestation-service';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import { buildOpNub1ReportModel } from '../public/ens/reports/op-nub-1-report-model';
import { ensRequirementProofLabel } from '../public/ens/reports/report-rows';
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

const PASSES = ['2026-10-08T18:05', '2026-10-09T00:05', '2026-10-09T06:05', '2026-10-09T12:05'];
const COMPLETE = PASSES[PASSES.length - 1];

const NOW = new Date('2026-10-09T12:30:00Z');

const COVERS = 'EV-01,EV-02,EV-04,EV-07';

const heartbeat = (ts: string, covered = COVERS): Line => ({
  ts, event: 'collector_run', resultado: 'completada', evidencias_cubiertas: covered, tipo_servidor: 'manager', emisor: 'recolector', pasada: 'completa',
});

const integration = (ts: string, modulo: string, extra: Line = {}): Line => ({
  ts, event: 'cloud_integration_observed', evidence_id: 'EV-01', requisito: 'op.nub.1.2', plano: 'central',
  modulo, familia: '-', donde: '-', habilitado: 'si', servicios: '-', intervalo: '-', secreto_en_linea: 'no',
  agentes_origen: '-', ultima_alerta: '-', alertas_24h: 0, errores_24h: 0, ultimo_error: '-',
  observado_desde: '2026-09-20T00:05:00Z', ...extra,
});

const operation = (ts: string, modulo: string, actor: string, extra: Line = {}): Line => ({
  ts, event: 'cloud_admin_operation_observed', evidence_id: 'EV-04', requisito: 'op.nub.1.2', plano: 'central',
  modulo, familia: '-', cuenta: '-', actor, tipo_actor: 'rol', operaciones: 'CreateUser', veces: 1,
  primera: ts.replace(/:(\d\d)Z$/, ':00Z'), ultima: ts.replace(/:(\d\d)Z$/, ':00Z'), agente_id: '031', ...extra,
});

const access = (ts: string, modulo: string, user: string, extra: Line = {}): Line => ({
  ts, event: 'cloud_authentication_observed', evidence_id: 'EV-07', requisito: 'op.nub.1.2', plano: 'central',
  modulo, familia: '-', cuenta: '-', usuario: user, resultado: 'exito', segundo_factor: 'si', metodo: 'consola', veces: 1,
  primera: '2026-10-09T09:00:00Z', ultima: '2026-10-09T09:00:00Z', origenes: '203.0.113.10', ...extra,
});

const posture = (ts: string, extra: Line = {}): Line => ({
  ts, event: 'cloud_posture_finding_observed', evidence_id: 'EV-02', requisito: 'op.nub.1.r2.1', plano: 'central',
  modulo: '-', fuente: 'ninguna', estandar: '-', cuenta: '-', controles_evaluados: 0, controles_fallidos: 0,
  fallidos_criticos: 0, fallidos: '-', ultimo_hallazgo: '-', ...extra,
});

const pass = (ts: string, actions = true): Line[] => {
  const t = (s: number) => `${ts}:${String(s).padStart(2, '0')}Z`;

  return [
    integration(t(10), 'aws-s3', {
      familia: 'amazon', donde: 'grupo:cloud-aws', servicios: 'cloudtrail,guardduty', intervalo: '10m',
      agentes_origen: '031', ultima_alerta: '2026-10-09T12:01:30Z', alertas_24h: 1840, errores_24h: 0,
      fuentes_admin: 'cloudtrail',
    }),
    integration(t(10), 'azure-logs', {
      familia: 'azure', donde: 'agente:031', habilitado: '-', servicios: '-', secreto_en_linea: '-',
      agentes_origen: '031', ultima_alerta: '2026-10-09T11:40:00Z', alertas_24h: 412, errores_24h: '-',
      fuentes_admin: 'azure-activity',
    }),
    integration(t(10), 'gcp-pubsub', {
      familia: 'gcp', donde: 'manager', servicios: 'pubsub', intervalo: '1h',
      agentes_origen: '000', ultima_alerta: '2026-10-09T10:15:00Z', alertas_24h: 96, errores_24h: 0,
      fuentes_admin: 'gcp-admin-activity',
    }),
    posture(t(12)),
    ...(actions
      ? [
          operation(t(14), 'aws-s3', 'arn:aws:iam::123456789012:role/Admin', { cuenta: '123456789012', operaciones: 'CreateUser,AttachRolePolicy', veces: 3 }),
          operation(t(14), 'aws-s3', 'config.amazonaws.com', { cuenta: '123456789012', tipo_actor: 'servicio', operaciones: 'PutEvaluations', veces: 12 }),
          operation(t(14), 'azure-logs', 'admin@cliente.example', { cuenta: 'sub-0001', tipo_actor: 'usuario', operaciones: 'Microsoft.Network/networkSecurityGroups/write', veces: 1 }),
          access(t(16), 'aws-s3', 'arn:aws:iam::123456789012:user/alice', { cuenta: '123456789012' }),
          access(t(16), 'azure-logs', 'admin@cliente.example', { cuenta: 'sub-0001', metodo: 'entra-id' }),
          access(t(16), 'azure-logs', 'bob@cliente.example', { cuenta: 'sub-0001', metodo: 'entra-id', resultado: 'fallo', segundo_factor: '-', veces: 4 }),
        ]
      : []),
    heartbeat(t(40)),
  ];
};

let counter = 0;

const RULE: Record<string, string> = {
  cloud_integration_observed: '111501', cloud_posture_finding_observed: '111502', cloud_admin_operation_observed: '111503',
  cloud_authentication_observed: '111504', evidence_state: '111550', collector_run: '111597',
};

const MANAGER = { id: '000', name: 'Wazuh-4' };

const alert = (line: Line, control = 'op.nub.1') => {
  counter += 1;
  const { ts, host: _host, ...data } = line as Line & { ts: string };

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts,
      agent: MANAGER,
      rule: { id: RULE[String(data.event)] || '111500', description: 'op.nub.1' },
      location: '/var/log/ensfacil/op_nub_1.json',
      data: Object.fromEntries(Object.entries({ ensfacil: control, ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const events = (lines: Line[], changes: (l: Line) => Line | Line[] | undefined = l => l): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lines
      .flatMap(l => {
        const r = changes({ ...l });

        return r === undefined ? [] : Array.isArray(r) ? r : [r];
      })
      .map(l => alert(l))
  );

const hoy = (changes?: (l: Line) => Line | Line[] | undefined) =>
  events(PASSES.flatMap(ts => pass(ts)), changes);

const inTheLast = (l: Line): boolean => String(l.ts).startsWith(COMPLETE);

type Values = Record<string, string[] | string | undefined>;

const configuration = (values: Values): ENSControlConfiguration => ({
  ...opNub1Configuration,
  parameters: opNub1Configuration.parameters.map(p => {
    const { value: _anterior, ...withoutValue } = p;

    return values[p.id] === undefined ? withoutValue : { ...withoutValue, value: values[p.id] };
  }),
});

const BASE: Values = {
  'P-01': 'usuario',
  'P-02': [
    'AWS producción | IaaS | Amazon Web Services | expedientes | alta | utilizado',
    'Azure suscripción | PaaS | Microsoft | portal del ciudadano | alta | utilizado',
    'GCP analítica | PaaS | Google | estadísticas | media | utilizado',
    'Hetzner | IaaS | Hetzner | laboratorio | baja | utilizado',
  ],
  'P-03': [
    'AWS producción | ENS ALTA | servicios de AWS en el alcance del CCN | 2027-06-30 | declaración de conformidad AWS-ENS-2026',
    'Azure suscripción | ENS ALTA | Microsoft Azure | 2027-03-31 | certificado de conformidad nº 2026/101',
    'GCP analítica | ENS MEDIA | Google Cloud | 2027-01-15 | certificado de conformidad nº 2026/202',
    'Hetzner | CCN-STIC-823 | servidores dedicados | 2026-12-31 | declaración del proveedor',
  ],
  'P-04': [
    'AWS producción | Common Criteria EAL4+ | CCN-2026-001 | 2027-06-30',
    'Azure suscripción | Common Criteria EAL4+ | CCN-2026-002 | 2027-03-31',
    'GCP analítica | LINCE | CCN-2026-003 | 2027-01-15',
    'Hetzner | LINCE | CCN-2026-004 | 2026-12-31',
  ],
  'P-06': [
    'AWS producción | aws-s3 | CloudTrail y GuardDuty de la cuenta 123456789012',
    'Azure suscripción | azure-logs | registro de actividad y Entra ID de sub-0001',
    'GCP analítica | gcp-pubsub | Cloud Audit Logs del proyecto analitica',
    'Hetzner | ninguno | sin módulo de Wazuh',
  ],
  'P-08': [
    'AWS producción | eu-south-2 (España) | eu-west-3 | RGPD',
    'Azure suscripción | Spain Central | West Europe | RGPD',
    'GCP analítica | europe-southwest1 | europe-west1 | RGPD',
    'Hetzner | Falkenstein (DE) | Helsinki (FI) | RGPD',
  ],
  'P-09': [
    'AWS producción | AES-256 en S3 y EBS | KMS con CMK propia',
    'Azure suscripción | AES-256 | claves del proveedor',
    'GCP analítica | AES-256 | Cloud KMS con CMEK',
    'Hetzner | LUKS en los discos | claves propias',
  ],
  'P-10': [
    'AWS producción | resumen ejecutivo del pentest 2026 | 2026-02-15 | plataforma',
    'Azure suscripción | informe de pentest 2026 | 2026-04-01 | Azure',
    'GCP analítica | resumen ejecutivo 2025 | 2025-11-20 | Google Cloud',
    'Hetzner | informe de pentest 2026 | 2026-05-10 | centro de datos',
  ],
  'P-11': [
    'AWS producción | arn:aws:iam::123456789012:role/Admin',
    'Azure suscripción | admin@cliente.example',
    'GCP analítica | ops@cliente.example',
  ],
  'P-05': ['ninguno'],
  'P-12': '12',
  'P-13': '24',
};

const NO_PARAMETERS: Values = {};

const evaluate = (
  evs: ENSNormalizedEvent[],
  values: Values = BASE,
  level: ENSLevel = 'MEDIO',
  now: Date = NOW
) => {
  const cfg = configuration(values);
  const ofTheControl = keepLatestRunStateFacts('op.nub.1', evs, now);
  const evidences = resolveEvidenceForControl('op.nub.1', ofTheControl, '000', level, cfg, now);
  const context = buildPolicyContext(opNub1CatalogDefinition, cfg, level, ofTheControl, evidences, now);
  const { decisions, runtimeVariables } = opNub1PolicyDefinition.evaluator!(context);
  const tabla = applyPolicyDecisionsToEvidences(evidences, decisions, opNub1CatalogDefinition.requirements);
  const attestations = parseRequirementAttestations(cfg);
  const requirement = (id: string) =>
    evaluateRequirement(
      opNub1CatalogDefinition.requirements.find(q => q.id === id)!,
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
      opNub1CatalogDefinition,
      cfg,
      level,
      evidences,
      {
        controlId: 'op.nub.1',
        policyId: opNub1PolicyDefinition.id,
        evaluatedAt: now.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      ofTheControl
    );

  return { decisions, runtimeVariables, requisito: requirement, evidencia: evidence, motivo: motive, deEvidencia: ofEvidence, motor };
};

const stateOf = (r: ReturnType<typeof evaluate>, ev: string) => `${r.evidencia(ev)?.status} ${r.evidencia(ev)?.gapCause || ''}`.trim();

section('1. Catalog: system category, manager plane, documentary items and report data');

{
  const levels = (id: string) =>
    opNub1CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');
  const req = (id: string) => opNub1CatalogDefinition.requirements.find(r => r.id === id)!;

  check('op.nub.1 is governed by the category (no dimension of its own)', opNub1CatalogDefinition.levelDimension === undefined);
  check('se mide solo en el manager', JSON.stringify(opNub1CatalogDefinition.measurementPlanes) === '["manager"]');
  check('the base (1.1 and 1.2) applies in the three categories', levels('op.nub.1.1') === 'BAJO,MEDIO,ALTO' && levels('op.nub.1.2') === 'BAJO,MEDIO,ALTO');
  check('R1 (r1.1 and r1.2) from MEDIA', levels('op.nub.1.r1.1') === 'MEDIO,ALTO' && levels('op.nub.1.r1.2') === 'MEDIO,ALTO');
  check('R2 only at ALTA', levels('op.nub.1.r2.1') === 'ALTO');
  check('the control is ACTIVE', opNub1CatalogDefinition.status === 'ACTIVE', opNub1CatalogDefinition.status);
  check('op.nub.1.1 and op.nub.1.r1.2 declare no technical evidence (documentary: P-03 and P-05)', !req('op.nub.1.1').evidenceIds.length && !req('op.nub.1.r1.2').evidenceIds.length);
  check(
    'op.nub.1 declares no P-ATT: no attestation without expiry can accredit 1.1 or R1.2 (decision 1)',
    !opNub1Configuration.parameters.some(p => p.id === 'P-ATT') && parseRequirementAttestations(configuration(BASE)).size === 0
  );
  check(
    'EV-03, EV-05, EV-06 and EV-07 are judged by no requirement (report data: no cloud SCA; the second factor is judged by op.acc.6)',
    opNub1CatalogDefinition.requirements.every(r => !['EV-03', 'EV-05', 'EV-06', 'EV-07'].some(ev => r.evidenceIds.includes(ev)))
  );
  check(
    'the policy declares the same levels, evidences and parameters as the catalog',
    opNub1PolicyDefinition.requirements.every(r => {
      const c = req(r.requirementId);

      return r.levels.join(',') === c.applicability.levels.join(',') && r.evidenceIds.join(',') === c.evidenceIds.join(',') && r.parameterIds.join(',') === c.parameterIds.join(',');
    })
  );
  check(
    'states (integrations, posture) are state facts; actions (operations, accesses) are not',
    ['cloud_integration_observed', 'cloud_posture_finding_observed'].every(t => getStateFactEventTypes('op.nub.1').has(t)) &&
      !getStateFactEventTypes('op.nub.1').has('cloud_admin_operation_observed') &&
      !getStateFactEventTypes('op.nub.1').has('cloud_authentication_observed')
  );
  const definitions = getEvidenceDefinitions('op.nub.1');
  check(
    'every evidence with a fact accredits it with its band 111500 rule (and no invented rule)',
    definitions.length === 9 &&
      definitions.every(e => e.relatedRules.every(r => /^1115\d\d$/.test(r))) &&
      JSON.stringify(definitions.filter(e => e.relatedRules.length).map(e => `${e.id}:${e.relatedRules.join('+')}`)) ===
        '["EV-01:111501","EV-02:111502","EV-04:111503","EV-07:111504"]',
    definitions.map(e => `${e.id}:${e.relatedRules.join('+')}`).join(' ')
  );
  check('no parameter carries an invented rule identifier', opNub1Configuration.parameters.every(p => !p.ruleIds.length));
  const invalid = configuration(BASE)
    .parameters.map(p => ({ id: p.id, veredicto: validateParameterValue(p, p.value) }))
    .filter(v => !v.veredicto.valid);
  check(
    'the BASE values are valid for their tables (YYYY-MM-DD dates, modules and dropdown uses)',
    invalid.length === 0,
    invalid.map(v => `${v.id}: ${v.veredicto.reason}`).join('; ')
  );
  check(
    'and a validity «hasta 06/2027» is not admitted by the form',
    !validateParameterValue(configuration(BASE).parameters.find(p => p.id === 'P-03')!, ['AWS producción | ENS ALTA | x | hasta 06/2027 | x']).valid
  );
}

section('2. Green: AWS, Azure and GCP user with a valid file and the live integration');

{
  const r = evaluate(hoy());
  const r12 = r.requisito('op.nub.1.2');

  check('op.nub.1.2 CUMPLE at MEDIA, documentarily accredited', r12.status === 'CUMPLE' && r12.attested === true && r12.evidenced === true, `${r12.status} ${r12.attested} ${r.motivo('op.nub.1.2')}`);
  check('and it reads «Acreditado documentalmente», not as measured', /^Acreditado documentalmente/.test(r12.observations[0] || ''), r12.observations[0]);
  check('op.nub.1.r1.1 CUMPLE accredited: the four certifications in force', r.requisito('op.nub.1.r1.1').status === 'CUMPLE' && r.requisito('op.nub.1.r1.1').attested === true, r.motivo('op.nub.1.r1.1'));
  check('op.nub.1.1 NO_APLICA: P-01 = usuario, does not provide', r.requisito('op.nub.1.1').status === 'NO_APLICA', r.requisito('op.nub.1.1').status);
  check('op.nub.1.r1.2 NO_APLICA: P-05 declares «ninguno»', r.requisito('op.nub.1.r1.2').status === 'NO_APLICA' && /no se utiliza ningún servicio en la nube de seguridad/.test(r.motivo('op.nub.1.r1.2')), r.motivo('op.nub.1.r1.2'));
  check('op.nub.1.r2.1 NO_APLICA at MEDIA', r.requisito('op.nub.1.r2.1').status === 'NO_APLICA');
  check(
    'EV-01 CUMPLE: the three modules alive, without errors, and Azure\'s seen through its alerts',
    r.evidencia('EV-01')?.status === 'CUMPLE' && /azure-logs\): configurado en agente:031/.test(r.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''),
    r.deEvidencia('op.nub.1.2', 'EV-01')?.reason
  );
  check(
    'the IaaS without a Wazuh module is a report finding, not a breach',
    /Sin integración en Wazuh \(hallazgo del informe, sin veredicto.*«Hetzner»/.test(r.deEvidencia('op.nub.1.2', 'EV-01')?.reason || '') &&
      JSON.stringify(r.runtimeVariables.find(v => v.name === 'servicios_sin_integracion')?.value) === '["Hetzner"]',
    r.deEvidencia('op.nub.1.2', 'EV-01')?.reason
  );
  check(
    'EV-04 CUMPLE: the Admin role and admin@ are in P-11; config.amazonaws.com\'s action is not contrasted',
    r.evidencia('EV-04')?.status === 'CUMPLE' && /role\/Admin/.test(r.deEvidencia('op.nub.1.2', 'EV-04')?.reason || '') && !/config\.amazonaws\.com/.test(r.deEvidencia('op.nub.1.2', 'EV-04')?.reason || ''),
    r.deEvidencia('op.nub.1.2', 'EV-04')?.reason
  );
  check(
    'EV-07 NO_APLICA: report finding crossed with op.acc.6.r8.1, with what is observed (GCP brings no logins)',
    r.evidencia('EV-07')?.status === 'NO_APLICA' && /op\.acc\.6\.r8\.1/.test(r.deEvidencia('op.nub.1.2', 'EV-07')?.reason || '') && /GCP analítica.*no consta ningún acceso interactivo/.test(r.deEvidencia('op.nub.1.2', 'EV-07')?.reason || ''),
    `${stateOf(r, 'EV-07')} ${r.deEvidencia('op.nub.1.2', 'EV-07')?.reason}`
  );
  check(
    'EV-09 CUMPLE «acreditado documentalmente», and the bridge does not leave it at «sin recogida»',
    r.evidencia('EV-09')?.status === 'CUMPLE' && (r.evidencia('EV-09')?.observations || []).some(o => /Acreditado documentalmente/.test(o)),
    stateOf(r, 'EV-09')
  );
  ['EV-03', 'EV-05', 'EV-06'].forEach(ev =>
    check(
      `${ev} NO_APLICA as a report datum, not grey`,
      r.evidencia(ev)?.status === 'NO_APLICA' && (r.evidencia(ev)?.observations || []).some(o => /Dato del informe, sin veredicto/.test(o)),
      stateOf(r, ev)
    )
  );
  check('EV-05 shows what is declared in P-09', (r.evidencia('EV-05')?.observations || []).some(o => /Declarado en P-09: AWS producción: AES-256/.test(o)));
  check('EV-08 shows the days left', /quedan \d+ días/.test(r.deEvidencia('op.nub.1.r1.1', 'EV-08')?.reason || ''));

  const control = r.motor();
  check('the control comes out CUMPLE at 100 % at MEDIA', control.status === 'CUMPLE' && control.score === 100, `${control.status} ${control.score}`);

  const report = buildOpNub1ReportModel(control);
  check('the report has the template\'s 12 fields', report.fields.length === 12, report.fields.length);
  check(
    'and separates the documentary block from the technical one in the score',
    report.fields[11].details.some(d => /^Bloque documental/.test(d)) && report.fields[11].details.some(d => /^Bloque técnico/.test(d)),
    report.fields[11].details.join(' | ')
  );
  check('the file is marked DOCUMENTACIÓN APORTADA', /DOCUMENTACIÓN APORTADA/.test(report.fields[2].value));

  const basic = evaluate(hoy(), BASE, 'BAJO');
  check('at BÁSICA, R1 does not apply and op.nub.1.2 stays accredited', basic.requisito('op.nub.1.r1.1').status === 'NO_APLICA' && basic.requisito('op.nub.1.2').status === 'CUMPLE');
}

section('3. P-01 = ninguno: everything NO_APLICA, declared (and not NO_EVALUABLE for an empty inventory)');

{
  const r = evaluate([], { 'P-01': 'ninguno' }, 'ALTO');

  check(
    'the five requirements NO_APLICA at ALTA, without facts or further parameters',
    ['op.nub.1.1', 'op.nub.1.2', 'op.nub.1.r1.1', 'op.nub.1.r1.2', 'op.nub.1.r2.1'].every(id => r.requisito(id).status === 'NO_APLICA'),
    ['op.nub.1.1', 'op.nub.1.2', 'op.nub.1.r1.1', 'op.nub.1.r1.2', 'op.nub.1.r2.1'].map(id => r.requisito(id).status).join(',')
  );
  check('and all evidences too', ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'].every(ev => r.evidencia(ev)?.status === 'NO_APLICA'));
  check('the control comes out NO_APLICA, without a number', r.motor().status === 'NO_APLICA' && r.motor().score === undefined, `${r.motor().status} ${r.motor().score}`);
  check('the motive says it is a declaration', /P-01 declara que el sistema no presta ni utiliza servicios en la nube/.test(r.motivo('op.nub.1.2')));

  const withP02 = evaluate([], { ...BASE, 'P-01': 'ninguno' }, 'ALTO');
  check(
    '«ninguno» with P-02 declaring used services → CONFIGURATION naming the contradiction, never NO_APLICA',
    withP02.requisito('op.nub.1.2').status === 'NO_CUMPLE' && withP02.requisito('op.nub.1.2').evidenced === false &&
      withP02.decisions.find(d => d.requirementId === 'op.nub.1.2')?.cause === 'CONFIGURATION' && /lo contradice: P-02 declara 4 servicio\(s\) en uso/.test(withP02.motivo('op.nub.1.2')),
    withP02.motivo('op.nub.1.2')
  );
  const withoutUse = evaluate([], { 'P-01': 'ninguno', 'P-02': ['Dropbox | SaaS | Dropbox | documentos | baja |'] }, 'ALTO');
  check(
    '«ninguno» with a P-02 row without use is also a contradiction → CONFIGURATION, never NO_APLICA',
    withoutUse.requisito('op.nub.1.2').status !== 'NO_APLICA' && withoutUse.decisions.find(d => d.requirementId === 'op.nub.1.2')?.cause === 'CONFIGURATION' &&
      /Dropbox \(sin uso declarado\)/.test(withoutUse.motivo('op.nub.1.2')),
    withoutUse.motivo('op.nub.1.2')
  );
  check(
    'REVERSAL: «ninguno» with empty P-02 holds → NO_APLICA',
    evaluate([], { 'P-01': 'ninguno' }, 'ALTO').requisito('op.nub.1.2').status === 'NO_APLICA'
  );
  const withModules = evaluate(hoy(), { 'P-01': 'ninguno' }, 'ALTO');
  check(
    '«ninguno» with cloud modules ingesting on the manager → CONFIGURATION naming the modules',
    withModules.requisito('op.nub.1.2').evidenced === false && /Wazuh está ingiriendo registros de aws-s3 \(1840 en 24 h\)/.test(withModules.motivo('op.nub.1.2')),
    withModules.motivo('op.nub.1.2')
  );
  check(
    'REVERSAL: the same manager with modules without records → «ninguno» holds: NO_APLICA',
    evaluate(hoy(l => (l.event === 'cloud_integration_observed' ? { ...l, alertas_24h: 0 } : l)), { 'P-01': 'ninguno' }, 'ALTO').requisito('op.nub.1.2').status === 'NO_APLICA'
  );
}

section('4. `attested` never covers a technical measure in NO_CUMPLE (each axis with its reversal)');

{
  const notAccredited = (r: ReturnType<typeof evaluate>) => {
    const q = r.requisito('op.nub.1.2');

    return q.status === 'NO_CUMPLE' && q.evidenced === true && !q.attested;
  };

  const withContractor = (actor: string) =>
    hoy(l => (l.event === 'cloud_admin_operation_observed' && l.modulo === 'azure-logs' && inTheLast(l) ? [l, { ...l, actor, operaciones: 'Microsoft.Authorization/roleAssignments/write' }] : l));
  const intruder2 = evaluate(withContractor('contratista@externo.example'));
  check(
    'administration operation by an actor P-11 does not authorize → op.nub.1.2 measured NO_CUMPLE, without the mark',
    notAccredited(intruder2) && /contratista@externo\.example/.test(intruder2.motivo('op.nub.1.2')),
    `${intruder2.requisito('op.nub.1.2').status} ${intruder2.motivo('op.nub.1.2')}`
  );
  check('and EV-04 comes out NO_CUMPLE in the table', intruder2.evidencia('EV-04')?.status === 'NO_CUMPLE');
  check(
    'REVERSAL: the same fact with the actor in P-11 → accredited CUMPLE',
    evaluate(withContractor('contratista@externo.example'), { ...BASE, 'P-11': [...(BASE['P-11'] as string[]), 'Azure suscripción | contratista@externo.example'] }).requisito('op.nub.1.2').attested === true
  );
  check(
    'an actor authorized for ANOTHER service is not valid for this one',
    notAccredited(evaluate(withContractor('ops@cliente.example')))
  );

  const withoutMfa = evaluate(hoy(l => (l.event === 'cloud_authentication_observed' && l.usuario === 'arn:aws:iam::123456789012:user/alice' && inTheLast(l) ? { ...l, segundo_factor: 'no' } : l)));
  check(
    'an AWS console access without a second factor does NOT bring op.nub.1.2 down: it stays accredited',
    withoutMfa.requisito('op.nub.1.2').attested === true,
    `${withoutMfa.requisito('op.nub.1.2').status} ${withoutMfa.motivo('op.nub.1.2')}`
  );
  check(
    'and it is reported highlighted, naming the user and origin, crossed with op.acc.6.r8.1',
    withoutMfa.evidencia('EV-07')?.status === 'NO_APLICA' &&
      /HAY ACCESOS SIN SEGUNDO FACTOR.*user\/alice.*203\.0\.113\.10/.test(withoutMfa.deEvidencia('op.nub.1.2', 'EV-07')?.reason || '') &&
      withoutMfa.runtimeVariables.find(v => v.name === 'accesos_cloud')?.value === 'NO_CUMPLE',
    withoutMfa.deEvidencia('op.nub.1.2', 'EV-07')?.reason
  );
  const federated = evaluate(hoy(l => (l.event === 'cloud_authentication_observed' && l.modulo === 'aws-s3' ? { ...l, segundo_factor: '-' } : l)));
  check(
    'REVERSAL: the federated access, without the second-factor datum, is not highlighted (it cannot be asserted)',
    federated.runtimeVariables.find(v => v.name === 'accesos_cloud')?.value === 'NO_EVALUABLE' && !/HAY ACCESOS SIN SEGUNDO FACTOR/.test(federated.deEvidencia('op.nub.1.2', 'EV-07')?.reason || ''),
    federated.runtimeVariables.find(v => v.name === 'accesos_cloud')?.value
  );
  const failedOne2 = evaluate(hoy(l => (l.event === 'cloud_authentication_observed' && l.usuario === 'bob@cliente.example' ? { ...l, segundo_factor: 'no' } : l)));
  check('a FAILED attempt without a second factor is not an access: not highlighted', failedOne2.runtimeVariables.find(v => v.name === 'accesos_cloud')?.value !== 'NO_CUMPLE');

  const withoutModule = evaluate(hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'gcp-pubsub' ? undefined : l)));
  check(
    'P-06 declares GCP via gcp-pubsub and Wazuh has no module → NO_CUMPLE',
    notAccredited(withoutModule) && /no tiene el módulo gcp-pubsub configurado/.test(withoutModule.motivo('op.nub.1.2')),
    withoutModule.motivo('op.nub.1.2')
  );
  check(
    'REVERSAL: the same fact with GCP declared «ninguno» in P-06 → finding, not a breach',
    evaluate(hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'gcp-pubsub' ? undefined : l)), {
      ...BASE,
      'P-06': (BASE['P-06'] as string[]).map(f => (f.startsWith('GCP') ? 'GCP analítica | ninguno | -' : f)),
    }).requisito('op.nub.1.2').attested === true
  );

  const stopped = (l: Line) => (l.event === 'cloud_integration_observed' && l.modulo === 'aws-s3' ? { ...l, ultima_alerta: '2026-10-07T08:00:00Z', alertas_24h: 0 } : l);
  check('AWS without records for 52 h (P-13 = 24) → ingestion is stopped: NO_CUMPLE', notAccredited(evaluate(hoy(stopped))), evaluate(hoy(stopped)).motivo('op.nub.1.2'));
  check('REVERSAL: the same fact with P-13 = 72 → accredited CUMPLE', evaluate(hoy(stopped), { ...BASE, 'P-13': '72' }).requisito('op.nub.1.2').attested === true);

  const errors = evaluate(hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'gcp-pubsub' && inTheLast(l) ? { ...l, errores_24h: 7, ultimo_error: 'wazuh-modulesd:gcp-pubsub: ERROR: 403 permission denied on subscription' } : l)));
  check(
    'gcp-pubsub with 7 errors in 24 h → NO_CUMPLE with the last error',
    notAccredited(errors) && /7 errores en 24 h.*403 permission denied/.test(errors.motivo('op.nub.1.2')),
    errors.motivo('op.nub.1.2')
  );
  const disabledOne = evaluate(hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'aws-s3' && inTheLast(l) ? { ...l, habilitado: 'no' } : l)));
  check('aws-s3 configured but disabled → NO_CUMPLE', notAccredited(disabledOne) && /deshabilitado/.test(disabledOne.motivo('op.nub.1.2')), disabledOne.motivo('op.nub.1.2'));

}

section('5. Documentary red: validities, category, pentest and incomplete file');

{
  const january = new Date('2027-01-10T12:30:00Z');
  const late = evaluate([], BASE, 'MEDIO', january);
  check(
    'on 10/01/2027 Hetzner\'s conformity has expired → op.nub.1.2 NO_CUMPLE (documentary, without the mark)',
    late.requisito('op.nub.1.2').status === 'NO_CUMPLE' && !late.requisito('op.nub.1.2').attested && /«Hetzner».*vencida el 2026-12-31/.test(late.motivo('op.nub.1.2')),
    late.motivo('op.nub.1.2')
  );
  check('and its certification too → R1 NO_CUMPLE', late.requisito('op.nub.1.r1.1').status === 'NO_CUMPLE' && /Hetzner.*venció el 2026-12-31/.test(late.motivo('op.nub.1.r1.1')), late.motivo('op.nub.1.r1.1'));
  const inDecember = evaluate(hoy(), { ...BASE, 'P-12': '24' }, 'MEDIO', new Date('2026-12-31T20:00:00Z'));
  check(
    'REVERSAL: the last day of validity is still valid (the file; ingestion is no longer judged at that date)',
    inDecember.evidencia('EV-09')?.status === 'CUMPLE' && inDecember.evidencia('EV-08')?.status === 'CUMPLE',
    `${stateOf(inDecember, 'EV-09')} ${stateOf(inDecember, 'EV-08')}`
  );

  const expiredConformity = evaluate(hoy(), { ...BASE, 'P-03': (BASE['P-03'] as string[]).map(f => (f.startsWith('Hetzner') ? 'Hetzner | CCN-STIC-823 | servidores | 2026-09-30 | declaración' : f)) });
  const field4 = buildOpNub1ReportModel(expiredConformity.motor()).fields[3];
  check(
    'at MEDIA, with certifications in force and an expired conformity, the report\'s validity field comes out NO_CUMPLE',
    expiredConformity.evidencia('EV-08')?.status === 'CUMPLE' && field4.status === 'NO_CUMPLE' && field4.details.some(d => /Hetzner.*vencida/.test(d)),
    `${field4.status} ${field4.details.join(' | ')}`
  );
  check('REVERSAL: with the conformity in force, CUMPLE', buildOpNub1ReportModel(evaluate(hoy()).motor()).fields[3].status === 'CUMPLE');

  const validitiesWithoutP03 = (values: Values, level: ENSLevel) => buildOpNub1ReportModel(evaluate(hoy(), values, level).motor()).fields[3];
  const withoutP03Basic = validitiesWithoutP03({ ...BASE, 'P-03': undefined }, 'BAJO');
  check('without P-03 and with used services, at BÁSICA the validity field comes out NO_EVALUABLE, not NO_APLICA', withoutP03Basic.status === 'NO_EVALUABLE', withoutP03Basic.status);
  const withoutP03Medium = validitiesWithoutP03({ ...BASE, 'P-03': undefined }, 'MEDIO');
  check(
    'and at MEDIA, with EV-08\'s certifications in force, it does not come out CUMPLE through EV-08 either',
    evaluate(hoy(), { ...BASE, 'P-03': undefined }).evidencia('EV-08')?.status === 'CUMPLE' && withoutP03Medium.status === 'NO_EVALUABLE' && withoutP03Medium.details.some(d => /P-03/.test(d)),
    `${withoutP03Medium.status} ${withoutP03Medium.details.join(' | ')}`
  );
  const withoutP03Provider = validitiesWithoutP03({ 'P-01': 'prestador', 'P-02': ['Portal de trámites | SaaS | Quersystem | expedientes | alta | prestado'] }, 'BAJO');
  check('without P-03 and with a provided service, also NO_EVALUABLE', withoutP03Provider.status === 'NO_EVALUABLE', withoutP03Provider.status);

  const withoutP02Basic = validitiesWithoutP03({ ...BASE, 'P-02': undefined }, 'BAJO');
  check(
    'P-01 = usuario without P-02, at BÁSICA → the validity field comes out NO_EVALUABLE, not NO_APLICA',
    withoutP02Basic.status === 'NO_EVALUABLE' && withoutP02Basic.details.some(d => /servicios utilizados: .*P-02/.test(d)),
    `${withoutP02Basic.status} ${withoutP02Basic.details.join(' | ')}`
  );
  const withoutUsed = validitiesWithoutP03({ ...BASE, 'P-02': ['Portal propio | SaaS | Quersystem | trámites | alta | prestado'] }, 'BAJO');
  check('P-01 = usuario and no «utilizado» row in P-02, at BÁSICA → NO_EVALUABLE', withoutUsed.status === 'NO_EVALUABLE', withoutUsed.status);
  const withoutProvided = validitiesWithoutP03({ ...BASE, 'P-01': 'prestador', 'P-02': undefined }, 'BAJO');
  check('P-01 = prestador without P-02, at BÁSICA → NO_EVALUABLE', withoutProvided.status === 'NO_EVALUABLE', withoutProvided.status);
  check('REVERSAL: P-01 = ninguno is not touched (the whole control does not apply)', evaluate(hoy(l => (l.event === 'cloud_integration_observed' ? { ...l, alertas_24h: 0 } : l)), { 'P-01': 'ninguno' }, 'BAJO').requisito('op.nub.1.2').status === 'NO_APLICA');
  const validitiesWith = (values: Values, level: ENSLevel) =>
    buildOpNub1ReportModel(evaluate(hoy(l => (l.event === 'cloud_integration_observed' ? { ...l, alertas_24h: 0 } : l)), values, level).motor()).fields[3].status;
  check(
    'and with P-01 = ninguno the validity field comes out NO_APLICA (not SIN_DATOS), at BÁSICA and MEDIA',
    validitiesWith({ 'P-01': 'ninguno' }, 'BAJO') === 'NO_APLICA' && validitiesWith({ 'P-01': 'ninguno' }, 'MEDIO') === 'NO_APLICA',
    `${validitiesWith({ 'P-01': 'ninguno' }, 'BAJO')} ${validitiesWith({ 'P-01': 'ninguno' }, 'MEDIO')}`
  );
  check('without P-01, NO_EVALUABLE (not SIN_DATOS) also at BÁSICA', validitiesWith(NO_PARAMETERS, 'BAJO') === 'NO_EVALUABLE', validitiesWith(NO_PARAMETERS, 'BAJO'));

  const basicGcp = { ...BASE, 'P-03': (BASE['P-03'] as string[]).map(f => (f.startsWith('GCP') ? 'GCP analítica | ENS BÁSICA | Google Cloud | 2027-01-15 | nº 1' : f)) };
  check('GCP with ENS BÁSICA conformity in a MEDIA system → NO_CUMPLE', evaluate(hoy(), basicGcp).evidencia('EV-09')?.status === 'NO_CUMPLE' && /inferior a la categoría MEDIA/.test(evaluate(hoy(), basicGcp).motivo('op.nub.1.2')));
  check('REVERSAL: the same conformity in a BÁSICA system → CUMPLE', evaluate(hoy(), basicGcp, 'BAJO').evidencia('EV-09')?.status === 'CUMPLE');
  const withGuide = (conformity: string) =>
    evaluate(hoy(), { ...BASE, 'P-03': (BASE['P-03'] as string[]).map(f => (f.startsWith('GCP') ? `GCP analítica | ${conformity} | Google Cloud | 2027-01-15 | nº 1` : f)) });
  check(
    '«ENS BÁSICA (CCN-STIC 809)» in a MEDIA system → NO_CUMPLE: the ENS category prevails, not the guide',
    withGuide('ENS BÁSICA (CCN-STIC 809)').evidencia('EV-09')?.status === 'NO_CUMPLE' && /inferior a la categoría MEDIA/.test(withGuide('ENS BÁSICA (CCN-STIC 809)').motivo('op.nub.1.2')),
    withGuide('ENS BÁSICA (CCN-STIC 809)').motivo('op.nub.1.2')
  );
  check('REVERSAL: «ENS MEDIA (CCN-STIC 809)» → CUMPLE', withGuide('ENS MEDIA (CCN-STIC 809)').evidencia('EV-09')?.status === 'CUMPLE');
  check('and a guide without «ENS» («CCN-STIC-823») is accepted as a guide → CUMPLE', withGuide('CCN-STIC-823').evidencia('EV-09')?.status === 'CUMPLE');

  const old = evaluate(hoy(), { ...BASE, 'P-12': '10' });
  check('GCP\'s pentest is from 2025-11-20 and P-12 = 10 months → NO_CUMPLE (a)', old.evidencia('EV-09')?.status === 'NO_CUMPLE' && /a\) el pentest «resumen ejecutivo 2025» es del 2025-11-20/.test(old.motivo('op.nub.1.2')), old.motivo('op.nub.1.2'));
  check('REVERSAL: P-12 = 12 → CUMPLE', evaluate(hoy(), { ...BASE, 'P-12': '12' }).evidencia('EV-09')?.status === 'CUMPLE');

  const withoutJurisdiction = evaluate(hoy(), { ...BASE, 'P-08': (BASE['P-08'] as string[]).filter(f => !f.startsWith('Azure')) });
  check('Azure without region or jurisdiction in P-08 → NO_CUMPLE (d)', withoutJurisdiction.evidencia('EV-09')?.status === 'NO_CUMPLE' && /«Azure suscripción».*d\) sin región/.test(withoutJurisdiction.motivo('op.nub.1.2')), withoutJurisdiction.motivo('op.nub.1.2'));
  ['no', 'ninguno', 'Sin cifrar'].forEach(encryption => {
    const r = evaluate(hoy(), { ...BASE, 'P-09': (BASE['P-09'] as string[]).map(f => (f.startsWith('Hetzner') ? `Hetzner | ${encryption} | -` : f)) });

    check(
      `encryption «${encryption}» in P-09 → NO_CUMPLE (c), not an incomplete row`,
      r.evidencia('EV-09')?.status === 'NO_CUMPLE' && /«Hetzner».*c\) P-09 declara que los datos no se cifran/.test(r.motivo('op.nub.1.2')),
      `${stateOf(r, 'EV-09')} ${r.motivo('op.nub.1.2')}`
    );
  });
  check(
    'REVERSAL: «LUKS en los discos» with empty key management → CONFIGURATION, not NO_CUMPLE',
    evaluate(hoy(), { ...BASE, 'P-09': (BASE['P-09'] as string[]).map(f => (f.startsWith('Hetzner') ? 'Hetzner | LUKS en los discos | ' : f)) }).evidencia('EV-09')?.gapCause === 'CONFIGURATION'
  );
  const withoutCertificate = evaluate(hoy(), { ...BASE, 'P-04': (BASE['P-04'] as string[]).filter(f => !f.startsWith('Hetzner')) });
  check('Hetzner without certification in P-04 → R1 NO_CUMPLE', withoutCertificate.requisito('op.nub.1.r1.1').status === 'NO_CUMPLE' && withoutCertificate.requisito('op.nub.1.r1.1').evidenced === true, withoutCertificate.motivo('op.nub.1.r1.1'));
  check('and op.nub.1.2 stays accredited: the certification belongs to R1', withoutCertificate.requisito('op.nub.1.2').attested === true);

  ['hasta 06/2027', '06/2027', '2027'].forEach(cell => {
    const r = evaluate(hoy(), { ...BASE, 'P-03': (BASE['P-03'] as string[]).map(f => (f.startsWith('Azure') ? `Azure suscripción | ENS ALTA | Microsoft Azure | ${cell} | nº` : f)) });

    check(
      `validity «${cell}» → NO_EVALUABLE by CONFIGURATION naming the row, never CUMPLE`,
      r.evidencia('EV-09')?.status === 'NO_EVALUABLE' && r.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && /P-03, fila de «Azure suscripción»/.test(r.motivo('op.nub.1.2')) && !r.requisito('op.nub.1.2').attested,
      `${stateOf(r, 'EV-09')} ${r.motivo('op.nub.1.2')}`
    );
  });
  const withoutCategory = evaluate(hoy(), { ...BASE, 'P-03': (BASE['P-03'] as string[]).map(f => (f.startsWith('Azure') ? 'Azure suscripción | ENS | Microsoft Azure | 2027-03-31 | nº' : f)) });
  check('«ENS» conformity without category → CONFIGURATION, asks for the category', withoutCategory.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && /no dice la categoría/.test(withoutCategory.motivo('op.nub.1.2')));
  const future = evaluate(hoy(), { ...BASE, 'P-10': (BASE['P-10'] as string[]).map(f => (f.startsWith('AWS') ? 'AWS producción | pentest 2027 | 2027-02-15 | plataforma' : f)) });
  check('a pentest dated in the future → CONFIGURATION, does not accredit', future.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && /fechado en el futuro/.test(future.motivo('op.nub.1.2')));
}

section('6. Without parameters or inventory: NO_EVALUABLE with cause CONFIGURATION, never CUMPLE by emptiness');

{
  const r = evaluate(hoy(), NO_PARAMETERS, 'ALTO');

  ['op.nub.1.1', 'op.nub.1.2', 'op.nub.1.r1.1', 'op.nub.1.r1.2', 'op.nub.1.r2.1'].forEach(id =>
    check(
      `without P-01, ${id} not proven (unmeasured NO_CUMPLE), cause CONFIGURATION`,
      r.requisito(id).status === 'NO_CUMPLE' && r.requisito(id).evidenced === false && r.decisions.find(d => d.requirementId === id)?.cause === 'CONFIGURATION',
      `${r.requisito(id).status} ${r.requisito(id).evidenced} ${r.decisions.find(d => d.requirementId === id)?.cause}`
    )
  );
  ['EV-01', 'EV-02', 'EV-04', 'EV-08', 'EV-09'].forEach(ev =>
    check(`${ev} unmeasured by CONFIGURATION`, r.evidencia(ev)?.status === 'NO_EVALUABLE' && r.evidencia(ev)?.gapCause === 'CONFIGURATION', stateOf(r, ev))
  );
  check('the motive names P-01', /P-01 \(Posición respecto a los servicios en la nube\) está sin configurar/.test(r.motivo('op.nub.1.2')), r.motivo('op.nub.1.2'));

  const odd2 = evaluate(hoy(), { ...BASE, 'P-01': 'cliente' });
  check('P-01 with a value that is not an option → CONFIGURATION', odd2.requisito('op.nub.1.2').evidenced === false && /no es ninguna de sus opciones/.test(odd2.motivo('op.nub.1.2')));

  const withoutInventory = evaluate(hoy(), { ...BASE, 'P-02': undefined });
  check(
    'without P-02 (the scope), op.nub.1.2 and R1 not proven by CONFIGURATION, even if ingestion complies',
    withoutInventory.requisito('op.nub.1.2').evidenced === false && withoutInventory.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && withoutInventory.requisito('op.nub.1.r1.1').evidenced === false,
    `${withoutInventory.requisito('op.nub.1.2').status} ${stateOf(withoutInventory, 'EV-09')}`
  );
  const onlyP03 = evaluate(hoy(), { ...BASE, 'P-03': undefined });
  check('only P-03 missing → op.nub.1.2 not proven, EV-09 CONFIGURATION', onlyP03.requisito('op.nub.1.2').evidenced === false && onlyP03.evidencia('EV-09')?.gapCause === 'CONFIGURATION');
  const onlyP12 = evaluate(hoy(), { ...BASE, 'P-12': undefined });
  check('only P-12 missing → EV-09 CONFIGURATION (nothing to measure the pentest against)', onlyP12.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && /P-12/.test(onlyP12.motivo('op.nub.1.2')));
  const onlyP04 = evaluate(hoy(), { ...BASE, 'P-04': undefined });
  check('only P-04 missing → R1 not proven, CONFIGURATION', onlyP04.requisito('op.nub.1.r1.1').evidenced === false && onlyP04.evidencia('EV-08')?.gapCause === 'CONFIGURATION');

  const onlyP13 = evaluate(hoy(), { ...BASE, 'P-13': undefined });
  check('only P-13 missing → EV-01 CONFIGURATION', onlyP13.evidencia('EV-01')?.status === 'NO_EVALUABLE' && onlyP13.evidencia('EV-01')?.gapCause === 'CONFIGURATION', stateOf(onlyP13, 'EV-01'));
  check(
    'and op.nub.1.2 stays accredited by the file, saying what is left to measure (integrating is not required)',
    onlyP13.requisito('op.nub.1.2').attested === true && onlyP13.requisito('op.nub.1.2').observations.some(o => /^EV-01 sin medir \(sin configurar\)/.test(o)),
    onlyP13.requisito('op.nub.1.2').observations.join(' | ')
  );
  const onlyP06 = evaluate(hoy(), { ...BASE, 'P-06': undefined });
  check(
    'P-06 missing → EV-01 and EV-04 CONFIGURATION (and access is reported without integration)',
    ['EV-01', 'EV-04'].every(ev => onlyP06.evidencia(ev)?.gapCause === 'CONFIGURATION') && onlyP06.evidencia('EV-07')?.status === 'NO_APLICA',
    ['EV-01', 'EV-04', 'EV-07'].map(ev => stateOf(onlyP06, ev)).join(', ')
  );
  const onlyP11 = evaluate(hoy(), { ...BASE, 'P-11': undefined });
  check('P-11 missing with operations by people → EV-04 CONFIGURATION, naming the actors', onlyP11.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /role\/Admin/.test(onlyP11.deEvidencia('op.nub.1.2', 'EV-04')?.reason || ''));
  const withoutOps = evaluate(hoy(l => (l.event === 'cloud_admin_operation_observed' ? undefined : l)), { ...BASE, 'P-11': undefined });
  check('REVERSAL: without operations in the window and with live ingestion, P-11 is not needed → EV-04 CUMPLE', withoutOps.evidencia('EV-04')?.status === 'CUMPLE', stateOf(withoutOps, 'EV-04'));

  const bothWithoutUse = { ...BASE, 'P-01': 'ambos', 'P-02': (BASE['P-02'] as string[]).map(f => (f.startsWith('Hetzner') ? 'Hetzner | IaaS | Hetzner | laboratorio | baja' : f)) };
  const ambos = evaluate(hoy(), bothWithoutUse);
  check(
    'P-01 = ambos and a P-02 row without «uso» → CONFIGURATION naming the row, never CUMPLE',
    ambos.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && /P-02, servicio «Hetzner»: con P-01 = ambos hay que decir/.test(ambos.motivo('op.nub.1.2')) && !ambos.requisito('op.nub.1.2').attested,
    `${stateOf(ambos, 'EV-09')} ${ambos.motivo('op.nub.1.2')}`
  );
  check('REVERSAL: with P-01 = usuario the same row is a used service → accredited', evaluate(hoy(), { ...bothWithoutUse, 'P-01': 'usuario' }).requisito('op.nub.1.2').attested === true);
  const contradictory = evaluate(hoy(), { ...BASE, 'P-02': [...(BASE['P-02'] as string[]), 'Portal propio | SaaS | Quersystem | trámites | alta | prestado'] });
  check('P-01 = usuario and a «prestado» row → CONFIGURATION naming the row, never CUMPLE', contradictory.requisito('op.nub.1.2').attested !== true && /«Portal propio»: se declara prestado y P-01 dice «usuario»/.test(contradictory.motivo('op.nub.1.2')), contradictory.motivo('op.nub.1.2'));
  const oddP06 = evaluate(hoy(), { ...BASE, 'P-06': [...(BASE['P-06'] as string[]), 'Hetzner | hcloud | API'] });
  check('P-06 with a module that is not Wazuh\'s → CONFIGURATION naming the row', oddP06.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /«hcloud» no es un módulo cloud de Wazuh/.test(oddP06.motivo('op.nub.1.2')), oddP06.motivo('op.nub.1.2'));
}

section('7. Without a collector or with the source broken: NO_EVALUABLE by COLLECTION; what is measured is not covered');

{
  const nothing = evaluate([]);
  check('without any fact → EV-01 by COLLECTION', nothing.evidencia('EV-01')?.status === 'NO_EVALUABLE' && nothing.evidencia('EV-01')?.gapCause === 'COLLECTION', stateOf(nothing, 'EV-01'));
  check('and EV-04 also by COLLECTION (not by evidence)', nothing.evidencia('EV-04')?.gapCause === 'COLLECTION', stateOf(nothing, 'EV-04'));
  check('op.nub.1.2 is accredited with the file, saying ingestion was not measured', nothing.requisito('op.nub.1.2').attested === true && nothing.requisito('op.nub.1.2').observations.some(o => /^EV-01 sin medir \(sin recogida\)/.test(o)));

  const at14h = evaluate(hoy(), BASE, 'MEDIO', new Date('2026-10-10T02:10:00Z'));
  check(
    '14 h without passes → EV-01 NO_EVALUABLE by COLLECTION, and EV-04 cannot assert «sin operaciones»',
    at14h.evidencia('EV-01')?.status === 'NO_EVALUABLE' && at14h.evidencia('EV-01')?.gapCause === 'COLLECTION' && /más de 13 h/.test(at14h.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''),
    `${stateOf(at14h, 'EV-01')} ${at14h.deEvidencia('op.nub.1.2', 'EV-01')?.reason}`
  );
  const withoutOpsA = (now: string) => evaluate(hoy(l => (l.event === 'cloud_admin_operation_observed' ? undefined : l)), BASE, 'MEDIO', new Date(now));
  check('no operations and expired ingestion → EV-04 NO_EVALUABLE, never CUMPLE', withoutOpsA('2026-10-10T02:10:00Z').evidencia('EV-04')?.status === 'NO_EVALUABLE', stateOf(withoutOpsA('2026-10-10T02:10:00Z'), 'EV-04'));
  check('REVERSAL: at 12 h from the last pass → EV-01 CUMPLE and EV-04 CUMPLE', evaluate(hoy(), BASE, 'MEDIO', new Date('2026-10-10T00:05:00Z')).evidencia('EV-01')?.status === 'CUMPLE' && withoutOpsA('2026-10-10T00:05:00Z').evidencia('EV-04')?.status === 'CUMPLE');

  const old = evaluate(hoy(), BASE, 'MEDIO', new Date('2026-10-11T12:30:00Z'));
  check('two days without passes: the state does not describe today → EV-01 by COLLECTION', old.evidencia('EV-01')?.gapCause === 'COLLECTION' && /no está informando/.test(old.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''), old.deEvidencia('op.nub.1.2', 'EV-01')?.reason);

  const gap = (ev: string, cause: string, motive: string) =>
    ({ ts: `${COMPLETE}:30Z`, event: 'evidence_state', evidence_id: ev, requisito: 'op.nub.1.2', plano: 'central', estado: 'NO_EVALUABLE', causa: cause, motivo: motive });
  const withoutConf = evaluate(hoy().concat(events([gap('EV-01', 'COLLECTION', 'no se puede leer /var/ossec/etc/ossec.conf')])));
  check('ossec.conf unreadable after the pass → EV-01 NO_EVALUABLE with the collector\'s motive', withoutConf.evidencia('EV-01')?.status === 'NO_EVALUABLE' && /ossec\.conf/.test(withoutConf.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''));
  const stoppedAndGap = evaluate(events(PASSES.flatMap(ts => pass(ts)), l => (l.event === 'cloud_integration_observed' && l.modulo === 'aws-s3' ? { ...l, ultima_alerta: '2026-10-07T08:00:00Z' } : l)).concat(events([gap('EV-01', 'COLLECTION', 'no se puede leer ossec.log')])));
  check(
    'and if the pass had a stopped ingestion, the measurement prevails: NO_CUMPLE, with the degradation apart',
    stoppedAndGap.evidencia('EV-01')?.status === 'NO_CUMPLE' && /Además: El recolector no ha podido medirlo/.test(stoppedAndGap.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''),
    stoppedAndGap.deEvidencia('op.nub.1.2', 'EV-01')?.reason
  );
  const tope = evaluate(hoy(l => (l.event === 'cloud_admin_operation_observed' && l.modulo === 'azure-logs' && inTheLast(l) ? [l, { ...l, actor: 'contratista@externo.example' }] : l)).concat(events([gap('EV-04', 'EVIDENCE', 'más de 60 actores distintos en la pasada: no se emiten todos')])));
  check('too many actors in a pass (EVIDENCE) do not cover an unauthorized actor: NO_CUMPLE', tope.evidencia('EV-04')?.status === 'NO_CUMPLE' && /más de 60 actores/.test(tope.deEvidencia('op.nub.1.2', 'EV-04')?.reason || ''), tope.deEvidencia('op.nub.1.2', 'EV-04')?.reason);
  const cleanCap = evaluate(hoy().concat(events([gap('EV-04', 'EVIDENCE', 'más de 60 actores distintos en la pasada')])));
  check('REVERSAL: without an unauthorized actor, the incomplete view does not allow asserting: NO_EVALUABLE', cleanCap.evidencia('EV-04')?.status === 'NO_EVALUABLE');

  const line = integration(`${COMPLETE}:10Z`, 'aws-s3', { ultima_alerta: '2026-10-09T12:01:30Z' });
  const awsOnly = { ...BASE, 'P-06': ['AWS producción | aws-s3 | -'] };
  const own = evaluate(normalizeWazuhAlerts([alert(line), alert(heartbeat(`${COMPLETE}:40Z`))]), awsOnly);
  const ofAnother = evaluate(normalizeWazuhAlerts([alert(line, 'op.mon.1'), alert(heartbeat(`${COMPLETE}:40Z`), 'op.mon.1')]), awsOnly);
  check('a fact from another control does not accredit op.nub.1 (REVERSAL: the same, its own, does)', own.evidencia('EV-01')?.status === 'CUMPLE' && ofAnother.evidencia('EV-01')?.status === 'NO_EVALUABLE', `${stateOf(own, 'EV-01')} / ${stateOf(ofAnother, 'EV-01')}`);
}

section('7 bis. Without operations by people, EV-04 complies only if the module brings an administration log (fuentes_admin)');

{
  const AWS_P02 = 'AWS producción | IaaS | Amazon Web Services | expedientes | alta | utilizado';
  const ENTRA_P02 = 'Entra ID | SaaS | Microsoft | identidades | alta | utilizado';
  const AWS_P06 = 'AWS producción | aws-s3 | CloudTrail de la cuenta 123456789012';
  const ENTRA_P06 = 'Entra ID | ms-graph | auditoría e inicios de sesión del inquilino';
  const AWS_Y_ENTRA: Values = { ...BASE, 'P-02': [AWS_P02, ENTRA_P02], 'P-06': [AWS_P06, ENTRA_P06] };
  const AWS_ONLY: Values = { ...BASE, 'P-02': [AWS_P02], 'P-06': [AWS_P06] };
  const ONLY_ENTRA: Values = { ...BASE, 'P-02': [ENTRA_P02], 'P-06': [ENTRA_P06] };

  const withoutPeople = (changes: (l: Line) => Line | undefined = l => l) =>
    hoy(l => {
      if (l.event === 'cloud_admin_operation_observed' && l.tipo_actor !== 'servicio') {
        return undefined;
      }

      return changes(
        l.event === 'cloud_integration_observed' && l.modulo === 'azure-logs'
          ? { ...l, modulo: 'ms-graph', familia: 'ms-graph', fuentes_admin: '-' }
          : l
      );
    });
  const ev04 = (r: ReturnType<typeof evaluate>) => r.deEvidencia('op.nub.1.2', 'EV-04')?.reason || '';

  const onlyEntra = evaluate(withoutPeople(), ONLY_ENTRA);
  check(
    'only Entra ID (ms-graph, fuentes_admin = -), alive and without operations → EV-04 NO_EVALUABLE by EVIDENCE, never CUMPLE',
    onlyEntra.evidencia('EV-01')?.status === 'CUMPLE' &&
      stateOf(onlyEntra, 'EV-04') === 'NO_EVALUABLE EVIDENCE' &&
      /«Entra ID» \(ms-graph\): ninguna operación de administración de una persona/.test(ev04(onlyEntra)) &&
      /ms-graph no trae ningún registro de administración que ENSFácil lea/.test(ev04(onlyEntra)),
    `${stateOf(onlyEntra, 'EV-01')} / ${stateOf(onlyEntra, 'EV-04')} ${ev04(onlyEntra)}`
  );

  const awsOnly = evaluate(withoutPeople(), AWS_ONLY);
  check(
    'REVERSAL: AWS with CloudTrail read in 30 days and no operations by people → EV-04 CUMPLE',
    awsOnly.evidencia('EV-04')?.status === 'CUMPLE' && /lee su registro de administración \(CloudTrail, con eventos en los últimos 30 días\)/.test(ev04(awsOnly)),
    `${stateOf(awsOnly, 'EV-04')} ${ev04(awsOnly)}`
  );

  const awsAndEntra = evaluate(withoutPeople(), AWS_Y_ENTRA);
  check(
    'AWS with CloudTrail and Entra ID without an administration log → EV-04 NO_EVALUABLE (Entra cannot be asserted)',
    stateOf(awsAndEntra, 'EV-04') === 'NO_EVALUABLE EVIDENCE' && /Entra ID/.test(ev04(awsAndEntra)),
    `${stateOf(awsAndEntra, 'EV-04')} ${ev04(awsAndEntra)}`
  );

  const awsWithoutCloudTrail = evaluate(withoutPeople(l => (l.event === 'cloud_integration_observed' && l.modulo === 'aws-s3' ? { ...l, fuentes_admin: '-' } : l)), AWS_ONLY);
  check(
    'aws-s3 alive without CloudTrail (fuentes_admin = -) → NO_EVALUABLE by EVIDENCE, saying what to enable',
    stateOf(awsWithoutCloudTrail, 'EV-04') === 'NO_EVALUABLE EVIDENCE' && /Para medirlo, activa CloudTrail/.test(ev04(awsWithoutCloudTrail)),
    `${stateOf(awsWithoutCloudTrail, 'EV-04')} ${ev04(awsWithoutCloudTrail)}`
  );

  const withoutField = evaluate(
    withoutPeople(l => {
      if (l.event !== 'cloud_integration_observed' || l.modulo !== 'aws-s3') {
        return l;
      }

      const { fuentes_admin: _outside, ...rest } = l;

      return rest;
    }),
    AWS_ONLY
  );
  check(
    'a fact without fuentes_admin (earlier collector) → NO_EVALUABLE by COLLECTION',
    stateOf(withoutField, 'EV-04') === 'NO_EVALUABLE COLLECTION' && /falta fuentes_admin/.test(ev04(withoutField)),
    `${stateOf(withoutField, 'EV-04')} ${ev04(withoutField)}`
  );

  const withPerson = evaluate(
    hoy(l =>
      l.event === 'cloud_integration_observed' && l.modulo === 'aws-s3' ? { ...l, fuentes_admin: '-' } : l
    ),
    AWS_ONLY
  );
  check(
    'REVERSAL: with operations by people, fuentes_admin does not count: they are judged against P-11 → CUMPLE',
    withPerson.evidencia('EV-04')?.status === 'CUMPLE' && /role\/Admin/.test(ev04(withPerson)),
    `${stateOf(withPerson, 'EV-04')} ${ev04(withPerson)}`
  );
}

section('8. The age of records is measured when observed, not when evaluating');

{
  const yesterday = (l: Line) => (l.event === 'cloud_integration_observed' && l.modulo === 'aws-s3' ? { ...l, ultima_alerta: '2026-10-08T13:00:00Z' } : l);
  const r = evaluate(hoy(yesterday), BASE, 'MEDIO', new Date('2026-10-09T20:00:00Z'));
  check('23 h before the observation with P-13 = 24 → CUMPLE even if at evaluation it is 31 h', r.evidencia('EV-01')?.status === 'CUMPLE', r.deEvidencia('op.nub.1.2', 'EV-01')?.reason);
  check('REVERSAL: with P-13 = 20 → NO_CUMPLE, and the motive gives the hours at observation', evaluate(hoy(yesterday), { ...BASE, 'P-13': '20' }, 'MEDIO', new Date('2026-10-09T20:00:00Z')).evidencia('EV-01')?.status === 'NO_CUMPLE' &&
    /23\.1 h antes de la observación/.test(evaluate(hoy(yesterday), { ...BASE, 'P-13': '20' }).motivo('op.nub.1.2')));

  const newOne = (since: string) => hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'gcp-pubsub' ? { ...l, ultima_alerta: '-', alertas_24h: 0, observado_desde: since } : l));
  check('gcp-pubsub without records for 3 days → NO_CUMPLE', evaluate(newOne('2026-10-06T12:05:00Z')).evidencia('EV-01')?.status === 'NO_CUMPLE');
  check('REVERSAL: observed only for 6 h → cannot be asserted: NO_EVALUABLE, never CUMPLE', evaluate(newOne('2026-10-09T06:05:00Z')).evidencia('EV-01')?.status === 'NO_EVALUABLE');

  const secreto = evaluate(hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'gcp-pubsub' ? { ...l, secreto_en_linea: 'si' } : l)));
  check('a credential written on the manager is warned about without changing the verdict', secreto.evidencia('EV-01')?.status === 'CUMPLE' && /Aviso: gcp-pubsub en manager lleva la credencial/.test(secreto.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''));
  const foreignOne = evaluate(hoy(l => (l.event === 'cloud_integration_observed' && inTheLast(l) && l.modulo === 'gcp-pubsub' ? [l, { ...l, modulo: 'office365', familia: 'office365', donde: 'agente:031' }] : l)));
  check('a module Wazuh ingests and P-06 does not declare is mentioned, without a verdict', foreignOne.evidencia('EV-01')?.status === 'CUMPLE' && /Wazuh ingiere además office365, que P-06 no declara/.test(foreignOne.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''));
}

section('9. R2 at ALTA: provider posture findings; without them, not automatable');

{
  const P07 = { ...BASE, 'P-07': ['AWS producción | CCN-STIC-887 | AWS Foundational Security Best Practices'] };
  const withoutPosture = evaluate(hoy(), P07, 'ALTO');
  check(
    'without posture findings (fuente=ninguna) → R2 NO_EVALUABLE, not proven: there is no cloud SCA',
    withoutPosture.evidencia('EV-02')?.status === 'NO_EVALUABLE' && withoutPosture.requisito('op.nub.1.r2.1').evidenced === false && /no es automatizable/.test(withoutPosture.motivo('op.nub.1.r2.1')),
    withoutPosture.motivo('op.nub.1.r2.1')
  );
  const hub = (failed: number) =>
    hoy(l => (l.event === 'cloud_posture_finding_observed' && inTheLast(l)
      ? { ...l, modulo: 'aws-s3', fuente: 'securityhub', estandar: 'AWS Foundational Security Best Practices v1.0.0', cuenta: '123456789012', controles_evaluados: 212, controles_fallidos: failed, fallidos_criticos: failed ? 1 : 0, fallidos: failed ? 'S3.2,IAM.6,EC2.19' : '-', ultimo_hallazgo: '2026-10-09T11:00:00Z' }
      : l));
  const fail2 = evaluate(hub(3), P07, 'ALTO');
  check('Security Hub with 3 failed controls → R2 measured NO_CUMPLE, naming them', fail2.requisito('op.nub.1.r2.1').status === 'NO_CUMPLE' && fail2.requisito('op.nub.1.r2.1').evidenced === true && /S3\.2/.test(fail2.motivo('op.nub.1.r2.1')), fail2.motivo('op.nub.1.r2.1'));
  check('REVERSAL: the 212 controls pass → R2 CUMPLE (measured, not accredited)', evaluate(hub(0), P07, 'ALTO').requisito('op.nub.1.r2.1').status === 'CUMPLE' && !evaluate(hub(0), P07, 'ALTO').requisito('op.nub.1.r2.1').attested);
  const unreadable = evaluate(hoy(l => (l.event === 'cloud_posture_finding_observed' && inTheLast(l)
    ? { ...l, modulo: 'aws-s3', fuente: 'securityhub', estandar: 'AWS Foundational Security Best Practices v1.0.0', controles_evaluados: '-', controles_fallidos: '-', fallidos: '-' }
    : l)), P07, 'ALTO');
  check(
    'controles_fallidos «-» (unreadable) → NO_EVALUABLE, never read as zero (CUMPLE)',
    unreadable.evidencia('EV-02')?.status === 'NO_EVALUABLE' && /recuento «-»/.test(unreadable.motivo('op.nub.1.r2.1')),
    `${stateOf(unreadable, 'EV-02')} ${unreadable.motivo('op.nub.1.r2.1')}`
  );
  const withoutTotal = evaluate(hoy(l => (l.event === 'cloud_posture_finding_observed' && inTheLast(l)
    ? { ...l, modulo: 'aws-s3', fuente: 'securityhub', estandar: 'AWS Foundational Security Best Practices v1.0.0', controles_evaluados: '-', controles_fallidos: 3, fallidos_criticos: 1, fallidos: 'S3.2,IAM.6,EC2.19' }
    : l)), P07, 'ALTO');
  check(
    '3 failed without a total of evaluated («-») → NO_CUMPLE that says «sin total de evaluados», never «3 de 0»',
    withoutTotal.evidencia('EV-02')?.status === 'NO_CUMPLE' && /3 controles fallidos \(sin total de evaluados\)/.test(withoutTotal.motivo('op.nub.1.r2.1')) && !/ de 0 /.test(withoutTotal.motivo('op.nub.1.r2.1')),
    withoutTotal.motivo('op.nub.1.r2.1')
  );
  check('REVERSAL: with the total, «3 de 212 controles fallidos»', /3 de 212 controles fallidos/.test(fail2.motivo('op.nub.1.r2.1')), fail2.motivo('op.nub.1.r2.1'));
  check('with another standard declared in P-07, those findings do not count → NO_EVALUABLE', evaluate(hub(3), { ...BASE, 'P-07': ['AWS producción | CCN-STIC-887 | CIS AWS Foundations'] }, 'ALTO').evidencia('EV-02')?.status === 'NO_EVALUABLE');
  check('without P-07 at ALTA → CONFIGURATION', evaluate(hub(0), BASE, 'ALTO').evidencia('EV-02')?.gapCause === 'CONFIGURATION');
  check('Hetzner in P-07, without integration → not automatable', /«Hetzner»: no tiene integración en Wazuh/.test(evaluate(hub(0), { ...BASE, 'P-07': ['Hetzner | CCN-STIC-887 | -'] }, 'ALTO').motivo('op.nub.1.r2.1')));
}

section('10. Provider (op.nub.1.1) and security services (R1.2): documentary, with their validity and without P-ATT');

{
  const provider = { 'P-01': 'prestador', 'P-02': ['Portal de trámites | SaaS | Quersystem | expedientes | alta | prestado'] };
  const withoutP03 = evaluate([], provider);
  check(
    'provider without P-03 → op.nub.1.1 not proven (CONFIGURATION), naming what is provided',
    withoutP03.requisito('op.nub.1.1').status === 'NO_CUMPLE' && withoutP03.requisito('op.nub.1.1').evidenced === false && /Portal de trámites/.test(withoutP03.motivo('op.nub.1.1')),
    withoutP03.motivo('op.nub.1.1')
  );
  check('and op.nub.1.2, R1 and R1.2 do not apply: it uses no third-party services', ['op.nub.1.2', 'op.nub.1.r1.1', 'op.nub.1.r1.2'].every(id => withoutP03.requisito(id).status === 'NO_APLICA'));
  const withConformity = (validity: string) =>
    evaluate([], { ...provider, 'P-03': [`Portal de trámites | ENS MEDIA | SaaS de tramitación | ${validity} | certificado de conformidad nº 2026/300`] });
  check(
    'REVERSAL: with the ENS MEDIA conformity in force in P-03 → op.nub.1.1 accredited CUMPLE',
    withConformity('2027-09-30').requisito('op.nub.1.1').status === 'CUMPLE' && withConformity('2027-09-30').requisito('op.nub.1.1').attested === true,
    withConformity('2027-09-30').motivo('op.nub.1.1')
  );
  check('the provider\'s control comes out CUMPLE with its conformity', withConformity('2027-09-30').motor().status === 'CUMPLE', withConformity('2027-09-30').motor().status);
  const expired = withConformity('2026-09-30');
  check(
    'with the conformity expired → documentary NO_CUMPLE: «Declarado (documental)», not «Medido»',
    expired.requisito('op.nub.1.1').status === 'NO_CUMPLE' && expired.requisito('op.nub.1.1').documental === true && ensRequirementProofLabel(expired.requisito('op.nub.1.1')) === 'Declarado (documental)',
    `${expired.requisito('op.nub.1.1').status} ${expired.motivo('op.nub.1.1')}`
  );

  const empty = evaluate(hoy(), { ...BASE, 'P-05': undefined });
  check(
    'empty P-05 → R1.2 not proven by CONFIGURATION, asking for «ninguno» (never NO_APLICA by absence)',
    empty.requisito('op.nub.1.r1.2').status === 'NO_CUMPLE' && empty.requisito('op.nub.1.r1.2').evidenced === false &&
      empty.decisions.find(d => d.requirementId === 'op.nub.1.r1.2')?.cause === 'CONFIGURATION' && /una sola fila «ninguno»/.test(empty.motivo('op.nub.1.r1.2')),
    `${empty.requisito('op.nub.1.r1.2').status} ${empty.motivo('op.nub.1.r1.2')}`
  );
  check('REVERSAL: the same configuration with P-05 = «ninguno» → NO_APLICA', evaluate(hoy(), BASE).requisito('op.nub.1.r1.2').status === 'NO_APLICA');
  const mix = evaluate(hoy(), { ...BASE, 'P-05': ['ninguno', 'SIEM gestionado | SIEM | sí'] });
  check(
    '«ninguno» mixed with a service → CONFIGURATION, never NO_APLICA',
    mix.requisito('op.nub.1.r1.2').evidenced === false && mix.decisions.find(d => d.requirementId === 'op.nub.1.r1.2')?.cause === 'CONFIGURATION' && /mezcla «ninguno»/.test(mix.motivo('op.nub.1.r1.2')),
    mix.motivo('op.nub.1.r1.2')
  );

  const siem = (row: string) => evaluate(hoy(), { ...BASE, 'P-05': [row] });
  const withoutRef = siem('SIEM gestionado | SIEM | sí');
  check(
    'a security service with «sí» but without the verification reference → not proven (CONFIGURATION), naming the row',
    withoutRef.requisito('op.nub.1.r1.2').status === 'NO_CUMPLE' && withoutRef.requisito('op.nub.1.r1.2').evidenced === false && /P-05, fila de «SIEM gestionado»/.test(withoutRef.motivo('op.nub.1.r1.2')),
    withoutRef.motivo('op.nub.1.r1.2')
  );
  const valid = siem('SIEM gestionado | SIEM | sí | informe de verificación op.pl.5 nº 12 | 2027-05-31');
  check(
    'REVERSAL: with reference and validity in force → R1.2 documentarily accredited CUMPLE',
    valid.requisito('op.nub.1.r1.2').status === 'CUMPLE' && valid.requisito('op.nub.1.r1.2').attested === true,
    valid.motivo('op.nub.1.r1.2')
  );
  const expiredOne = siem('SIEM gestionado | SIEM | sí | informe de verificación op.pl.5 nº 12 | 2026-05-31');
  check(
    'the verification expired → documentary NO_CUMPLE',
    expiredOne.requisito('op.nub.1.r1.2').status === 'NO_CUMPLE' && expiredOne.requisito('op.nub.1.r1.2').documental === true && /venció el 2026-05-31/.test(expiredOne.motivo('op.nub.1.r1.2')),
    expiredOne.motivo('op.nub.1.r1.2')
  );
  const noPl5 = siem('SIEM gestionado | SIEM | no | - | 2027-05-31');
  check('«cumple op.pl.5 = no» is a declared breach', noPl5.requisito('op.nub.1.r1.2').status === 'NO_CUMPLE' && noPl5.requisito('op.nub.1.r1.2').evidenced === true && !noPl5.requisito('op.nub.1.r1.2').attested);

  const ambos = {
    ...BASE,
    'P-01': 'ambos',
    'P-02': [...(BASE['P-02'] as string[]), 'Portal de trámites | SaaS | Quersystem | expedientes | alta | prestado'],
  };
  const r = evaluate(hoy(), ambos);
  check('both: the provided service does not enter the third-party file (op.nub.1.2 stays accredited)', r.requisito('op.nub.1.2').attested === true, r.motivo('op.nub.1.2'));
  const bothWithModule = { ...ambos, 'P-06': [...(BASE['P-06'] as string[]), 'Portal de trámites | github | organización del portal'] };
  const providedIntegrated = evaluate(hoy(), bothWithModule);
  check(
    'both: a PROVIDED service declared in P-06 without a Wazuh module does not count in op.nub.1.2\'s EV-01',
    providedIntegrated.evidencia('EV-01')?.status === 'CUMPLE' && !/github/.test(providedIntegrated.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''),
    providedIntegrated.deEvidencia('op.nub.1.2', 'EV-01')?.reason
  );
  check(
    'REVERSAL: the same service declared as used → EV-01 NO_CUMPLE (it has no github module)',
    evaluate(hoy(), {
      ...bothWithModule,
      'P-02': [...(BASE['P-02'] as string[]), 'Portal de trámites | SaaS | Quersystem | expedientes | alta | utilizado'],
      'P-03': [...(BASE['P-03'] as string[]), 'Portal de trámites | ENS MEDIA | x | 2027-09-30 | nº'],
    }).evidencia('EV-01')?.status === 'NO_CUMPLE'
  );
  check(
    'and op.nub.1.1 judges the conformity of what is provided: without a P-03 row → documentary NO_CUMPLE',
    r.requisito('op.nub.1.1').status === 'NO_CUMPLE' && r.requisito('op.nub.1.1').documental === true && /«Portal de trámites» \(SaaS\): sin conformidad/.test(r.motivo('op.nub.1.1')),
    r.motivo('op.nub.1.1')
  );
}

section('11. Volume: a simulated customer day fits the budget; lines, logcollector');

{
  const day = ['00', '06', '12', '18'].flatMap(h => pass(`2026-10-09T${h}:05`));
  check(`a simulated customer day is ${day.length} facts, below the budget's 300`, day.length <= 300, day.length);

  const large = 4 * (3 + 3 + 60 + 60 + 1);
  check(`with the contract cap (60 actors per type and pass) it is ${large} per day: the cap exists for this`, large <= 600, large);

  const long = access(`${COMPLETE}:16Z`, 'aws-s3', `arn:aws:iam::123456789012:user/${'x'.repeat(64)}`, {
    origenes: Array.from({ length: 10 }, (_, i) => `2001:db8:1234:5678:9abc:def0:1234:${String(i).padStart(4, '0')}`).join(','),
  });
  const postureShort = posture(`${COMPLETE}:12Z`, { fallidos: Array.from({ length: 20 }, (_, i) => `CloudFront.${i + 100}`).join(','), estandar: 'x'.repeat(120) });
  const bytes = [long, postureShort].map(l => new TextEncoder().encode(JSON.stringify({ ensfacil: 'op.nub.1', host: 'Wazuh-4', ...l })).length);
  check('lines with lists at the cap do not exceed 8 KiB', Math.max(...bytes) <= 8192, Math.max(...bytes));
}

section('12. Collector stopped: documentary survives (mark `documental`); technical goes to no collection');

{
  const PARADO = { since: '2026-10-07T12:05:40Z', reference: 'collector_run' as const, reason: 'Sin datos del recolector desde el 2026-10-07 12:05 UTC.' };
  const parado = (values: Values, changes?: (l: Line) => Line | Line[] | undefined) => {
    const r = evaluate(hoy(changes), values);
    const decisions = markPolicyRuntimeStale(
      { controlId: 'op.nub.1', policyId: opNub1PolicyDefinition.id, evaluatedAt: NOW.toISOString(), decisions: r.decisions, appliedParameters: [], runtimeVariables: [] },
      PARADO
    )!.decisions;
    const cfg = configuration(values);
    const evidences = markEvidencesStale(resolveEvidenceForControl('op.nub.1', [], '000', 'MEDIO', cfg, NOW), PARADO);
    const tabla = applyPolicyDecisionsToEvidences(evidences, decisions, opNub1CatalogDefinition.requirements);
    const requirement = (id: string) =>
      evaluateRequirement(opNub1CatalogDefinition.requirements.find(q => q.id === id)!, 'MEDIO', tabla, false, decisions, 'ACTIVE');

    return { decisiones: decisions, tabla, requisito: requirement };
  };

  const withoutCertificate = parado({ ...BASE, 'P-04': (BASE['P-04'] as string[]).filter(f => !f.startsWith('Hetzner')) });
  check(
    'R1\'s missing certification is still a documentary NO_CUMPLE, not «sin recogida»',
    withoutCertificate.requisito('op.nub.1.r1.1').status === 'NO_CUMPLE' && withoutCertificate.requisito('op.nub.1.r1.1').evidenced === true && withoutCertificate.requisito('op.nub.1.r1.1').documental === true,
    `${withoutCertificate.requisito('op.nub.1.r1.1').status} ${withoutCertificate.requisito('op.nub.1.r1.1').evidenced}`
  );
  check(
    'the file still accredits op.nub.1.2, and ingestion is reported as no collection',
    withoutCertificate.requisito('op.nub.1.2').attested === true && withoutCertificate.tabla.find(e => e.id === 'EV-01')?.gapCause === 'COLLECTION' && withoutCertificate.tabla.find(e => e.id === 'EV-09')?.status === 'CUMPLE',
    `${withoutCertificate.requisito('op.nub.1.2').status} ${withoutCertificate.tabla.find(e => e.id === 'EV-01')?.status}`
  );
  const intruder2 = parado(BASE, l => (l.event === 'cloud_admin_operation_observed' && l.modulo === 'azure-logs' && inTheLast(l) ? [l, { ...l, actor: 'contratista@externo.example' }] : l));
  check(
    'a technical NO_CUMPLE (unauthorized actor) does NOT survive: with old data, not proven',
    intruder2.decisiones.find(d => d.requirementId === 'op.nub.1.2')?.documental !== true && intruder2.requisito('op.nub.1.2').status === 'NO_CUMPLE' && intruder2.requisito('op.nub.1.2').evidenced === false,
    `${intruder2.requisito('op.nub.1.2').status} ${intruder2.requisito('op.nub.1.2').evidenced}`
  );
  check(
    'op.nub.1\'s documentary decisions carry the mark: R1, EV-08 and EV-09',
    ['op.nub.1.r1.1', 'op.nub.1.r1.1/EV-08', 'op.nub.1.2/EV-09'].every(id => evaluate(hoy()).decisions.find(d => d.trace.ruleId === id)?.documental === true) &&
      evaluate(hoy()).decisions.filter(d => ['op.nub.1.2/EV-01', 'op.nub.1.2/EV-04', 'op.nub.1.2/EV-07'].includes(d.trace.ruleId)).every(d => !d.documental)
  );
  check(
    'and the label of a documentary NO_CUMPLE is «Declarado (documental)»',
    ensRequirementProofLabel(withoutCertificate.requisito('op.nub.1.r1.1')) === 'Declarado (documental)'
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
