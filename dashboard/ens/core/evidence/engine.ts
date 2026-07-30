import { ENSLevel } from '../../configuration/types';
import { ENSNormalizedEvent } from '../data-source/types';
import { getEvidenceDefinitions } from './registry';
import { ENSEvidenceDefinition, ENSEvidenceResolved } from './types';

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

const sortByTimestampDesc = (events: ENSNormalizedEvent[]) =>
  [...events].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
};

const getEventFieldValue = (
  event: ENSNormalizedEvent,
  field: string
): unknown => {
  if (
    event.attributes &&
    Object.prototype.hasOwnProperty.call(
      event.attributes,
      field
    )
  ) {
    return event.attributes[field];
  }

  const directEvent = event as unknown as Record<
    string,
    unknown
  >;

  return directEvent[field];
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
): Omit<ENSEvidenceResolved, 'status' | 'observations' | 'lastSeen' | 'agentId' | 'agentName' | 'resolvedEventId' | 'resolvedEventType' | 'resolvedSourceType' | 'resolvedSource' | 'resolvedRuleId' | 'resolvedRuleDescription'> => ({
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

const resolveEvidenceEventStatus = (
  event: ENSNormalizedEvent
): ENSEvidenceResolved['status'] =>
  resolveEventComplianceStatus(event);

export const resolveEvidenceForControl = (
  controlId: string,
  events: ENSNormalizedEvent[],
  agentId?: string,
  level?: ENSLevel
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

    const matchingEventsByEvidenceId = sortByTimestampDesc(
      filteredEvents.filter(event =>
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
      filteredEvents.filter(event =>
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

    if (!latestEvent) {
      const latestRejectedCandidate =
        rejectedCandidates[0];

      return {
        ...baseEvidence,
        status: 'NO_EVALUABLE',
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
