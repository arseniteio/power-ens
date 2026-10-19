export interface EvolutionRowModel {
  label: string;
  score: number;
  date?: Date;
  // The present point. Marked apart because it is the only one the auditor can check against the panel above.
  isCurrent?: boolean;
}

export interface EvolutionModel {
  title: string;
  rows: EvolutionRowModel[];
  description: string;
}
