// Filtros fijos de las vistas de hechos crudos («Controles» con su panel de
// requisito, y «Eventos»): solo hechos ENS de las máquinas del alcance. Sin
// React: lo prueba tests/events-columns.test.ts.
import { buildENSScopeAgentQueryFilter } from '../../common/ens/core/scope';
import type { ENSAgentScope } from '../../common/ens/core/scope/types';

// Con una máquina elegida, solo los hechos de ESA máquina, como el agente
// fijado de la versión integrada (alcance y agente: una máquina fuera del
// alcance no trae nada). El filtro del motor, en la vista de una máquina,
// añade el manager para juzgar los controles de la organización; estas vistas
// no juzgan, enseñan hechos, y los del manager no son de la máquina elegida.
export const buildRawFactsAgentFilter = (agents: ENSAgentScope[], agentId?: string): unknown => {
  if (agentId === undefined) return buildENSScopeAgentQueryFilter(agents);
  const id = agentId.trim();
  return id && agents.some(a => a.id.trim() === id) ? { match_phrase: { 'agent.id': id } } : { match_none: {} };
};

// Deterministas: los mismos agentes y la misma máquina dan el mismo JSON, y
// `useEsSearch` no vuelve a buscar en cada render.
export const buildRawFactsFilters = (agents: ENSAgentScope[], agentId?: string): unknown[] => [
  { match_phrase: { 'rule.groups': 'ensfacil' } },
  buildRawFactsAgentFilter(agents, agentId),
];
