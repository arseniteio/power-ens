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
  // The BOE literal of the requirement (Annex II, RD 311/2022): provenance «Norma ENS».
  description: string;
  kind: ENSRequirementKind;
  applicability: ENSApplicabilityDefinition;
  evidenceIds: string[];
  parameterIds: string[];
  decisionPolicy?: ENSRequirementDecisionPolicy;
  // Optional. How the requirement is read and measured (auditor's proposal or ENSFácil's criterion), kept apart from the literal: provenance «Criterio de aplicación».
  interpretation?: string;
}

// Security dimension whose LEVEL governs a control when Annex II applies it by dimension, not by system category: C Confidentiality, I Integrity, T Traceability, A Authenticity, D Availability.
export type ENSLevelDimension = 'C' | 'I' | 'T' | 'A' | 'D';

// Auditor's template a control was built from: file name without extension, template version and its date (ISO), absent when the template carries none.
export interface ENSControlSource {
  template: string;
  version: string;
  date?: string;
}

// Plane where a control is measured: on each scope machine (`agent`) or on the Wazuh manager (`manager`, agent 000, which belongs to no group). See `core/scope/measurement-planes.ts`.
export type ENSMeasurementPlane = 'agent' | 'manager';

export interface ENSControlDefinition {
  id: string;
  name: string;
  family: string;
  category: string;
  dimension: string;
  // Optional. Dimension(s) whose level governs the control (Annex II «nivel X»); with several, the highest of their levels rules. Each level comes from the global configuration (`confidentialityLevel`, `integrityLevel`, `traceabilityLevel`, `authenticityLevel`, `availabilityLevel`) and, with the key absent, is the ENS level. `dimension` stays descriptive text: this is all the engine reads. See `core/control-level.ts`.
  levelDimension?: ENSLevelDimension | ENSLevelDimension[];
  // Annex II section of the measure (e.g. '4.2.1'): orders the lists and heads the detail and the report.
  annexSection: string;
  // Template and version the control follows (traceability to the auditor's package).
  source: ENSControlSource;
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
