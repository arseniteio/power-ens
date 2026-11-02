import { useEffect, useRef, useState } from 'react';
import { getCore, getData } from '../services';
import { ENSRequestTimeoutError, withRequestTimeout } from '../../common/platform/request-timeout';
import { buildENSSearchRequest, ENSSearchParams } from './search-request';
import { decideSearch, isOwnCancellation, searchDataKey, shouldToast } from './search-decision';

const givenNotices = new Map<string, number>();

interface PendingSearch {
  clave: string;
  controlador: AbortController;
}

export const useEsSearch = (params: ENSSearchParams & { refreshKey?: number }) => {
  const [esResults, setEsResults] = useState<any>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>();
  const hadFailed = useRef(false);
  const inProgress = useRef<PendingSearch | undefined>();
  const key = JSON.stringify(params);
  const dataKey = searchDataKey(params as Record<string, unknown>);

  useEffect(() => {
    const decision = decideSearch(inProgress.current?.clave, dataKey);
    if (decision === 'skip') return;
    if (decision === 'abort-and-start') inProgress.current?.controlador.abort();

    const search: PendingSearch = { clave: dataKey, controlador: new AbortController() };
    inProgress.current = search;
    const valid = () => inProgress.current === search;
    setIsLoading(true);

    withRequestTimeout(
      signal => getData().search.search(
        { params: buildENSSearchRequest(params) },
        { abortSignal: signal }
      ).toPromise(),
      'eventos ENS',
      search.controlador
    )
      .then((response: any) => {
        if (!valid()) return;
        setEsResults(response?.rawResponse ?? {});
        setError(undefined);
        hadFailed.current = false;
      })
      .catch((failure: any) => {
        if (!valid() || (!(failure instanceof ENSRequestTimeoutError) && isOwnCancellation(search.controlador.signal))) return;
        setError(failure);
        if (hadFailed.current) return;
        hadFailed.current = true;
        const text = String(failure?.message || failure);
        if (!shouldToast(givenNotices, text, Date.now())) return;
        getCore().notifications.toasts.addDanger({
          title: 'Power ENS: no se pudo consultar el índice',
          text: text,
        });
      })
      .finally(() => {
        if (!valid()) return;
        inProgress.current = undefined;
        setIsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(
    () => () => {
      inProgress.current?.controlador.abort();
      inProgress.current = undefined;
    },
    []
  );

  return { esResults, isLoading, error };
};
