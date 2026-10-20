// Data set of the art. 32 annual report: every figure has a stable field id, its value, its source and its trace.

export const ENS_ANNUAL_REPORT_SCHEMA = 'ensfacil.art32.v1';

// Where a figure comes from. Codes are stable (exports); the guide «Informe anual del artículo 32» explains each.
export type ENSAnnualSource =
  | 'ENGINE'
  | 'MATURITY_ENGINE'
  | 'ASSESSMENT'
  | 'DECLARED'
  | 'SOA'
  | 'ANNEX_II'
  | 'CONFIGURATION'
  | 'CYCLE_REGISTER'
  | 'INCIDENT_REGISTER'
  | 'ALERT_RECONCILIATION'
  | 'FREEZE'
  | 'NONE';

export type ENSAnnualValue = string | number | boolean | null;

export interface ENSAnnualDatum {
  // Stable id, e.g. `measure.implementation_pct`.
  id: string;
  // What the figure is about when the id repeats: the measure, the framework, the incident type, the level.
  key?: string;
  value: ENSAnnualValue;
  unit?: string;
  source: ENSAnnualSource;
  // Where exactly it was read, in Spanish.
  trace: string;
}

export type ENSAnnualMeasureEngine = 'MEDIDO' | 'SIN_MEDICION' | 'SIN_MOTOR';

export interface ENSAnnualMeasure {
  id: string;
  name: string;
  annexSection: string;
  framework: 'org' | 'op' | 'mp';
  engine: ENSAnnualMeasureEngine;
  data: ENSAnnualDatum[];
}

export interface ENSAnnualReport {
  schema: typeof ENS_ANNUAL_REPORT_SCHEMA;
  period: string;
  header: ENSAnnualDatum[];
  categorisation: ENSAnnualDatum[];
  implementation: ENSAnnualDatum[];
  maturity: ENSAnnualDatum[];
  measures: ENSAnnualMeasure[];
  incidents: ENSAnnualDatum[];
  resources: ENSAnnualDatum[];
  measurement: ENSAnnualDatum[];
}

// A frozen report: the data set as it was at the closing, kept in `wazuh-ens-snapshots`.
export interface ENSAnnualFreezeEntry {
  revision: number;
  frozenAt: string;
  frozenBy: string;
  // Why it was frozen again (empty for the automatic freeze at the closing).
  reason?: string;
}

export interface ENSAnnualFreeze extends ENSAnnualFreezeEntry {
  documentType: 'annual_freeze';
  period: string;
  report: ENSAnnualReport;
  // Earlier revisions, oldest first; each one's data set is kept in its own document.
  history: ENSAnnualFreezeEntry[];
}

// The sections of the data set that hold data, in export order.
export const ENS_ANNUAL_SECTIONS: (keyof Pick<ENSAnnualReport, 'header' | 'categorisation' | 'implementation' | 'maturity' | 'incidents' | 'resources' | 'measurement'>)[] = [
  'header',
  'categorisation',
  'implementation',
  'maturity',
  'incidents',
  'resources',
  'measurement',
];

export interface ENSAnnualFrozenPeriod extends ENSAnnualFreezeEntry {
  period: string;
  history: ENSAnnualFreezeEntry[];
}

// What `GET /api/ensfacil/annual-report` returns.
export interface ENSAnnualReportResponse {
  period: string;
  currentPeriod: string;
  lastClosedPeriod: string;
  // MM-DD of op.mon.2 P-02 (12-31 when absent).
  closing: string;
  periodFrom: string;
  periodTo: string;
  periods: ENSAnnualFrozenPeriod[];
  frozen?: ENSAnnualFreezeEntry & { history: ENSAnnualFreezeEntry[] };
  report?: ENSAnnualReport;
  // The organisation evaluation is still being computed: ask again.
  pending?: boolean;
  // Why the frozen reports could not be read (the data set shown is then computed now).
  freezeError?: string;
  // Version of the maturity document: «Medidas sin motor» records with it.
  maturityVersion: { seqNo: number; primaryTerm: number } | null;
}

// What `POST /api/ensfacil/annual-report/freeze` takes: the revision read (null when the period had none).
export interface ENSAnnualFreezeRequest {
  period: string;
  reason: string;
  expectedRevision: number | null;
}
