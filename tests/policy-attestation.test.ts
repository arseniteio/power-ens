/** Policy-level documentary attestation: `attested` in `ENSPolicyDecision`. */
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import { consolidateAgentComplianceResultByControl } from '../common/ens/core/compliance-state/consolidation';
import type { ENSAgentComplianceState } from '../common/ens/core/compliance-state/types';
import type {
  ENSPolicyDecision,
  ENSPolicyRuntimeResult,
} from '../common/ens/core/policy-runtime/types';
import { opAcc1CatalogDefinition } from '../common/ens/catalog/op-acc-1';
import { opAcc1Configuration } from '../common/ens/configuration/data/op-acc-1-parameters';
import type { ENSControlDefinition } from '../common/ens/catalog/types';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../common/ens/configuration/types';
import type { ENSComplianceStatus } from '../common/ens/core/evaluation/types';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';
import { compliantRequirementLabel } from '../public/ens/controls/control-detail/general-view';
import { ensRequirementProofLabel } from '../public/ens/reports/report-rows';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (name: string, condition: boolean, detail: string = ''): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

const CONTROL: ENSControlDefinition = opAcc1CatalogDefinition;

const requirement = (id: string) => {
  const found = CONTROL.requirements.find(item => item.id === id);

  if (!found) {
    throw new Error(`broken fixture: ${id} is not in the catalog`);
  }

  return found;
};

const evidence = (id: string, status: ENSComplianceStatus, observations: string[] = []): ENSEvidenceResolved => {
  const definition = getEvidenceDefinitions('op.acc.1').find(item => item.id === id);

  if (!definition) {
    throw new Error(`fixture rota: ${id}`);
  }

  return { ...definition, status, observations } as ENSEvidenceResolved;
};

const decision = (
  requirementId: string,
  status: ENSComplianceStatus,
  extra: Partial<ENSPolicyDecision> = {}
): ENSPolicyDecision => ({
  policyId: 'prueba',
  requirementId: requirementId,
  status,
  parameterIds: [],
  evidenceIds: [],
  eventIds: [],
  runtimeVariables: [],
  trace: {
    ruleId: requirementId,
    ruleType: 'MAX_AGE',
    expression: 'prueba',
    expected: 'prueba',
    actual: status,
    result: status === 'CUMPLE',
  },
  reason: 'Plan de continuidad v4 aprobado el 2026-03-01, dentro de la periodicidad de 12 meses',
  ...extra,
});

const REQ = 'op.acc.1.2';

const judges = (
  evidences: ENSEvidenceResolved[],
  decisions: ENSPolicyDecision[],
  requirementId: string = REQ,
  estadoControl: ENSControlDefinition['status'] = 'ACTIVE',
  level: 'BAJO' | 'MEDIO' | 'ALTO' = 'MEDIO'
) => evaluateRequirement(requirement(requirementId), level, evidences, false, decisions, estadoControl);

const ACCREDITS = decision(REQ, 'CUMPLE', { attested: true });

section('1. A CUMPLE decision with `attested` complies marked as documentary');

{
  const r = judges([evidence('EV-05', 'CUMPLE'), evidence('EV-06', 'NO_EVALUABLE')], [ACCREDITS]);

  check('CUMPLE', r.status === 'CUMPLE', r.status);
  check('marked as documentarily accredited', r.attested === true, String(r.attested));
  check('proven (with the proof the ENS asks for)', r.evidenced === true, String(r.evidenced));
  check('with its score', r.score === 100, String(r.score));
  check(
    'the motive says it is documentary and carries the declaration',
    (r.observations[0] || '').startsWith('Acreditado documentalmente: ') &&
      (r.observations[0] || '').includes('Plan de continuidad v4'),
    r.observations[0]
  );
  check('keeps the catalog\'s evidences', r.evidenceIds.join(',') === 'EV-05,EV-06', r.evidenceIds.join(','));

  const withoutMark = judges([evidence('EV-05', 'CUMPLE'), evidence('EV-06', 'NO_EVALUABLE')], [decision(REQ, 'CUMPLE')]);

  check(
    'the reversal: without `attested`, it complies as measured and without the mark',
    withoutMark.status === 'CUMPLE' && withoutMark.attested !== true,
    `${withoutMark.status} attested=${withoutMark.attested}`
  );

  const alreadySaysIt = judges([], [decision(REQ, 'CUMPLE', { attested: true, reason: 'Acreditado documentalmente: contrato vigente' })]);

  check(
    'a motive that already starts with «Acreditado documentalmente» is not duplicated',
    alreadySaysIt.observations[0] === 'Acreditado documentalmente: contrato vigente',
    alreadySaysIt.observations[0]
  );

  const withoutEvidences = judges([], [decision('op.acc.1.5', 'CUMPLE', { attested: true })], 'op.acc.1.5');

  check(
    'in a requirement without evidences it also accredits',
    withoutEvidences.status === 'CUMPLE' && withoutEvidences.attested === true,
    `${withoutEvidences.status} attested=${withoutEvidences.attested}`
  );
}

