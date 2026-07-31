// Un hallazgo de incumplimiento DEMOSTRADO: se ha medido y el resultado no
// conforma. Es lo único que puede abrir una no conformidad.
export interface ENSNonConformity {
  id: string;
  evidenceId: string;
  requirementId: string;
  finding: string;
  impact: string;
  requiredAction: string;
  expected?: string;
  actual?: string;
}

// Un HUECO DE MEDIDA no es una no conformidad y por eso viaja aparte, con otro
// identificador (PM-xxx), otro texto y otra acción.
//
// La máquina no ha incumplido nada: sencillamente no se ha podido medir. Antes
// esto abría una NC ("El requisito op.acc.1.2 esta en estado PARCIAL", acción
// "revisar las evidencias") indistinguible de un incumplimiento real, y el
// auditor no tenía forma de saber si el sistema estaba mal o si faltaba un dato.
// La acción de un hueco nunca es "revisar": es configurar el parámetro concreto
// o arreglar el recolector que no está emitiendo.
export interface ENSMeasurementGap {
  id: string;
  evidenceId: string;
  requirementId: string;
  finding: string;
  impact: string;
  requiredAction: string;

  // Todas las evidencias del requisito que no se han podido medir, no solo la
  // primera: `evidenceId` existe para que la tarjeta tenga un ancla, pero el
  // que va a configurar necesita la lista entera.
  evidenceIds: string[];

  // Parámetros de la pantalla de Configuración que acreditan esas evidencias.
  // Es lo que convierte "falta medir" en una acción ejecutable.
  parameterIds: string[];
}

import { ENSPolicyRuntimeResult } from '../policy-runtime';
import { ENSLevel } from '../../configuration/types';
import {
  ENSEvidenceCategory,
  ENSEvidenceCriticality,
} from '../evidence/types';
import { ENSDataSourceType } from '../data-source/types';

export type ENSComplianceStatus =
  | 'CUMPLE'
  | 'NO_CUMPLE'
  | 'PARCIAL'
  | 'NO_EVALUABLE'
  | 'NO_APLICA';

export interface ENSRequirementResult {
  id: string;
  title: string;
  status: ENSComplianceStatus;
  level: ENSLevel[];
  observations: string[];
  evidenceIds?: string[];
}

export interface ENSEvidenceResult {
  id: string;
  controlId: string;
  status: ENSComplianceStatus;
  description: string;

  // Por qué la evidencia está como está: qué cuenta concreta incumple, qué
  // parámetro falta, por qué un gris es un gris justificado.
  //
  // Este campo NO existía, y su ausencia vaciaba en silencio todo el trabajo de
  // escribir buenos motivos: `ENSEvidenceResolved` los trae desde el motor, y
  // aquí se perdían. Los dos modelos de informe los leían igual
  // (`evidences.get(id)?.observations`) y recibían siempre `[]`, así que el
  // motivo de una evidencia en gris o en rojo no llegaba nunca al auditor.
  // Afecta a los tres controles, no solo al que estrenó las primitivas de
  // juicio: también al gris justificado de EV-06 de mp.info.6.
  observations: string[];

  requirements: string[];
  levels: ENSLevel[];
  category: ENSEvidenceCategory;
  criticality: ENSEvidenceCriticality;
  sourceTypes: ENSDataSourceType[];
  expectedEventTypes: string[];
  relatedRules: string[];
  auditQuestion: string;
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
}

export interface ENSParameterResult {
  id: string;
  name: string;
  label: string;
  status: 'CONFIGURED' | 'NOT_CONFIGURED' | 'NOT_APPLICABLE' | 'INVALID';
  value?: string | number | boolean | string[];
  required: boolean;
  requirements: string[];
  ifNotConfigured: string;
}

export interface ENSTraceabilityResult {
  source: 'CATALOG' | 'CONFIGURATION' | 'WAZUH' | 'EVIDENCE' | 'REPORT';
  reference: string;
  description: string;
  controlId?: string;
  requirementId?: string;
  requirementIds?: string[];
  evidenceId?: string;
  status?: ENSComplianceStatus;
  eventId?: string;
  eventType?: string;
  eventSourceType?: ENSDataSourceType;
  eventSource?: string;
  ruleId?: string;
  ruleDescription?: string;
  agentId?: string;
  agentName?: string;
  auditAttributes?: Record<string, unknown>;
  timestamp?: string;
}

export interface ENSComplianceResult {
  control: {
    id: string;
    name: string;
    family: string;
    category: string;
    description: string;
  };

  policyRuntime?: ENSPolicyRuntimeResult;  

  level: ENSLevel;
  status: ENSComplianceStatus;

  // OPCIONAL a propósito. Un control NO_EVALUABLE o NO_APLICA se publica SIN
  // número, nunca con un cero: el cero es una afirmación en rojo ("0 % de
  // cumplimiento") sobre algo que no se ha medido, del mismo género que el
  // CUMPLE falso que el principio rector prohíbe. Mismo contrato que el
  // `score_snapshot` de los tres agentes, que ya omite el campo.
  score?: number;

  coverage: number;

  // Qué mide el porcentaje, sin tener que cruzarlo con nada: `score` es el
  // porcentaje de `measuredRequirements` que conforma, y `applicableRequirements`
  // dice sobre cuántos debería haberse podido pronunciar el control. Sin este
  // par, un 50 no se distingue de otro: "la mitad de todo incumple" y "de los
  // dos requisitos que se pudieron medir, uno conforma" son fotos muy distintas
  // de la misma máquina. Mismos campos que `requisitos_aplicables` /
  // `requisitos_medidos` de los agentes.
  applicableRequirements: number;
  measuredRequirements: number;
  unmeasuredRequirements: string[];

  evaluatedAt: string;
  lastEvidenceAt?: string;
  nextReviewAt?: string;

  requirements: ENSRequirementResult[];
  parameters: ENSParameterResult[];
  evidences: ENSEvidenceResult[];

  missingParameters: string[];
  missingEvidences: string[];
  relatedRules: string[];

  nonConformities: ENSNonConformity[];

  // Lista aparte, nunca fusionada con la anterior. El recuento de "no
  // conformidades abiertas" que ve el auditor sale solo de `nonConformities`.
  measurementGaps: ENSMeasurementGap[];

  observations: string[];
  traceability: ENSTraceabilityResult[];
}
