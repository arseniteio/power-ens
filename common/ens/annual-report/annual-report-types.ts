// Data set of the art. 32 annual report: every figure has a stable field id, its value, its source and its trace.

export const ENS_ANNUAL_REPORT_SCHEMA = 'power-ens.art32.v1';

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
  // First and last day it covers (its header's), kept beside it for the list of frozen periods.
  periodStart?: string;
  periodEnd?: string;
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
  periodStart?: string;
  periodEnd?: string;
  history: ENSAnnualFreezeEntry[];
}

// What `GET /api/powerEns/annual-report` returns.
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
  // A closing moved since a freeze: what the period would cover now, or the freeze of another closing left aside.
  notice?: string;
  // A frozen period: whether «Regenerar» can still recompute it (op.mon.2 still re-sends its incidents), and why not.
  regeneration?: { allowed: boolean; reason?: string };
  // Version of the maturity document: «Medidas sin motor» records with it.
  maturityVersion: { seqNo: number; primaryTerm: number } | null;
}

// What `POST /api/powerEns/annual-report/freeze` takes: the revision read (null when the period had none).
export interface ENSAnnualFreezeRequest {
  period: string;
  reason: string;
  expectedRevision: number | null;
}

// Every field id of the data set (guide 11 documents each); an id never changes meaning, a new figure is a new id.
export const ENS_ANNUAL_FIELD_IDS: string[] = [
  ...['schema', 'organisation', 'unit', 'system', 'period', 'period_start', 'period_end', 'period_open', 'category', 'generated_at', 'plugin_version', 'frozen', 'frozen_at', 'frozen_by', 'revision', 'freeze_reason'].map(id => `header.${id}`),
  ...['level_c', 'level_i', 'level_t', 'level_a', 'level_d', 'ens_level', 'category'].map(id => `category.${id}`),
  ...['global_pct', 'framework_pct', 'measures_applicable', 'measures_measured', 'measures_declared', 'measures_without_data', 'measures_applicable_outside_soa'].map(
    id => `implementation.${id}`
  ),
  ...['measures_at_level', 'not_assessed', 'below_target'].map(id => `maturity.${id}`),
  ...[
    'name',
    'engine',
    'axis',
    'level',
    'annex_requirement',
    'soa',
    'applies',
    'status',
    'implementation_pct',
    'coverage_pct',
    'maturity_accredited',
    'maturity_assessed',
    'maturity_target',
    'documentary_reference',
    'owner',
    'assessed_at',
  ].map(id => `measure.${id}`),
  ...[
    'window_start',
    'window_end',
    'total',
    'by_type',
    'by_severity',
    'mttd_hours',
    'mttd_lower_bound_hours',
    'mttd_from_occurrence',
    'mttd_from_alert',
    'mttd_without_data',
    'mttc_hours',
    'mttr_hours',
    'notified_ccn_cert',
    'with_personal_data',
    'notified_aepd',
    'alerts_window',
    'alerts_relevant',
    'alerts_in_incident',
    'alerts_to_incident_pct',
  ].map(id => `incidents.${id}`),
  ...['cycles', 'hours_internal', 'hours_external', 'budget_executed', 'ict_budget_total', 'ict_staff_total', 'security_staff', 'budget_pct_of_ict', 'security_staff_pct_of_ict'].map(
    id => `resources.${id}`
  ),
  ...['coverage_pct', 'controls_not_evaluable', 'last_cycle', 'last_cycle_implementation_pct'].map(id => `measurement.${id}`),
];
