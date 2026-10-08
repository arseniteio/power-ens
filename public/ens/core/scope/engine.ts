import type { ENSConfigurationScope } from '../../configuration/types';
import {
  ENS_MANAGER_AGENT_ID,
  isManagerAgentId,
} from './measurement-planes';
import { ENSAgentScope, ENSScopeResult } from './types';

export const ENS_SCOPE_GROUP = 'ens';

const normalizeGroup = (group: string): string =>
  group.trim().toLowerCase();

const normalizeAgentId = (
  agentId: string
): string =>
  agentId.trim();

export type ENSScopeAgentQueryFilter =
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

    // En la vista de una máquina, si el manager está en el alcance, sus hechos
    // también se traen: los controles que se miden solo en el manager son de la
    // organización y se muestran con el resultado de su fila. El motor decide
    // qué fila juzga cada control; aquí solo se evita que falten los datos.
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

export const isAgentInENSScope = (
  agent: ENSAgentScope
): ENSScopeResult => {
  const normalizedGroups = agent.groups.map(normalizeGroup);
  const scopeGroup = normalizeGroup(ENS_SCOPE_GROUP);
  const inScope = normalizedGroups.includes(scopeGroup);

  const matchedGroups = agent.groups.filter(
    group => normalizeGroup(group) === scopeGroup
  );

  return {
    agentId: agent.id,
    agentName: agent.name,
    inScope,
    scopeGroup: ENS_SCOPE_GROUP,
    matchedGroups,
    reason: inScope
      ? `El agente pertenece al grupo '${ENS_SCOPE_GROUP}' y entra en el alcance ENS.`
      : `El agente no pertenece al grupo '${ENS_SCOPE_GROUP}' y queda fuera del alcance ENS.`,
  };
};

export const filterAgentsInENSScope = (
  agents: ENSAgentScope[]
): ENSAgentScope[] =>
  agents.filter(agent => isAgentInENSScope(agent).inScope);

export const getAgentScopeResults = (
  agents: ENSAgentScope[]
): ENSScopeResult[] =>
  agents.map(isAgentInENSScope);
