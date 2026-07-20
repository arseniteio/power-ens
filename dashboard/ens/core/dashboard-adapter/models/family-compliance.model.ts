export interface FamilyComplianceRowModel {
  family: string;
  label: string;
  total: number;
  evaluable: number;
  cumple: number;
  parcial: number;
  noCumple: number;
  noEvaluable: number;
  noAplica: number;
  percent: number;
}

export interface FamilyComplianceModel {
  title: string;
  rows: FamilyComplianceRowModel[];
}
