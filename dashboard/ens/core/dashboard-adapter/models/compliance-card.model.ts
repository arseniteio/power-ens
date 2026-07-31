export interface ComplianceCardModel {
  title: string;
  score: number;

  // Sobre cuántos controles se ha calculado `score`. Con 0 no hay índice que
  // enseñar: la tarjeta tiene que decir "sin medir", no "0 %".
  measured: number;

  total: number;
  cumple: number;
  parcial: number;
  noCumple: number;
  noEvaluable: number;
  noAplica: number;
  lastEvaluation: string;
  description: string;
}
