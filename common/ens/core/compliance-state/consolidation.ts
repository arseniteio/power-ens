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

// Aggregation across agents. The overview answers "what happens with the control", not "what happens on each machine". Group by CONTENT and note HOW MANY MACHINES it occurs on;
// what differs between machines still comes out apart. Nothing is trimmed here: the engine publishes every group and each screen decides how many to show.

const toAgentRef = (entry: ENSAgentResultEntry): ENSAgentRef => ({
  agentId: entry.agentId,
  agentName: entry.agentName,
});

// How many machines are named in the plain text before counting them; only for consumers that cannot read `agents` (the report models).
const MAX_NAMED_AGENTS = 4;

const describeAgents = (agents: ENSAgentRef[]): string => {
  const labels = agents.map(getAgentLabel);

  if (labels.length === 1) {
    return labels[0];
  }

  const named = labels.slice(0, MAX_NAMED_AGENTS);
  const rest = labels.length - named.length;

  return (
    `${labels.length} máquinas: ${named.join(', ')}` +
    (rest > 0 ? ` y ${rest} más` : '')
  );
};

// Groups identical texts and notes where they were seen. Order of first appearance, so two consolidations of the same data are equal.
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

// The same group flattened. With a single machine the prefix is the usual `[name (id)]`.
const formatObservationGroup = (group: ENSObservationGroup): string =>
  group.agents.length === 0
    ? group.text
    : `[${describeAgents(group.agents)}] ${group.text}`;

interface ENSCardGroup<T> {
  template: T;
  agents: ENSAgentRef[];
}

// Same criterion for the cards (NC and PM): two cards with the same content are one card seen on two machines.
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

// Identifier of a consolidated card:
// - RENUMBERED, because the `NC-001` number is the index inside ONE agent;
// - keeps the `<agent>:` prefix ONLY when the card belongs to a single machine;
// - respects symbolic identifiers such as `NC-CFG` (configuration is the same for every agent of the control, so it yields one group).
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

// Consolidates VERDICTS across agents. Control and requirement states arriving here no longer include NO_EVALUABLE (what is not proven is NO_CUMPLE), so its branches are exercised only by EVIDENCES,
// which keep it as a raw observation.
const consolidateENSStatuses = (statuses: ENSComplianceStatus[]): ENSComplianceStatus => {
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

  // No `hasCompliant && hasNotEvaluable -> PARCIAL` rule: a gap of measure must not fabricate an assertion one layer up. The case falls to the final NO_EVALUABLE.
  // The two branches above (NO_CUMPLE and PARCIAL) come first on purpose: a proven failure on ANY agent rules over the gap.
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

// The consolidated percentage averages the agents that carry a number: all those with some applicable requirement (an agent that reported nothing carries a deliberate 0).
// The guard stays because NO_APLICA still exists: a whole control outside the active level has no number and must not drag the average down.
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

// A machine "has results" if the engine MEASURED something on it, not if it has a verdict (all have one). Otherwise `agentsWithoutResults` would always be 0 and the fallen-agent counter would be lost.
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

    // Without the first machine's documentary mark: recalculated below with all of them. Inheriting it would publish "accredited" on a requirement another machine fails with a measure.
    const template = { ...requirementEntries[0].requirement };
    delete template.attested;
    delete template.documental;

    const evidenceIds = uniqueValues(
      requirementEntries.flatMap(({ requirement }) => requirement.evidenceIds || [])
    );

    // Same criterion as the evidences: a motive equal on seven machines is written once, saying seven.
    const observationGroups = groupObservations(
      requirementEntries.flatMap(({ entry, requirement }) =>
        requirement.observations.map((text) => ({ entry, text }))
      )
    );

    const consolidatedStatus = consolidateENSStatuses(
      requirementEntries.map(({ requirement }) => requirement.status)
    );

    // ACCREDITED DOCUMENTARILY if the set complies and some machine accredits with a document. One suffices; never on a requirement that does not comply.
    const attested =
      consolidatedStatus === 'CUMPLE' &&
      requirementEntries.some(({ requirement }) => requirement.attested === true);

    // DOCUMENTARY only if it is on every machine that decides it: one that fails it by measuring makes the set a measure.
    const decisive = requirementEntries.filter(
      ({ requirement }) => requirement.status === consolidatedStatus
    );
    const documental =
      decisive.length > 0 &&
      decisive.every(({ requirement }) => requirement.documental === true);

    return {
      ...template,
      status: consolidatedStatus,
      // THE SCORE MUST FOLLOW THE CONSOLIDATED STATE: `template` is the first machine's requirement and drags its `score`. The field is not painted on any screen today;
      // `tests/measurement-gap.test.ts` checks it per agent on purpose, where the score IS correct.
      score: scoreByStatus(consolidatedStatus),
      // Proven only if proven on ALL: one machine without proof makes the set unproven, so a healthy machine cannot cover one that does not report.
      evidenced: requirementEntries.every(
        ({ requirement }) => requirement.evidenced !== false
      ),
      ...(attested ? { attested: true } : {}),
      ...(documental ? { documental: true } : {}),
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

    // The evidence motive grouped by text: seven near-identical lines become one saying on how many machines it occurs.
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

      // Same agent prefix as the requirements: a motive without its machine is useless to fix, and without this the motive of the agent that determines the consolidated state would be lost with more than one agent.
      // A motive seen on one machine is written as always; a repeated one names all machines in a prefix.
      observations: observationGroups.map(formatObservationGroup),
      observationGroups,

      // The root result represents several agents. Individual detail is kept in state.agents and traceability.
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
    // A CATALOG-cause card belongs to no machine: attributing it to agents turned it into identical findings and pointed at the wrong place; the fix belongs to the product.
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

// Observations of the whole control. Most are identical on every machine because they come from the same configuration; repeating them per agent was noise.
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

    // How many machines this summarises, so the screen can tell "missing on 6" and "missing on all" apart.
    consolidatedAgents: uniqueByKey(entries.map(toAgentRef), (agent) => agent.agentId),

    status: consolidateENSStatuses(entries.map((entry) => entry.result.status)),
    score: averageScore(entries),
    coverage: averageApplicableResultValue(entries, (result) => result.coverage),

    // SUMMED, not averaged: the set has as many applicable requirements as the sum over agents, and the list of those missing a measure is named with the agent first.
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
