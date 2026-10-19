/** The gap cause reaches the evidence and the requirement intact. */
import { opExp5CatalogDefinition } from '../common/ens/catalog/op-exp-5';
import { opExp5Configuration } from '../common/ens/configuration/data/op-exp-5-parameters';
import { opExp8Configuration } from '../common/ens/configuration/data/op-exp-8-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import type { ENSPolicyDecision } from '../common/ens/core/policy-runtime/types';
import type { ENSComplianceStatus, ENSGapCause } from '../common/ens/core/evaluation/types';
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

const NOW = new Date('2026-09-26T23:34:23Z');

let counter = 0;

const alert = (control: string, agent: { id: string; name: string }, data: Record<string, unknown>) => {
  counter += 1;

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': '2026-09-26T23:26:50.000Z',
      agent: agent,
      rule: { id: '110950', description: control },
      data: Object.fromEntries(Object.entries({ ensfacil: control, ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const MANAGER = { id: '000', name: 'Wazuh-4' };
const REAL = { id: '024', name: 'wazuh-real' };

const decision = (
  requirement: string,
  estado: ENSComplianceStatus,
  evidences: string[],
  cause?: ENSGapCause
): ENSPolicyDecision => ({
  policyId: 'policy.prueba',
  requirementId: requirement,
  status: estado,
  parameterIds: [],
  evidenceIds: evidences,
  eventIds: [],
  runtimeVariables: [],
  trace: { ruleId: requirement, ruleType: 'COVERAGE_REQUIRED', expression: '', expected: '', actual: estado, result: false },
  reason: 'motivo de la policy',
  ...(cause ? { cause: cause } : {}),
});

section('1. A NO_EVALUABLE evidence_state arrives with the cause the collector declares');

{
  const events = normalizeWazuhAlerts([
    alert('op.exp.8', MANAGER, {
      event: 'evidence_state', evidence_id: 'EV-05', requisito: 'op.exp.8.r1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION',
      motivo: 'no existe el registro de revisiones de los registros /etc/ensfacil/log-review-register.tsv: no consta donde anota la organizacion sus revisiones',
    }),
  ]);
  const ev05 = resolveEvidenceForControl('op.exp.8', events, '000', 'MEDIO', opExp8Configuration, NOW).find(e => e.id === 'EV-05');
  check('absent record, cause=CONFIGURATION → gapCause CONFIGURATION (formerly EVIDENCE)', ev05?.status === 'NO_EVALUABLE' && ev05?.gapCause === 'CONFIGURATION', `${ev05?.status} ${ev05?.gapCause}`);

  const read = normalizeWazuhAlerts([
    alert('op.exp.8', MANAGER, { event: 'evidence_state', evidence_id: 'EV-05', estado: 'NO_EVALUABLE', causa: 'collection', motivo: 'no se puede leer' }),
  ]);
  check(
    'the cause is read case-insensitively (collection → COLLECTION)',
    resolveEvidenceForControl('op.exp.8', read, '000', 'MEDIO', opExp8Configuration, NOW).find(e => e.id === 'EV-05')?.gapCause === 'COLLECTION'
  );

  const withoutCause = normalizeWazuhAlerts([
    alert('op.exp.8', MANAGER, { event: 'evidence_state', evidence_id: 'EV-05', estado: 'NO_EVALUABLE', motivo: 'algo' }),
  ]);
  check(
    'without a declared cause it is still EVIDENCE: the data arrived and is not enough',
    resolveEvidenceForControl('op.exp.8', withoutCause, '000', 'MEDIO', opExp8Configuration, NOW).find(e => e.id === 'EV-05')?.gapCause === 'EVIDENCE'
  );

  const odd = normalizeWazuhAlerts([
    alert('op.exp.8', MANAGER, { event: 'evidence_state', evidence_id: 'EV-05', estado: 'NO_EVALUABLE', causa: 'CATALOG', motivo: 'x' }),
  ]);
  check(
    'CATALOG is not an evidence cause: ignored (EVIDENCE)',
    resolveEvidenceForControl('op.exp.8', odd, '000', 'MEDIO', opExp8Configuration, NOW).find(e => e.id === 'EV-05')?.gapCause === 'EVIDENCE'
  );
}

section('2. The evidence a policy fills in carries the cause the policy declares');

const facts5 = normalizeWazuhAlerts([
  alert('op.exp.5', REAL, { event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-01,EV-02' }),
]);
const classic = resolveEvidenceForControl('op.exp.5', facts5, '024', 'MEDIO', opExp5Configuration, NOW);

{
  check('starting point: the classic model says COLLECTION for EV-05', classic.find(e => e.id === 'EV-05')?.gapCause === 'COLLECTION', classic.find(e => e.id === 'EV-05')?.gapCause);

  const decisiones = [
    decision('op.exp.5.3', 'NO_EVALUABLE', ['EV-05'], 'CONFIGURATION'),
    decision('op.exp.5.3', 'NO_EVALUABLE', ['EV-05'], 'CONFIGURATION'),
  ];
  const tabla = applyPolicyDecisionsToEvidences(classic, decisiones, opExp5CatalogDefinition.requirements);
  check('with the policy\'s cause, EV-05 comes out CONFIGURATION', tabla.find(e => e.id === 'EV-05')?.gapCause === 'CONFIGURATION', tabla.find(e => e.id === 'EV-05')?.gapCause);

  const mixed = applyPolicyDecisionsToEvidences(
    classic,
    [decision('op.exp.5.1', 'NO_EVALUABLE', ['EV-01', 'EV-02'], 'EVIDENCE'), decision('op.exp.5.1', 'NO_EVALUABLE', ['EV-02'], 'CONFIGURATION')],
    opExp5CatalogDefinition.requirements
  );
  check('the decision that names ONLY that evidence prevails', mixed.find(e => e.id === 'EV-02')?.gapCause === 'CONFIGURATION', mixed.find(e => e.id === 'EV-02')?.gapCause);

  const silent = applyPolicyDecisionsToEvidences(classic, [decision('op.exp.5.3', 'NO_EVALUABLE', ['EV-05'])], opExp5CatalogDefinition.requirements);
  check('a policy that declares no cause does not change the existing one (those of earlier controls)', silent.find(e => e.id === 'EV-05')?.gapCause === 'COLLECTION', silent.find(e => e.id === 'EV-05')?.gapCause);

  const nothing = applyPolicyDecisionsToEvidences(classic, decisiones, opExp5CatalogDefinition.requirements, true);
  check('if NOTHING from the control has arrived from the machine, the gap is a collection one (COLLECTION)', nothing.find(e => e.id === 'EV-05')?.gapCause === 'COLLECTION', nothing.find(e => e.id === 'EV-05')?.gapCause);
}

section('3. The cause reaches the requirement\'s nonconformity');

{
  const runtime = (decisiones: ENSPolicyDecision[]) => ({
    controlId: 'op.exp.5',
    policyId: 'policy.prueba',
    evaluatedAt: NOW.toISOString(),
    decisions: decisiones,
    appliedParameters: [],
    runtimeVariables: [],
  });
  const decisiones = [decision('op.exp.5.3', 'NO_EVALUABLE', ['EV-05'], 'CONFIGURATION')];

  const withFacts = evaluateENSControl(opExp5CatalogDefinition, opExp5Configuration, 'MEDIO', classic, runtime(decisiones), facts5);
  const nc = withFacts.nonConformities.find(n => n.requirementId === 'op.exp.5.3');
  check('op.exp.5.3 with the collector reporting and P-05 undeclared → NC CONFIGURATION (formerly COLLECTION)', nc?.cause === 'CONFIGURATION', `${nc?.origin} ${nc?.cause}`);

  const withoutFacts = evaluateENSControl(
    opExp5CatalogDefinition,
    opExp5Configuration,
    'MEDIO',
    resolveEvidenceForControl('op.exp.5', [], '028', 'MEDIO', opExp5Configuration, NOW),
    runtime(decisiones),
    []
  );
  const nc2 = withoutFacts.nonConformities.find(n => n.requirementId === 'op.exp.5.3');
  check('REVERSAL: the same decision on a machine from which nothing arrives → COLLECTION', nc2?.cause === 'COLLECTION', `${nc2?.origin} ${nc2?.cause}`);
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
