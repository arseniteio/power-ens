import { ENSPolicyRuntimeResult } from '../policy-runtime';
import { ENSControlDefinition } from '../../catalog';
import { ENSControlConfiguration, ENSLevel } from '../../configuration/types';
import { validateControlConfiguration } from '../../configuration/services';
import { ENSEvidenceResolved } from '../evidence/types';
import { ENSComplianceResult, ENSNonConformity } from './types';
import { evaluateRequirements } from './requirement';
import { evaluateControlStatus } from './control';
import { ENSNormalizedEvent } from '../data-source/types';

const asTraceabilityStatus = (
  status: string | undefined
): ENSComplianceResult[
  'traceability'
][number]['status'] => {
  switch (status) {
    case 'CUMPLE':
    case 'NO_CUMPLE':
    case 'PARCIAL':
    case 'NO_EVALUABLE':
    case 'NO_APLICA':
      return status;

    default:
      return undefined;
  }
};

const buildAuditAttributes = (
  evidence: ENSEvidenceResolved
): Record<string, unknown> | undefined => {
  const requiredFields =
    evidence.qualityRequirements?.requiredFields || [];

  const attributes =
    evidence.resolvedAttributes ||
    {};

  const auditAttributes =
    requiredFields.reduce<Record<string, unknown>>(
      (result, field) => {
        if (
          !Object.prototype.hasOwnProperty.call(
            attributes,
            field
          )
        ) {
          return result;
        }

        const value = attributes[field];

        if (
          value === undefined ||
          value === null ||
          String(value).trim() === ''
        ) {
          return result;
        }

        result[field] = value;

        return result;
      },
      {}
    );

  return Object.keys(auditAttributes).length
    ? auditAttributes
    : undefined;
};

