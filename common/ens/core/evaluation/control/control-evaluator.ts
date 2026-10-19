import { ENSComplianceStatus } from '../types';
import { ENSRequirementEvaluationResult } from '../requirement';
import { requirementVerdict, scoreByStatus } from '../utils';

export interface ENSControlEvaluationResult {
  status: ENSComplianceStatus;

  // Absent ONLY when no requirement applies (NO_APLICA). Everything that applies carries a number.
  score?: number;

  coverage: number;

  applicableRequirements: number;
  measuredRequirements: number;
  unmeasuredRequirements: string[];
}

// Control state and percentage from its requirements. Criterion in force since 04/08: what cannot be proven counts against.
//   all applicable CUMPLE   -> CUMPLE, 100
//   all applicable NO_CUMPLE -> NO_CUMPLE
//   mix                      -> PARCIAL
//   nothing applicable       -> NO_APLICA, no number
// An unprovable requirement counts as NO_CUMPLE (`requirementVerdict`). The denominator is `applicableRequirements`: a measured-only denominator rises the less is measured (seven grey requirements and one compliant published 100 %).
// `measuredRequirements` is still published as the diagnostic accompanying the number.
export const evaluateControlStatus = (
  requirements: ENSRequirementEvaluationResult[]
): ENSControlEvaluationResult => {
  const applicable = requirements.filter(
    requirement => requirementVerdict(requirement) !== 'NO_APLICA'
  );

  if (!applicable.length) {
    // NO number, not a 0: a control that does not apply is not a failing control and 0 is painted red. This lets a BAJO-level client reach 100 % without the MEDIO and ALTO reinforcements.
    return {
      status: 'NO_APLICA',
      score: undefined,
      coverage: 0,
      applicableRequirements: 0,
      measuredRequirements: 0,
      unmeasuredRequirements: [],
    };
  }

  // Measured = the engine could pronounce by looking at something. No longer deduced from the state: a measured NO_CUMPLE and an unevidenced one are the same state, and `evidenced` is all that separates them.
  const unmeasured = applicable.filter(
    requirement => requirement.evidenced === false
  );

  const measured = applicable.filter(
    requirement => requirement.evidenced !== false
  );

  const coverage = Math.round((measured.length / applicable.length) * 100);

  const counters = {
    applicableRequirements: applicable.length,
    measuredRequirements: measured.length,
    unmeasuredRequirements: unmeasured.map(requirement => requirement.id),
  };

  const some = (value: ENSComplianceStatus) =>
    applicable.some(requirement => requirementVerdict(requirement) === value);

  // With nothing failing or half-conforming, everything applicable is CUMPLE: the 100 is exact and no rounding can mask anything. The only line a CUMPLE comes out of.
  if (!some('NO_CUMPLE') && !some('PARCIAL')) {
    return {
      status: 'CUMPLE',
      score: 100,
      coverage,
      ...counters,
    };
  }

  const score = Math.round(
    applicable.reduce(
      (sum, requirement) => sum + scoreByStatus(requirementVerdict(requirement)),
      0
    ) / applicable.length
  );

  return {
    status:
      some('NO_CUMPLE') && !some('CUMPLE') && !some('PARCIAL')
        ? 'NO_CUMPLE'
        : 'PARCIAL',
    score,
    coverage,
    ...counters,
  };
};
