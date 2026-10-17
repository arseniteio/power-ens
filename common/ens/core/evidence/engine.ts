import {
  ENSControlConfiguration,
  ENSLevel,
} from '../../configuration/types';
import { ENSNormalizedEvent } from '../data-source/types';
import { ENSGapCause } from '../evaluation/types';
import { judgeEvidence } from './judgment';
import {
  getEventFieldValue,
  hasMeaningfulValue,
  sortByTimestampDesc,
} from './normalized-events';
import { getEvidenceDefinitions } from './registry';
import {
  ENSEvidenceBaseFields,
  ENSEvidenceDefinition,
  ENSEvidenceResolved,
} from './types';

const GENERIC_EVENT_TYPES = ['evidence_state', 'control_state', 'score_snapshot'];

const DECLARED_STATUSES: ENSEvidenceResolved['status'][] = [
  'CUMPLE',
  'NO_CUMPLE',
  'PARCIAL',
  'NO_EVALUABLE',
  'NO_APLICA',
];

// Ver la explicación extensa en data-source/data-source-engine.ts. Resumen: el
// nombre de un evento describe un hecho observado, no un veredicto, así que solo
// puede empujar hacia NO_CUMPLE. La misma lista en los dos sitios para que el
// motor no dé dos respuestas distintas sobre el mismo evento.
const ADVERSE_EVENT_PATTERNS = [
  'error',
  'failed',
  'missing',
  'unauthorized',
];

// Estado de un evento concreto: primero lo que el evento DECLARA, y solo si no
// declara nada se infiere, y nunca hacia CUMPLE.
//
// Antes esta función terminaba en `: 'CUMPLE'`: un evento sin `estado` cuyo
// nombre no contuviera 'missing', 'error' ni 'unauthorized' se daba por
// conforme. Era un generador de cumplimiento falso —cualquier hecho técnico
// desconocido contaba como conforme— y rompía el principio rector del producto:
// la ausencia de un dato no puede producir una afirmación de cumplimiento.
const resolveEventComplianceStatus = (
  event: ENSNormalizedEvent
): ENSEvidenceResolved['status'] => {
  const declared = String(
    event.status || ''
  ).toUpperCase() as ENSEvidenceResolved['status'];

  if (DECLARED_STATUSES.includes(declared)) {
    return declared;
  }

  const eventType = String(
    event.eventType || ''
  ).toLowerCase();

  return ADVERSE_EVENT_PATTERNS.some(pattern =>
    eventType.includes(pattern)
  )
    ? 'NO_CUMPLE'
    : 'NO_EVALUABLE';
};

const getEvidenceQualityIssues = (
  event: ENSNormalizedEvent,
  definition: ENSEvidenceDefinition
): string[] => {
  const requirements =
    definition.qualityRequirements;

  if (!requirements) {
    return [];
  }

  const requiredFields =
    requirements.requiredFields || [];

  const requiredFieldsWhenStatus =
    requirements.requiredFieldsWhenStatus || [];

  // El contrato de calidad (`requiredFieldsWhenStatus`) solo se exige cuando el
  // evento afirma un estado; si no afirma nada, no hay nada que respaldar.
  const inferredStatus =
    resolveEventComplianceStatus(event);

  const validateRequiredFields =
    !requiredFieldsWhenStatus.length ||
    requiredFieldsWhenStatus.includes(
      String(inferredStatus).toUpperCase()
    );

  const missingFields = validateRequiredFields
    ? requiredFields.filter(
        field =>
          !hasMeaningfulValue(
            getEventFieldValue(event, field)
          )
      )
    : [];

  const invalidPatternFields =
    validateRequiredFields
      ? Object.entries(
          requirements.fieldPatterns || {}
        )
          .filter(([field, pattern]) => {
            const value = getEventFieldValue(
              event,
              field
            );

            if (!hasMeaningfulValue(value)) {
              return false;
            }

            try {
              return !new RegExp(pattern).test(
                String(value)
              );
            } catch {
              return true;
            }
          })
          .map(([field]) => field)
      : [];

  const issues: string[] = [];

  if (missingFields.length) {
    issues.push(
      `faltan campos obligatorios: ${missingFields.join(', ')}`
    );
  }

  if (invalidPatternFields.length) {
    issues.push(
      `campos con formato inválido: ${invalidPatternFields.join(', ')}`
    );
  }

  if (
    requirements.rejectSynthetic &&
    event.isSynthetic
  ) {
    issues.push(
      'el evento está marcado como sintético o de demostración'
    );
  }

  return issues;
};

