import { buildPolicyContext, runPolicyRuntime } from './policy-runtime';
import { ENSCatalog } from '../catalog';
import { ENSConfigurationRegistry } from '../configuration/registry';
import {
  getActiveControlConfiguration,
  getActiveENSConfiguration,
} from '../configuration/services';
import { ENSLevel } from '../configuration/types';
import {
  ENSDataSourceProvider,
  ENSDataSourceProviderContext,
  ENSNormalizedEvent,
  getENSNormalizedEventsFromProvider,
} from './data-source';
import { controlExpectsFacts, resolveEvidenceForControl } from './evidence';
import { keepLatestRunStateFacts } from './evidence/state-facts';
import {
  findStaleCollector,
  markEvidencesStale,
  markPolicyRuntimeStale,
} from './evidence/stale-collector';
import { evaluateENSControl } from './evaluation';
import { buildPendingMeasurementEvidences } from './evidence/pending-measurement';
import { isPendingMeasurement } from '../catalog/support/measurement-plan';
import {
  buildComplianceState,
  consolidateAgentComplianceResultByControl,
  consolidateAgentComplianceResults,
} from './compliance-state';
import { ENSAgentScope } from './scope/types';
import {
  ENS_MANAGER_AGENT_ID,
  describeOutOfScopeDeclaredMachine,
  describeUnmatchedDeclaredScope,
  getDeclaredScopeAgentNames,
  isAgentNameDeclared,
  isControlInDeclaredScope,
  isControlMeasuredOnAgent,
  isManagerAgentId,
  isManagerOnlyControl,
  markEvidencesUnmatchedScope,
  markPolicyRuntimeUnmatchedScope,
} from './scope/measurement-planes';
import { resolveControlLevel } from './control-level';
import type { ENSControlDefinition } from '../catalog/types';
import type { ENSComplianceResult } from './evaluation/types';

// Effective level of a control: the global one, unless the catalog ties it to one or more dimensions (C, I, T, A, D); then the highest of their levels. See `control-level.ts`.
const getControlLevel = (
  catalogControl: Parameters<typeof resolveControlLevel>[0],
  level: ENSLevel
): ENSLevel =>
  resolveControlLevel(
    catalogControl,
    level,
    getActiveENSConfiguration()?.global
  );

const getScopedEvents = (
  events: ENSNormalizedEvent[],
  agentId?: string,
  scopeAgents?: ENSAgentScope[]
): ENSNormalizedEvent[] => {
  const scopedAgentIds =
    scopeAgents === undefined
      ? undefined
      : new Set(
          scopeAgents.map(
            agent => agent.id
          )
        );

  return events.filter(event => {
    if (
      scopedAgentIds &&
      (
        !event.agentId ||
        !scopedAgentIds.has(event.agentId)
      )
    ) {
      return false;
    }

    return (
      !agentId ||
      event.agentId === agentId
    );
  });
};

// Name of a machine, to compare with a control's declared scope: the scope inventory's, else its events'.
const resolveAgentName = (
  agentId: string,
  events: ENSNormalizedEvent[],
  scopeAgents?: ENSAgentScope[]
): string | undefined =>
  scopeAgents?.find(agent => agent.id === agentId)?.name ||
  events.find(event => event.agentId === agentId && event.agentName)
    ?.agentName;

// Is this control evaluated on this machine's row? Its measurement plane and, if declared, its scope (see `scope/measurement-planes.ts`).
export const isControlEvaluatedOnAgent = (
  control: ENSControlDefinition,
  agentId: string,
  agentName: string | undefined
): boolean =>
  // A control without collector has no machine row: its one result is the same everywhere (see `evaluateControlOnEvents`).
  !isPendingMeasurement(control) &&
  isControlMeasuredOnAgent(control, agentId) &&
  isControlInDeclaredScope(
    control,
    agentName,
    getActiveControlConfiguration(control.id)
  );

