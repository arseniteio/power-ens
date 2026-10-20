export interface FindingsCardModel {
  title: string;
  total: number;
  severity: 'OK' | 'WARNING' | 'CRITICAL';
  lastEvaluation: string;
  description: string;

  // Unfavourable requirements by the origin of their non-conformities (ENS-DASH-002). Mutually exclusive: they add up to `total`.
  measuredFindings: number;
  unevidencedFindings: number;
  mixedFindings: number;
  unclassifiedFindings: number;
}
