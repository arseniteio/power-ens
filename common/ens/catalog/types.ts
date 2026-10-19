export type ENSLevel = 'BAJO' | 'MEDIO' | 'ALTO';

export type ENSRequirementKind = 'BASE' | 'REFUERZO';

export type ENSControlStatus = 'ACTIVE' | 'DRAFT' | 'DEPRECATED';

export type ENSRequirementDecisionMode =
  | 'ALL_REQUIRED'
  | 'ANY_REQUIRED'
  | 'MANUAL_REVIEW';

export type ENSMissingEvidenceBehavior =
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
}

// Security dimension whose LEVEL governs a control, when not governed by the system category: 'T' Traceability (op.exp.8) and 'D' Availability (op.cont.2, op.cont.3, which apply only with D at ALTO).
export type ENSLevelDimension = 'T' | 'D';

// Plane where a control is measured: on each scope machine (`agent`) or on the Wazuh manager (`manager`, agent 000, which belongs to no group). See `core/scope/measurement-planes.ts`.
export type ENSMeasurementPlane = 'agent' | 'manager';

export interface ENSControlDefinition {
  id: string;
  name: string;
  family: string;
  category: string;
  dimension: string;
  // Optional. If declared, the control is evaluated with that dimension's level from the global configuration (`traceabilityLevel` for 'T', `availabilityLevel` for 'D') and, if not declared there, with the global ENS level. `dimension` stays descriptive text: this is all the engine reads.
  levelDimension?: ENSLevelDimension;
  // Optional. Planes where the control is measured; default `['agent']`. With `manager` the manager enters the scope and the control is evaluated on its row; without `agent` it is NOT evaluated on any other machine's row.
  measurementPlanes?: ENSMeasurementPlane[];
  // Optional. `id` of the control's configuration parameter declaring the machines it is measured on (e.g. 'P-04' of mp.info.6). If declared, the control is evaluated only on the rows of the machines listed there; with the parameter empty, on none.
  // See `isControlInDeclaredScope` in `core/scope/measurement-planes.ts`.
  scopeParameter?: string;
  description: string;
  levels: ENSLevel[];
  requirements: ENSRequirementDefinition[];
  status: ENSControlStatus;
  version: string;
}