// Evaluates ONE control over the events already trimmed to the row (or the whole set, without `agentId`). The single path of the panel and the detail.
const evaluateControlOnEvents = (
  catalogControl: ENSControlDefinition,
  level: ENSLevel,
  scopedEvents: ENSNormalizedEvent[],
  agentId?: string,
  now?: Date,
  scopeAgents?: ENSAgentScope[],
  // CONFIGURATION gap imposed from outside: the row of a machine the declared scope names that is not in the ENS scope (see `buildOutOfScopeDeclaredRows`).
  configurationGap?: string
): ENSComplianceResult => {
  // A control without collector: no fact to read and nothing to judge. One cheap result, the same for any row or
  // instant: requirements NO_APLICA, evidences NO_APLICA with the source they need, no non-conformity.
  if (isPendingMeasurement(catalogControl)) {
    return evaluateENSControl(
      catalogControl,
      getActiveControlConfiguration(catalogControl.id),
      getControlLevel(catalogControl, level),
      buildPendingMeasurementEvidences(catalogControl.id),
      undefined,
      [],
      false
    );
  }

  // The configuration is loaded BEFORE resolving evidences: those declaring `judgment` are judged against the parameter the auditor set on screen.
  // Resolved for the row (agent, templates, organisation); without a row, the organisation view.
  const configuration = getActiveControlConfiguration(catalogControl.id, agentId);

  // Without a row, a control with declared scope is measured only with the facts of the declared machines; a machine outside its scope neither adds nor subtracts here.
  const declaredScope =
    agentId === undefined
      ? getDeclaredScopeAgentNames(catalogControl, configuration)
      : undefined;

  const eventsInScope = declaredScope
    ? scopedEvents.filter(event =>
        isAgentNameDeclared(event.agentName, declaredScope)
      )
    : scopedEvents;

  // Known machines: the scope's and, without it, the events'. If the declared scope names none (empty, or a typo), there is nobody to expect facts from: what could not be measured is CONFIGURATION, not collection.
  const knownAgentNames = declaredScope
    ? (scopeAgents
        ? scopeAgents.map(agent => agent.name)
        : scopedEvents.map(event => event.agentName)
      ).filter((name): name is string => Boolean(name))
    : [];

  const unmatchedScope =
    declaredScope !== undefined &&
    !knownAgentNames.some(name => isAgentNameDeclared(name, declaredScope));

  const unmatchedScopeReason =
    configurationGap ??
    (unmatchedScope && catalogControl.scopeParameter
      ? describeUnmatchedDeclaredScope(
          catalogControl.scopeParameter,
          declaredScope as string[]
        )
      : undefined);

  // Facts are not expected either from a control that listens to none (op.cont.2). See `controlExpectsFacts`.
  const expectsFacts =
    !unmatchedScopeReason && controlExpectsFacts(catalogControl.id);

  // STATE facts are judged with the collector's last pass, before evidences and policy read them (see `evidence/state-facts.ts`).
  const controlEvents = keepLatestRunStateFacts(
    catalogControl.id,
    eventsInScope,
    now
  );

  const controlLevel = getControlLevel(catalogControl, level);

  const resolvedEvidences = resolveEvidenceForControl(
    catalogControl.id,
    controlEvents,
    agentId,
    controlLevel,
    configuration,
    now
  );

  const policyContext = buildPolicyContext(
    catalogControl,
    configuration,
    controlLevel,
    controlEvents,
    resolvedEvidences,
    now
  );

  const resolvedPolicyRuntime = runPolicyRuntime(policyContext);

  // On a machine's row, a collector silent for over 24 h proves nothing as of `now`: the control is not judged with that data (see `evidence/stale-collector.ts`).
  // Without a machine there is no row to attribute the heartbeat to; the set is consolidated from rows, which already apply it.
  const stale =
    agentId === undefined
      ? undefined
      : findStaleCollector(catalogControl.id, scopedEvents, now);

  const evidences = stale
    ? markEvidencesStale(resolvedEvidences, stale)
    : unmatchedScopeReason
    ? markEvidencesUnmatchedScope(resolvedEvidences, unmatchedScopeReason)
    : resolvedEvidences;

  const policyRuntime = stale
    ? markPolicyRuntimeStale(resolvedPolicyRuntime, stale)
    : unmatchedScopeReason
    ? markPolicyRuntimeUnmatchedScope(resolvedPolicyRuntime, unmatchedScopeReason)
    : resolvedPolicyRuntime;

  return evaluateENSControl(
    catalogControl,
    configuration,
    controlLevel,
    evidences,
    policyRuntime,
    controlEvents,
    expectsFacts
  );
};

const evaluateCatalogControls = (
  catalogControls: ENSControlDefinition[],
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) => {
  const scopedEvents = getScopedEvents(
    events,
    agentId,
    scopeAgents
  );

  return catalogControls.map(catalogControl =>
    evaluateControlOnEvents(
      catalogControl,
      level,
      scopedEvents,
      agentId,
      now,
      scopeAgents
    )
  );
};

