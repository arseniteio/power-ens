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

// Cómo se ha llegado al incumplimiento. El VEREDICTO es el mismo en los dos
// casos —NO_CUMPLE—, pero ni la acción ni quién la ejecuta lo son, y esa es
// justo la información que no se puede perder:
//
//   MEDIDA          se ha mirado y el resultado no conforma. Es un hallazgo
//                   sobre el sistema: hay algo que corregir en la máquina.
//   NO_EVIDENCIADA  no se ha podido demostrar. La carga de la prueba es del
//                   auditado, así que cuenta en contra igual — pero lo que hay
//                   que hacer es habilitar la prueba, no corregir la máquina.
//
// Decisión del responsable del 04/08. Revierte la parte de `346e56b` que
// publicaba `NO_EVALUABLE` sin número: un auditor no escribe «no evaluable»,
// escribe «no evidenciado» y lo cuenta en contra. Lo que `346e56b` sí acertó
// —y aquí se conserva entero— es que las dos cosas no se explican igual.
export type ENSNonConformityOrigin = 'MEDIDA' | 'NO_EVIDENCIADA';

// De quién es el hueco cuando el incumplimiento es NO_EVIDENCIADA. Es lo que
// decide a quién le toca arreglarlo, y por eso se publica en vez de quedarse
// dentro del texto:
//
//   CATALOG       el producto no declara qué acreditaría el requisito. Es
//                 cierto para todas las máquinas por igual y no cambia por
//                 mirar otra: NO es un hallazgo por máquina y consolidando
//                 nunca se multiplica ni se atribuye a un agente.
//   CONFIGURATION falta un parámetro obligatorio, o la política declarada está
//                 vacía. Es del despliegue del cliente, no de una máquina en
//                 concreto, pero afecta a las que se nombran. Lo arregla quien
//                 configura ENSFácil.
//   COLLECTION    no ha llegado NADA de esa máquina: agente caído, recolector
//                 sin ejecutar, sin latido. **No es un hallazgo sobre la
//                 máquina, es un fallo de RECOGIDA**, y lo arregla quien opera
//                 Wazuh y los agentes — otra persona y otra acción.
//   EVIDENCE      el dato llegó pero no basta para pronunciarse: contrato de
//                 calidad incumplido, campo ilegible, o el propio agente
//                 declara que no ha podido medir y dice por qué. Lo arregla
//                 quien mantiene el productor de la evidencia.
export type ENSGapCause =
  | 'CATALOG'
  | 'CONFIGURATION'
  | 'COLLECTION'
  | 'EVIDENCE';

// Un hallazgo de incumplimiento. UNA SOLA lista: hasta el 04/08 los huecos de
// medida viajaban aparte, en `measurementGaps`, con su propio contador y su
// propio color. Con el criterio nuevo eso ya no se sostiene —el veredicto es el
// mismo— y mantener dos contadores invitaba a leer uno de ellos como «esto no
// cuenta», que es exactamente lo que la decisión revierte. El diagnóstico no se
// pierde: baja de ser una categoría de veredicto a ser `origin` + `cause`.
export interface ENSNonConformity {
  id: string;
  evidenceId: string;
  requirementId: string;
  finding: string;
  impact: string;
  requiredAction: string;
  expected?: string;
  actual?: string;

  // Medido y no conforme, o no evidenciado. Ver `ENSNonConformityOrigin`.
  origin: ENSNonConformityOrigin;

  // Solo en las `NO_EVIDENCIADA`. En las medidas no hay hueco del que hablar.
  cause?: ENSGapCause;

  // Máquinas en las que se ha demostrado ESTE hallazgo, con este mismo texto.
  // Solo lo rellena la consolidación: una tarjeta idéntica en seis máquinas es
  // una tarjeta con seis máquinas, no seis tarjetas. Si el hallazgo difiere
  // (otra cuenta, otro valor), el texto difiere y son tarjetas distintas.
  // Vacío en las de causa CATALOG: no hay máquina a la que atribuirlas.
  agents?: ENSAgentRef[];

  // Todas las evidencias implicadas, no solo la primera: `evidenceId` existe
  // para que la tarjeta tenga un ancla, pero el que va a arreglarlo necesita la
  // lista entera.
  evidenceIds: string[];

  // Parámetros de la pantalla de Configuración que desbloquearían la medida. Es
  // lo que convierte «no se ha podido demostrar» en una acción ejecutable.
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

  // ¿Se ha llegado a medir? Con `status` a NO_CUMPLE, esto es lo que distingue
  // «hemos mirado y está mal» de «no lo has podido demostrar». El veredicto no
  // lo dice porque el veredicto es el mismo a propósito.
  //
  // `false` en un requisito NO_APLICA no significa nada: ahí no hay nada que
  // medir. Consolidando entre agentes es `true` solo si TODAS las máquinas lo
  // midieron: basta una sin demostrar para que el conjunto no esté demostrado.
  evidenced?: boolean;

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

  // OPCIONAL, y desde el 04/08 solo falta en un caso: NO_APLICA. Un control que
  // no aplica no se puntúa —el 0 se pinta en rojo igual que un incumplimiento
  // real—, pero todo lo que aplica SIEMPRE trae número, porque todo lo que
  // aplica tiene veredicto. Antes también se omitía en NO_EVALUABLE, y ese
  // hueco sin número es el que dejaba fuera del porcentaje lo no demostrado.
  score?: number;

  coverage: number;

  // El DENOMINADOR del porcentaje es `applicableRequirements`, no
  // `measuredRequirements`. Entre el 30/07 y el 04/08 fue al revés, y tenía
  // sentido mientras un requisito sin medir no era un incumplimiento: dejarlo
  // en el denominador lo hacía restar igual que uno incumplido, que era
  // precisamente el error. Con el criterio nuevo eso deja de ser un error y
  // pasa a ser la definición: lo no demostrado NO CUMPLE, luego resta.
  //
  // `measuredRequirements` sigue publicándose, pero ya no divide nada: ahora es
  // el DIAGNÓSTICO. «60 %, 5 de 8 requisitos demostrados» y «60 %, 8 de 8
  // demostrados» son dos máquinas muy distintas con el mismo número, y el par
  // es lo que las separa. Mismos campos que `requisitos_aplicables` /
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

  // TODAS las no conformidades, medidas y no evidenciadas, en una sola lista y
  // con un solo contador. Quien quiera separarlas filtra por `origin`, que es
  // lo que hace la pantalla para presentarlas en dos bloques bajo un único
  // total. La lista `measurementGaps` que vivía aquí ya no existe: dos listas
  // con dos contadores es lo que permitía leer una de ellas como «esto no
  // cuenta».
  nonConformities: ENSNonConformity[];

  observations: string[];
  traceability: ENSTraceabilityResult[];
}
