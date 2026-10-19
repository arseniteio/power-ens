import { ENSComplianceState } from '../../compliance-state/types';
import { RequirementsSummaryModel } from '../models';

const statusPercent = (value: number, total: number): number =>
  total ? Math.round((value * 100) / total) : 0;

export const buildRequirementsSummaryModel = (
  complianceState: ENSComplianceState
): RequirementsSummaryModel => {
  const total = complianceState.requirementSummary.totalControls || 0;
  const cumple = complianceState.requirementSummary.cumple || 0;
  const parcial = complianceState.requirementSummary.parcial || 0;
  const noCumple = complianceState.requirementSummary.noCumple || 0;
  const noAplica = complianceState.requirementSummary.noAplica || 0;
  const noEvaluable =
    complianceState.requirementSummary.noEvaluable || 0;
  const score = complianceState.requirementSummary.scoreAverage || 0;

  const cumplePercent = statusPercent(cumple, total);
  const parcialPercent = statusPercent(parcial, total);
  const noCumplePercent = statusPercent(noCumple, total);
  const noEvaluablePercent = statusPercent(noEvaluable, total);
  const noAplicaPercent = statusPercent(noAplica, total);

  const cumpleEnd = cumplePercent;
  const parcialEnd = cumpleEnd + parcialPercent;
  const noCumpleEnd = parcialEnd + noCumplePercent;
  const noEvaluableEnd = noCumpleEnd + noEvaluablePercent;

  const statusDonut =
    `conic-gradient(#00A65A 0 ${cumpleEnd}%, ` +
    `#F5B700 ${cumpleEnd}% ${parcialEnd}%, ` +
    `#BD271E ${parcialEnd}% ${noCumpleEnd}%, ` +
    `#98A2B3 ${noCumpleEnd}% ${noEvaluableEnd}%, ` +
    `#D3DAE6 ${noEvaluableEnd}% 100%)`;

  return {
    total,
    cumple,
    parcial,
    noCumple,
    noAplica,
    noEvaluable,
    score,
    cumplePercent,
    parcialPercent,
    noCumplePercent,
    noEvaluablePercent,
    statusDonut,
    noAplicaPercent,
  };
};
