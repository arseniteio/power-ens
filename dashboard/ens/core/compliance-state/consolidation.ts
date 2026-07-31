import type {
  ENSComplianceResult,
  ENSComplianceStatus,
  ENSEvidenceResult,
  ENSMeasurementGap,
  ENSNonConformity,
  ENSRequirementResult,
  ENSTraceabilityResult,
} from '../evaluation/types';
import type {
  ENSAppliedParameter,
  ENSPolicyDecision,
  ENSPolicyRuntimeResult,
  ENSRuntimeVariable,
} from '../policy-runtime/types';
import type { ENSAgentComplianceState } from './types';

interface ENSAgentResultEntry {
  agentId: string;
  agentName?: string;
  result: ENSComplianceResult;
}

const uniqueValues = <T>(values: T[]): T[] => Array.from(new Set(values));

const uniqueByKey = <T>(items: T[], keyOf: (item: T) => string): T[] => {
  const itemsByKey = new Map<string, T>();

  items.forEach((item) => {
    const key = keyOf(item);

    if (!itemsByKey.has(key)) {
      itemsByKey.set(key, item);
    }
  });

  return Array.from(itemsByKey.values());
};

const getAgentLabel = (entry: Pick<ENSAgentResultEntry, 'agentId' | 'agentName'>): string =>
  entry.agentName ? `${entry.agentName} (${entry.agentId})` : entry.agentId;

const getLatestIsoDate = (values: Array<string | undefined>): string | undefined => {
  const definedValues = values.filter((value): value is string => Boolean(value));

  return definedValues.sort((left, right) => right.localeCompare(left))[0];
};

const getEarliestIsoDate = (values: Array<string | undefined>): string | undefined => {
  const definedValues = values.filter((value): value is string => Boolean(value));

  return definedValues.sort((left, right) => left.localeCompare(right))[0];
};

export const consolidateENSStatuses = (statuses: ENSComplianceStatus[]): ENSComplianceStatus => {
  const applicableStatuses = statuses.filter((status) => status !== 'NO_APLICA');

  if (applicableStatuses.length === 0) {
    return 'NO_APLICA';
  }

  if (applicableStatuses.some((status) => status === 'NO_CUMPLE')) {
    return 'NO_CUMPLE';
  }

  if (applicableStatuses.some((status) => status === 'PARCIAL')) {
    return 'PARCIAL';
  }

  // Aquí había un `hasCompliant && hasNotEvaluable -> PARCIAL`: un agente que
  // cumple y otro del que no se ha podido medir nada daban "PARCIAL" para el
  // conjunto. Eso es el mismo hueco de medida fabricando una afirmación, una
  // capa más arriba: nadie ha demostrado que el conjunto conforme a medias, lo
  // que hay es una parte sin medir. Sin esa regla, el caso cae solo en el
  // NO_EVALUABLE del final, que es lo correcto.
  //
  // Las dos ramas de arriba (NO_CUMPLE y PARCIAL) van antes a propósito: un
  // incumplimiento demostrado en CUALQUIER agente sigue mandando sobre el hueco.
  if (applicableStatuses.every((status) => status === 'NO_EVALUABLE')) {
    return 'NO_EVALUABLE';
  }

  if (applicableStatuses.every((status) => status === 'CUMPLE')) {
    return 'CUMPLE';
  }

  return 'NO_EVALUABLE';
};

const averageApplicableResultValue = (
  entries: ENSAgentResultEntry[],
  selector: (result: ENSComplianceResult) => number
): number => {
  const applicableEntries = entries.filter((entry) => entry.result.status !== 'NO_APLICA');

  if (applicableEntries.length === 0) {
    return 0;
  }

  return Math.round(
    applicableEntries.reduce((sum, entry) => sum + selector(entry.result), 0) /
      applicableEntries.length
  );
};

// El porcentaje consolidado se promedia SOLO sobre los agentes que traen
// número. Un agente sin medir no aporta un 0 al promedio: eso volvería a
// convertir la falta de dato en un porcentaje bajo, que es exactamente el error
// que se corrige una capa más abajo. Si ningún agente trae número, no hay
// número consolidado.
const averageScore = (entries: ENSAgentResultEntry[]): number | undefined => {
  const scored = entries.filter(
    (entry) => typeof entry.result.score === 'number'
  );

  if (scored.length === 0) {
    return undefined;
  }

  return Math.round(
    scored.reduce((sum, entry) => sum + (entry.result.score as number), 0) / scored.length
  );
};

