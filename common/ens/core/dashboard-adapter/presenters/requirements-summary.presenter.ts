import { ENSComplianceState } from '../../compliance-state/types';
import { RequirementsSummaryModel } from '../models';

const statusPercent = (value: number, total: number): number =>
  total ? Math.round((value * 100) / total) : 0;

export const buildRequirementsSummaryModel = (
  complianceState: ENSComplianceState
): RequirementsSummaryModel => {
  const total = complianceState.requirementSummary.totalControls || 0;
  const compliant = complianceState.requirementSummary.cumple || 0;
  const partial = complianceState.requirementSummary.parcial || 0;
  const nonCompliant = complianceState.requirementSummary.noCumple || 0;
  const notApplicable = complianceState.requirementSummary.noAplica || 0;
  const notEvaluable =
    complianceState.requirementSummary.noEvaluable || 0;
  const score = complianceState.requirementSummary.scoreAverage || 0;

  const compliantPercent = statusPercent(compliant, total);
  const partialPercent = statusPercent(partial, total);
  const nonCompliantPercent = statusPercent(nonCompliant, total);
  const notEvaluablePercent = statusPercent(notEvaluable, total);
  const notApplicablePercent = statusPercent(notApplicable, total);

  const compliantEnd = compliantPercent;
  const partialEnd = compliantEnd + partialPercent;
  const nonCompliantEnd = partialEnd + nonCompliantPercent;
  const notEvaluableEnd = nonCompliantEnd + notEvaluablePercent;

  const statusDonut =
    `conic-gradient(#00A65A 0 ${compliantEnd}%, ` +
    `#F5B700 ${compliantEnd}% ${partialEnd}%, ` +
    `#BD271E ${partialEnd}% ${nonCompliantEnd}%, ` +
    `#98A2B3 ${nonCompliantEnd}% ${notEvaluableEnd}%, ` +
    `#D3DAE6 ${notEvaluableEnd}% 100%)`;

  return {
    total,
    cumple: compliant,
    parcial: partial,
    noCumple: nonCompliant,
    noAplica: notApplicable,
    noEvaluable: notEvaluable,
    score,
    cumplePercent: compliantPercent,
    parcialPercent: partialPercent,
    noCumplePercent: nonCompliantPercent,
    noEvaluablePercent: notEvaluablePercent,
    statusDonut,
    noAplicaPercent: notApplicablePercent,
  };
};
