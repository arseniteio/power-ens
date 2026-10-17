import type { ENSConfigurationScope } from '../../configuration/types';
import { ENSCatalog } from '../../catalog';
import { resolveAgentsByConfigurationScope } from './engine';
import {
  applyManagerPlaneToScope,
  isManagerPlaneActive,
} from './measurement-planes';
import { ENSAgentScope } from './types';

export type ENSScopeHydrationStatus = 'NOT_STARTED' | 'LOADING' | 'READY' | 'ERROR';

export interface ENSScopeHydrationState {
  status: ENSScopeHydrationStatus;
  scopeKey: string | null;
  inventoryCount: number;
  resolvedCount: number;
  error?: string;
}

export type ENSAgentInventoryLoader = () => Promise<ENSAgentScope[]>;

let activeScopeAgents: ENSAgentScope[] = [];

let hydrationState: ENSScopeHydrationState = {
  status: 'NOT_STARTED',
  scopeKey: null,
  inventoryCount: 0,
  resolvedCount: 0,
};

let hydrationPromise: Promise<ENSAgentScope[]> | null = null;

let hydrationPromiseScopeKey: string | null = null;

const cloneAgent = (agent: ENSAgentScope): ENSAgentScope => ({
  ...agent,
  groups: [...agent.groups],
});

// Los agentes del alcance: los que resuelve el modo configurado (global, grupo
// o agente) y, si algún control ACTIVE se mide en el manager, el manager, que
// no está en ningún grupo y ningún modo trae por sí solo. El catálogo es un
// parámetro para poder probarlo con controles en otro estado.
export const resolveENSScopeAgents = (
  inventory: ENSAgentScope[],
  scope: ENSConfigurationScope,
  catalog: Parameters<typeof isManagerPlaneActive>[0] = ENSCatalog
): ENSAgentScope[] =>
  applyManagerPlaneToScope(
    resolveAgentsByConfigurationScope(inventory, scope),
    inventory,
    isManagerPlaneActive(catalog)
  );

const cloneAgents = (agents: ENSAgentScope[]): ENSAgentScope[] => agents.map(cloneAgent);

const getScopeKey = (scope: ENSConfigurationScope): string =>
  JSON.stringify({
    mode: scope.mode,
    agentIds: scope.agentIds
      .map((agentId) => agentId.trim())
      .filter(Boolean)
      .sort(),
    groupIds: scope.groupIds
      .map((groupId) => groupId.trim().toLowerCase())
      .filter(Boolean)
      .sort(),
  });

const resolveHydrationError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return 'No se pudo resolver el alcance ENS.';
};

const normalizeInventory = (agents: ENSAgentScope[]): ENSAgentScope[] =>
  agents
    .filter((agent) => typeof agent?.id === 'string' && agent.id.trim().length > 0)
    .map((agent) => ({
      id: agent.id.trim(),
      name: typeof agent.name === 'string' && agent.name.trim() ? agent.name.trim() : undefined,
      groups: Array.isArray(agent.groups)
        ? agent.groups
            .filter((group) => typeof group === 'string' && group.trim().length > 0)
            .map((group) => group.trim())
        : [],
      // El estado (de wazuh-monitoring) solo si lo trae: lo pinta el selector.
      ...(typeof agent.status === 'string' && agent.status.trim()
        ? { status: agent.status.trim() }
        : {}),
    }));

export const getActiveENSScopeAgents = (): ENSAgentScope[] => cloneAgents(activeScopeAgents);

export const getENSScopeHydrationState = (): ENSScopeHydrationState => ({
  ...hydrationState,
});

export const hydrateENSScope = (
  scope: ENSConfigurationScope,
  loadInventory: ENSAgentInventoryLoader,
  force: boolean = false
): Promise<ENSAgentScope[]> => {
  const scopeKey = getScopeKey(scope);

  if (hydrationPromise) {
    if (hydrationPromiseScopeKey === scopeKey) {
      return hydrationPromise;
    }

    return hydrationPromise
      .catch(() => [])
      .then(() => hydrateENSScope(scope, loadInventory, force));
  }

  if (!force && hydrationState.status === 'READY' && hydrationState.scopeKey === scopeKey) {
    return Promise.resolve(getActiveENSScopeAgents());
  }

  hydrationPromiseScopeKey = scopeKey;

  hydrationState = {
    status: 'LOADING',
    scopeKey,
    inventoryCount: 0,
    resolvedCount: 0,
  };

  hydrationPromise = (async () => {
    try {
      const loadedInventory = await loadInventory();

      if (!Array.isArray(loadedInventory)) {
        throw new Error('El inventario ENS no es una lista válida.');
      }

      const inventory = normalizeInventory(loadedInventory);

      const resolvedAgents = resolveENSScopeAgents(inventory, scope);

      activeScopeAgents = cloneAgents(resolvedAgents);

      hydrationState = {
        status: 'READY',
        scopeKey,
        inventoryCount: inventory.length,
        resolvedCount: activeScopeAgents.length,
      };

      return getActiveENSScopeAgents();
    } catch (error) {
      activeScopeAgents = [];

      hydrationState = {
        status: 'ERROR',
        scopeKey,
        inventoryCount: 0,
        resolvedCount: 0,
        error: resolveHydrationError(error),
      };

      throw error;
    } finally {
      hydrationPromise = null;
      hydrationPromiseScopeKey = null;
    }
  })();

  return hydrationPromise;
};

export const retryENSScopeHydration = (
  scope: ENSConfigurationScope,
  loadInventory: ENSAgentInventoryLoader
): Promise<ENSAgentScope[]> => hydrateENSScope(scope, loadInventory, true);
