// Fixed filters of the raw fact views (the requirement panel and Eventos): the OSCompliance facts of the scope machines.
import { buildENSScopeAgentQueryFilter } from '../../common/ens/core/scope';
import type { ENSAgentScope } from '../../common/ens/core/scope/types';

const buildRawFactsAgentFilter = (agents: ENSAgentScope[], agentId?: string): unknown => {
  if (agentId === undefined) return buildENSScopeAgentQueryFilter(agents);
  const id = agentId.trim();
  return id && agents.some(a => a.id.trim() === id) ? { match_phrase: { 'agent.id': id } } : { match_none: {} };
};

// Deterministic: the same agents and machine give the same JSON, so `useEsSearch` does not search on every render.
export const buildRawFactsFilters = (agents: ENSAgentScope[], agentId?: string): unknown[] => [
  { match_phrase: { 'rule.groups': 'oscompliance' } },
  buildRawFactsAgentFilter(agents, agentId),
];
