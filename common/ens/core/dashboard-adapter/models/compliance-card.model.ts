export interface ComplianceCardModel {
  title: string;
  score: number;

  // Over how many controls `score` was computed. With 0 there is no index to show: the card must say "sin medir", not "0 %".
  measured: number;

  total: number;
  cumple: number;
  parcial: number;
  noCumple: number;
  noEvaluable: number;
  noAplica: number;
  // Controls in the catalog without collector (`DRAFT`): neither measured nor «no aplica» by level.
  sinMedicion: number;
  lastEvaluation: string;
  description: string;
}
