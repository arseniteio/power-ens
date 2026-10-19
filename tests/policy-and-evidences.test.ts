/** The policy and the evidences must say the same thing. */
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';
import type { ENSPolicyDecision } from '../common/ens/core/policy-runtime/types';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (
  name: string,
  condition: boolean,
  detail?: unknown
): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  console.log(`  FAIL ${name}${detail !== undefined ? ` — ${String(detail)}` : ''}`);
  failures.push(name);
};

const section = (title: string): void => console.log(`\n${title}`);

const evidence = (
  id: string,
  status: string
): ENSEvidenceResolved =>
  ({
    id,
    controlId: 'op.acc.3',
    status,
    observations: ['motivo original'],
    relatedRules: [],
  } as unknown as ENSEvidenceResolved);

const decision = (
  requirementId: string,
  status: string,
  evidenceIds: string[]
): ENSPolicyDecision =>
  ({
    policyId: 'op-acc-3',
    requirementId,
    status,
    evidenceIds,
    parameterIds: [],
    reason: `la policy dice ${status}`,
  } as unknown as ENSPolicyDecision);

const estadoDe = (
  list: ENSEvidenceResolved[],
  id: string
): string | undefined => list.find(e => e.id === id)?.status;

section('1. What the policy measured reaches the evidence');

{
  const resolvedOne = applyPolicyDecisionsToEvidences(
    [evidence('EV-01', 'NO_EVALUABLE'), evidence('EV-06', 'NO_EVALUABLE')],
    [decision('op.acc.3.1', 'CUMPLE', ['EV-01', 'EV-06'])]
  );

  check(
    'an evidence the classic model could not resolve takes the policy\'s verdict',
    estadoDe(resolvedOne, 'EV-01') === 'CUMPLE',
    estadoDe(resolvedOne, 'EV-01')
  );

  check(
    'and it is said that the policy resolved it, not the agent',
    (resolvedOne.find(e => e.id === 'EV-01')?.observations || []).some(o =>
      o.includes('política del control')
    ),
    JSON.stringify(resolvedOne.find(e => e.id === 'EV-01')?.observations)
  );

  check(
    'without losing the motive it already had',
    (resolvedOne.find(e => e.id === 'EV-01')?.observations || []).includes(
      'motivo original'
    )
  );
}

section('2. An already measured evidence prevails over the policy');

{
  const withFinding = applyPolicyDecisionsToEvidences(
    [evidence('EV-01', 'NO_CUMPLE')],
    [decision('op.acc.3.1', 'CUMPLE', ['EV-01'])]
  );

  check(
    'an observed NO_CUMPLE does NOT become CUMPLE through the policy',
    estadoDe(withFinding, 'EV-01') === 'NO_CUMPLE',
    estadoDe(withFinding, 'EV-01')
  );

  const alreadyComplies = applyPolicyDecisionsToEvidences(
    [evidence('EV-01', 'CUMPLE')],
    [decision('op.acc.3.1', 'NO_CUMPLE', ['EV-01'])]
  );

  check(
    'and an observed CUMPLE is not overwritten by the policy either',
    estadoDe(alreadyComplies, 'EV-01') === 'CUMPLE',
    estadoDe(alreadyComplies, 'EV-01')
  );

  const notApplicable = applyPolicyDecisionsToEvidences(
    [evidence('EV-04', 'NO_APLICA')],
    [decision('op.acc.3.r1.1', 'CUMPLE', ['EV-04'])]
  );

  check(
    'a NO_APLICA is a level decision and is not touched either',
    estadoDe(notApplicable, 'EV-04') === 'NO_APLICA',
    estadoDe(notApplicable, 'EV-04')
  );
}

section('3. If an evidence backs two requirements, the worse wins');

{
  const resolvedOne = applyPolicyDecisionsToEvidences(
    [evidence('EV-06', 'NO_EVALUABLE')],
    [
      decision('op.acc.3.1', 'CUMPLE', ['EV-06']),
      decision('op.acc.3.2', 'NO_CUMPLE', ['EV-06']),
    ]
  );

  check(
    'an evidence backing a failing requirement does not come out green',
    estadoDe(resolvedOne, 'EV-06') === 'NO_CUMPLE',
    estadoDe(resolvedOne, 'EV-06')
  );

  const alReves = applyPolicyDecisionsToEvidences(
    [evidence('EV-06', 'NO_EVALUABLE')],
    [
      decision('op.acc.3.2', 'NO_CUMPLE', ['EV-06']),
      decision('op.acc.3.1', 'CUMPLE', ['EV-06']),
    ]
  );

  check(
    'and the order of the decisions does not matter',
    estadoDe(alReves, 'EV-06') === estadoDe(resolvedOne, 'EV-06'),
    `${estadoDe(alReves, 'EV-06')} vs ${estadoDe(resolvedOne, 'EV-06')}`
  );
}

section('4. An evidence the policy does not measure stays as it was');