export const evaluateENSControl = (
  catalogControl: ENSControlDefinition,
  configuration: ENSControlConfiguration | undefined,
  level: ENSLevel,
  evidences: ENSEvidenceResolved[] = [],
  policyRuntime?: ENSPolicyRuntimeResult,
  events: ENSNormalizedEvent[] = []
): ENSComplianceResult => {
  const validation = configuration
    ? validateControlConfiguration(configuration, level)
    : undefined;

  const missingRequired = validation?.missingRequired || [];

  // Un obligatorio PRESENTE pero con un valor que no significa nada para su tipo
  // cuenta como no configurado: si no contara, el control se declararía
  // evaluable sobre un dato inexistente y podría salir en verde. Bloquea igual
  // que el que falta, pero se le cuenta al auditor aparte, porque el arreglo es
  // otro: corregir el valor, no rellenar un campo vacío.
  const invalidRequired = validation?.invalidRequired || [];
  const configurationIssues = validation?.issues || [];

  const blockingParameters = [
    ...missingRequired,
    ...invalidRequired,
  ];

  const hasMissingRequired = blockingParameters.length > 0;

  // Motivo redactado de por qué el valor no vale. Sin motivo el auditor busca a
  // ciegas: "P-07 tiene un valor inválido" no le dice si sobra un espacio o si
  // escribió letras donde iban dígitos octales.
  const getInvalidReason = (
    parameterId: string
  ): string =>
    configurationIssues.find(
      issue => issue.parameterId === parameterId
    )?.reason ||
    'el valor no es válido para su tipo';

  const describeInvalidParameter = (
    parameter: { id: string; label: string }
  ): string =>
    `${parameter.id} (${parameter.label}): ${getInvalidReason(parameter.id)}`;

    const requirements = evaluateRequirements(
      catalogControl.requirements,
      level,
      evidences,
      hasMissingRequired,
      policyRuntime?.decisions || []
    );

  const controlEvaluation = evaluateControlStatus(requirements);

  const parameters = validation?.parameters.map(parameter => ({
    id: parameter.id,
    name: parameter.name,
    label: parameter.label,
    status: parameter.status || 'NOT_CONFIGURED',
    value: parameter.value,
    required: parameter.required,
    requirements: parameter.requirements,
    ifNotConfigured: parameter.ifNotConfigured,
  })) || [];

  const relatedRules = Array.from(
    new Set([
      ...(configuration?.parameters.flatMap(parameter => parameter.ruleIds) || []),
      ...evidences.flatMap(evidence => evidence.relatedRules),
    ])
  );

  const observations = [
    ...(hasMissingRequired
      ? [
          ...missingRequired.map(
            parameter =>
              `Falta configurar ${parameter.id} - ${parameter.label}. ${parameter.ifNotConfigured}`
          ),
          ...invalidRequired.map(
            parameter =>
              `${parameter.id} - ${parameter.label} tiene un valor inválido: ${getInvalidReason(
                parameter.id
              )}. ${parameter.ifNotConfigured}`
          ),
        ]
      : ['Configuración mínima disponible para evaluar el control.']),
    ...evidences.flatMap(evidence => evidence.observations),
  ];


  const controlRequirementIds = new Set(
    catalogControl.requirements.map(
      requirement =>
        requirement.id
    )
  );

  const resolvedEventIds = new Set(
    evidences
      .map(
        evidence =>
          evidence.resolvedEventId
      )
      .filter(
        (eventId): eventId is string =>
          Boolean(eventId)
      )
  );

  const historicalEventIds =
    new Set<string>();

  const historicalEventTraceability = [
    ...events,
  ]
    .filter(
      event =>
        !event.isSynthetic
    )
    .sort(
      (left, right) =>
        new Date(
          right.timestamp
        ).getTime() -
        new Date(
          left.timestamp
        ).getTime()
    )
    .flatMap(event => {
      if (
        resolvedEventIds.has(
          event.id
        ) ||
        historicalEventIds.has(
          event.id
        )
      ) {
        return [];
      }

      const hasConflictingControlId =
        Boolean(
          event.controlId &&
          event.controlId !==
            catalogControl.id
        );

      const hasConflictingRequirementId =
        Boolean(
          event.requirementId &&
          !controlRequirementIds.has(
            event.requirementId
          )
        );

      if (
        hasConflictingControlId ||
        hasConflictingRequirementId
      ) {
        return [];
      }

      const relatedEvidence = evidences.find(
        evidence => {
          const evidenceMatches =
            event.evidenceId
              ? event.evidenceId ===
                  evidence.id
              : evidence.expectedEventTypes
                  .includes(
                    event.eventType
                  );

          return (
            evidenceMatches &&
            evidence.sourceTypes.includes(
              event.sourceType
            ) &&
            evidence.expectedEventTypes.includes(
              event.eventType
            )
          );
        }
      );

      const explicitRequirementBelongs =
        Boolean(
          event.requirementId &&
          controlRequirementIds.has(
            event.requirementId
          )
        );

      const belongsToControl =
        event.controlId ===
          catalogControl.id ||
        Boolean(relatedEvidence) ||
        explicitRequirementBelongs;

      if (!belongsToControl) {
        return [];
      }

      historicalEventIds.add(
        event.id
      );

      const requirementIds = Array.from(
        new Set([
          ...(relatedEvidence?.requirements || []),
          ...(event.requirementId
            ? [event.requirementId]
            : []),
        ])
      );

      return [
        {
          source: 'WAZUH' as const,
          reference: event.id,
          description:
            `Evento histórico ${event.eventType} conservado para la trazabilidad del control ${catalogControl.id}.`,
          controlId:
            event.controlId ||
            catalogControl.id,
          requirementId:
            requirementIds.length === 1
              ? requirementIds[0]
              : undefined,
          requirementIds,
          evidenceId:
            event.evidenceId ||
            relatedEvidence?.id,
          status: asTraceabilityStatus(event.status),
          eventId: event.id,
          eventType: event.eventType,
          eventSourceType:
            event.sourceType,
          eventSource:
            event.source,
          ruleId:
            event.ruleId,
          ruleDescription:
            event.ruleDescription,
          agentId:
            event.agentId,
          agentName:
            event.agentName,
          timestamp:
            event.timestamp,
        },
      ];
    });

  const failingRequirements = requirements.filter(
    requirement =>
      requirement.applicable &&
      (requirement.status === 'NO_CUMPLE' || requirement.status === 'PARCIAL')
  );

  const nonConformities: ENSNonConformity[] = [
    // NC-CFG distingue los dos casos a proposito. "Faltan P-01, P-03" se
    // arregla rellenando; "P-07 tiene un valor invalido" se arregla
    // corrigiendo. Decirselo mal manda al auditor a buscar un campo vacio que
    // esta lleno.
    ...(hasMissingRequired
      ? [
          {
            id: 'NC-CFG',
            evidenceId: 'CONFIG',
            requirementId: catalogControl.id,
            finding: `Configuracion incompleta: ${[
              missingRequired.length
                ? `faltan ${missingRequired
                    .map(parameter => parameter.id)
                    .join(', ')}`
                : '',
              invalidRequired.length
                ? `${
                    missingRequired.length ? 'Valor' : 'valor'
                  } invalido en ${invalidRequired
                    .map(describeInvalidParameter)
                    .join('; ')}`
                : '',
            ]
              .filter(Boolean)
              .join('. ')}.`,
            impact:
              invalidRequired.length > 0 &&
              missingRequired.length === 0
                ? 'El control no puede evaluarse con garantias: hay parametros obligatorios rellenos con un valor que no significa nada para su tipo.'
                : 'El control no puede evaluarse con garantias mientras falten parametros obligatorios o tengan un valor invalido.',
            requiredAction: [
              missingRequired.length
                ? `Rellenar ${missingRequired
                    .map(parameter => parameter.id)
                    .join(', ')}`
                : '',
              invalidRequired.length
                ? `Corregir el valor de ${invalidRequired
                    .map(parameter => parameter.id)
                    .join(', ')}`
                : '',
            ]
              .filter(Boolean)
              .join('. ') +
              ' en la pestana Configuracion.',
          },
        ]
      : []),
    ...failingRequirements.map((requirement, index) => {
      const decision = (policyRuntime?.decisions || []).find(
        item => item.requirementId === requirement.id
      );

      const badEvidences = evidences
        .filter(
          evidence =>
            requirement.evidenceIds.includes(evidence.id) &&
            evidence.status !== 'CUMPLE' &&
            evidence.status !== 'NO_APLICA'
        )
        .map(evidence => evidence.id);

      return {
        id: `NC-${String(index + 1).padStart(3, '0')}`,
        evidenceId:
          badEvidences[0] ||
          decision?.evidenceIds?.[0] ||
          requirement.evidenceIds[0] ||
          'ENS',
        requirementId: requirement.id,
        finding:
          decision?.reason ||
          `El requisito ${requirement.id} esta en estado ${requirement.status}.`,
        impact:
          requirement.status === 'NO_CUMPLE'
            ? `Impide el cumplimiento del control ${catalogControl.id} en nivel ${level}.`
            : `Degrada el cumplimiento del control ${catalogControl.id} en nivel ${level}.`,
        requiredAction: decision?.trace
          ? `Corregir para alcanzar: ${decision.trace.expected}. Valor actual: ${decision.trace.actual}.`
          : badEvidences.length
          ? `Revisar las evidencias ${badEvidences.join(', ')} del requisito ${requirement.id}.`
          : `Revisar el requisito ${requirement.id}.`,
        expected: decision?.trace?.expected,
        actual: decision?.trace?.actual,
      };
    }),
  ];

  return {
    control: {
      id: catalogControl.id,
      name: catalogControl.name,
      family: catalogControl.family,
      category: catalogControl.category,
      description: catalogControl.description,
    },

    policyRuntime,

    level,
    status: controlEvaluation.status,
    score: controlEvaluation.score,
    coverage: controlEvaluation.coverage,
    evaluatedAt: new Date().toISOString(),
    lastEvidenceAt: evidences
      .map(evidence => evidence.lastSeen)
      .filter(Boolean)
      .sort()
      .reverse()[0],

    requirements,

    parameters,
    evidences: evidences.map(evidence => ({
      id: evidence.id,
      controlId: evidence.controlId,
      status: evidence.status,
      description: evidence.description,
      // El motivo viaja con la evidencia hasta el informe y la pantalla de
      // detalle. Antes se quedaba aquí.
      observations: evidence.observations,
      requirements: evidence.requirements,
      levels: evidence.levels,
      category: evidence.category,
      criticality: evidence.criticality,
      sourceTypes: evidence.sourceTypes,
      expectedEventTypes: evidence.expectedEventTypes,
      relatedRules: evidence.relatedRules,
      auditQuestion: evidence.auditQuestion,
      lastSeen: evidence.lastSeen,
      agentId: evidence.agentId,
      agentName: evidence.agentName,
      resolvedEventId: evidence.resolvedEventId,
      resolvedEventType: evidence.resolvedEventType,
      resolvedSourceType: evidence.resolvedSourceType,
      resolvedSource: evidence.resolvedSource,
      resolvedRuleId: evidence.resolvedRuleId,
      resolvedRuleDescription: evidence.resolvedRuleDescription,
      resolvedAttributes: evidence.resolvedAttributes,
      latestSuccessfulEventId:
        evidence.latestSuccessfulEventId,
      latestSuccessfulAttributes:
        evidence.latestSuccessfulAttributes,
    })),

    // Incluye los invalidos: para el consumidor de este resultado (tarjeta,
    // informe) son igual de bloqueantes que los que faltan.
    missingParameters: blockingParameters.map(
      parameter => parameter.id
    ),
    missingEvidences: evidences
      .filter(evidence => evidence.status === 'NO_EVALUABLE')
      .map(evidence => evidence.id),
    relatedRules,

    nonConformities,
    observations,

    traceability: [
      {
        source: 'CATALOG',
        reference: catalogControl.id,
        description: 'Definición oficial del control ENS.',
        controlId: catalogControl.id,
      },
      {
        source: 'CONFIGURATION',
        reference: configuration?.controlId || 'NO_CONFIGURATION',
        description: configuration
          ? 'Configuración cliente asociada al control.'
          : 'No existe configuración cliente para este control.',
        controlId: catalogControl.id,
      },
      ...evidences.flatMap(evidence => [
        {
          source: 'EVIDENCE' as const,
          reference: evidence.id,
          description: `Evidencia ${evidence.id} procesada por Evidence Engine.`,
          controlId: evidence.controlId,
          requirementId:
            evidence.requirements.length === 1
              ? evidence.requirements[0]
              : undefined,
          requirementIds: evidence.requirements,
          evidenceId: evidence.id,
          status: evidence.status,
          agentId: evidence.agentId,
          agentName: evidence.agentName,
          auditAttributes: buildAuditAttributes(evidence),
          timestamp: evidence.lastSeen,
        },
        ...(evidence.resolvedEventId
          ? [
              {
                source: 'WAZUH' as const,
                reference: evidence.resolvedEventId,
                description: `Evento Wazuh utilizado para resolver la evidencia ${evidence.id}.`,
                controlId: evidence.controlId,
                requirementId:
                  evidence.requirements.length === 1
                    ? evidence.requirements[0]
                    : undefined,
                requirementIds: evidence.requirements,
                evidenceId: evidence.id,
                status: evidence.status,
                eventId: evidence.resolvedEventId,
                eventType: evidence.resolvedEventType,
                eventSourceType: evidence.resolvedSourceType,
                eventSource: evidence.resolvedSource,
                ruleId: evidence.resolvedRuleId,
                ruleDescription: evidence.resolvedRuleDescription,
                agentId: evidence.agentId,
                agentName: evidence.agentName,
                timestamp: evidence.lastSeen,
              },
            ]
          : []),
      ]),
      ...historicalEventTraceability,
    ],
  };
};