const consolidateMeasurementGaps = (entries: ENSAgentResultEntry[]): ENSMeasurementGap[] =>
  uniqueByKey(
    entries.flatMap((entry) =>
      entry.result.measurementGaps.map((gap) => {
        const agentLabel = getAgentLabel(entry);

        return {
          ...gap,
          id: `${entry.agentId}:` + gap.id,
          finding: `[${agentLabel}] ` + gap.finding,
          impact: `[${agentLabel}] ` + gap.impact,
          requiredAction: `[${agentLabel}] ` + gap.requiredAction,
        };
      })
    ),
    (gap) => gap.id
  );

export const agentHasEvaluatedResults = (agent: ENSAgentComplianceState): boolean =>
  agent.results.some((result) => result.status !== 'NO_EVALUABLE' && result.status !== 'NO_APLICA');

const consolidateRequirements = (entries: ENSAgentResultEntry[]): ENSRequirementResult[] => {
  const requirementIds = uniqueValues(
    entries.flatMap((entry) => entry.result.requirements.map((requirement) => requirement.id))
  );

  return requirementIds.map((requirementId) => {
    const requirementEntries = entries.flatMap((entry) =>
      entry.result.requirements
        .filter((requirement) => requirement.id === requirementId)
        .map((requirement) => ({
          entry,
          requirement,
        }))
    );

    const template = requirementEntries[0].requirement;

    const evidenceIds = uniqueValues(
      requirementEntries.flatMap(({ requirement }) => requirement.evidenceIds || [])
    );

    return {
      ...template,
      status: consolidateENSStatuses(
        requirementEntries.map(({ requirement }) => requirement.status)
      ),
      level: uniqueValues(requirementEntries.flatMap(({ requirement }) => requirement.level)),
      evidenceIds: evidenceIds.length > 0 ? evidenceIds : undefined,
      observations: uniqueValues(
        requirementEntries.flatMap(({ entry, requirement }) =>
          requirement.observations.map((observation) => `[${getAgentLabel(entry)}] ${observation}`)
        )
      ),
    };
  });
};

const consolidateEvidences = (entries: ENSAgentResultEntry[]): ENSEvidenceResult[] => {
  const evidenceIds = uniqueValues(
    entries.flatMap((entry) => entry.result.evidences.map((evidence) => evidence.id))
  );

  return evidenceIds.map((evidenceId) => {
    const evidenceEntries = entries.flatMap((entry) =>
      entry.result.evidences
        .filter((evidence) => evidence.id === evidenceId)
        .map((evidence) => ({
          entry,
          evidence,
        }))
    );

    const template = evidenceEntries[0].evidence;

    return {
      ...template,
      status: consolidateENSStatuses(evidenceEntries.map(({ evidence }) => evidence.status)),
      requirements: uniqueValues(evidenceEntries.flatMap(({ evidence }) => evidence.requirements)),
      levels: uniqueValues(evidenceEntries.flatMap(({ evidence }) => evidence.levels)),
      sourceTypes: uniqueValues(evidenceEntries.flatMap(({ evidence }) => evidence.sourceTypes)),
      expectedEventTypes: uniqueValues(
        evidenceEntries.flatMap(({ evidence }) => evidence.expectedEventTypes)
      ),
      relatedRules: uniqueValues(evidenceEntries.flatMap(({ evidence }) => evidence.relatedRules)),
      lastSeen: getLatestIsoDate(evidenceEntries.map(({ evidence }) => evidence.lastSeen)),

      // Con el mismo prefijo de agente que los requisitos: consolidando varios
      // agentes, «se ha observado 'admin'» sin decir en qué máquina no sirve de
      // nada para ir a corregirlo. Y sin esto, el motivo del agente que
      // determina el estado consolidado se perdería en cuanto hubiera más de
      // uno (`...template` solo conserva el del primero).
      observations: uniqueValues(
        evidenceEntries.flatMap(({ entry, evidence }) =>
          (evidence.observations || []).map(
            (observation) => `[${getAgentLabel(entry)}] ${observation}`
          )
        )
      ),

      // El resultado raíz representa varios agentes.
      // El detalle individual se conserva en state.agents
      // y en traceability.
      agentId: undefined,
      agentName: undefined,
      resolvedEventId: undefined,
      resolvedEventType: undefined,
      resolvedSourceType: undefined,
      resolvedSource: undefined,
      resolvedRuleId: undefined,
      resolvedRuleDescription: undefined,
    };
  });
};

