import { useMemo } from 'react';
import { getActiveENSScopeAgents } from './runtime';
import type { ENSAgentScope } from './types';

// El repositorio devuelve copias. La identidad de esta lista solo cambia si
// cambia su contenido: paginar o refrescar no invalida los cálculos del motor.
export const useActiveENSScopeAgents = (): ENSAgentScope[] => {
  const key = JSON.stringify(getActiveENSScopeAgents());
  return useMemo(() => JSON.parse(key), [key]);
};