{
  const resolvedOne = applyPolicyDecisionsToEvidences(
    [evidence('EV-07', 'NO_EVALUABLE')],
    [decision('op.acc.3.1', 'CUMPLE', ['EV-01'])]
  );

  check(
    'EV-07 remains unproven because nobody measured it',
    estadoDe(resolvedOne, 'EV-07') === 'NO_EVALUABLE',
    estadoDe(resolvedOne, 'EV-07')
  );

  const sinPolicy = applyPolicyDecisionsToEvidences(
    [evidence('EV-01', 'NO_EVALUABLE')],
    []
  );

  check(
    'without any decision, nothing changes',
    estadoDe(sinPolicy, 'EV-01') === 'NO_EVALUABLE'
  );
}

section('5. Without `evidenceIds`, the decision inherits the requirement\'s');

{
  const REQUIREMENTS = [
    { id: 'op.acc.3.1', evidenceIds: ['EV-01', 'EV-06'] },
    { id: 'op.acc.3.2', evidenceIds: ['EV-02', 'EV-03', 'EV-06'] },
  ];

  const unnamed = {
    ...decision('op.acc.3.1', 'NO_CUMPLE', []),
  } as ENSPolicyDecision;

  const resolvedOne = applyPolicyDecisionsToEvidences(
    [evidence('EV-01', 'NO_EVALUABLE'), evidence('EV-06', 'NO_EVALUABLE')],
    [unnamed],
    REQUIREMENTS
  );

  check(
    'EV-01 takes the verdict because op.acc.3.1 is proven with it',
    estadoDe(resolvedOne, 'EV-01') === 'NO_CUMPLE',
    estadoDe(resolvedOne, 'EV-01')
  );

  check(
    'and so does EV-06, the other of the same requirement',
    estadoDe(resolvedOne, 'EV-06') === 'NO_CUMPLE',
    estadoDe(resolvedOne, 'EV-06')
  );

  const naming = applyPolicyDecisionsToEvidences(
    [evidence('EV-01', 'NO_EVALUABLE'), evidence('EV-06', 'NO_EVALUABLE')],
    [decision('op.acc.3.1', 'CUMPLE', ['EV-01'])],
    REQUIREMENTS
  );

  check(
    'if the decision names only EV-01, EV-06 is not touched',
    estadoDe(naming, 'EV-01') === 'CUMPLE' &&
      estadoDe(naming, 'EV-06') === 'NO_EVALUABLE',
    `${estadoDe(naming, 'EV-01')} / ${estadoDe(naming, 'EV-06')}`
  );

  const blindly = applyPolicyDecisionsToEvidences(
    [evidence('EV-01', 'NO_EVALUABLE')],
    [decision('op.acc.3.1', 'CUMPLE', [])],
    []
  );

  check(
    'without catalog or names, no evidence is touched',
    estadoDe(blindly, 'EV-01') === 'NO_EVALUABLE',
    estadoDe(blindly, 'EV-01')
  );
}

section('6. The named prevails over an inherited GAP, never over a breach');

{
  const REQUIREMENTS = [
    { id: 'R1', evidenceIds: ['EV-X'] },
    { id: 'R2', evidenceIds: ['EV-X'] },
  ];
  const resolves = (inheritedOne: string, named2: string) =>
    estadoDe(
      applyPolicyDecisionsToEvidences(
        [evidence('EV-X', 'NO_EVALUABLE')],
        [decision('R1', inheritedOne, []), decision('R2', named2, ['EV-X'])],
        REQUIREMENTS
      ),
      'EV-X'
    );

  check(
    'an inherited NO_EVALUABLE does not cover a named CUMPLE (R1 could not be measured for another reason)',
    resolves('NO_EVALUABLE', 'CUMPLE') === 'CUMPLE',
    resolves('NO_EVALUABLE', 'CUMPLE')
  );
  check(
    'an inherited NO_CUMPLE DOES prevail: R1 rests on EV-X and does not comply',
    resolves('NO_CUMPLE', 'CUMPLE') === 'NO_CUMPLE',
    resolves('NO_CUMPLE', 'CUMPLE')
  );
  check(
    'an inherited PARCIAL also prevails over a named CUMPLE',
    resolves('PARCIAL', 'CUMPLE') === 'PARCIAL',
    resolves('PARCIAL', 'CUMPLE')
  );
  check(
    'and over a named NO_EVALUABLE',
    resolves('PARCIAL', 'NO_EVALUABLE') === 'PARCIAL',
    resolves('PARCIAL', 'NO_EVALUABLE')
  );
  check(
    'but not over a worse named one: a named NO_CUMPLE stays',
    resolves('PARCIAL', 'NO_CUMPLE') === 'NO_CUMPLE',
    resolves('PARCIAL', 'NO_CUMPLE')
  );
  check(
    'with nothing named, the inherited applies as always (including a gap)',
    estadoDe(
      applyPolicyDecisionsToEvidences([evidence('EV-X', 'NO_EVALUABLE')], [decision('R1', 'CUMPLE', [])], REQUIREMENTS),
      'EV-X'
    ) === 'CUMPLE'
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
