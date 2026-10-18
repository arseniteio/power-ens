import { useEffect, useState } from 'react';

import { loadENSAgentInventory } from '../../../agents/agent-inventory';
import {
  ENSAgentPlatformFacts,
  loadAgentPlatformFacts,
} from '../../../agents/agent-platform-facts';
import { getActiveENSScopeAgents } from '../../core/scope/runtime';
import type { ENSAgentScope } from '../../core/scope/types';

export interface ENSSystemsData {
  // Los agentes del alcance (con el manager si algún control se mide en él).
  scopeAgents: ENSAgentScope[];
  // El inventario entero: la migración reconoce también a las máquinas fuera
  // del alcance que la configuración nombra.
  inventory: ENSAgentScope[];
  facts: Record<string, ENSAgentPlatformFacts>;
  loading: boolean;
  // Lo que no se pudo leer. La pantalla sigue con lo que hay: sin hechos, el
  // tipo sale solo del inventario (un LDAP se ve como Linux) y se corrige a mano.
  errors: string[];
}

const reason = (error: unknown): string =>
  error instanceof Error && error.message.trim() ? error.message.trim() : String(error || 'error desconocido');

// Una sola vez al entrar en «Sistemas»: el inventario (una agregación) y los
// hechos que delatan el tipo (otra agregación, 30 días, sin documentos).
export const useSystemsData = (): ENSSystemsData => {
  const [data, setData] = useState<ENSSystemsData>(() => ({
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
      if (facts.error) errors.push(`Hechos para detectar el tipo de sistema: ${facts.error}`);
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
