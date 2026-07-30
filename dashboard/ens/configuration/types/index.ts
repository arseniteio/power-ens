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
  | 'duration_days';

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
  ensVersion: string;
  scope: string;
  evaluationPeriod: string;
  timezone: string;
  reportLanguage: 'es' | 'en';
  activePolicy: string;
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
  example?: string;
  // Opciones admitidas para `type: 'select'`. Mientras un bloque no las declare,
  // la validación de ese select se queda en "no está vacío" (ver
  // `parameter-value-validator.ts`). Opcional para no romper los bloques ya
  // sembrados en `wazuh-ens-configuration`.
  options?: string[];
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

// Veredicto sobre UN valor concreto. `reason` está redactado para que el
// auditor pueda corregir sin adivinar: dice qué se esperaba y qué llegó.
export interface ENSParameterValueVerdict {
  valid: boolean;
  reason?: string;
}

// Motivo de invalidez con la identidad del parámetro, para poder listarlos en la
// no conformidad NC-CFG y en el formulario sin volver a validar.
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
  // Obligatorios del nivel activo que SÍ tienen valor, pero un valor que no
  // significa nada para su tipo. Bloquean la evaluación igual que los que
  // faltan, pero el arreglo es distinto: corregir, no rellenar.
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