const consolidatePolicyDecisions = (
  entries: Array<{
    entry: ENSAgentResultEntry;
    decision: ENSPolicyDecision;
  }>
): ENSPolicyDecision[] => {
  const requirementIds = uniqueValues(entries.map((item) => item.decision.requirementId));

  return requirementIds.map((requirementId) => {
    const decisionEntries = entries.filter((item) => item.decision.requirementId === requirementId);

    const template = decisionEntries[0].decision;

    const status = consolidateENSStatuses(decisionEntries.map((item) => item.decision.status));

    return {
      ...template,
      status,
      parameterIds: uniqueValues(decisionEntries.flatMap((item) => item.decision.parameterIds)),
      evidenceIds: uniqueValues(decisionEntries.flatMap((item) => item.decision.evidenceIds)),
      eventIds: uniqueValues(decisionEntries.flatMap((item) => item.decision.eventIds)),
      runtimeVariables: uniqueValues(
        decisionEntries.flatMap((item) => item.decision.runtimeVariables)
      ),
      trace: {
        ...template.trace,
        result: status === 'CUMPLE',
        actual: decisionEntries
          .map(
            ({ entry, decision }) =>
              `${getAgentLabel(entry)}: ` + `${decision.status} ` + `(${decision.trace.actual})`
          )
          .join(' | '),
      },
      reason:
        'Consolidación por agente: ' +
        decisionEntries
          .map(({ entry, decision }) => `${getAgentLabel(entry)}=${decision.status}`)
          .join(', '),
    };
  });
};

const formatRuntimeVariableValue = (value: ENSRuntimeVariable['value']): string => {
  const serializedValue = JSON.stringify(value);

  return serializedValue === undefined ? String(value) : serializedValue;
};

const consolidateRuntimeVariables = (
  entries: Array<{
    entry: ENSAgentResultEntry;
    variable: ENSRuntimeVariable;
  }>
): ENSRuntimeVariable[] => {
  const groupedVariables = new Map<
    string,
    Array<{
      entry: ENSAgentResultEntry;
      variable: ENSRuntimeVariable;
    }>
  >();

  entries.forEach((item) => {
    const current = groupedVariables.get(item.variable.name) || [];

    current.push(item);

    groupedVariables.set(item.variable.name, current);
  });

  return Array.from(groupedVariables.values()).map((variableEntries) => {
    const template = variableEntries[0].variable;

    return {
      ...template,
      value: variableEntries.map(
        ({ entry, variable }) =>
          `${getAgentLabel(entry)}=` + formatRuntimeVariableValue(variable.value)
      ),
      parameterIds: uniqueValues(variableEntries.flatMap(({ variable }) => variable.parameterIds)),
      evidenceIds: uniqueValues(variableEntries.flatMap(({ variable }) => variable.evidenceIds)),
      eventIds: uniqueValues(variableEntries.flatMap(({ variable }) => variable.eventIds)),
      description: `${template.description} ` + 'Valores consolidados por agente.',
    };
  });
};

const consolidatePolicyRuntime = (
  entries: ENSAgentResultEntry[]
): ENSPolicyRuntimeResult | undefined => {
  const runtimeEntries = entries.flatMap((entry) =>
    entry.result.policyRuntime
      ? [
          {
            entry,
            runtime: entry.result.policyRuntime,
          },
        ]
      : []
  );

  if (runtimeEntries.length === 0) {
    return undefined;
  }

  const template = runtimeEntries[0].runtime;

  const appliedParameters = uniqueByKey<ENSAppliedParameter>(
    runtimeEntries.flatMap((item) => item.runtime.appliedParameters),
    (parameter) => parameter.id
  ).map((parameter) => ({
    ...parameter,
  }));

  const decisions = consolidatePolicyDecisions(
    runtimeEntries.flatMap((item) =>
      item.runtime.decisions.map((decision) => ({
        entry: item.entry,
        decision,
      }))
    )
  );

  const runtimeVariables = consolidateRuntimeVariables(
    runtimeEntries.flatMap((item) =>
      item.runtime.runtimeVariables.map((variable) => ({
        entry: item.entry,
        variable,
      }))
    )
  );

  return {
    controlId: template.controlId,
    policyId: template.policyId,
    evaluatedAt:
      getLatestIsoDate(runtimeEntries.map((item) => item.runtime.evaluatedAt)) ||
      template.evaluatedAt,
    decisions,
    appliedParameters,
    runtimeVariables,
  };
};