// Controls evaluated on a machine's row: those of its measurement plane that, if they declare scope, have it declared. Without a machine, all of them.
const getCatalogControlsForAgent = (
  agentId?: string,
  agentName?: string
): ENSControlDefinition[] =>
  agentId === undefined
    ? ENSCatalog
    : ENSCatalog.filter(control =>
        isControlEvaluatedOnAgent(control, agentId, agentName)
      );

// `now` is the instant evaluated. Defaults to now (the panel) and is a parameter because the daily series evaluates this same engine at past dates.
// With `agentId`, the row of THAT machine: only controls of its plane and declared scope produce a result. A control not measured there does not appear, not even as NO_APLICA.
export const getENSComplianceResults = (
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) =>
  evaluateCatalogControls(
    getCatalogControlsForAgent(
      agentId,
      agentId === undefined
        ? undefined
        : resolveAgentName(agentId, events, scopeAgents)
    ),
    level,
    events,
    agentId,
    scopeAgents,
    now
  );

// Results in catalog order: the manager row (000) sorts first by id and carries only its controls, so consolidation would put them ahead of the rest.
const sortByCatalog = (
  results: ENSComplianceResult[]
): ENSComplianceResult[] => {
  const catalogOrder = new Map(
    ENSCatalog.map((control, index) => [control.id, index])
  );

  return [...results].sort(
    (left, right) =>
      (catalogOrder.get(left.control.id) ?? Number.MAX_SAFE_INTEGER) -
      (catalogOrder.get(right.control.id) ?? Number.MAX_SAFE_INTEGER)
  );
};

// View of ONE machine. Manager-only controls belong to the organisation: they show the manager row's result. Dual-plane controls (op.exp.8) keep the machine's row.
// With the manager itself selected its row already carries them.
const withOrganizationControls = (
  agentResults: ENSComplianceResult[],
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  agentId: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
): ENSComplianceResult[] => {
  // The manager's view carries only what is measured on it.
  if (isManagerAgentId(agentId)) {
    return agentResults;
  }

  // The controls without collector are in every machine's view with their one result (no row of their own).
  const pendingResults = evaluateCatalogControls(
    ENSCatalog.filter(control => isPendingMeasurement(control)),
    level,
    [],
    undefined,
    scopeAgents,
    now
  );

  const organizationControls = ENSCatalog.filter(isManagerOnlyControl);

  if (organizationControls.length === 0 && pendingResults.length === 0) {
    return agentResults;
  }

  return sortByCatalog([
    ...agentResults,
    ...evaluateCatalogControls(
      organizationControls,
      level,
      events,
      ENS_MANAGER_AGENT_ID,
      scopeAgents,
      now
    ),
    ...pendingResults,
  ]);
};

// Set view. Each control comes from consolidating the rows that measure it. If none does (a manager control without the manager in scope), it is evaluated over all events, as when there are no rows.
const withUnmeasuredControls = (
  consolidatedResults: ENSComplianceResult[],
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  scopeAgents?: ENSAgentScope[],
  now?: Date
): ENSComplianceResult[] => {
  const consolidatedIds = new Set(
    consolidatedResults.map(result => result.control.id)
  );

  const unmeasuredControls = ENSCatalog.filter(
    control => !consolidatedIds.has(control.id)
  );

  return sortByCatalog([
    ...consolidatedResults,
    ...evaluateCatalogControls(
      unmeasuredControls,
      level,
      events,
      undefined,
      scopeAgents,
      now
    ),
  ]);
};

interface ENSAgentIdentity {
  agentId: string;
  agentName?: string;
}

// Exported for the server, which builds the state control by control (see `control-partition.ts`) and needs the same machines in the same order.
export const getAgentIdentities = (
  events: ENSNormalizedEvent[],
  requestedAgentId?: string,
  scopeAgents?: ENSAgentScope[]
): ENSAgentIdentity[] => {
  const identities = new Map<
    string,
    string | undefined
  >();

  if (scopeAgents !== undefined) {
    scopeAgents
      .filter(
        agent =>
          !requestedAgentId ||
          agent.id === requestedAgentId
      )
      .forEach(agent => {
        identities.set(
          agent.id,
          agent.name
        );
      });
  }

  const identityEvents = getScopedEvents(
    events,
    requestedAgentId,
    scopeAgents
  );

  identityEvents.forEach(event => {
    if (!event.agentId) {
      return;
    }

    const existingName = identities.get(
      event.agentId
    );

    if (
      !identities.has(event.agentId) ||
      (!existingName && event.agentName)
    ) {
      identities.set(
        event.agentId,
        event.agentName
      );
    }
  });

  if (
    scopeAgents === undefined &&
    requestedAgentId &&
    !identities.has(requestedAgentId)
  ) {
    identities.set(
      requestedAgentId,
      undefined
    );
  }

  return Array.from(
    identities.entries()
  )
    .map(([agentId, agentName]) => ({
      agentId,
      agentName,
    }))
    .sort(
      (left, right) =>
        left.agentId.localeCompare(
          right.agentId
        )
    );
};

