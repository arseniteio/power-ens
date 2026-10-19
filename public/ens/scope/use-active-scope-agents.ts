import { useMemo } from 'react';
import { getActiveENSScopeAgents } from '../../../common/ens/core/scope/runtime';
import type { ENSAgentScope } from '../../../common/ens/core/scope/types';

// The repository returns copies. The identity of this list changes only when its content does, so paging or refreshing does not invalidate the engine calculations.
export const useActiveENSScopeAgents = (): ENSAgentScope[] => {
  const key = JSON.stringify(getActiveENSScopeAgents());
  return useMemo(() => JSON.parse(key), [key]);
};
