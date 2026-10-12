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
  ENSGapCause,
  ENSNonConformity,
} from './types';
import { evaluateRequirements } from './requirement';
import { evaluateControlStatus } from './control';
// Del fichero, no del barrel `configuration/services`: ese re-exporta el cliente
// HTTP y arrastra `kibana-services` al grafo del motor.
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
  // ¿Había alguna máquina de la que esperar hechos? Es falso en dos casos: un
  // control con alcance declarado vacío evaluado sin fila (mp.info.6 sin
  // ninguna máquina en P-04), y un control cuyas evidencias no escuchan ningún
  // evento (op.cont.2, solo configuración: `controlExpectsFacts`). En los dos
  // no ha fallado ninguna recogida, lo que falta es la configuración, y el
  // hueco no se puede atribuir a RECOGIDA.
  expectsFacts = true
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

    // LAS EVIDENCIAS QUE LA POLICY MIDIÓ, resueltas por ella. Sin esto,
    // op.acc.3 publicaba «100 % CUMPLE» junto a «0 de 7 evidencias cumplen»: la
    // policy decidía los requisitos leyendo los hechos crudos y las evidencias
    // se quedaban esperando un `evidence_state` que su agente no emite nunca.
    // Ver `policy-evidence-bridge.ts`.
    // Si de esta máquina no ha llegado ningún hecho del control, lo que la
    // policy no pudo medir es un hueco de recogida (ver el puente).
    const nadaRecibido =
      expectsFacts &&
      !events.some(
        event => event.controlId === catalogControl.id
      );

    const evidencesConPolicy = applyPolicyDecisionsToEvidences(
      evidences,
      policyRuntime?.decisions || [],
      catalogControl.requirements,
      nadaRecibido
    );

    // La Declaración de Aplicabilidad se aplica sobre lo ya evaluado: su límite
    // —nunca tapa lo medido— se comprueba contra lo que la máquina demostró.
    const requirements = applyApplicabilityDeclaration(
      evaluateRequirements(
        catalogControl.requirements,
        level,
        evidencesConPolicy,
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
      ...evidencesConPolicy.flatMap(evidence => evidence.relatedRules),
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
    ...evidencesConPolicy.flatMap(evidence => evidence.observations),
  ];


  const controlRequirementIds = new Set(
    catalogControl.requirements.map(
      requirement =>
        requirement.id
    )
  );

  const resolvedEventIds = new Set(
    evidencesConPolicy
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

      const relatedEvidence = evidencesConPolicy.find(
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

  // TODO incumplimiento abre no conformidad, se haya demostrado o no. Desde el
  // 04/08 el requisito que no se ha podido demostrar sale NO_CUMPLE, así que cae
  // aquí igual que el que se midió y falló; lo que los separa es `evidenced`, y
  // de ahí salen `origin` y `cause` de la tarjeta.
  //
  // `PARCIAL` salió de este filtro el 05/08 porque un REQUISITO ya no puede
  // estar en ese estado: un incumplimiento medido lo tumba entero (ver
  // `resolveMeasurement`). PARCIAL sigue existiendo, pero solo donde significa
  // algo: en el CONTROL —parte de sus requisitos conforman y parte no— y en
  // una EVIDENCIA que el agente declare medida a medias.
  const failingRequirements = requirements.filter(
    requirement =>
      requirement.applicable && requirement.status === 'NO_CUMPLE'
  );

  // Parámetros de la pantalla de Configuración que acreditan un requisito y no
  // están utilizables. Son la acción concreta de un incumplimiento no
  // evidenciado: sin esto, el auditor lee "no se ha podido demostrar" y no sabe
  // qué tocar.
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

  // De quién es el hueco. El orden importa y es el de "qué hecho es más fuerte":
  //
  //   1. CATALOG     el requisito no declara con qué demostrarse. Ninguna
  //                  máquina puede arreglarlo, y ninguna configuración tampoco.
  //   2. COLLECTION  no ha llegado NADA de esta máquina para ninguna de las
  //                  evidencias pendientes. Va antes que la configuración a
  //                  propósito: con el agente caído, rellenar un parámetro no
  //                  produce ninguna medida, y quien tiene que actuar es otro.
  //                  Se exige que lo digan TODAS las pendientes: si una llegó y
  //                  otra no, lo que hay no es silencio.
  //   3. CONFIGURATION  falta el parámetro, o está vacío, o la evidencia lo dice
  //                  ella misma (política declarada vacía). También cuando las
  //                  evidencias llegaron bien y lo único que bloquea es la
  //                  configuración obligatoria del control.
  //   4. EVIDENCE    llegó el dato y no basta.
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

    // La policy no pudo medir el requisito y ninguna evidencia quedó
    // pendiente de la que sacar la causa: la dice la propia policy.
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
            // Mismo cierre que el resto de las no evidenciadas: la carga de la
            // prueba es del auditado. Antes decia "no puede evaluarse", que era
            // una descripcion del motor; ahora tiene que decir la consecuencia,
            // porque la tarjeta cuenta como incumplimiento.
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

      const requirementEvidences = evidencesConPolicy.filter(evidence =>
        requirement.evidenceIds.includes(evidence.id)
      );

      // --- incumplimiento NO EVIDENCIADO -----------------------------------
      //
      // Mismo veredicto que el medido y el mismo contador, pero otro texto y
      // otra acción: es la parte de `346e56b` que se conserva entera. Lo que era
      // una tarjeta `PM-` con su propia lista vive ahora aquí dentro, marcada.
      if (requirement.evidenced === false) {
        const pendingEvidences = requirementEvidences.filter(
          evidence => evidence.status === 'NO_EVALUABLE'
        );

        const pendingEvidenceIds = pendingEvidences.map(
          evidence => evidence.id
        );

        // El `motivo` que el agente puso en su `evidence_state` ("P-07 no
        // configurado", "sin datos del recolector en la ventana"...). Es la
        // respuesta a "¿y por qué no se ha podido demostrar?", y ya viaja en los
        // atributos del evento.
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

        const cause = resolveGapCause(
          requirement,
          requirementEvidences,
          pendingEvidences,
          parameters,
          decision?.status === 'NO_EVALUABLE' && decision.cause
            ? nadaRecibido
              ? 'COLLECTION'
              : decision.cause
            : undefined
        );

        const motivos = pendingReasons.length
          ? ` Motivo — ${pendingReasons.join('; ')}.`
          : '';

        const finding =
          cause === 'CATALOG'
            ? `El requisito ${requirement.id} no declara ninguna evidencia en el catálogo: no hay nada con lo que demostrarlo, y lo que no se demuestra no cumple.`
            : cause === 'CONFIGURATION'
            ? `El requisito ${requirement.id} no se ha podido demostrar: falta configurar lo que el responsable tiene que decidir${
                listaParametros ? ` (${listaParametros})` : ''
              }. Sin esa decisión escrita no hay contra qué contrastar, y lo que no se demuestra no cumple.${motivos}`
            : cause === 'COLLECTION'
            ? `El requisito ${requirement.id} no se ha podido demostrar: no ha llegado ningún dato para ${pendingEvidenceIds.join(
                ', '
              )}. Es un fallo de RECOGIDA —agente sin reportar, recolector sin ejecutar o sin latido—, NO un hallazgo sobre la máquina, pero sin la prueba el requisito no se puede dar por cumplido.${motivos}`
            : `El requisito ${requirement.id} no se ha podido demostrar: ${pendingEvidenceIds.join(
                ', '
              )} ha llegado sin datos suficientes, y lo que no se demuestra no cumple.${motivos}`;

        const requiredAction =
          cause === 'CATALOG'
            ? `Declarar en el catálogo qué evidencias acreditan ${requirement.id}.`
            : cause === 'COLLECTION'
            ? `Restablecer la RECOGIDA: comprobar que el agente está activo y que su recolector emite ${pendingEvidenceIds.join(
                ', '
              )}. Es una acción sobre el despliegue de Wazuh, no una corrección en el sistema auditado.`
            : listaParametros
            ? `Configurar ${listaParametros} en la pestaña Configuración.`
            : pendingEvidenceIds.length
            ? `Corregir lo que el productor de ${pendingEvidenceIds.join(
                ', '
              )} declara: la evidencia llega, pero no con los datos que exige su contrato.`
            : `Completar la configuración obligatoria del control ${catalogControl.id} en la pestaña Configuración.`;

        return {
          id,
          // Nunca una evidencia que SÍ se ha medido: si lo que bloquea es la
          // configuración, el ancla es CONFIG, no la primera evidencia de la
          // lista, que puede estar perfectamente en verde.
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

      // --- incumplimiento MEDIDO -------------------------------------------
      //
      // Las evidencias que SOSTIENEN la acusación, no todas las que no están en
      // verde: una evidencia NO_EVALUABLE se colaba aquí y acababa siendo la
      // `evidenceId` de la tarjeta, señalando como culpable justo a la que no
      // se ha podido medir.
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
        // Ya no hay rama de «conforma solo en parte»: un requisito con un
        // incumplimiento medido no conforma, y punto. Esa redacción era la
        // cara visible del crédito parcial —la tarjeta decía «solo en parte»
        // sobre un requisito que un auditor marca no conforme— y desaparece
        // con él.
        finding:
          decision?.reason ||
          `El requisito ${requirement.id} se ha medido y no conforma.`,
        impact: `Impide el cumplimiento del control ${catalogControl.id} en nivel ${level}.`,
        // Un NO_CUMPLE DOCUMENTAL (un contrato o una certificación vencida o
        // ausente en la pantalla) no se corrige en la máquina: se renueva o se
        // completa la documentación.
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
    lastEvidenceAt: evidencesConPolicy
      .map(evidence => evidence.lastSeen)
      .filter(Boolean)
      .sort()
      .reverse()[0],

    requirements,

    parameters,
    evidences: evidencesConPolicy.map(evidence => ({
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
    missingEvidences: evidencesConPolicy
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
      ...evidencesConPolicy.flatMap(evidence => [
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
