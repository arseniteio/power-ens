import { ENSComplianceResult } from '../evaluation/types';
import { agentHasEvaluatedResults } from './consolidation';
import {
  ENSAgentComplianceState,
  ENSAgentSummary,
  ENSComplianceState,
  ENSComplianceSummary,
  ENSEvidenceSummary,
} from './types';

const getStatusScore = (status: string): number => {
  if (status === 'CUMPLE') return 100;
  if (status === 'PARCIAL') return 50;
  return 0;
};

const createSummaryFromItems = (
  items: { status: string; score?: number }[]
): ENSComplianceSummary => {
  const totalControls = items.length;
  const cumple = items.filter(item => item.status === 'CUMPLE').length;
  const noCumple = items.filter(item => item.status === 'NO_CUMPLE').length;
  const parcial = items.filter(item => item.status === 'PARCIAL').length;
  const noEvaluable = items.filter(item => item.status === 'NO_EVALUABLE').length;
  const noAplica = items.filter(item => item.status === 'NO_APLICA').length;
  const evaluableItems = items.filter(item => item.status !== 'NO_APLICA');

  const scoreAverage = evaluableItems.length
    ? Math.round(
        evaluableItems.reduce(
          (sum, item) => sum + (item.score ?? getStatusScore(item.status)),
          0
        ) / evaluableItems.length
      )
    : 0;

  return {
    totalControls,
    cumple,
    noCumple,
    parcial,
    noEvaluable,
    noAplica,
    scoreAverage,
  };
};

const createControlSummary = (
  results: ENSComplianceResult[]
): ENSComplianceSummary => createSummaryFromItems(results);

const createRequirementSummary = (
  results: ENSComplianceResult[]
): ENSComplianceSummary =>
  createSummaryFromItems(results.flatMap(result => result.requirements));

const createEvidenceSummary = (
  results: ENSComplianceResult[]
): ENSEvidenceSummary => {
  const evidences = results.flatMap(result => result.evidences);

  return {
    totalEvidences: evidences.length,
    cumple: evidences.filter(e => e.status === 'CUMPLE').length,
    noCumple: evidences.filter(e => e.status === 'NO_CUMPLE').length,
    parcial: evidences.filter(e => e.status === 'PARCIAL').length,
    noEvaluable: evidences.filter(e => e.status === 'NO_EVALUABLE').length,
    noAplica: evidences.filter(e => e.status === 'NO_APLICA').length,
  };
};

const createAgentSummary = (
  agents: ENSAgentComplianceState[]
): ENSAgentSummary => {
  const totalAgents = agents.length;
  const agentsWithResults = agents.filter(
    agentHasEvaluatedResults
  ).length;

  return {
    totalAgents,
    agentsWithResults,
    agentsWithoutResults: totalAgents - agentsWithResults,
  };
};

const buildAgentStates = (
  _results: ENSComplianceResult[]
): ENSAgentComplianceState[] => [];

export const buildComplianceState = (
  results: ENSComplianceResult[],
  agents?: ENSAgentComplianceState[]
): ENSComplianceState => {
  const resolvedAgents = agents || buildAgentStates(results);
  const controlSummary = createControlSummary(results);
  const requirementSummary = createRequirementSummary(results);

  return {
    evaluatedAt: new Date().toISOString(),
    results,

    controlSummary,
    requirementSummary,
    agentSummary: createAgentSummary(resolvedAgents),
    evidenceSummary: createEvidenceSummary(results),

    summary: controlSummary,
    agents: resolvedAgents,
  };
};