const buildAgentComplianceStates = (
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  requestedAgentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) =>
  getAgentIdentities(
    events,
    requestedAgentId,
    scopeAgents
  ).map(agent => {
    const agentEvents = getScopedEvents(
      events,
      agent.agentId,
      scopeAgents
    );

    const results =
      getENSComplianceResults(
        level,
        agentEvents,
        agent.agentId,
        scopeAgents,
        now
      );

    const state =
      buildComplianceState(results);

    return {
      agentId: agent.agentId,
      agentName: agent.agentName,
      results,
      summary: state.controlSummary,
    };
  });

// Machines the control's declared scope names that the engine does not know (a misspelled name, or a machine in the backup group but not in the ENS one). They count as declared machines WITHOUT DATA:
// added to the CONSOLIDATION, not to panel rows, all NO_EVALUABLE by CONFIGURATION with a motive naming them. Without this, P-04 = "srv-01, srv-99" with srv-01 up to date showed the control 100 % proven.
// Exported for the server (see `control-partition.ts`).
export const buildOutOfScopeDeclaredRows = (
  controls: ENSControlDefinition[],
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  scopeAgents?: ENSAgentScope[],
  now?: Date
) => {
  const knownNames = getAgentIdentities(events, undefined, scopeAgents)
    .map(agent => agent.agentName)
    .filter((name): name is string => Boolean(name));

  const rows = new Map<string, ENSComplianceResult[]>();

  controls.forEach(control => {
    if (!control.scopeParameter) {
      return;
    }

    (getDeclaredScopeAgentNames(control, getActiveControlConfiguration(control.id)) || [])
      .filter(name => !knownNames.some(known => isAgentNameDeclared(known, [name])))
      .forEach(name => {
        rows.set(name, [
          ...(rows.get(name) || []),
          evaluateControlOnEvents(
            control,
            level,
            [],
            undefined,
            now,
            scopeAgents,
            describeOutOfScopeDeclaredMachine(control.scopeParameter as string, name)
          ),
        ]);
      });
  });

  return Array.from(rows.entries()).map(([name, results]) => ({
    agentId: name,
    agentName: name,
    results,
    summary: buildComplianceState(results).controlSummary,
  }));
};

export const getENSComplianceState = (
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) => {
  const agents = buildAgentComplianceStates(
    level,
    events,
    agentId,
    scopeAgents,
    now
  );

  const selectedAgentResults = agentId
    ? agents.find(
        agent =>
          agent.agentId === agentId
      )?.results
    : undefined;

  const results = agentId
    ? withOrganizationControls(
        selectedAgentResults ||
          getENSComplianceResults(
            level,
            events,
            agentId,
            scopeAgents,
            now
          ),
        level,
        events,
        agentId,
        scopeAgents,
        now
      )
    : agents.length > 0
    ? withUnmeasuredControls(
        consolidateAgentComplianceResults([
          ...agents,
          ...buildOutOfScopeDeclaredRows(
            ENSCatalog,
            level,
            events,
            scopeAgents,
            now
          ),
        ]),
        level,
        events,
        scopeAgents,
        now
      )
    : getENSComplianceResults(
        level,
        events,
        agentId,
        scopeAgents,
        now
      );

  return buildComplianceState(
    results,
    agents
  );
};

export const getENSComplianceStateFromProvider = async (
  provider: ENSDataSourceProvider,
  level: ENSLevel,
  context: ENSDataSourceProviderContext = {},
  scopeAgents?: ENSAgentScope[]
) => {
  const dataSourceResult = await getENSNormalizedEventsFromProvider({
    provider,
    ...context,
  });

  return getENSComplianceState(
    level,
    dataSourceResult.events,
    context.agentId,
    scopeAgents
  );
};

