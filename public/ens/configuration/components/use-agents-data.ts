import { useEffect, useState } from 'react';

import { loadENSAgentInventory } from '../../../agents/load-agent-inventory';
import {
  ENSAgentPlatformFacts,
  loadAgentPlatformFacts,
} from '../../../agents/agent-platform-facts';
import { getActiveENSScopeAgents } from '../../../../common/ens/core/scope/runtime';
import type { ENSAgentScope } from '../../../../common/ens/core/scope/types';
import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { normalizeAgentId } from '../../../../common/agent-configuration';
import {
  ENSSystemDetection,
  detectAgentSystem,
} from '../../../../common/ens/configuration/agents/system-detection';

export interface ENSAgentsData {
  // Scope agents (with the manager when a control is measured there).
  scopeAgents: ENSAgentScope[];
  // The whole inventory: the distribution by agents also recognises machines named outside the scope.
  inventory: ENSAgentScope[];
  facts: Record<string, ENSAgentPlatformFacts>;
  loading: boolean;
  // What could not be read; the screen goes on with what there is.
  errors: string[];
}

export interface ENSAgentRow {
  id: string;
  agent: ENSAgentScope;
  inScope: boolean;
  detection: ENSSystemDetection;
}

const reason = (error: unknown): string =>
  error instanceof Error && error.message.trim() ? error.message.trim() : String(error || 'error desconocido');

// Two aggregations and no documents: cheap enough to load once per tab.
export const useAgentsData = (): ENSAgentsData => {
  const [data, setData] = useState<ENSAgentsData>(() => ({
    scopeAgents: getActiveENSScopeAgents(),
    inventory: getActiveENSScopeAgents(),
    facts: {},
    loading: true,
    errors: [],
  }));

  useEffect(() => {
    let alive = true;

    const settle = <T,>(promise: Promise<T>) =>
      promise.then(
        value => ({ value, error: undefined as string | undefined }),
        error => ({ value: undefined as T | undefined, error: reason(error) })
      );

    Promise.all([settle(loadENSAgentInventory()), settle(loadAgentPlatformFacts())]).then(([inventory, facts]) => {
      if (!alive) return;
      const errors: string[] = [];
      if (inventory.error) errors.push(`Inventario de agentes: ${inventory.error}`);
      if (facts.error) errors.push(`Datos para detectar el tipo de sistema: ${facts.error}`);
      setData(previous => ({
        ...previous,
        inventory: inventory.value && inventory.value.length ? inventory.value : previous.inventory,
        facts: facts.value || {},
        loading: false,
        errors,
      }));
    });

    return () => {
      alive = false;
    };
  }, []);

  return data;
};

// Stored profiles of machines out of the scope are kept as rows, so nothing stored is hidden.
export const buildAgentRows = (configuration: ENSConfigurationVersion, data: ENSAgentsData): ENSAgentRow[] => {
  const byId = new Map<string, ENSAgentRow>();
  const fromInventory = new Map(data.inventory.map(agent => [normalizeAgentId(agent.id), agent]));

  data.scopeAgents.forEach(agent => {
    const id = normalizeAgentId(agent.id);
    const full = { ...(fromInventory.get(id) || {}), ...agent, os: agent.os || fromInventory.get(id)?.os };
    byId.set(id, { id, agent: full, inScope: true, detection: detectAgentSystem(full, data.facts[id]) });
  });

  Object.entries(configuration.agents || {}).forEach(([id, profile]) => {
    if (byId.has(id)) return;
    const agent = fromInventory.get(id) || { id, name: profile?.name, groups: [] };
    byId.set(id, { id, agent, inScope: false, detection: detectAgentSystem(agent, data.facts[id]) });
  });

  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
};

export const agentRowLabel = (row: ENSAgentRow): string => `${row.id}${row.agent.name ? ` · ${row.agent.name}` : ''}`;
