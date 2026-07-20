import { ENSComplianceState } from '../../compliance-state/types';
import { FindingsCardModel } from '../models/findings-card.model';

export const buildFindingsCardModel = (
  complianceState: ENSComplianceState
): FindingsCardModel => {
  const findings = complianceState.results.flatMap(result =>
    result.requirements.filter(
      requirement =>
        requirement.status === 'NO_CUMPLE' ||
        requirement.status === 'PARCIAL' ||
        requirement.status === 'NO_EVALUABLE'
    )
  );

  const hasCritical = findings.some(
    requirement => requirement.status === 'NO_CUMPLE'
  );

  return {
    title: 'HALLAZGOS RELEVANTES',
    total: findings.length,
    severity: findings.length ? (hasCritical ? 'CRITICAL' : 'WARNING') : 'OK',
    lastEvaluation: complianceState.evaluatedAt,
    description: 'Hallazgos ENS abiertos, requisitos parciales o requisitos sin evidencia suficiente.',
  };
};
