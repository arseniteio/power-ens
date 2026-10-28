import { ENSComplianceResult } from '../evaluation/types';

export interface ENSComplianceSummary {
  totalControls: number;
  cumple: number;
  noCumple: number;
  parcial: number;
  noEvaluable: number;
  noAplica: number;

  // Average OVER THE APPLICABLE (everything but NO_APLICA). `measured` says over how many elements it was computed: with `measured` at 0 nothing applies and the screen cannot paint a percentage.
  scoreAverage: number;
  measured: number;
}

export interface ENSAgentSummary {
  totalAgents: number;
  agentsWithResults: number;
  agentsWithoutResults: number;
}

export interface ENSEvidenceSummary {
  totalEvidences: number;
  cumple: number;
  noCumple: number;
  parcial: number;
  noEvaluable: number;
  noAplica: number;
}

export interface ENSAgentComplianceState {
  agentId: string;
  agentName?: string;
  results: ENSComplianceResult[];
  summary: ENSComplianceSummary;
}

export interface ENSComplianceState {
  evaluatedAt: string;
  results: ENSComplianceResult[];

  controlSummary: ENSComplianceSummary;
  requirementSummary: ENSComplianceSummary;
  agentSummary: ENSAgentSummary;
  evidenceSummary: ENSEvidenceSummary;

  summary: ENSComplianceSummary;
  agents: ENSAgentComplianceState[];
}
