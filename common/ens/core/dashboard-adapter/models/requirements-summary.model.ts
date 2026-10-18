export interface RequirementsSummaryModel {
  total: number;
  cumple: number;
  parcial: number;
  noCumple: number;
  noAplica: number;
  noEvaluable: number;
  score: number;
  cumplePercent: number;
  parcialPercent: number;
  noCumplePercent: number;
  noEvaluablePercent: number;
  statusDonut: string;
  noAplicaPercent: number;
}
