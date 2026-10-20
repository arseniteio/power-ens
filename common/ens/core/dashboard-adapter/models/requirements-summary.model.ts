export interface RequirementsSummaryModel {
  total: number;
  cumple: number;
  parcial: number;
  noCumple: number;
  noAplica: number;
  // Requirements of the controls without collector, apart from those that do not apply at the level.
  sinMedicion: number;
  sinMedicionPercent: number;
  noEvaluable: number;
  score: number;
  cumplePercent: number;
  parcialPercent: number;
  noCumplePercent: number;
  noEvaluablePercent: number;
  statusDonut: string;
  noAplicaPercent: number;
}
