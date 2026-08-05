import { buildPolicyContext, runPolicyRuntime } from './policy-runtime';
import { ENSCatalog } from '../catalog';
import { ENSConfigurationRegistry } from '../configuration/registry';
import { getActiveControlConfiguration } from '../configuration/services';
import { ENSLevel } from '../configuration/types';
import {
  ENSDataSourceProvider,
  ENSDataSourceProviderContext,
  ENSNormalizedEvent,
  getENSNormalizedEventsFromProvider,
} from './data-source';
import { resolveEvidenceForControl } from './evidence';
import { evaluateENSControl } from './evaluation';
import {
  buildComplianceState,
  consolidateAgentComplianceResultByControl,
  consolidateAgentComplianceResults,
} from './compliance-state';
import { ENSAgentScope } from './scope';

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

// `now` es el instante al que se evalúa. Por defecto es ahora —el caso del
// panel— y existe como parámetro porque la serie diaria evalúa este mismo
// motor a fechas pasadas: la ventana del latido y la antigüedad de la copia
// tienen que medirse contra el día del punto, no contra hoy.
export const getENSComplianceResults = (
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) => {
  const scopedEvents = getScopedEvents(
    events,
    agentId,
    scopeAgents
  );

  return ENSCatalog.map(catalogControl => {
    // La configuración se carga ANTES de resolver las evidencias: las que
    // declaran `judgment` se juzgan contra el parámetro que el auditor puso en
    // la pantalla, así que el motor no puede resolverlas sin ella.
    const configuration = getActiveControlConfiguration(catalogControl.id);

    const evidences = resolveEvidenceForControl(
      catalogControl.id,
      scopedEvents,
      agentId,
      level,
      configuration,
      now
    );

    const policyContext = buildPolicyContext(
      catalogControl,
      configuration,
      level,
      scopedEvents,
      evidences,
      now
    );

    const policyRuntime = runPolicyRuntime(policyContext);

    return evaluateENSControl(
      catalogControl,
      configuration,
      level,
      evidences,
      policyRuntime,
      scopedEvents
    );
  });
};

interface ENSAgentIdentity {
  agentId: string;
  agentName?: string;
}

const getAgentIdentities = (
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
    ? selectedAgentResults ||
      getENSComplianceResults(
        level,
        events,
        agentId,
        scopeAgents,
        now
      )
    : agents.length > 0
    ? consolidateAgentComplianceResults(
        agents
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
  scopeAgents?: ENSAgentScope[]
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

  // Mismo orden que en `getENSComplianceResults`: primero la configuración,
  // porque las evidencias con `judgment` la necesitan para resolverse.
  const configuration =
    getActiveControlConfiguration(
      controlId
    );

  const evidences = resolveEvidenceForControl(
    controlId,
    scopedEvents,
    agentId,
    level,
    configuration
  );

  const policyContext = buildPolicyContext(
    catalogControl,
    configuration,
    level,
    scopedEvents,
    evidences
  );

  const policyRuntime =
    runPolicyRuntime(policyContext);

  return evaluateENSControl(
    catalogControl,
    configuration,
    level,
    evidences,
    policyRuntime,
    scopedEvents
  );
};

const buildAgentComplianceStatesByControl = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  scopeAgents?: ENSAgentScope[]
) =>
  getAgentIdentities(
    events,
    undefined,
    scopeAgents
  ).map(agent => {
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
        scopeAgents
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
  scopeAgents?: ENSAgentScope[]
) => {
  if (agentId) {
    return evaluateENSComplianceResultByControl(
      controlId,
      level,
      events,
      agentId,
      scopeAgents
    );
  }

  const agents =
    buildAgentComplianceStatesByControl(
      controlId,
      level,
      events,
      scopeAgents
    );

  if (agents.length === 0) {
    return evaluateENSComplianceResultByControl(
      controlId,
      level,
      events,
      undefined,
      scopeAgents
    );
  }

  return (
    consolidateAgentComplianceResultByControl(
      agents,
      controlId
    ) ||
    evaluateENSComplianceResultByControl(
      controlId,
      level,
      events,
      undefined,
      scopeAgents
    )
  );
};

export const getENSRegisteredConfigurationControls = () =>
  ENSConfigurationRegistry;
