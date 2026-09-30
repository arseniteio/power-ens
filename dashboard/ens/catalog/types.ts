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

// Plano en el que se mide un control: en cada máquina del alcance (`agent`) o
// en el manager de Wazuh (`manager`, agente 000), que no pertenece a ningún
// grupo. Ver `core/scope/measurement-planes.ts`.
export type ENSMeasurementPlane = 'agent' | 'manager';

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
  // Opcional. Planos en los que se mide el control; si falta, `['agent']`, que
  // es lo que eran todos antes de existir. Con `manager`, el manager entra en el
  // alcance y el control se evalúa en su fila; sin `agent`, NO se evalúa en la
  // fila de ninguna otra máquina.
  measurementPlanes?: ENSMeasurementPlane[];
  // Opcional. `id` del parámetro de la configuración del control que declara
  // las máquinas en las que se mide (p. ej. 'P-04' de mp.info.6). Si se
  // declara, el control solo se evalúa en la fila de las máquinas cuyo nombre
  // figura en ese parámetro: en las demás no produce resultado, igual que un
  // control fuera de su plano. Con el parámetro vacío no se mide en ninguna
  // máquina. Ver `isControlInDeclaredScope` en `core/scope/measurement-planes.ts`.
  scopeParameter?: string;
  description: string;
  levels: ENSLevel[];
  requirements: ENSRequirementDefinition[];
  status: ENSControlStatus;
  version: string;
}