const consolidateNonConformities = (entries: ENSAgentResultEntry[]): ENSNonConformity[] =>
  uniqueByKey(
    entries.flatMap((entry) =>
      entry.result.nonConformities.map((nonConformity) => {
        const agentLabel = getAgentLabel(entry);

        return {
          ...nonConformity,
          id: `${entry.agentId}:` + nonConformity.id,
          finding: `[${agentLabel}] ` + nonConformity.finding,
          impact: `[${agentLabel}] ` + nonConformity.impact,
          requiredAction: `[${agentLabel}] ` + nonConformity.requiredAction,
        };
      })
    ),
    (nonConformity) => nonConformity.id
  );

const consolidateTraceability = (entries: ENSAgentResultEntry[]): ENSTraceabilityResult[] =>
  uniqueByKey(
    entries.flatMap((entry) =>
      entry.result.traceability.map((trace) => ({
        ...trace,
        agentId: trace.agentId || entry.agentId,
        agentName: trace.agentName || entry.agentName,
      }))
    ),
    (trace) =>
      [
        trace.source,
        trace.reference,
        trace.agentId || '',
        trace.status || '',
        trace.eventId || '',
        trace.requirementId || '',
        trace.evidenceId || '',
      ].join('|')
  );

const consolidateObservations = (entries: ENSAgentResultEntry[]): string[] =>
  uniqueValues(
    entries.flatMap((entry) =>
      entry.result.observations.map((observation) => `[${getAgentLabel(entry)}] ${observation}`)
    )
  );

const consolidateControlResult = (entries: ENSAgentResultEntry[]): ENSComplianceResult => {
  const template = entries[0].result;

  return {
    ...template,
    control: {
      ...template.control,
    },
    policyRuntime: consolidatePolicyRuntime(entries),

    status: consolidateENSStatuses(entries.map((entry) => entry.result.status)),
    score: averageScore(entries),
    coverage: averageApplicableResultValue(entries, (result) => result.coverage),

    // Se SUMAN, no se promedian: el conjunto tiene tantos requisitos aplicables
    // como la suma de los de cada agente, y la lista de los que faltan por medir
    // se nombra con el agente delante para que se pueda ir a corregir.
    applicableRequirements: entries.reduce(
      (sum, entry) => sum + entry.result.applicableRequirements,
      0
    ),
    measuredRequirements: entries.reduce(
      (sum, entry) => sum + entry.result.measuredRequirements,
      0
    ),
    unmeasuredRequirements: entries.flatMap((entry) =>
      entry.result.unmeasuredRequirements.map(
        (requirementId) => `${entry.agentId}:${requirementId}`
      )
    ),

    evaluatedAt:
      getLatestIsoDate(entries.map((entry) => entry.result.evaluatedAt)) || template.evaluatedAt,
    lastEvidenceAt: getLatestIsoDate(entries.map((entry) => entry.result.lastEvidenceAt)),
    nextReviewAt: getEarliestIsoDate(entries.map((entry) => entry.result.nextReviewAt)),

    requirements: consolidateRequirements(entries),

    parameters: template.parameters.map((parameter) => ({
      ...parameter,
    })),

    evidences: consolidateEvidences(entries),

    missingParameters: uniqueValues(entries.flatMap((entry) => entry.result.missingParameters)),
    missingEvidences: uniqueValues(entries.flatMap((entry) => entry.result.missingEvidences)),
    relatedRules: uniqueValues(entries.flatMap((entry) => entry.result.relatedRules)),

    nonConformities: consolidateNonConformities(entries),
    measurementGaps: consolidateMeasurementGaps(entries),

    observations: consolidateObservations(entries),

    traceability: consolidateTraceability(entries),
  };
};

export const consolidateAgentComplianceResultByControl = (
  agents: ENSAgentComplianceState[],
  controlId: string
): ENSComplianceResult | undefined => {
  const entries = agents.flatMap((agent) =>
    agent.results
      .filter((result) => result.control.id === controlId)
      .map((result) => ({
        agentId: agent.agentId,
        agentName: agent.agentName,
        result,
      }))
  );

  return entries.length > 0 ? consolidateControlResult(entries) : undefined;
};

export const consolidateAgentComplianceResults = (
  agents: ENSAgentComplianceState[]
): ENSComplianceResult[] => {
  const controlIds = uniqueValues(
    agents.flatMap((agent) => agent.results.map((result) => result.control.id))
  );

  return controlIds
    .map((controlId) => consolidateAgentComplianceResultByControl(agents, controlId))
    .filter((result): result is ENSComplianceResult => Boolean(result));
};
