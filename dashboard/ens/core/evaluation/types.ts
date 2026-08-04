// Una máquina, nombrada como la nombra el auditor. Sale de la consolidación
// entre agentes: el resultado de UN agente no la lleva, porque ahí la máquina ya
// es el contexto entero de la pantalla.
export interface ENSAgentRef {
  agentId: string;
  agentName?: string;
}

// Un motivo y las máquinas en las que ocurre. El mismo motivo repetido en siete
// agentes es UN motivo observado siete veces, no siete motivos: agrupar por
// texto es lo que hace que la vista general siga leyéndose cuando el parque
// crece. La estructura viaja cruda —sin recortar ni redactar— para que cada
// consumidor decida cuántos grupos enseña y cómo; el motor no recorta nada.
export interface ENSObservationGroup {
  // El motivo tal cual lo escribió el motor, SIN prefijo de agente.
  text: string;

  // En qué máquinas se ha observado, en orden estable de aparición. Vacío
  // solo si el motivo no procede de ninguna máquina en concreto.
  agents: ENSAgentRef[];
}

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

  // Máquinas en las que se ha demostrado ESTE hallazgo, con este mismo texto.
  // Solo lo rellena la consolidación: una tarjeta idéntica en seis máquinas es
  // una tarjeta con seis máquinas, no seis tarjetas. Si el hallazgo difiere
  // (otra cuenta, otro valor), el texto difiere y son tarjetas distintas.
  agents?: ENSAgentRef[];
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

  // De QUIÉN es el hueco, que es lo que decide a quién le toca arreglarlo:
  //
  //   CATALOG       el producto no declara qué acreditaría el requisito. Es
  //                 cierto para todas las máquinas por igual y no cambia por
  //                 mirar otra: NO es un hallazgo por máquina y consolidando
  //                 nunca se multiplica ni se atribuye a un agente.
  //   CONFIGURATION faltan parámetros obligatorios del control. Es del
  //                 despliegue del cliente, no de una máquina en concreto,
  //                 pero afecta a las que se nombran.
  //   EVIDENCE      falta el dato de una máquina concreta.
  //
  // El motor ya distinguía las tres para redactar el texto y la acción; sin
  // publicarlo, el consumidor tenía que adivinarlo del texto.
  cause: 'CATALOG' | 'CONFIGURATION' | 'EVIDENCE';

  // Máquinas en las que falta ESTA medida, con este mismo texto. Igual que en
  // `ENSNonConformity`, solo lo rellena la consolidación. Vacío en los huecos
  // de causa CATALOG: no hay máquina a la que atribuirlos.
  agents?: ENSAgentRef[];

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

  // Los mismos motivos sin aplanar. Como en `ENSEvidenceResult`, solo lo
  // rellena la consolidación entre agentes.
  observationGroups?: ENSObservationGroup[];

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
  //
  // Consolidando varios agentes cada motivo llega prefijado con la máquina (o
  // con las máquinas) en las que se observó, para el consumidor que solo sabe
  // leer texto plano —los dos modelos de informe—. El que quiera enseñarlo bien
  // tiene la misma información sin aplanar en `observationGroups`.
  observations: string[];

  // Los mismos motivos, agrupados por texto y con las máquinas de cada uno.
  // Solo lo rellena la consolidación entre agentes: con un agente seleccionado
  // el motivo no necesita decir de qué máquina viene.
  observationGroups?: ENSObservationGroup[];

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

  // Las máquinas que ha resumido este resultado. Solo lo rellena la
  // consolidación: sin él, la vista general dice «todos los agentes» sin decir
  // cuántos son, y «afecta a 6» no se distingue de «afecta a todas».
  consolidatedAgents?: ENSAgentRef[];

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