const buildBaseEvidence = (
  definition: ENSEvidenceDefinition
): ENSEvidenceBaseFields => ({
  id: definition.id,
  controlId: definition.controlId,
  title: definition.title,
  description: definition.description,
  requirements: definition.requirements,
  levels: definition.levels,
  category: definition.category,
  criticality: definition.criticality,
  sourceTypes: definition.sourceTypes,
  expectedEventTypes: definition.expectedEventTypes,
  relatedRules: definition.relatedRules,
  auditQuestion: definition.auditQuestion,
  qualityRequirements: definition.qualityRequirements,
});

// La causa con la que el recolector declara que no pudo medir (`causa` de su
// `evidence_state`). Solo las tres de una evidencia: CATALOG es del requisito.
const DECLARABLE_GAP_CAUSES: ENSGapCause[] = [
  'CONFIGURATION',
  'COLLECTION',
  'EVIDENCE',
];

export const declaredGapCause = (
  event: ENSNormalizedEvent
): ENSGapCause | undefined => {
  const raw = event.attributes?.causa;
  const cause = String(raw === undefined || raw === null ? '' : raw)
    .trim()
    .toUpperCase() as ENSGapCause;

  return DECLARABLE_GAP_CAUSES.includes(cause) ? cause : undefined;
};

// ¿El evento trae un veredicto? Se mira el estado ya normalizado: el `estado`
// que declara el agente y, sin él, NO_EVALUABLE (o NO_CUMPLE si el nombre del
// evento es adverso; ningún hecho de una evidencia que declara
// `agentDeclaresOnlyGaps` lleva un nombre así).
const VERDICT_STATUSES = ['CUMPLE', 'NO_CUMPLE', 'PARCIAL'];

const declaresVerdict = (
  event: ENSNormalizedEvent
): boolean =>
  VERDICT_STATUSES.includes(
    String(event.status || '').toUpperCase()
  );

const resolveEvidenceEventStatus = (
  event: ENSNormalizedEvent
): ENSEvidenceResolved['status'] =>
  resolveEventComplianceStatus(event);

