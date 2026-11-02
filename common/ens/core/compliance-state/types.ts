import { ENSComplianceResult } from '../evaluation/types';

export interface ENSComplianceSummary {
  totalControls: number;
  compliant: number;
  nonCompliant: number;
  partial: number;
  notEvaluable: number;
  notApplicable: number;

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
  compliant: number;
  nonCompliant: number;
  partial: number;
  notEvaluable: number;
  notApplicable: number;
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
