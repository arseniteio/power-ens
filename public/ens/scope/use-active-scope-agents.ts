import { useMemo } from 'react';
import { getActiveENSScopeAgents } from '../../../common/ens/core/scope/runtime';
import type { ENSAgentScope } from '../../../common/ens/core/scope/types';

export const useActiveENSScopeAgents = (): ENSAgentScope[] => {
  const key = JSON.stringify(getActiveENSScopeAgents());
  return useMemo(() => JSON.parse(key), [key]);
};
