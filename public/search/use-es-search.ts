// Búsqueda de las pantallas ENS sobre el servicio de búsqueda del dashboard,
// como el usuario que mira. Mismo nombre y forma que el `useEsSearch` de Wazuh
// al que sustituye, para no tocar las pantallas. Una diferencia buscada: este
// vuelve a buscar cuando cambian los filtros de la pantalla (el de Wazuh no).
//
// Mientras llega la respuesta nueva se sigue mostrando la anterior. Si solo
// sube el `refreshKey` y la misma búsqueda sigue en curso, se espera a esa; si
// cambian los datos pedidos, la búsqueda vieja se cancela (ver
// `search-decision.ts`).
import { useEffect, useRef, useState } from 'react';
import { getCore, getData } from '../services';
import { ENSRequestTimeoutError, withRequestTimeout } from '../../common/platform/request-timeout';
import { buildENSSearchRequest, ENSSearchParams } from './search-request';
import { decideSearch, isOwnCancellation, searchDataKey, shouldToast } from './search-decision';

// Compartido por todas las búsquedas de la página: un aviso por mensaje y minuto.
const avisosDados = new Map<string, number>();

interface BusquedaEnCurso {
  clave: string;
  controlador: AbortController;
}

export const useEsSearch = (params: ENSSearchParams & { refreshKey?: number }) => {
  const [esResults, setEsResults] = useState<any>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>();
  // Se avisa al pasar de bien a error, no en cada refresco que vuelve a fallar.
  const fallaba = useRef(false);
  const enCurso = useRef<BusquedaEnCurso | undefined>();
  const clave = JSON.stringify(params);
  const claveDatos = searchDataKey(params as Record<string, unknown>);

  useEffect(() => {
    const decision = decideSearch(enCurso.current?.clave, claveDatos);
    if (decision === 'skip') return;
    if (decision === 'abort-and-start') enCurso.current?.controlador.abort();

    const busqueda: BusquedaEnCurso = { clave: claveDatos, controlador: new AbortController() };
    enCurso.current = busqueda;
    const vigente = () => enCurso.current === busqueda;
    setIsLoading(true);

    withRequestTimeout(
      signal => getData().search.search(
        { params: buildENSSearchRequest(params) },
        { abortSignal: signal }
      ).toPromise(),
      'eventos ENS',
      busqueda.controlador
    )
      .then((respuesta: any) => {
        if (!vigente()) return;
        setEsResults(respuesta?.rawResponse ?? {});
        setError(undefined);
        fallaba.current = false;
      })
      .catch((fallo: any) => {
        if (!vigente() || (!(fallo instanceof ENSRequestTimeoutError) && isOwnCancellation(busqueda.controlador.signal))) return;
        setError(fallo);
        if (fallaba.current) return;
        fallaba.current = true;
        const texto = String(fallo?.message || fallo);
        if (!shouldToast(avisosDados, texto, Date.now())) return;
        getCore().notifications.toasts.addDanger({
          title: 'ENSFácil: no se pudo consultar el índice',
          text: texto,
        });
      })
      .finally(() => {
        if (!vigente()) return;
        enCurso.current = undefined;
        setIsLoading(false);
      });
    // `clave` resume todos los parámetros, `refreshKey` incluido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Al desmontar, la búsqueda en curso ya no la va a mirar nadie.
  useEffect(
    () => () => {
      enCurso.current?.controlador.abort();
      enCurso.current = undefined;
    },
    []
  );

  return { esResults, isLoading, error };
};
