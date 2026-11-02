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
  const compliant = items.filter(item => item.status === 'CUMPLE').length;
  const nonCompliant = items.filter(item => item.status === 'NO_CUMPLE').length;
  const partial = items.filter(item => item.status === 'PARCIAL').length;
  const notEvaluable = items.filter(item => item.status === 'NO_EVALUABLE').length;
  const notApplicable = items.filter(item => item.status === 'NO_APLICA').length;
  const measuredItems = items.filter(item => item.status !== 'NO_APLICA');

  const scoreAverage = measuredItems.length
    ? Math.round(
        measuredItems.reduce(
          (sum, item) => sum + (item.score ?? getStatusScore(item.status)),
          0
        ) / measuredItems.length
      )
    : 0;

  return {
    totalControls,
    compliant,
    nonCompliant,
    partial,
    notEvaluable,
    notApplicable,
    scoreAverage,
    measured: measuredItems.length,
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
    compliant: evidences.filter(e => e.status === 'CUMPLE').length,
    nonCompliant: evidences.filter(e => e.status === 'NO_CUMPLE').length,
    partial: evidences.filter(e => e.status === 'PARCIAL').length,
    notEvaluable: evidences.filter(e => e.status === 'NO_EVALUABLE').length,
    notApplicable: evidences.filter(e => e.status === 'NO_APLICA').length,
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
