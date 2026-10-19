export interface RequirementFindingRowModel {
  requirementId: string;
  title: string;
  family: string;
  familyLabel: string;
  status: string;
  score: number;
}

export interface RequirementFindingsModel {
  title: string;
  rows: RequirementFindingRowModel[];
  emptyMessage: string;
}
