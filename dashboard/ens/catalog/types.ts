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

// Dimensión de seguridad por cuyo NIVEL se rige un control, cuando no se rige
// por la categoría del sistema. Hoy solo existe la Trazabilidad: op.exp.8 es la
// única medida de op.exp que el Anexo II aplica por el nivel de una dimensión.
export type ENSLevelDimension = 'T';

export interface ENSControlDefinition {
  id: string;
  name: string;
  family: string;
  category: string;
  dimension: string;
  // Opcional. Si se declara, el control se evalúa con el nivel de esa dimensión
  // de la configuración global (`traceabilityLevel` para 'T') y, si no está
  // declarado allí, con el nivel ENS global, como todos los demás. `dimension`
  // sigue siendo texto descriptivo: esto es lo único que el motor lee.
  levelDimension?: ENSLevelDimension;
  description: string;
  levels: ENSLevel[];
  requirements: ENSRequirementDefinition[];
  status: ENSControlStatus;
  version: string;
}
