// Parámetros de la URL de la app (`tabView`, `control`, `agentId`). Sustituye
// al `useRouterSearch` de Wazuh con el mismo resultado: un objeto con los
// parámetros de la consulta.
import { useCallback } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { parseRouterSearch, withRouterSearch } from './router-search';

export { parseRouterSearch, withRouterSearch };

export const useRouterSearch = (): Record<string, string> => parseRouterSearch(useLocation().search);

export const useSetRouterSearch = () => {
  const history = useHistory();
  const location = useLocation();

  return useCallback(
    (cambios: Record<string, string | undefined>) =>
      history.push({ search: withRouterSearch(location.search, cambios) }),
    [history, location.search]
  );
};
