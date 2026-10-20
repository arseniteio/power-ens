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

// See the long explanation in data-source/data-source-engine.ts. The name of an event describes an observed fact, not a verdict, so it can only push towards NO_CUMPLE. Same list in both places so the engine does not give two answers about one event.
const ADVERSE_EVENT_PATTERNS = [
  'error',
  'failed',
  'missing',
  'unauthorized',
];

// State of a concrete event: first what the event DECLARES, and only if it declares nothing is it inferred, and never towards CUMPLE.
// This function used to end in `: 'CUMPLE'`: an event without `estado` whose name lacked 'missing', 'error' or 'unauthorized' was taken as compliant, a generator of false compliance.
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

  // The quality contract (`requiredFieldsWhenStatus`) is required only when the event asserts a state; otherwise there is nothing to back.
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

// Cause with which the collector declares it could not measure (`causa` of its `evidence_state`). Only the three of an evidence: CATALOG belongs to the requirement.
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

// Does the event carry a verdict? The already normalized state is looked at: the agent's declared `estado` and, without it, NO_EVALUABLE (or NO_CUMPLE if the event name is adverse; no fact of an evidence declaring `agentDeclaresOnlyGaps` has such a name).
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

// `configuration` is the control's active configuration, needed only by evidences declaring `judgment`. `now` is used only by those to measure the collector heartbeat window; a parameter so tests can freeze it.
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
          `La evidencia ${definition.id} no aplica en el nivel ${level} con el que se evalúa el control.`,
          `Pregunta de auditoría: ${definition.auditQuestion}`,
        ],
      };
    }

    // The engine's single fork: a primitive declared in the catalog decides, or the agent's `evidence_state` as before. Never both on the same evidence.
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

    // If the evidence's collector puts no verdicts, an event declaring one is not its own: it does not resolve it (see `agentDeclaresOnlyGaps`).
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

    // An evidence that listens to no event expects no facts: the control's policy resolves it with the declared configuration (op.cont.2). Without a policy decision what is missing is CONFIGURATION; "no event arrived" would send people looking for a collector that does not exist.
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
        // Without any compatible event NOTHING arrived from this machine for this evidence (agent down, collector not deployed, rule not firing): a COLLECTION failure. With compatible events rejected, the data arrived but is unusable: the evidence producer's.
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
      // The agent reported and itself declares it could not measure; its `motivo` says why and travels in the attributes to the card. If it also declares the `causa`, that rules: the collector knows whether what is missing is the register the organisation does not maintain (CONFIGURATION) or a source it could not read (COLLECTION).
      // Without a declared cause the data arrived and is not enough: the evidence producer's.
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
