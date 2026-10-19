import { ENSComplianceResult, ENSComplianceStatus } from '../evaluation/types';

export interface ENSComplianceSummary {
  totalControls: number;
  cumple: number;
  noCumple: number;
  parcial: number;
  noEvaluable: number;
  noAplica: number;

  // Promedio SOBRE LO APLICABLE (todo lo que no es NO_APLICA). `measured` dice
  // sobre cuántos elementos se ha calculado: con `measured` a 0 no hay nada
  // aplicable y la pantalla no puede pintar un porcentaje.
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

export type ENSComplianceStatusFilter = ENSComplianceStatus | 'ALL';
