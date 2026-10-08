export interface ENSDashboardMetric {
  label: string;
  value: number | string;
  description?: string;
}

export interface ENSDashboardStatusSummary {
  total: number;
  cumple: number;
  parcial: number;
  noCumple: number;
  noEvaluable: number;
  noAplica: number;
  score: number;
}

export interface ENSDashboardCoverage {
  percent: number;
  verified: number;
  pending: number;
  total: number;
}

export interface ENSDashboardFamilyRow {
  family: string;
  label: string;
  total: number;
  evaluable: number;
  cumple: number;
  parcial: number;
  noCumple: number;
  noAplica: number;
  percent: number;
}

export interface ENSDashboardRequirementRow {
  id: string;
  title: string;
  state: string;
  level: string;
  score: number;
  family: string;
  lastEvaluation: string;
}

export interface ENSDashboardEvidenceRow {
  id: string;
  controlId: string;
  requirementId: string;
  state: string;
  level: string;
  agent: string;
  ruleId: string;
  event: string;
  date: string;
}

export interface ENSDashboardModel {
  compliance: ENSDashboardStatusSummary;
  requirements: ENSDashboardStatusSummary;
  coverage: ENSDashboardCoverage;
  findings: {
    total: number;
    lastEvaluation: string;
  };
  familyRows: ENSDashboardFamilyRow[];
  requirementRows: ENSDashboardRequirementRow[];
  evidenceRows: ENSDashboardEvidenceRow[];
}
