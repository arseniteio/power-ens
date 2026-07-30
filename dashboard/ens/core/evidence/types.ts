import { ENSComplianceStatus } from '../evaluation/types';
import { ENSLevel } from '../../configuration/types';
import { ENSDataSourceType } from '../data-source/types';

export type ENSEvidenceCategory =
  | 'CONFIGURATION'
  | 'EXECUTION'
  | 'MONITORING'
  | 'INTEGRITY'
  | 'ACCESS_CONTROL'
  | 'RECOVERY'
  | 'OFFSITE'
  | 'TRACEABILITY';

export type ENSEvidenceCriticality =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH';

export interface ENSEvidenceQualityRequirements {
  requiredFields?: string[];
  requiredFieldsWhenStatus?: string[];
  fieldPatterns?: Record<string, string>;
  rejectSynthetic?: boolean;
}

// Primitivas de juicio del motor. Son deliberadamente pocas y deliberadamente
// iguales para los tres controles: el evaluador por control (op-acc-1.evaluator)
// dio dos caminos de evaluación sobre los mismos datos y se desconectó en
// `3e92f5c`. Aquí no hay código por control, solo una declaración en el catálogo.
//
//   NINGUNO_EN_LISTA  CUMPLE si ningún hecho observado está en la lista.
//   TODOS_EN_LISTA    CUMPLE si todo hecho observado está en la lista.
//   UMBRAL_MAXIMO     CUMPLE si ningún valor observado supera el del parámetro.
export type ENSEvidenceJudgmentPrimitive =
  | 'NINGUNO_EN_LISTA'
  | 'TODOS_EN_LISTA'
  | 'UMBRAL_MAXIMO';

// Declara que de esta evidencia decide el motor, no el agente.
//
// El agente emite el HECHO CRUDO (qué cuentas se han autenticado, qué días
// lleva una copia sin hacerse) y el motor lo contrasta con el parámetro que el
// auditor configuró en la pantalla. Cuando una evidencia declara `judgment`, su
// `evidence_state` deja de mandar sobre ella: el motor no lee `estado` en este
// camino.
//
// Invariante que ninguna primitiva puede romper: sin hecho observado o sin
// parámetro, NO_EVALUABLE con motivo. Nunca CUMPLE por ausencia, y nunca
// NO_CUMPLE por ausencia.
export interface ENSEvidenceJudgment {
  primitive: ENSEvidenceJudgmentPrimitive;

  // `id` del ENSControlParameter (p.ej. 'P-04'), no su `name`. El `id` es lo
  // estable entre el bloque semilla de `config/` y lo que devuelve el índice.
  parameterId: string;

  // Tipos de evento que transportan el hecho crudo. Es una lista, como
  // `expectedEventTypes`, porque un mismo hecho puede llegar por más de un tipo
  // (`generic_account_login` y `auth_success` para EV-03 de op.acc.1) y porque
  // durante una migración conviven el tipo viejo y el nuevo.
  factEventTypes: string[];

  // Campo del evento cuyo valor se contrasta. Se busca primero en `attributes` y
  // luego en la raíz del evento normalizado. Si el campo trae una lista, cada
  // elemento cuenta como un hecho observado independiente.
  factField: string;
}

export interface ENSEvidenceDefinition {
  id: string;
  controlId: string;
  title: string;
  description: string;
  requirements: string[];
  levels: ENSLevel[];
  category: ENSEvidenceCategory;
  criticality: ENSEvidenceCriticality;
  sourceTypes: ENSDataSourceType[];
  expectedEventTypes: string[];
  relatedRules: string[];
  auditQuestion: string;
  qualityRequirements?: ENSEvidenceQualityRequirements;

  // Opcional. Sin `judgment`, la evidencia se resuelve como siempre: manda el
  // `evidence_state` que emite el agente.
  judgment?: ENSEvidenceJudgment;
}

export interface ENSEvidenceResolved {
  id: string;
  controlId: string;
  title: string;
  description: string;
  status: ENSComplianceStatus;
  requirements: string[];
  levels: ENSLevel[];
  category: ENSEvidenceCategory;
  criticality: ENSEvidenceCriticality;
  sourceTypes: ENSDataSourceType[];
  expectedEventTypes: string[];
  relatedRules: string[];
  auditQuestion: string;
  qualityRequirements?: ENSEvidenceQualityRequirements;
  lastSeen?: string;
  agentId?: string;
  agentName?: string;
  resolvedEventId?: string;
  resolvedEventType?: string;
  resolvedSourceType?: ENSDataSourceType;
  resolvedSource?: string;
  resolvedRuleId?: string;
  resolvedRuleDescription?: string;
  resolvedAttributes?: Record<string, unknown>;
  latestSuccessfulEventId?: string;
  latestSuccessfulAttributes?: Record<string, unknown>;
  observations: string[];
}

// La parte de la evidencia resuelta que se copia tal cual desde el catálogo,
// antes de saber nada del veredicto ni del evento que lo sostiene. La construye
// `engine.ts` y la consume también `judgment.ts`.
export type ENSEvidenceBaseFields = Omit<
  ENSEvidenceResolved,
  | 'status'
  | 'observations'
  | 'lastSeen'
  | 'agentId'
  | 'agentName'
  | 'resolvedEventId'
  | 'resolvedEventType'
  | 'resolvedSourceType'
  | 'resolvedSource'
  | 'resolvedRuleId'
  | 'resolvedRuleDescription'
>;
