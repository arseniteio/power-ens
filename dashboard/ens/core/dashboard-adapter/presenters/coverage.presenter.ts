import { ENSComplianceState } from '../../compliance-state/types';
import { CoverageCardModel } from '../models/coverage-card.model';

export const buildCoverageCardModel = (
  complianceState: ENSComplianceState
): CoverageCardModel => {
  const totalEvidences = complianceState.evidenceSummary.totalEvidences || 0;
  const verifiedEvidences =
  (complianceState.evidenceSummary.cumple || 0) +
  (complianceState.evidenceSummary.parcial || 0) +
  (complianceState.evidenceSummary.noCumple || 0);
  const noEvaluableEvidences =
    complianceState.evidenceSummary.noEvaluable || 0;
  const noApplicableEvidences =
    complianceState.evidenceSummary.noAplica || 0;

  const pendingEvidences =
    complianceState.evidenceSummary.noEvaluable || 0;

  const applicableEvidences = Math.max(
    totalEvidences - noApplicableEvidences,
    0
  );

  const coveragePercent = applicableEvidences
    ? Math.round((verifiedEvidences * 100) / applicableEvidences)
    : 0;

  return {
    title: 'COBERTURA ENS',
    coveragePercent,
    totalEvidences,
    verifiedEvidences,
    pendingEvidences,
    noEvaluableEvidences,
    noApplicableEvidences,
    description:
      'Cobertura basada en evidencias ENS verificadas frente a evidencias aplicables.',
  };
};