section('1 bis. Accredited, but what remains unmeasured is stated');

{
  const unmeasured = { ...evidence('EV-06', 'NO_EVALUABLE', ['no ha llegado nada del recolector']), gapCause: 'COLLECTION' as const };
  const r = judges([evidence('EV-05', 'CUMPLE'), unmeasured], [ACCREDITS]);

  check(
    'the first observation is still the accreditation',
    (r.observations[0] || '').startsWith('Acreditado documentalmente: '),
    r.observations[0]
  );
  check(
    'and after it, the unmeasured evidence with its cause',
    r.observations.includes('EV-06 sin medir (sin recogida)'),
    r.observations.join(' | ')
  );
  check(
    'the one that was measured is not named as unmeasured',
    !r.observations.some(o => o.startsWith('EV-05 sin medir')),
    r.observations.join(' | ')
  );

  const withoutCause = judges([evidence('EV-05', 'NO_EVALUABLE')], [ACCREDITS]);

  check(
    'without a declared cause: «EV-05 sin medir»',
    withoutCause.observations.includes('EV-05 sin medir'),
    withoutCause.observations.join(' | ')
  );
}

section('2. A measurement against always prevails over the accreditation');

{
  const cases: [string, ENSEvidenceResolved[], ENSPolicyDecision[]][] = [
    ['una evidencia del requisito en NO_CUMPLE', [evidence('EV-05', 'NO_CUMPLE', ['cuenta genérica «admin» activa']), evidence('EV-06', 'CUMPLE')], [ACCREDITS]],
    ['una evidencia del requisito en PARCIAL', [evidence('EV-05', 'CUMPLE'), evidence('EV-06', 'PARCIAL')], [ACCREDITS]],
    [
      'una evidencia que nombra la decisión, aunque no sea del requisito',
      [evidence('EV-05', 'CUMPLE'), evidence('EV-06', 'CUMPLE'), evidence('EV-07', 'NO_CUMPLE')],
      [decision(REQ, 'CUMPLE', { attested: true, evidenceIds: ['EV-07'] })],
    ],
    [
      'otra decisión de la policy en contra para el mismo requisito',
      [evidence('EV-05', 'CUMPLE'), evidence('EV-06', 'CUMPLE')],
      [ACCREDITS, decision(REQ, 'NO_CUMPLE', { evidenceIds: ['EV-06'], reason: 'EV-06: sin MFA en 2 cuentas' })],
    ],
  ];

  for (const [name, evidences, decisions] of cases) {
    const r = judges(evidences, decisions);

    check(
      `${name}: NO_CUMPLE and without the mark`,
      r.status === 'NO_CUMPLE' && r.attested !== true,
      `${r.status} attested=${r.attested}`
    );

    check(`${name}: counts as measured, not as a gap`, r.evidenced === true, String(r.evidenced));

    check(
      `${name}: the motive says the measurement prevails`,
      r.observations.some(o => o.startsWith('La medida manda sobre la acreditación documental')),
      r.observations.join(' | ')
    );
  }

  const withMotive = judges([evidence('EV-05', 'NO_CUMPLE', ['cuenta genérica «admin» activa']), evidence('EV-06', 'CUMPLE')], [ACCREDITS]);

  check(
    'and keeps the motive of the failing evidence',
    withMotive.observations.includes('cuenta genérica «admin» activa'),
    withMotive.observations.join(' | ')
  );

  const gap = judges([evidence('EV-05', 'NO_EVALUABLE'), evidence('EV-06', 'NO_EVALUABLE')], [ACCREDITS]);

  check(
    'the reversal: unmeasured evidences (NO_EVALUABLE) do not prevent it',
    gap.status === 'CUMPLE' && gap.attested === true,
    `${gap.status} attested=${gap.attested}`
  );

  const otherRequirement = judges(
    [evidence('EV-05', 'CUMPLE'), evidence('EV-06', 'CUMPLE'), evidence('EV-04', 'NO_CUMPLE')],
    [ACCREDITS, decision('op.acc.1.4', 'NO_CUMPLE', { evidenceIds: ['EV-04'] })]
  );

  check(
    'the reversal: a measurement against ANOTHER requirement does not prevent it',
    otherRequirement.status === 'CUMPLE' && otherRequirement.attested === true,
    `${otherRequirement.status} attested=${otherRequirement.attested}`
  );
}

