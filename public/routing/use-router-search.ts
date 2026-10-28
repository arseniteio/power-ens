// App URL parameters (`tabView`, `control`, `agentId`); replaces Wazuh's `useRouterSearch` with the same result.
import { useCallback } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { parseRouterSearch, withRouterSearch } from './router-search';

export const useRouterSearch = (): Record<string, string> => parseRouterSearch(useLocation().search);

export const useSetRouterSearch = () => {
  const history = useHistory();
  const location = useLocation();

  return useCallback(
    (changes: Record<string, string | undefined>) =>
      history.push({ search: withRouterSearch(location.search, changes) }),
    [history, location.search]
  );
};
