import { ENSComplianceStatus } from '../types';
import { ENSRequirementEvaluationResult } from '../requirement';
import { scoreByStatus } from '../utils/score';

export interface ENSControlEvaluationResult {
  status: ENSComplianceStatus;
  score: number;
  coverage: number;
}

export const evaluateControlStatus = (
  requirements: ENSRequirementEvaluationResult[]
): ENSControlEvaluationResult => {
  const applicable = requirements.filter(
    requirement => requirement.status !== 'NO_APLICA'
  );

  if (!applicable.length) {
    return { status: 'NO_APLICA', score: 0, coverage: 0 };
  }

  const score = Math.round(
    applicable.reduce(
      (sum, requirement) => sum + scoreByStatus(requirement.status),
      0
    ) / applicable.length
  );

  const evaluated = applicable.filter(
    requirement => requirement.status !== 'NO_EVALUABLE'
  );
  const coverage = Math.round((evaluated.length / applicable.length) * 100);

  const every = (value: ENSComplianceStatus) =>
    applicable.every(requirement => requirement.status === value);
  const some = (value: ENSComplianceStatus) =>
    applicable.some(requirement => requirement.status === value);

  let status: ENSComplianceStatus;

  if (every('CUMPLE')) {
    status = 'CUMPLE';
  } else if (every('NO_EVALUABLE')) {
    status = 'NO_EVALUABLE';
  } else if (some('NO_CUMPLE') && !some('CUMPLE') && !some('PARCIAL')) {
    status = 'NO_CUMPLE';
  } else {
    status = 'PARCIAL';
  }

  return { status, score, coverage };
};
