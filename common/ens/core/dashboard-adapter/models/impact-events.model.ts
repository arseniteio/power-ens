export type ImpactEventSeverity = 'info' | 'warning' | 'error' | 'success';

// One operational SOC alert: the same problem observed many times is ONE row (ENS-DASH-004).
export interface ImpactEventRowModel {
  // The incident key.
  id: string;
  eventType: string;
  label: string;
  // Key details (account, rule, origin and object) for the tooltip.
  description: string;
  severity: ImpactEventSeverity;
  // How many facts observed it in the window.
  count: number;
  // That count in words (facts, or hours with alerts for a security alert); only from two on.
  countLabel?: string;
  controlId: string;
  agentId: string;
  agentName?: string;
  lastObserved: string;
}

export interface ImpactEventsModel {
  title: string;
  rows: ImpactEventRowModel[];
  // Alerts that passed the filters, shown or not (the panel shows the first rows).
  total: number;
  // What is left out, in words (a lower bound when the read hit its limit).
  summary?: string;
  // The alerts could not be read; the rest of the panel stands.
  error?: string;
}
