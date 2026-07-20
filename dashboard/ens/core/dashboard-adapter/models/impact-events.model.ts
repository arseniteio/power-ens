export type ImpactEventSeverity = 'info' | 'warning' | 'error' | 'success';

export interface ImpactEventRowModel {
  id: string;
  label: string;
  description: string;
  severity: ImpactEventSeverity;
  count: number;
  percent: number;
}

export interface ImpactEventsModel {
  title: string;
  rows: ImpactEventRowModel[];
}
