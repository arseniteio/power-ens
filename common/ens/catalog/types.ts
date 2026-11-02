export type ENSLevel = 'BAJO' | 'MEDIO' | 'ALTO';

export type ENSRequirementKind = 'BASE' | 'REFUERZO';

export type ENSControlStatus = 'ACTIVE' | 'DRAFT' | 'DEPRECATED';

type ENSRequirementDecisionMode =
  | 'ALL_REQUIRED'
  | 'ANY_REQUIRED'
  | 'MANUAL_REVIEW';

type ENSMissingEvidenceBehavior =
  | 'PARTIAL'
  | 'FAIL'
  | 'IGNORE';

export interface ENSApplicabilityDefinition {
  levels: ENSLevel[];
  reason?: string;
}

export interface ENSRequirementDecisionPolicy {
  mode: ENSRequirementDecisionMode;
  requiredEvidenceIds?: string[];
  supportiveEvidenceIds?: string[];
  negativeEvidenceIds?: string[];
  missingEvidenceBehavior?: ENSMissingEvidenceBehavior;
  failIfParametersMissing?: boolean;
}

export interface ENSRequirementDefinition {
  id: string;
  title: string;
  description: string;
  kind: ENSRequirementKind;
  applicability: ENSApplicabilityDefinition;
  evidenceIds: string[];
  parameterIds: string[];
  decisionPolicy?: ENSRequirementDecisionPolicy;
  interpretation?: string;
}

export type ENSLevelDimension = 'C' | 'I' | 'T' | 'A' | 'D';

export interface ENSControlSource {
  template: string;
  version: string;
  date?: string;
}

export type ENSMeasurementPlane = 'agent' | 'manager';

export interface ENSControlDefinition {
  id: string;
  name: string;
  family: string;
  category: string;
  dimension: string;
  levelDimension?: ENSLevelDimension | ENSLevelDimension[];
  annexSection: string;
  source: ENSControlSource;
  measurementPlanes?: ENSMeasurementPlane[];
  scopeParameter?: string;
  description: string;
  levels: ENSLevel[];
  requirements: ENSRequirementDefinition[];
  status: ENSControlStatus;
  version: string;
}
