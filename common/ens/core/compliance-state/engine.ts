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
  // El índice global se promedia sobre todo lo APLICABLE. Entre el 30/07 y el
  // 04/08 se promediaba solo sobre lo medido, para que un control sin datos no
  // bajara el índice por algo que nadie había demostrado. La decisión del
  // responsable invierte esa premisa: lo no demostrado cuenta en contra, así que
  // un control sin datos aporta su 0 y el índice baja — que es lo que hace que
  // el número signifique algo cuando se le enseña a un auditor.
  //
  // Lo único que sigue fuera del promedio es NO_APLICA: un control que no rige
  // en el nivel activo no puede restar. Es lo que permite el 100 % en BAJO.
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
