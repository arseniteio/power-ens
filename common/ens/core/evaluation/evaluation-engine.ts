import { ENSPolicyRuntimeResult } from '../policy-runtime';
import { ENSControlDefinition } from '../../catalog';
import { ENSControlConfiguration, ENSLevel } from '../../configuration/types';
// From the file, not the `configuration/services` barrel: it re-exports the HTTP client, which drags `kibana-services` into the engine graph and brings back the `Settings` TDZ cycle (same as `policy-runtime.ts`).
import { validateControlConfiguration } from '../../configuration/services/validation-engine';
import { ENSEvidenceResolved } from '../evidence/types';
import {
  ENSComplianceResult,
  ENSGapCause,
  ENSNonConformity,
} from './types';
import { evaluateRequirements } from './requirement';
import { evaluateControlStatus } from './control';
// From the file, not the `configuration/services` barrel (it drags `kibana-services` into the engine graph).
import { parseRequirementAttestations } from '../../configuration/services/attestation-service';
import { parseApplicabilityDeclaration } from '../../configuration/services/applicability-service';
import { applyApplicabilityDeclaration } from './requirement/applicability';
import { ENSNormalizedEvent } from '../data-source/types';
import { applyPolicyDecisionsToEvidences } from './policy-evidence-bridge';

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
  events: ENSNormalizedEvent[] = [],
  // Was there any machine to expect facts from? False in two cases: a control with empty declared scope evaluated without a row, and a control whose evidences listen to no event (op.cont.2: `controlExpectsFacts`).
  // In both no collection failed; the configuration is what is missing, so the gap cannot be attributed to COLLECTION.
  expectsFacts = true
): ENSComplianceResult => {
  const validation = configuration
    ? validateControlConfiguration(configuration, level)
    : undefined;

  const missingRequired = validation?.missingRequired || [];

  // A PRESENT required parameter with a value meaningless for its type counts as not configured; otherwise the control would be declared evaluable over nonexistent data and could come out green.
  // It blocks like a missing one but is told apart because the fix differs: correct the value, not fill an empty field.
  const invalidRequired = validation?.invalidRequired || [];
  const configurationIssues = validation?.issues || [];

  const blockingParameters = [
    ...missingRequired,
    ...invalidRequired,
  ];

  const hasMissingRequired = blockingParameters.length > 0;

  // Why the value is invalid, so the auditor does not search blindly.
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

    // THE EVIDENCES THE POLICY MEASURED, resolved by it. Without this op.acc.3 published "100 % CUMPLE" next to "0 of 7 evidences comply". See `policy-evidence-bridge.ts`.
    // If no fact of the control arrived from this machine, what the policy could not measure is a COLLECTION gap.
    const nothingReceived =
      expectsFacts &&
      !events.some(
        event => event.controlId === catalogControl.id
      );

    const evidencesWithPolicy = applyPolicyDecisionsToEvidences(
      evidences,
      policyRuntime?.decisions || [],
      catalogControl.requirements,
      nothingReceived
    );

    // The Statement of Applicability applies over what was already evaluated: its limit (never covers what was measured) is checked against what the machine proved.
    const requirements = applyApplicabilityDeclaration(
      evaluateRequirements(
        catalogControl.requirements,
        level,
        evidencesWithPolicy,
        hasMissingRequired,
        policyRuntime?.decisions || [],
        catalogControl.status,
        parseRequirementAttestations(configuration)
      ),
      parseApplicabilityDeclaration(configuration)
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
      ...evidencesWithPolicy.flatMap(evidence => evidence.relatedRules),
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
    ...evidencesWithPolicy.flatMap(evidence => evidence.observations),
  ];


  const controlRequirementIds = new Set(
    catalogControl.requirements.map(
      requirement =>
        requirement.id
    )
  );

  const resolvedEventIds = new Set(
    evidencesWithPolicy
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

      const relatedEvidence = evidencesWithPolicy.find(
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

  // EVERY failure opens a nonconformity, proven or not: an unproven requirement is NO_CUMPLE and falls here like a measured one; `evidenced` separates them and yields `origin` and `cause`.
  // `PARCIAL` left this filter because a REQUIREMENT can no longer be in that state (a measured failure fails it whole); it remains only for the CONTROL and for an EVIDENCE the agent declares half-measured.
  const failingRequirements = requirements.filter(
    requirement =>
      requirement.applicable && requirement.status === 'NO_CUMPLE'
  );

  // Configuration screen parameters that accredit a requirement and are not usable; the concrete action of an unevidenced noncompliance.
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

  // Whose gap it is. Order = strongest fact first:
  //   1. CATALOG        the requirement declares no way to prove itself.
  //   2. COLLECTION     NOTHING arrived from this machine for any pending evidence (before configuration: with the agent down, filling a parameter yields no measure). ALL pending must say so.
  //   3. CONFIGURATION  the parameter is missing or empty, or the evidence says so itself; also when the only blocker is the control's mandatory configuration.
  //   4. EVIDENCE       the data arrived and is not enough.
  const resolveGapCause = (
    requirement: { id: string; evidenceIds: string[] },
    requirementEvidences: ENSEvidenceResolved[],
    pendingEvidences: ENSEvidenceResolved[],
    unusableParameters: { id: string; label: string }[],
    policyCause?: ENSGapCause
  ): ENSGapCause => {
    if (
      requirement.evidenceIds.length === 0 ||
      requirementEvidences.length === 0
    ) {
      return 'CATALOG';
    }

    // The policy could not measure the requirement and no evidence is pending to take the cause from: the policy states it.
    if (pendingEvidences.length === 0 && policyCause) {
      return policyCause;
    }

    if (
      pendingEvidences.length > 0 &&
      pendingEvidences.every(
        evidence => evidence.gapCause === 'COLLECTION'
      )
    ) {
      return 'COLLECTION';
    }

    if (
      pendingEvidences.length === 0 ||
      unusableParameters.length > 0 ||
      pendingEvidences.some(
        evidence => evidence.gapCause === 'CONFIGURATION'
      )
    ) {
      return 'CONFIGURATION';
    }

    return 'EVIDENCE';
  };

  const nonConformities: ENSNonConformity[] = [
    // NC-CFG tells the two cases apart on purpose: "missing P-01, P-03" is fixed by filling, "P-07 has an invalid value" by correcting.
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
            // Same closing as the other unevidenced ones: the burden of proof is the audited party's. It must state the consequence, because the card counts as a failure.
            impact:
              (invalidRequired.length > 0 && missingRequired.length === 0
                ? 'Hay parametros obligatorios rellenos con un valor que no significa nada para su tipo. '
                : 'Faltan parametros obligatorios, o tienen un valor invalido. ') +
              `Cuenta como incumplimiento del control ${catalogControl.id} en nivel ${level}: la carga de la prueba es del auditado y con la configuracion incompleta no hay contra que contrastar.`,
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
            origin: 'NO_EVIDENCIADA' as const,
            cause: 'CONFIGURATION' as const,
            evidenceIds: [],
            parameterIds: blockingParameters.map(parameter => parameter.id),
          },
        ]
      : []),
    ...failingRequirements.map((requirement, index): ENSNonConformity => {
      const decision = (policyRuntime?.decisions || []).find(
        item => item.requirementId === requirement.id
      );

      const id = `NC-${String(index + 1).padStart(3, '0')}`;

      const requirementEvidences = evidencesWithPolicy.filter(evidence =>
        requirement.evidenceIds.includes(evidence.id)
      );

      // UNEVIDENCED noncompliance. Same verdict and counter as the measured one, but another text and action.
      if (requirement.evidenced === false) {
        const pendingEvidences = requirementEvidences.filter(
          evidence => evidence.status === 'NO_EVALUABLE'
        );

        const pendingEvidenceIds = pendingEvidences.map(
          evidence => evidence.id
        );

        // The `motivo` the agent put in its `evidence_state`: the answer to "why could it not be proven".
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

        const parameterList = parameters
          .map(parameter => `${parameter.id} (${parameter.label})`)
          .join(', ');

        const cause = resolveGapCause(
          requirement,
          requirementEvidences,
          pendingEvidences,
          parameters,
          decision?.status === 'NO_EVALUABLE' && decision.cause
            ? nothingReceived
              ? 'COLLECTION'
              : decision.cause
            : undefined
        );

        const motives = pendingReasons.length
          ? ` Motivo — ${pendingReasons.join('; ')}.`
          : '';

        // The whole control is missing from the active configuration (half-seeded): whatever the cause, first register it; without it there is no owner decision to compare against. The cause is kept.
        const withoutConfiguration = !configuration && cause !== 'CATALOG';
        const besidesCause =
          cause === 'COLLECTION'
            ? ` Además, no ha llegado ningún dato para ${pendingEvidenceIds.join(', ')}.`
            : cause === 'EVIDENCE' && pendingEvidenceIds.length
            ? ` Además, ${pendingEvidenceIds.join(', ')} ha llegado sin datos suficientes.`
            : '';

        const finding =
          cause === 'CATALOG'
            ? `El requisito ${requirement.id} no declara ninguna evidencia en el catálogo: no hay nada con lo que demostrarlo, y lo que no se demuestra no cumple.`
            : withoutConfiguration
            ? `${catalogControl.id} no está en la configuración activa: el requisito ${requirement.id} no se ha podido demostrar porque no hay ninguna decisión del responsable contra la que contrastarlo, y lo que no se demuestra no cumple.${besidesCause}${motives}`
            : cause === 'CONFIGURATION'
            ? `El requisito ${requirement.id} no se ha podido demostrar: falta configurar lo que el responsable tiene que decidir${
                parameterList ? ` (${parameterList})` : ''
              }. Sin esa decisión escrita no hay contra qué contrastar, y lo que no se demuestra no cumple.${motives}`
            : cause === 'COLLECTION'
            ? `El requisito ${requirement.id} no se ha podido demostrar: no ha llegado ningún dato para ${pendingEvidenceIds.join(
                ', '
              )}. Es un fallo de RECOGIDA —agente sin reportar, recolector sin ejecutar o sin latido—, NO un hallazgo sobre la máquina, pero sin la prueba el requisito no se puede dar por cumplido.${motives}`
            : `El requisito ${requirement.id} no se ha podido demostrar: ${pendingEvidenceIds.join(
                ', '
              )} ha llegado sin datos suficientes, y lo que no se demuestra no cumple.${motives}`;

        const requiredAction =
          cause === 'CATALOG'
            ? `Declarar en el catálogo qué evidencias acreditan ${requirement.id}.`
            : withoutConfiguration
            ? `Añadir con valores por defecto (Configuración > Organización > «Controles del catálogo sin añadir»): ${catalogControl.id} no está en la configuración activa. Después, declarar sus parámetros obligatorios.`
            : cause === 'COLLECTION'
            ? `Restablecer la RECOGIDA: comprobar que el agente está activo y que su recolector emite ${pendingEvidenceIds.join(
                ', '
              )}. Es una acción sobre el despliegue de Wazuh, no una corrección en el sistema auditado.`
            : parameterList
            ? `Configurar ${parameterList} en la pestaña Configuración.`
            : cause === 'CONFIGURATION'
            ? `Completar la configuración obligatoria del control ${catalogControl.id} en la pestaña Configuración.`
            : pendingEvidenceIds.length
            ? `Corregir lo que el productor de ${pendingEvidenceIds.join(
                ', '
              )} declara: la evidencia llega, pero no con los datos que exige su contrato.`
            : `Completar la configuración obligatoria del control ${catalogControl.id} en la pestaña Configuración.`;

        return {
          id,
          // Never an evidence that WAS measured: if configuration blocks, the anchor is CONFIG, not the first evidence, which may be green.
          evidenceId:
            pendingEvidenceIds[0] ||
            (cause === 'CONFIGURATION' ? 'CONFIG' : 'ENS'),
          requirementId: requirement.id,
          finding,
          impact: `Cuenta como incumplimiento del control ${catalogControl.id} en nivel ${level}: la carga de la prueba es del auditado y esto no se ha podido demostrar.`,
          requiredAction,
          origin: 'NO_EVIDENCIADA',
          cause,
          evidenceIds: pendingEvidenceIds,
          parameterIds: parameters.map(parameter => parameter.id),
        };
      }

      // MEASURED noncompliance. The evidences that SUPPORT the accusation, not all that are not green: a NO_EVALUABLE one would end up as the card's `evidenceId`.
      const badEvidences = requirementEvidences
        .filter(
          evidence =>
            evidence.status === 'NO_CUMPLE' || evidence.status === 'PARCIAL'
        )
        .map(evidence => evidence.id);

      return {
        id,
        evidenceId:
          badEvidences[0] ||
          decision?.evidenceIds?.[0] ||
          requirement.evidenceIds[0] ||
          'ENS',
        requirementId: requirement.id,
        // No "conforms only partly" branch: a requirement with a measured failure does not conform.
        finding:
          decision?.reason ||
          `El requisito ${requirement.id} se ha medido y no conforma.`,
        impact: `Impide el cumplimiento del control ${catalogControl.id} en nivel ${level}.`,
        // A DOCUMENTARY NO_CUMPLE (an expired or absent contract or certification) is not fixed on the machine: the documentation is renewed or completed.
        requiredAction: requirement.documental
          ? `Renovar o completar la documentación declarada en la pestaña Configuración: ${decision?.trace?.expected || requirement.id}. Es una declaración de la organización, no una corrección en la máquina.`
          : decision?.trace
          ? `Corregir para alcanzar: ${decision.trace.expected}. Valor actual: ${decision.trace.actual}.`
          : badEvidences.length
          ? `Revisar las evidencias ${badEvidences.join(', ')} del requisito ${requirement.id}.`
          : `Revisar el requisito ${requirement.id}.`,
        expected: decision?.trace?.expected,
        actual: decision?.trace?.actual,
        origin: 'MEDIDA',
        ...(requirement.documental ? { documental: true } : {}),
        evidenceIds: badEvidences,
        parameterIds: [],
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
    applicableRequirements: controlEvaluation.applicableRequirements,
    measuredRequirements: controlEvaluation.measuredRequirements,
    unmeasuredRequirements: controlEvaluation.unmeasuredRequirements,
    evaluatedAt: new Date().toISOString(),
    lastEvidenceAt: evidencesWithPolicy
      .map(evidence => evidence.lastSeen)
      .filter(Boolean)
      .sort()
      .reverse()[0],

    requirements,

    parameters,
    evidences: evidencesWithPolicy.map(evidence => ({
      id: evidence.id,
      controlId: evidence.controlId,
      status: evidence.status,
      description: evidence.description,
      // The motive travels with the evidence to the report and the detail screen.
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

    // Includes the invalid ones: for the consumer they block as much as the missing ones.
    missingParameters: blockingParameters.map(
      parameter => parameter.id
    ),
    missingEvidences: evidencesWithPolicy
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
      ...evidencesWithPolicy.flatMap(evidence => [
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