const evaluateENSComplianceResultByControl = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  // The instant evaluated, as in the all-controls path. Needed by the detail's daily series: otherwise each history point would be judged against today's clock.
  now?: Date
) => {
  const catalogControl = ENSCatalog.find(
    control =>
      control.id === controlId
  );

  if (!catalogControl) {
    return undefined;
  }

  const scopedEvents = getScopedEvents(
    events,
    agentId,
    scopeAgents
  );

  return evaluateControlOnEvents(
    catalogControl,
    level,
    scopedEvents,
    agentId,
    now,
    scopeAgents
  );
};

const buildAgentComplianceStatesByControl = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  scopeAgents?: ENSAgentScope[],
  now?: Date
) =>
  getAgentIdentities(
    events,
    undefined,
    scopeAgents
  )
    // Only the rows that measure the control: the others produce no result, and a row without one is not consolidated.
    .filter(agent => {
      const catalogControl = ENSCatalog.find(
        control => control.id === controlId
      );

      return (
        !catalogControl ||
        isControlEvaluatedOnAgent(
          catalogControl,
          agent.agentId,
          agent.agentName
        )
      );
    })
    .map(agent => {
      const agentEvents = getScopedEvents(
        events,
        agent.agentId,
        scopeAgents
      );

      const result =
        evaluateENSComplianceResultByControl(
          controlId,
          level,
          agentEvents,
          agent.agentId,
          scopeAgents,
          now
        );

      const results = result
        ? [result]
        : [];

      const state =
        buildComplianceState(results);

      return {
        agentId: agent.agentId,
        agentName: agent.agentName,
        results,
        summary: state.controlSummary,
      };
    });

export const getENSComplianceResultByControl = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) => {
  if (agentId) {
    const catalogControl = ENSCatalog.find(
      control => control.id === controlId
    );

    // Same plane rule as `getENSComplianceState`: in a machine's view a manager-only control comes out with the manager row; in the manager's view a control not measured there has no result.
    if (
      catalogControl &&
      !isControlMeasuredOnAgent(catalogControl, agentId)
    ) {
      return isManagerOnlyControl(catalogControl) &&
        !isManagerAgentId(agentId)
        ? evaluateENSComplianceResultByControl(
            controlId,
            level,
            events,
            ENS_MANAGER_AGENT_ID,
            scopeAgents,
            now
          )
        : undefined;
    }

    // And declared scope: in a machine's view, a control that does not declare it has no result.
    if (
      catalogControl &&
      !isControlInDeclaredScope(
        catalogControl,
        resolveAgentName(agentId, events, scopeAgents),
        getActiveControlConfiguration(controlId)
      )
    ) {
      return undefined;
    }

    return evaluateENSComplianceResultByControl(
      controlId,
      level,
      events,
      agentId,
      scopeAgents,
      now
    );
  }

  return getENSControlEvaluation(
    controlId,
    level,
    events,
    scopeAgents,
    now
  ).result;
};

// Set view of ONE control plus the rows of the machines that measure it. It is the machine-less branch of `getENSComplianceResultByControl`, used by the server.
// Rows of declared machines not in the scope enter the consolidation but are not panel rows, so they are not returned.
export const getENSControlEvaluation = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  scopeAgents?: ENSAgentScope[],
  now?: Date
): {
  result: ENSComplianceResult | undefined;
  agents: ReturnType<typeof buildAgentComplianceStatesByControl>;
} => {
  const measuredAgents = buildAgentComplianceStatesByControl(
    controlId,
    level,
    events,
    scopeAgents,
    now
  );

  const agents = [
    ...measuredAgents,
    ...buildOutOfScopeDeclaredRows(
      ENSCatalog.filter(control => control.id === controlId),
      level,
      events,
      scopeAgents,
      now
    ),
  ];

  if (agents.length === 0) {
    return {
      result: evaluateENSComplianceResultByControl(
        controlId,
        level,
        events,
        undefined,
        scopeAgents,
        now
      ),
      agents: measuredAgents,
    };
  }

  return {
    result:
      consolidateAgentComplianceResultByControl(
        agents,
        controlId
      ) ||
      evaluateENSComplianceResultByControl(
        controlId,
        level,
        events,
        undefined,
        scopeAgents,
        now
      ),
    agents: measuredAgents,
  };
};

export const getENSRegisteredConfigurationControls = () =>
  ENSConfigurationRegistry;
