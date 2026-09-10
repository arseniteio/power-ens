import type {
  ENSAgentRef,
  ENSComplianceResult,
  ENSComplianceStatus,
  ENSEvidenceResult,
  ENSNonConformity,
  ENSObservationGroup,
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
import { scoreByStatus } from '../evaluation/utils/score';

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

// --- agregación entre agentes ----------------------------------------------
//
// La vista general responde a «qué pasa con el control», no a «qué pasa en cada
// máquina»: para eso está la vista de un agente. Con siete agentes reales, la
// consolidación anterior repetía el mismo motivo siete veces en una celda y
// multiplicaba por siete cada tarjeta —45 tarjetas para 8 requisitos—, y con
// cincuenta máquinas la pantalla no se puede leer.
//
// El criterio, en las tres funciones de abajo: agrupar por CONTENIDO y anotar
// EN CUÁNTAS MÁQUINAS ocurre. Lo que difiere entre máquinas sigue saliendo
// aparte —agregar no es esconder: si seis fallan por una razón y una por otra,
// se ven las dos—. Aquí no se recorta nada: el motor publica todos los grupos y
// cada pantalla decide cuántos enseña.

const toAgentRef = (entry: ENSAgentResultEntry): ENSAgentRef => ({
  agentId: entry.agentId,
  agentName: entry.agentName,
});

// Cuántas máquinas se nombran en el texto plano antes de contarlas. Es solo
// para el consumidor que no sabe leer `agents` (los modelos de informe); el que
// sí sabe recibe la lista entera.
const MAX_AGENTES_NOMBRADOS = 4;

const describeAgents = (agents: ENSAgentRef[]): string => {
  const labels = agents.map(getAgentLabel);

  if (labels.length === 1) {
    return labels[0];
  }

  const named = labels.slice(0, MAX_AGENTES_NOMBRADOS);
  const rest = labels.length - named.length;

  return (
    `${labels.length} máquinas: ${named.join(', ')}` +
    (rest > 0 ? ` y ${rest} más` : '')
  );
};

// Agrupa textos idénticos y anota dónde se han visto. El orden es el de primera
// aparición: dos consolidaciones de los mismos datos tienen que salir iguales.
const groupObservations = (
  items: Array<{ entry: ENSAgentResultEntry; text: string }>
): ENSObservationGroup[] => {
  const groups = new Map<string, ENSObservationGroup>();

  items.forEach(({ entry, text }) => {
    const group = groups.get(text);

    if (!group) {
      groups.set(text, { text, agents: [toAgentRef(entry)] });

      return;
    }

    if (!group.agents.some((agent) => agent.agentId === entry.agentId)) {
      group.agents.push(toAgentRef(entry));
    }
  });

  return Array.from(groups.values());
};

// El mismo grupo, aplanado. Con una sola máquina el prefijo es exactamente el
// de siempre, `[nombre (id)]`, para no romper a quien ya lo leía así.
const formatObservationGroup = (group: ENSObservationGroup): string =>
  group.agents.length === 0
    ? group.text
    : `[${describeAgents(group.agents)}] ${group.text}`;

interface ENSCardGroup<T> {
  template: T;
  agents: ENSAgentRef[];
}

// Mismo criterio para las tarjetas (NC y PM): dos tarjetas con el mismo
// contenido son una tarjeta vista en dos máquinas. En cuanto el contenido
// difiere —otra cuenta, otro motivo del recolector— vuelven a ser dos.
const groupCards = <T>(
  items: Array<{ entry: ENSAgentResultEntry; card: T }>,
  keyOf: (card: T) => string
): Array<ENSCardGroup<T>> => {
  const groups = new Map<string, ENSCardGroup<T>>();

  items.forEach(({ entry, card }) => {
    const key = keyOf(card);
    const group = groups.get(key);

    if (!group) {
      groups.set(key, { template: card, agents: [toAgentRef(entry)] });

      return;
    }

    if (!group.agents.some((agent) => agent.agentId === entry.agentId)) {
      group.agents.push(toAgentRef(entry));
    }
  });

  return Array.from(groups.values());
};

// El identificador de una tarjeta consolidada:
//
//   - se RENUMERA, porque el número de `NC-001` es el índice dentro de UN
//     agente: el `NC-001` de una máquina y el de otra no son el mismo
//     requisito, y conservarlos hacía que `025:NC-001` y `024:NC-001`
//     parecieran hermanos sin serlo;
//   - conserva el prefijo `<agente>:` SOLO cuando la tarjeta es de una sola
//     máquina, que es cuando nombrarla es cierto. Una tarjeta compartida por
//     seis no puede llevar el nombre de una;
//   - respeta los identificadores simbólicos como `NC-CFG`, donde el nombre
//     significa algo y el número no aportaría nada. No pueden chocar entre sí:
//     la configuración es la misma para todos los agentes del control, así que
//     `NC-CFG` produce un solo grupo.
const consolidatedCardId = (
  localId: string,
  index: number,
  agents: ENSAgentRef[]
): string => {
  const id = /^NC-\d+$/.test(localId)
    ? `NC-${String(index + 1).padStart(3, '0')}`
    : localId;

  return agents.length === 1 ? `${agents[0].agentId}:${id}` : id;
};

const getLatestIsoDate = (values: Array<string | undefined>): string | undefined => {
  const definedValues = values.filter((value): value is string => Boolean(value));

  return definedValues.sort((left, right) => right.localeCompare(left))[0];
};

const getEarliestIsoDate = (values: Array<string | undefined>): string | undefined => {
  const definedValues = values.filter((value): value is string => Boolean(value));

  return definedValues.sort((left, right) => left.localeCompare(right))[0];
};

// Consolida VEREDICTOS entre agentes. Desde el 04/08, los estados de control y
// de requisito que le llegan ya no incluyen NO_EVALUABLE —lo no demostrado sale
// NO_CUMPLE—, así que sus ramas de NO_EVALUABLE solo las ejercitan las
// EVIDENCIAS, que conservan ese estado como observación en crudo: ahí «una
// máquina lo demostró y de otra no sabemos nada» sigue siendo, correctamente,
// «no lo sabemos», y el veredicto ya lo ha aplicado el requisito.
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

// El porcentaje consolidado se promedia sobre los agentes que traen número.
// Desde el 04/08 eso son TODOS los que tienen algún requisito aplicable —el que
// no ha reportado nada trae un 0, y ese 0 es ahora una afirmación deliberada:
// «de esta máquina no se ha demostrado nada»—. La guarda se queda porque el
// caso NO_APLICA sigue existiendo: un control entero fuera del nivel activo no
// tiene número y no puede arrastrar el promedio a la baja.
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

// Una máquina «tiene resultados» si el motor ha llegado a MEDIR algo en ella, no
// si tiene veredicto: desde el 04/08 todas tienen veredicto, incluida la que no
// ha reportado nada en su vida. Sin este cambio, `agentsWithoutResults` sería
// siempre 0 y la pantalla perdería justo el contador que delata al agente caído.
export const agentHasEvaluatedResults = (agent: ENSAgentComplianceState): boolean =>
  agent.results.some((result) => result.measuredRequirements > 0);

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

    // Mismo criterio que en las evidencias: el motivo que sale igual en las
    // siete máquinas se escribe una vez, diciendo que son siete.
    const observationGroups = groupObservations(
      requirementEntries.flatMap(({ entry, requirement }) =>
        requirement.observations.map((text) => ({ entry, text }))
      )
    );

    const statusConsolidado = consolidateENSStatuses(
      requirementEntries.map(({ requirement }) => requirement.status)
    );

    return {
      ...template,
      status: statusConsolidado,
      // EL SCORE TIENE QUE SEGUIR AL ESTADO CONSOLIDADO, y hasta el 07/08/2026
      // no lo hacía: `template` es el requisito de la PRIMERA máquina y arrastra
      // su `score`. Un requisito que sale NO_CUMPLE porque falla en la segunda
      // seguía aportando los 100 de la primera al índice de requisitos.
      //
      // Hoy ese índice no se pinta en ninguna pantalla —el número grande sale de
      // `controlSummary`, que recalcula desde los veredictos— así que no ha
      // mentido a ningún auditor. Es una bomba armada, no un incendio: el día
      // que alguien pinte ese campo, miente. Se desarma donde toca, que es aquí,
      // y no quitando el campo del tipo: `tests/measurement-gap.test.ts` lo
      // comprueba a propósito por agente, y ahí el score SÍ es correcto.
      score: scoreByStatus(statusConsolidado),
      // Demostrado solo si lo está en TODAS: basta una máquina sin prueba para
      // que el requisito del conjunto no esté demostrado. Es lo que impide que
      // una máquina sana tape a la que no reporta.
      evidenced: requirementEntries.every(
        ({ requirement }) => requirement.evidenced !== false
      ),
      level: uniqueValues(requirementEntries.flatMap(({ requirement }) => requirement.level)),
      evidenceIds: evidenceIds.length > 0 ? evidenceIds : undefined,
      observations: observationGroups.map(formatObservationGroup),
      observationGroups,
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

    // El motivo de la evidencia, agrupado por texto. Con siete agentes, «sin
    // datos del recolector en la ventana» pasa de ocupar siete líneas casi
    // iguales a una sola que dice en cuántas máquinas ocurre.
    const observationGroups = groupObservations(
      evidenceEntries.flatMap(({ entry, evidence }) =>
        (evidence.observations || []).map((text) => ({ entry, text }))
      )
    );

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
      //
      // Un motivo visto en una sola máquina se sigue escribiendo igual que
      // siempre; el que se repite en varias las nombra a todas en un prefijo,
      // en vez de repetir el texto entero una vez por máquina.
      observations: observationGroups.map(formatObservationGroup),
      observationGroups,

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

// Dos tarjetas son la misma si dicen exactamente lo mismo: mismo requisito,
// mismo origen y causa, mismo motivo, misma acción y mismas evidencias y
// parámetros implicados. `finding` incluye el motivo que resolvió la policy («se
// ha observado 'admin'») y el que declaró el recolector, así que dos máquinas
// que fallan por razones distintas siguen dando dos tarjetas.
const nonConformityKey = (nonConformity: ENSNonConformity): string =>
  [
    nonConformity.origin,
    nonConformity.cause || '',
    nonConformity.requirementId,
    nonConformity.evidenceId,
    nonConformity.finding,
    nonConformity.impact,
    nonConformity.requiredAction,
    nonConformity.expected || '',
    nonConformity.actual || '',
    (nonConformity.evidenceIds || []).join(','),
    (nonConformity.parameterIds || []).join(','),
  ].join('|');

const consolidateNonConformities = (entries: ENSAgentResultEntry[]): ENSNonConformity[] =>
  groupCards(
    entries.flatMap((entry) =>
      entry.result.nonConformities.map((card) => ({ entry, card }))
    ),
    nonConformityKey
  ).map(({ template, agents }, index) => {
    // Una tarjeta de causa CATALOG no es de ninguna máquina: «op.acc.1.5 no
    // declara evidencia en el catálogo» es cierto para las siete por igual y no
    // cambia por mirar otra. Atribuirla a los agentes la convertía en cinco
    // hallazgos idénticos y, encima, señalaba al sitio equivocado: no hay nada
    // que arreglar en la máquina, el arreglo lo tiene el producto.
    const cardAgents = template.cause === 'CATALOG' ? [] : agents;

    return {
      ...template,
      id: consolidatedCardId(template.id, index, cardAgents),
      agents: cardAgents,
    };
  });

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

// Las observaciones del control entero. La mayoría («Configuración mínima
// disponible para evaluar el control.») son idénticas en todas las máquinas
// porque salen de la misma configuración: repetirlas una vez por agente era
// ruido puro.
const consolidateObservations = (entries: ENSAgentResultEntry[]): string[] =>
  groupObservations(
    entries.flatMap((entry) =>
      entry.result.observations.map((text) => ({ entry, text }))
    )
  ).map(formatObservationGroup);

const consolidateControlResult = (entries: ENSAgentResultEntry[]): ENSComplianceResult => {
  const template = entries[0].result;

  return {
    ...template,
    control: {
      ...template.control,
    },
    policyRuntime: consolidatePolicyRuntime(entries),

    // Sobre cuántas máquinas se ha resumido esto. Sin este dato, la pantalla no
    // puede distinguir «falta en 6» de «falta en todas».
    consolidatedAgents: uniqueByKey(entries.map(toAgentRef), (agent) => agent.agentId),

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
