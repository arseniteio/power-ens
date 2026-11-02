export interface ComplianceCardModel {
  title: string;
  score: number;

  measured: number;

  total: number;
  cumple: number;
  parcial: number;
  noCumple: number;
  noEvaluable: number;
  noAplica: number;
  notMeasured: number;
  lastEvaluation: string;
  description: string;
}