section('3. `attested` with another state accredits nothing');

{
  const nonCompliant = judges([], [decision(REQ, 'NO_CUMPLE', { attested: true, reason: 'plan caducado el 2025-03-01' })]);

  check(
    'NO_CUMPLE + attested → NO_CUMPLE without the mark (an expired plan is an ordinary breach)',
    nonCompliant.status === 'NO_CUMPLE' && nonCompliant.attested !== true && nonCompliant.evidenced === true,
    `${nonCompliant.status} attested=${nonCompliant.attested} evidenced=${nonCompliant.evidenced}`
  );

  const noEvaluable = judges([], [decision(REQ, 'NO_EVALUABLE', { attested: true, cause: 'CONFIGURATION' })]);

  check(
    'NO_EVALUABLE + attested → NO_CUMPLE not evidenced, without the mark',
    noEvaluable.status === 'NO_CUMPLE' && noEvaluable.attested !== true && noEvaluable.evidenced === false,
    `${noEvaluable.status} attested=${noEvaluable.attested} evidenced=${noEvaluable.evidenced}`
  );

  const notApplicable = judges([], [decision(REQ, 'NO_APLICA', { attested: true })]);

  check(
    'NO_APLICA + attested → NO_APLICA, outside the denominator',
    notApplicable.status === 'NO_APLICA' && notApplicable.applicable === false && notApplicable.attested !== true,
    `${notApplicable.status} attested=${notApplicable.attested}`
  );

  const draft = judges([], [ACCREDITS], REQ, 'DRAFT');

  check(
    'a DRAFT control is not accredited: NO_APLICA',
    draft.status === 'NO_APLICA' && draft.attested !== true,
    `${draft.status} attested=${draft.attested}`
  );

  const outOfLevel = judges([], [decision('op.acc.1.r1.2', 'CUMPLE', { attested: true })], 'op.acc.1.r1.2', 'ACTIVE', 'BAJO');

  check(
    'outside its level it does not apply even if the policy accredits it',
    outOfLevel.status === 'NO_APLICA' && outOfLevel.attested !== true,
    `${outOfLevel.status} attested=${outOfLevel.attested}`
  );
}

section('3 bis. Several decisions for the same requirement');

{
  const withoutMeasure = decision(REQ, 'NO_EVALUABLE', { cause: 'COLLECTION', reason: 'sin hechos del recolector' });

  const behind = judges([], [withoutMeasure, ACCREDITS]);

  check(
    '[NO_EVALUABLE, accredited CUMPLE] → the accredited one is read: CUMPLE and marked',
    behind.status === 'CUMPLE' && behind.attested === true,
    `${behind.status} attested=${behind.attested}`
  );

  const front = judges([], [ACCREDITS, withoutMeasure]);

  check(
    '[accredited CUMPLE, NO_EVALUABLE] → the same',
    front.status === 'CUMPLE' && front.attested === true,
    `${front.status} attested=${front.attested}`
  );

  const notApplicable = judges([], [decision(REQ, 'NO_APLICA', { reason: 'refuerzo no elegido' }), ACCREDITS]);

  check(
    'the reversal · [NO_APLICA, accredited CUMPLE] → NO_APLICA: it leaves the game before anything',
    notApplicable.status === 'NO_APLICA' && notApplicable.attested !== true,
    `${notApplicable.status} attested=${notApplicable.attested}`
  );

  const against = judges([], [decision(REQ, 'NO_CUMPLE', { reason: 'medida en contra' }), ACCREDITS]);

  check(
    'the reversal · [NO_CUMPLE, accredited CUMPLE] → NO_CUMPLE: the measurement against prevails',
    against.status === 'NO_CUMPLE' && against.attested !== true,
    `${against.status} attested=${against.attested}`
  );

  const unaccredited = judges([], [withoutMeasure, decision(REQ, 'CUMPLE')]);

  check(
    'the reversal · without accreditation, the first prevails as always: NO_EVALUABLE → NO_CUMPLE',
    unaccredited.status === 'NO_CUMPLE' && unaccredited.evidenced === false,
    `${unaccredited.status} evidenced=${unaccredited.evidenced}`
  );
}