// `configuration` es la configuración activa del control. Solo la necesitan las
// evidencias que declaran `judgment` (el motor juzga contra un parámetro); las
// demás se resuelven igual con ella y sin ella.
// `now` solo lo usan las evidencias con `judgment`, para medir la ventana del
// latido del recolector. Se pasa como parámetro para poder congelarlo en las
// pruebas; en producción nadie lo pasa.
export const resolveEvidenceForControl = (
  controlId: string,
  events: ENSNormalizedEvent[],
  agentId?: string,
  level?: ENSLevel,
  configuration?: ENSControlConfiguration,
  now?: Date
): ENSEvidenceResolved[] => {
  const definitions = getEvidenceDefinitions(controlId);

  const filteredEvents = events.filter(event => {
    const sameControl =
      !event.controlId ||
      event.controlId === controlId;

    const sameAgent =
      !agentId ||
      event.agentId === agentId;

    return sameControl && sameAgent;
  });

  return definitions.map(definition => {
    const baseEvidence = buildBaseEvidence(definition);
    const appliesToLevel = !level || definition.levels.includes(level);

    if (!appliesToLevel) {
      return {
        ...baseEvidence,
        status: 'NO_APLICA',
        observations: [
          `La evidencia ${definition.id} no aplica para el nivel ENS ${level}.`,
          `Pregunta de auditoría: ${definition.auditQuestion}`,
        ],
      };
    }

    // Bifurcación única del motor: o la decide una primitiva declarada en el
    // catálogo, o la decide el `evidence_state` del agente como hasta ahora.
    // Nunca las dos cosas sobre la misma evidencia.
    const judgment = definition.judgment;

    if (judgment) {
      return judgeEvidence(
        definition,
        judgment,
        baseEvidence,
        filteredEvents,
        configuration,
        now
      );
    }

    // Si el recolector de la evidencia no pone veredictos, un evento que lo
    // declara no es suyo: no la resuelve (ver `agentDeclaresOnlyGaps`).
    const candidateEvents = definition.agentDeclaresOnlyGaps
      ? filteredEvents.filter(event => !declaresVerdict(event))
      : filteredEvents;

    const matchingEventsByEvidenceId = sortByTimestampDesc(
      candidateEvents.filter(event =>
        event.evidenceId === definition.id &&
        definition.sourceTypes.includes(
          event.sourceType
        ) &&
        definition.expectedEventTypes.includes(
          event.eventType
        )
      )
    );

    const matchingEventsByEventType = sortByTimestampDesc(
      candidateEvents.filter(event =>
        !event.evidenceId &&
        definition.sourceTypes.includes(
          event.sourceType
        ) &&
        !GENERIC_EVENT_TYPES.includes(event.eventType) &&
        definition.expectedEventTypes.includes(event.eventType)
      )
    );

    const compatibleEvents = sortByTimestampDesc([
      ...matchingEventsByEvidenceId,
      ...matchingEventsByEventType,
    ]);

    const candidatesWithQuality =
      compatibleEvents.map(event => ({
        event,
        issues: getEvidenceQualityIssues(
          event,
          definition
        ),
      }));

    const rejectedCandidates =
      candidatesWithQuality.filter(
        candidate =>
          candidate.issues.length > 0
      );

    const latestEvent =
      candidatesWithQuality.find(
        candidate =>
          candidate.issues.length === 0
      )?.event;

    // Una evidencia que no escucha ningún evento no espera hechos: la resuelve
    // la policy del control con la configuración declarada (op.cont.2). Sin
    // decisión de la policy, lo que falta es de CONFIGURACIÓN, y decir «no ha
    // llegado ningún evento» mandaría a buscar un recolector que no existe.
    if (!definition.expectedEventTypes.length) {
      return {
        ...baseEvidence,
        status: 'NO_EVALUABLE',
        gapCause: 'CONFIGURATION',
        observations: [
          `La evidencia ${definition.id} no escucha ningún hecho: la juzga la policy del control con lo declarado en la pantalla de Configuración.`,
          `Pregunta de auditoría: ${definition.auditQuestion}`,
        ],
      };
    }

    if (!latestEvent) {
      const latestRejectedCandidate =
        rejectedCandidates[0];

      return {
        ...baseEvidence,
        status: 'NO_EVALUABLE',
        // Sin ningún evento compatible no ha llegado NADA de esta máquina para
        // esta evidencia: agente caído, recolector sin desplegar o regla que no
        // dispara. Es un fallo de RECOGIDA, y quien lo arregla no es quien
        // arregla la máquina. Con eventos compatibles rechazados sí llegó el
        // dato, pero no sirve: eso es del productor de la evidencia.
        gapCause: compatibleEvents.length ? 'EVIDENCE' : 'COLLECTION',
        observations: compatibleEvents.length
          ? [
              `Se encontraron ${compatibleEvents.length} eventos compatibles para ${definition.id}, pero ninguno cumple el contrato de calidad.`,
              ...(latestRejectedCandidate
                ? [
                    `Último evento rechazado ${latestRejectedCandidate.event.id}: ${latestRejectedCandidate.issues.join('; ')}.`,
                  ]
                : []),
              `Pregunta de auditoría: ${definition.auditQuestion}`,
            ]
          : [
              `No se ha encontrado ningún evento normalizado compatible para la evidencia ${definition.id}.`,
              `Pregunta de auditoría: ${definition.auditQuestion}`,
            ],
      };
    }

    const latestSuccessfulEvent =
      candidatesWithQuality.find(
        candidate =>
          candidate.issues.length === 0
          &&
          resolveEvidenceEventStatus(
            candidate.event
          ) === 'CUMPLE'
      )?.event;

    const resolvedStatus =
      resolveEvidenceEventStatus(
        latestEvent
      );

    return {
      ...baseEvidence,
      status: resolvedStatus,
      // El agente ha reportado y él mismo declara que no ha podido medir; su
      // `motivo` dice por qué y viaja en los atributos hasta la tarjeta. Si
      // además declara la `causa`, esa es la que manda: el recolector sabe si
      // lo que falta es el registro que la organización no mantiene
      // (CONFIGURATION) o una fuente que no pudo leer (COLLECTION), y el motor
      // no tiene otra forma de saberlo. Sin causa declarada, el dato llegó y no
      // basta: es del productor de la evidencia.
      gapCause:
        resolvedStatus === 'NO_EVALUABLE'
          ? declaredGapCause(latestEvent) || 'EVIDENCE'
          : undefined,
      relatedRules: Array.from(
        new Set([
          ...definition.relatedRules,
          ...(latestEvent.ruleId ? [latestEvent.ruleId] : []),
        ])
      ),
      lastSeen: latestEvent.timestamp,
      agentId: latestEvent.agentId,
      agentName: latestEvent.agentName,
      resolvedEventId: latestEvent.id,
      resolvedEventType: latestEvent.eventType,
      resolvedSourceType: latestEvent.sourceType,
      resolvedSource: latestEvent.source,
      resolvedRuleId: latestEvent.ruleId,
      resolvedRuleDescription: latestEvent.ruleDescription,
      resolvedAttributes: latestEvent.attributes,
      latestSuccessfulEventId:
        latestSuccessfulEvent?.id,
      latestSuccessfulAttributes:
        latestSuccessfulEvent
          ?.attributes,
      observations: [
        `Evidencia ${definition.id} resuelta desde evento ${latestEvent.eventType}.`,
        ...(rejectedCandidates.length
          ? [
              `Se ignoraron ${rejectedCandidates.length} eventos compatibles que no cumplían el contrato de calidad.`,
            ]
          : []),
        `Pregunta de auditoría: ${definition.auditQuestion}`,
      ],
    };
  });
};
