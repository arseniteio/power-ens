export interface EvolutionRowModel {
  label: string;
  score: number;
  date?: Date;
}

export interface EvolutionModel {
  title: string;
  rows: EvolutionRowModel[];
  description: string;
}
