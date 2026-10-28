// Fixed filters of the raw fact views (Controles with its requirement panel, and Eventos): only ENS facts of the scope machines. No React: tested in tests/events-columns.test.ts.
import { buildENSScopeAgentQueryFilter } from '../../common/ens/core/scope';
import type { ENSAgentScope } from '../../common/ens/core/scope/types';

const buildRawFactsAgentFilter = (agents: ENSAgentScope[], agentId?: string): unknown => {
  if (agentId === undefined) return buildENSScopeAgentQueryFilter(agents);
  const id = agentId.trim();
  return id && agents.some(a => a.id.trim() === id) ? { match_phrase: { 'agent.id': id } } : { match_none: {} };
};

// Deterministic: the same agents and machine give the same JSON, so `useEsSearch` does not search on every render.
export const buildRawFactsFilters = (agents: ENSAgentScope[], agentId?: string): unknown[] => [
  { match_phrase: { 'rule.groups': 'power_ens' } },
  buildRawFactsAgentFilter(agents, agentId),
];
