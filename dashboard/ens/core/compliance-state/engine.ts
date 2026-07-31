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
  // El índice global se promedia SOLO sobre lo medido. Un control NO_EVALUABLE
  // aportaba antes un 0 al promedio (por `score` a 0 o por el `getStatusScore`
  // de respaldo), así que tres controles sanos y uno sin medir daban 75 % y el
  // índice bajaba por algo que nadie ha demostrado. Es el mismo error que se
  // corrige en `evaluation/control`, una capa más arriba y por la puerta del
  // número.
  const measuredItems = items.filter(
    item => item.status !== 'NO_APLICA' && item.status !== 'NO_EVALUABLE'
  );

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
    cumple,
    noCumple,
    parcial,
    noEvaluable,
    noAplica,
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
