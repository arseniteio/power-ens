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
    cumple: complianceState.controlSummary.cumple || 0,
    parcial: complianceState.controlSummary.parcial || 0,
    noCumple: complianceState.controlSummary.noCumple || 0,
    noEvaluable: complianceState.controlSummary.noEvaluable || 0,
    noAplica: Math.max(0, (complianceState.controlSummary.noAplica || 0) - pending),
    sinMedicion: pending,
    lastEvaluation: complianceState.evaluatedAt,
    description: 'Cumplimiento global basado en controles ENS evaluados.',
  };
};
