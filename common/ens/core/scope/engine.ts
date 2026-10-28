import type { ENSConfigurationScope } from '../../configuration/types';
import { ENS_MANAGER_AGENT_ID, isManagerAgentId } from './measurement-planes';
import { ENSAgentScope } from './types';

const normalizeGroup = (group: string): string =>
  group.trim().toLowerCase();

const normalizeAgentId = (
  agentId: string
): string =>
  agentId.trim();

type ENSScopeAgentQueryFilter =
  | {
      terms: {
        'agent.id': string[];
      };
    }
  | {
      match_phrase: {
        'agent.id': string;
      };
    }
  | {
      match_none: Record<string, never>;
    };

export const buildENSScopeAgentQueryFilter = (
  agents: ENSAgentScope[],
  requestedAgentId?: string
): ENSScopeAgentQueryFilter => {
  const agentIds = Array.from(
    new Set(
      agents
        .map(agent =>
          normalizeAgentId(agent.id)
        )
        .filter(Boolean)
    )
  );

  if (requestedAgentId !== undefined) {
    const normalizedRequestedAgentId =
      normalizeAgentId(requestedAgentId);

    // In a machine's view, if the manager is in the scope its facts are also fetched: manager-only controls belong to the organisation and show with its row's result. The engine decides which row judges each control; here only missing data is avoided.
    if (
      normalizedRequestedAgentId &&
      !isManagerAgentId(normalizedRequestedAgentId) &&
      agentIds.includes(
        normalizedRequestedAgentId
      ) &&
      agentIds.includes(ENS_MANAGER_AGENT_ID)
    ) {
      return {
        terms: {
          'agent.id': [
            normalizedRequestedAgentId,
            ENS_MANAGER_AGENT_ID,
          ],
        },
      };
    }

    if (
      normalizedRequestedAgentId &&
      agentIds.includes(
        normalizedRequestedAgentId
      )
    ) {
      return {
        match_phrase: {
          'agent.id':
            normalizedRequestedAgentId,
        },
      };
    }

    return {
      match_none: {},
    };
  }

  if (agentIds.length === 0) {
    return {
      match_none: {},
    };
  }

  return {
    terms: {
      'agent.id': agentIds,
    },
  };
};

export const resolveAgentsByConfigurationScope = (
  agents: ENSAgentScope[],
  scope: ENSConfigurationScope
): ENSAgentScope[] => {
  if (scope.mode === 'global') {
    return [...agents];
  }

  if (scope.mode === 'agent') {
    const configuredAgentIds = new Set(
      scope.agentIds.map(normalizeAgentId)
    );

    return agents.filter(agent =>
      configuredAgentIds.has(
        normalizeAgentId(agent.id)
      )
    );
  }

  const configuredGroups = new Set(
    scope.groupIds.map(normalizeGroup)
  );

  return agents.filter(agent =>
    agent.groups.some(group =>
      configuredGroups.has(
        normalizeGroup(group)
      )
    )
  );
};
