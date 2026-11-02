export interface ComplianceCardModel {
  title: string;
  score: number;

  measured: number;

  total: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  notEvaluable: number;
  notApplicable: number;
  notMeasured: number;
  lastEvaluation: string;
  description: string;
}
