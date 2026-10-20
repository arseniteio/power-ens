import type { ENSMaturityConfiguration } from '../../maturity/types';
import type { ENSAgentParameterValue, ENSAgentsConfiguration, ENSCustomTemplate, ENSMatchMode } from '../../../agent-configuration';

export type {
  ENSAgentControlOverrides,
  ENSAgentParameterValue,
  ENSAgentProfile,
  ENSAgentsConfiguration,
  ENSCustomTemplate,
  ENSMatchMode,
  ENSSystemType,
} from '../../../agent-configuration';

export type ENSLevel = 'BAJO' | 'MEDIO' | 'ALTO';

export type ENSParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'list'
  | 'path'
  | 'url'
  | 'duration_hours'
  | 'duration_days'
  // Policy that fits neither a scalar nor a list: a grid of rows with declared columns (the hand-written machine
  // files such as `opacc2-acl.tsv`). See `columns` and `ENSParameterColumn`.
  | 'table';

// Cell types: a short vocabulary, so each means the same in every table. A check valid for one table only goes
// in `PARAMETER_REFINEMENTS`.
export type ENSParameterColumnType =
  // Free text: 'root:ops', 'sudo:total', 'u:auditor:r-x'.
  | 'string'
  // Account, profile or group name. No spaces, commas or `|` (compared literally against the machine).
  | 'identifier'
  // Absolute path, same rule as the `path` parameter type.
  | 'path'
  // Octal file mode, three or four digits ('750', '2770').
  | 'octal'
  // Integer or decimal, within the parameter range.
  | 'number'
  // Date YYYY-MM-DD that exists.
  | 'date'
  // One of the options declared in the column.
  | 'select'
  // Several declared options, comma-separated inside the cell.
  | 'multiselect';

/** A column of a `table` parameter (or the item shape of a `list`). `name` is the stable identifier used when exporting to the machine; `label` is what the auditor sees. */
export interface ENSParameterColumn {
  name: string;
  label: string;
  type: ENSParameterColumnType;
  // A required column left empty makes the row INCOMPLETE; a fully blank row is not judged.
  required: boolean;
  // Required for `select` and `multiselect`; ignored otherwise.
  options?: string[];
  // Only valid on the LAST column: the row may carry more cells than declared and all belong to it (op.acc.3
  // P-03 is `function | indicator | indicator | ...`).
  variadic?: boolean;
}

export type ENSParameterStatus =
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'NOT_APPLICABLE'
  | 'INVALID';

export type ENSConfigurationScopeMode = 'global' | 'agent' | 'group';

export interface ENSConfigurationScope {
  mode: ENSConfigurationScopeMode;
  agentIds: string[];
  groupIds: string[];
}

export interface ENSGlobalConfiguration {
  clientName: string;
  organization: string;
  ensLevel: ENSLevel;
  // Dimension levels (C, I, T, A, D). Optional: an ABSENT key means "same as `ensLevel`"; never `null`. Each is read
  // only by controls whose `levelDimension` includes it; `ensLevel` (the category) may not be below any of them.
  confidentialityLevel?: ENSLevel;
  integrityLevel?: ENSLevel;
  traceabilityLevel?: ENSLevel;
  authenticityLevel?: ENSLevel;
  availabilityLevel?: ENSLevel;
  ensVersion: string;
  scope: string;
  evaluationPeriod: string;
  timezone: string;
  reportLanguage: 'es' | 'en';
  activePolicy: string;
  // Default maturity target per category (1.4.0). Optional: an absent key (or category) means L2 BÁSICA, L3 MEDIA,
  // L4 ALTA; never `null`. See `common/ens/maturity`.
  maturityTargets?: Partial<Record<ENSLevel, 0 | 1 | 2 | 3 | 4 | 5>>;
}

