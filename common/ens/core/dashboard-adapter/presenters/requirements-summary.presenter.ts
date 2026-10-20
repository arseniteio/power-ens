import { ENSComplianceState } from '../../compliance-state/types';
import { RequirementsSummaryModel } from '../models';
import { pendingMeasurementResults } from './pending-measurement';

const statusPercent = (value: number, total: number): number =>
  total ? Math.round((value * 100) / total) : 0;

export const buildRequirementsSummaryModel = (
  complianceState: ENSComplianceState
): RequirementsSummaryModel => {
  const total = complianceState.requirementSummary.totalControls || 0;
  const compliant = complianceState.requirementSummary.cumple || 0;
  const partial = complianceState.requirementSummary.parcial || 0;
  const nonCompliant = complianceState.requirementSummary.noCumple || 0;
  // The requirements of a control without collector are NO_APLICA in the engine, but not because of the level.
  const pending = pendingMeasurementResults(complianceState).reduce((n, result) => n + result.requirements.length, 0);
  const notApplicable = Math.max(0, (complianceState.requirementSummary.noAplica || 0) - pending);
  const notEvaluable =
    complianceState.requirementSummary.noEvaluable || 0;
  const score = complianceState.requirementSummary.scoreAverage || 0;

  const compliantPercent = statusPercent(compliant, total);
  const partialPercent = statusPercent(partial, total);
  const nonCompliantPercent = statusPercent(nonCompliant, total);
  const notEvaluablePercent = statusPercent(notEvaluable, total);
  const notApplicablePercent = statusPercent(notApplicable, total);
  const pendingPercent = statusPercent(pending, total);

  const compliantEnd = compliantPercent;
  const partialEnd = compliantEnd + partialPercent;
  const nonCompliantEnd = partialEnd + nonCompliantPercent;
  const notEvaluableEnd = nonCompliantEnd + notEvaluablePercent;
  const notApplicableEnd = notEvaluableEnd + notApplicablePercent;

  const statusDonut =
    `conic-gradient(#00A65A 0 ${compliantEnd}%, ` +
    `#F5B700 ${compliantEnd}% ${partialEnd}%, ` +
    `#BD271E ${partialEnd}% ${nonCompliantEnd}%, ` +
    `#98A2B3 ${nonCompliantEnd}% ${notEvaluableEnd}%, ` +
    `#D3DAE6 ${notEvaluableEnd}% ${pending ? notApplicableEnd : 100}%` +
    (pending ? `, #EEF1F5 ${notApplicableEnd}% 100%)` : ')');

  return {
    total,
    cumple: compliant,
    parcial: partial,
    noCumple: nonCompliant,
    noAplica: notApplicable,
    notMeasured: pending,
    notMeasuredPercent: pendingPercent,
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
