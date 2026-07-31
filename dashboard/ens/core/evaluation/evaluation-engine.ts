import { ENSPolicyRuntimeResult } from '../policy-runtime';
import { ENSControlDefinition } from '../../catalog';
import { ENSControlConfiguration, ENSLevel } from '../../configuration/types';
// Del fichero, no del barrel `configuration/services`: ese re-exporta el cliente
// HTTP, que arrastra `kibana-services` al grafo del motor sin que haga falta —y
// es también por donde vuelve el ciclo del TDZ de `Settings`—. Mismo criterio
// que ya aplica `policy-runtime.ts`. Sin esto el motor no se puede ejercitar
// fuera del árbol de Wazuh, que es justo lo que necesita `tests/`.
import { validateControlConfiguration } from '../../configuration/services/validation-engine';
import { ENSEvidenceResolved } from '../evidence/types';
import {
  ENSComplianceResult,
  ENSMeasurementGap,
  ENSNonConformity,
} from './types';
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

  // Solo el incumplimiento DEMOSTRADO abre no conformidad. Un requisito en
  // NO_EVALUABLE no está aquí: no se ha podido medir, así que no hay nada que
  // acusar. Ver `unmeasuredRequirements` justo debajo.
  const failingRequirements = requirements.filter(
    requirement =>
      requirement.applicable &&
      (requirement.status === 'NO_CUMPLE' || requirement.status === 'PARCIAL')
  );

  const unmeasuredRequirements = requirements.filter(
    requirement =>
      requirement.applicable && requirement.status === 'NO_EVALUABLE'
  );

  // Parámetros de la pantalla de Configuración que acreditan un requisito y no
  // están utilizables. Son la acción concreta de un hueco de medida: sin esto,
  // el auditor lee "falta medir" y no sabe qué tocar.
  const unusableParametersFor = (
    requirementId: string,
    evidenceIds: string[]
  ): { id: string; label: string }[] =>
    (validation?.parameters || []).filter(
      parameter =>
        (parameter.status === 'NOT_CONFIGURED' ||
          parameter.status === 'INVALID') &&
        (parameter.requirements.includes(requirementId) ||
          parameter.evidenceIds.some(evidenceId =>
            evidenceIds.includes(evidenceId)
          ))
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

      // Las evidencias que SOSTIENEN la acusación, no todas las que no están en
      // verde: una evidencia NO_EVALUABLE se colaba aquí y acababa siendo la
      // `evidenceId` de la tarjeta, señalando como culpable justo a la que no
      // se ha podido medir.
      const badEvidences = evidences
        .filter(
          evidence =>
            requirement.evidenceIds.includes(evidence.id) &&
            (evidence.status === 'NO_CUMPLE' || evidence.status === 'PARCIAL')
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

  // Huecos de medida: PM = "pendiente de medición". Prefijo distinto de NC a
  // propósito, para que ni el ojo ni el código los confundan.
  const measurementGaps: ENSMeasurementGap[] = unmeasuredRequirements.map(
    (requirement, index) => {
      const requirementEvidences = evidences.filter(evidence =>
        requirement.evidenceIds.includes(evidence.id)
      );

      const pendingEvidences = requirementEvidences.filter(
        evidence => evidence.status === 'NO_EVALUABLE'
      );

      const pendingEvidenceIds = pendingEvidences.map(
        evidence => evidence.id
      );

      // El `motivo` que el agente puso en su `evidence_state` ("P-07 no
      // configurado", "sin datos del recolector en la ventana"...). Es la
      // respuesta a "¿y por qué no se ha podido medir?", y ya viaja en los
      // atributos del evento: no llevarlo a la tarjeta obligaba a cruzarla a
      // mano con la tabla de evidencias.
      const pendingReasons = pendingEvidences
        .map(evidence => {
          const reason = evidence.resolvedAttributes?.motivo;

          return reason && String(reason).trim()
            ? `${evidence.id}: ${String(reason).trim()}`
            : '';
        })
        .filter(Boolean);

      const parameters = unusableParametersFor(
        requirement.id,
        pendingEvidenceIds
      );

      const listaParametros = parameters
        .map(parameter => `${parameter.id} (${parameter.label})`)
        .join(', ');

      // Tres causas distintas, tres textos distintos y tres acciones distintas.
      // Un solo texto genérico ("falta medir, revisar") es lo que convierte una
      // pantalla en algo que nadie usa: la acción tiene que decir a quién le
      // toca y dónde.
      //
      //   1. El catálogo no declara qué acreditaría el requisito. El arreglo no
      //      lo tiene el cliente, lo tiene el producto.
      //   2. Las evidencias están bien pero faltan parámetros obligatorios del
      //      control: se mide en cuanto se rellenen.
      //   3. Falta el dato del agente para evidencias concretas.
      const cause: 'CATALOG' | 'CONFIGURATION' | 'EVIDENCE' =
        requirement.evidenceIds.length === 0 || requirementEvidences.length === 0
          ? 'CATALOG'
          : pendingEvidenceIds.length === 0
          ? 'CONFIGURATION'
          : 'EVIDENCE';

      const finding =
        cause === 'CATALOG'
          ? `El requisito ${requirement.id} no tiene ninguna evidencia declarada en el catálogo, así que no hay nada que medir.`
          : cause === 'CONFIGURATION'
          ? `El requisito ${requirement.id} no se ha podido medir: sus evidencias han llegado, pero faltan parámetros obligatorios del control. No consta ningún incumplimiento.`
          : `El requisito ${requirement.id} no se ha podido medir: ${pendingEvidenceIds.join(
              ', '
            )} sin datos suficientes. No consta ningún incumplimiento.${
              pendingReasons.length
                ? ` Motivo — ${pendingReasons.join('; ')}.`
                : ''
            }`;

      const requiredAction =
        cause === 'CATALOG'
          ? `Declarar en el catálogo qué evidencias acreditan ${requirement.id}.`
          : listaParametros
          ? `Configurar ${listaParametros} en la pestaña Configuración.`
          : `Comprobar que el agente emite las evidencias ${pendingEvidenceIds.join(
              ', '
            )} del requisito ${requirement.id}.`;

      return {
        id: `PM-${String(index + 1).padStart(3, '0')}`,
        // Nunca una evidencia que SÍ se ha medido: si la culpa es de la
        // configuración, el ancla es CONFIG, no la primera evidencia de la
        // lista, que puede estar perfectamente en verde.
        evidenceId:
          pendingEvidenceIds[0] ||
          (cause === 'CONFIGURATION' ? 'CONFIG' : 'ENS'),
        requirementId: requirement.id,
        finding,
        impact: `El control ${catalogControl.id} no puede declararse conforme en nivel ${level} mientras falte esta medida. No es un incumplimiento.`,
        requiredAction,
        evidenceIds: pendingEvidenceIds,
        parameterIds: parameters.map(parameter => parameter.id),
      };
    }
  );

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
    applicableRequirements: controlEvaluation.applicableRequirements,
    measuredRequirements: controlEvaluation.measuredRequirements,
    unmeasuredRequirements: controlEvaluation.unmeasuredRequirements,
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
    measurementGaps,
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