export interface ENSControlParameter {
  id: string;
  controlId: string;
  name: string;
  label: string;
  description: string;
  levels: ENSLevel[];
  requirements: string[];
  type: ENSParameterType;
  // Mode of `value`, stored beside it; the value stays text or a list, so its type in the index does not change.
  matchMode?: ENSMatchMode;
  example?: string;
  // Options accepted for `type: 'select'`: the form draws a dropdown and validation requires one of them.
  // Optional: without `options` the select is free text and validated as "not empty" (blocks seeded earlier;
  // reseed with `inject-control.py`, which keeps configured values).
  options?: string[];
  // Shape of the parameter ITEM; same two effects as `options` (editable grid and per-cell validation).
  //   - `type: 'table'`: one column per field of the row.
  //   - `type: 'list'`: ONE column describing each item; only the first applies.
  // Optional: without `columns` a `table` is edited and validated as a plain list.
  columns?: ENSParameterColumn[];
  required: boolean;
  minValue?: number;
  maxValue?: number;
  defaultValue?: string | number | boolean | string[];
  value?: string | number | boolean | string[];
  wazuhUsage: string;
  ensfacilUsage: string;
  evidenceIds: string[];
  ruleIds: string[];
  ifNotConfigured: string;
  status?: ENSParameterStatus;
}

export interface ENSControlConfiguration {
  controlId: string;
  controlName: string;
  family: string;
  enabled: boolean;
  applicableLevels: ENSLevel[];
  parameters: ENSControlParameter[];
}

// Verdict on ONE value; `reason` says what was expected and what arrived.
export interface ENSParameterValueVerdict {
  valid: boolean;
  reason?: string;
}

// Invalidity reason with the parameter identity, to list in the NC-CFG finding and the form.
export interface ENSParameterValueIssue {
  parameterId: string;
  parameterName: string;
  label: string;
  required: boolean;
  reason: string;
}

export interface ENSControlConfigurationValidation {
  controlId: string;
  controlName: string;
  activeLevel: ENSLevel;
  totalParameters: number;
  configured: number;
  notConfigured: number;
  notApplicable: number;
  invalid: number;
  missingRequired: ENSControlParameter[];
  invalidParameters: ENSControlParameter[];
  // Required parameters of the active level that have a value meaningless for their type. They block evaluation
  // like missing ones; the fix is to correct, not to fill.
  invalidRequired: ENSControlParameter[];
  issues: ENSParameterValueIssue[];
  status: 'CONFIGURED' | 'INCOMPLETE' | 'INVALID';
  parameters: ENSControlParameter[];
}

export interface ENSConfigurationVersion {
  id: string;
  clientId: string;
  version: string;
  status: ENSConfigurationLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  changeReason: string;
  global: ENSGlobalConfiguration;
  scope: ENSConfigurationScope;
  controls: ENSControlConfiguration[];
  auditTrail: ENSConfigurationAuditEntry[];
  // Optional: without it every agent takes the common values, as a 1.1.0 plugin does.
  agents?: ENSAgentsConfiguration;
  // Custom control templates (1.3.0). Its presence marks a 1.3.0 document; built-ins live in code.
  templates?: ENSCustomTemplate[];
  // Shared data asked once (1.4.0); each mapped control parameter is a view of its item. Absent: not migrated.
  organizationData?: ENSOrganizationData;
  // What people record about each control's maturity (1.4.0), append-only. Written only by the maturity route:
  // the configuration save always keeps the stored one. See `common/ens/maturity/types.ts`.
  maturity?: ENSMaturityConfiguration;
}

export interface ENSOrganizationData {
  // Value of each item by id; an absent key is no value, never `null`. Unknown ids (a later version) are kept.
  values: Record<string, ENSAgentParameterValue>;
}
export type ENSConfigurationLifecycleStatus =
  | 'DRAFT'
  | 'CONFIGURED'
  | 'INCOMPLETE'
  | 'INVALID'
  | 'ACTIVE'
  | 'ARCHIVED';

export type ENSControlParameterValues = Record<
  string,
  ENSControlParameter['value']
>;

export interface ENSConfigurationAuditEntry {
  action: 'CREATED' | 'UPDATED' | 'VALIDATED' | 'RESET';
  user: string;
  date: string;
  summary: string;
}

export * from './configuration-session';