section('4. The engine (with the evidence bridge) and consolidation across machines');

const runtime = (decisions: ENSPolicyDecision[]): ENSPolicyRuntimeResult => ({
  controlId: 'op.acc.1',
  policyId: 'prueba',
  evaluatedAt: '2026-10-09T12:00:00Z',
  decisions: decisions,
  appliedParameters: [],
  runtimeVariables: [],
});

const ALL_OF_THEM = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'];

const validValue = (parameter: ENSControlParameter): ENSControlParameter['value'] => {
  if (parameter.options && parameter.options.length) {
    return parameter.options[0];
  }

  switch (parameter.type) {
    case 'number':
    case 'duration_days':
    case 'duration_hours':
      return typeof parameter.minValue === 'number' ? Math.max(parameter.minValue, 1) : 7;
    case 'boolean':
      return true;
    case 'list':
      return parameter.columns && parameter.columns.length ? [parameter.example || ''] : ['valor-uno', 'valor-dos'];
    case 'table':
      return [parameter.example || ''];
    case 'path':
      return '/var/lib/ensfacil';
    case 'url':
      return 'https://ensfacil.example.org/api';
    default:
      return 'valor';
  }
};

const FULL_CONFIGURATION: ENSControlConfiguration = {
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map(parameter => ({ ...parameter, value: validValue(parameter) })),
};

const machine = (exceptions: Record<string, ENSComplianceStatus>, decisions: ENSPolicyDecision[]) =>
  evaluateENSControl(
    CONTROL,
    FULL_CONFIGURATION,
    'MEDIO',
    ALL_OF_THEM.map(id => evidence(id, exceptions[id] || 'CUMPLE')),
    runtime(decisions),
    []
  );

const req = (result: ReturnType<typeof machine> | undefined, id: string = REQ) =>
  result?.requirements.find(r => r.id === id);

