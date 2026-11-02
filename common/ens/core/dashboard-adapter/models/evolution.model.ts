export interface EvolutionRowModel {
  label: string;
  score: number;
  date?: Date;
  isCurrent?: boolean;
}

export interface EvolutionModel {
  title: string;
  rows: EvolutionRowModel[];
  description: string;
}
