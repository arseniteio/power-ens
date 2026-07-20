export interface FindingsCardModel {
  title: string;
  total: number;
  severity: 'OK' | 'WARNING' | 'CRITICAL';
  lastEvaluation: string;
  description: string;
}
