export interface LevelSummaryRowModel {
  level: 'BAJO' | 'MEDIO' | 'ALTO';
  label: string;
  count: number;
  percent: number;
}

export interface LevelSummaryModel {
  title: string;
  rows: LevelSummaryRowModel[];
  donutGradient: string;
}

