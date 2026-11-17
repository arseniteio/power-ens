import { useCallback } from 'react';
import { ENS_CONTROL_DETAIL_TAB_ID } from '../app/tabs';
import { useRouterSearch, useSetRouterSearch } from '../routing/use-router-search';

export const useOpenControl = () => {
  const { agentId } = useRouterSearch();
  const updateUrl = useSetRouterSearch();
  return useCallback((controlId: string) => updateUrl({ tabView: ENS_CONTROL_DETAIL_TAB_ID, control: controlId, agentId }), [updateUrl, agentId]);
};
