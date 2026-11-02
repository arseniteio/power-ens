import { ENSComplianceState } from '../../compliance-state/types';
import { ComplianceCardModel } from '../models/compliance-card.model';
import { pendingMeasurementResults } from './pending-measurement';

export const buildComplianceCardModel = (
  complianceState: ENSComplianceState
): ComplianceCardModel => {
  const pending = pendingMeasurementResults(complianceState).length;

  return {
    title: 'ÍNDICE GLOBAL DE CUMPLIMIENTO ENS',
    score: complianceState.controlSummary.scoreAverage || 0,
    measured: complianceState.controlSummary.measured || 0,
    total: complianceState.controlSummary.totalControls || 0,
    compliant: complianceState.controlSummary.compliant || 0,
    partial: complianceState.controlSummary.partial || 0,
    nonCompliant: complianceState.controlSummary.nonCompliant || 0,
    notEvaluable: complianceState.controlSummary.notEvaluable || 0,
    notApplicable: Math.max(0, (complianceState.controlSummary.notApplicable || 0) - pending),
    notMeasured: pending,
    lastEvaluation: complianceState.evaluatedAt,
    description: 'Cumplimiento global basado en controles ENS evaluados.',
  };
};
