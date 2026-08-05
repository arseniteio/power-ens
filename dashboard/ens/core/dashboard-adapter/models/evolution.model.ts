export interface EvolutionRowModel {
  label: string;
  score: number;
  date?: Date;
  // El punto del presente. Se marca aparte porque es el único que el auditor
  // puede contrastar con el panel de arriba, y verlo señalado es lo que
  // convierte la línea en algo comprobable.
  isCurrent?: boolean;
}

export interface EvolutionModel {
  title: string;
  rows: EvolutionRowModel[];
  description: string;
}
