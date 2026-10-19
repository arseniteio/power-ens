export interface CoverageCardModel {
  title: string;
  coveragePercent: number;
  totalEvidences: number;
  verifiedEvidences: number;
  pendingEvidences: number;
  noEvaluableEvidences: number;
  noApplicableEvidences: number;
  description: string;
}
