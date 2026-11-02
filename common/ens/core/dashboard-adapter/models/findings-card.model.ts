export interface FindingsCardModel {
  title: string;
  total: number;
  severity: 'OK' | 'WARNING' | 'CRITICAL';
  lastEvaluation: string;
  description: string;

  measuredFindings: number;
  unevidencedFindings: number;
  mixedFindings: number;
  unclassifiedFindings: number;
}