{
  const accredited2 = machine({ 'EV-06': 'NO_EVALUABLE' }, [ACCREDITS]);
  const ev06 = accredited2.evidences.find(e => e.id === 'EV-06');

  check(
    'engine · the requirement reaches the result as CUMPLE and marked',
    req(accredited2)?.status === 'CUMPLE' && req(accredited2)?.attested === true,
    `${req(accredited2)?.status} attested=${req(accredited2)?.attested}`
  );

  check(
    'engine · the unmeasured evidence stays NO_EVALUABLE: accreditation does not measure it',
    ev06?.status === 'NO_EVALUABLE',
    ev06?.status
  );

  const r12 = req(accredited2, 'op.acc.1.r1.2');

  check(
    'fixture · the configuration is complete (the parameters axis, still)',
    !accredited2.requirements.some(r => r.observations.includes('Existen parámetros obligatorios pendientes de configuración.')),
    accredited2.requirements.filter(r => r.observations.includes('Existen parámetros obligatorios pendientes de configuración.')).map(r => r.id).join(',')
  );

  check(
    'engine · op.acc.1.r1.2, which shares EV-06, does not come out CUMPLE through the other\'s accreditation',
    r12?.status !== 'CUMPLE' && r12?.attested !== true,
    `${r12?.status} attested=${r12?.attested} evidenced=${r12?.evidenced}`
  );

  const measuredByPolicy = machine({ 'EV-06': 'NO_EVALUABLE' }, [decision(REQ, 'CUMPLE')]);

  check(
    'the reversal · a CUMPLE decision without the mark does fill EV-06',
    measuredByPolicy.evidences.find(e => e.id === 'EV-06')?.status === 'CUMPLE',
    measuredByPolicy.evidences.find(e => e.id === 'EV-06')?.status
  );

  const expiredOne = machine({ 'EV-06': 'NO_EVALUABLE' }, [decision(REQ, 'NO_CUMPLE', { attested: true })]);

  check(
    'and an accredited one in NO_CUMPLE does fill EV-06 with its NO_CUMPLE',
    expiredOne.evidences.find(e => e.id === 'EV-06')?.status === 'NO_CUMPLE',
    expiredOne.evidences.find(e => e.id === 'EV-06')?.status
  );

  const measuredAgainst = machine({ 'EV-05': 'NO_CUMPLE' }, [ACCREDITS]);

  check(
    'engine · with EV-05 measured NO_CUMPLE, the requirement NO_CUMPLE and without the mark',
    req(measuredAgainst)?.status === 'NO_CUMPLE' && req(measuredAgainst)?.attested !== true,
    `${req(measuredAgainst)?.status} attested=${req(measuredAgainst)?.attested}`
  );

  check(
    'engine · and it opens its nonconformity',
    measuredAgainst.nonConformities.some(nc => nc.requirementId === REQ),
    measuredAgainst.nonConformities.map(nc => nc.requirementId).join(',')
  );

  const fleet = (results: ReturnType<typeof machine>[]): ENSAgentComplianceState[] =>
    results.map((result, index) => ({
      agentId: `02${index + 1}`,
      agentName: `CLIENTE-0${index + 1}`,
      results: [result],
      summary: undefined as never,
    }));

  const both = consolidateAgentComplianceResultByControl(fleet([accredited2, accredited2]), 'op.acc.1');

  check(
    'consolidation · two accredited machines: CUMPLE and marked',
    req(both)?.status === 'CUMPLE' && req(both)?.attested === true,
    `${req(both)?.status} attested=${req(both)?.attested}`
  );

  const oneAgainst = consolidateAgentComplianceResultByControl(fleet([accredited2, measuredAgainst]), 'op.acc.1');

  check(
    'consolidation · one machine with the measurement against: NO_CUMPLE and without the mark',
    req(oneAgainst)?.status === 'NO_CUMPLE' && req(oneAgainst)?.attested !== true,
    `${req(oneAgainst)?.status} attested=${req(oneAgainst)?.attested}`
  );

  const measure = machine({}, [decision(REQ, 'CUMPLE')]);
  const mixed = consolidateAgentComplianceResultByControl(fleet([measure, accredited2]), 'op.acc.1');

  check(
    'consolidation · one measured and one accredited: CUMPLE marked (partly rests on a document)',
    req(mixed)?.status === 'CUMPLE' && req(mixed)?.attested === true,
    `${req(mixed)?.status} attested=${req(mixed)?.attested}`
  );

  const onlyMeasures = consolidateAgentComplianceResultByControl(fleet([measure, measure]), 'op.acc.1');

  check(
    'the reversal · two measured machines: CUMPLE without the mark',
    req(onlyMeasures)?.status === 'CUMPLE' && req(onlyMeasures)?.attested !== true,
    `${req(onlyMeasures)?.status} attested=${req(onlyMeasures)?.attested}`
  );
}

section('5. The control detail and the report state it as documentary');

{
  check(
    'detail · an accredited requirement reads «acreditado documentalmente»',
    compliantRequirementLabel({ attested: true }) === 'acreditado documentalmente'
  );
  check('detail · a measured one reads «cumple»', compliantRequirementLabel({}) === 'cumple');

  check(
    'report · an accredited requirement: «Acreditado documentalmente»',
    ensRequirementProofLabel({ status: 'CUMPLE', attested: true, evidenced: true }) === 'Acreditado documentalmente'
  );
  check(
    'report · a measured one: «Medido»',
    ensRequirementProofLabel({ status: 'CUMPLE', evidenced: true }) === 'Medido'
  );
  check(
    'report · an unproven one: «No evidenciado» with its causes',
    ensRequirementProofLabel({ status: 'NO_CUMPLE', evidenced: false }, ['Configuración']) === 'No evidenciado · Configuración'
  );
  check(
    'report · a NO_APLICA carries no proof line',
    ensRequirementProofLabel({ status: 'NO_APLICA', attested: true }) === ''
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
