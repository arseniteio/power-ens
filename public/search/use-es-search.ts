// Búsqueda de las pantallas ENS sobre el servicio de búsqueda del dashboard,
// como el usuario que mira. Mismo nombre y forma que el `useEsSearch` de Wazuh
// al que sustituye, para no tocar las pantallas. Una diferencia buscada: este
// vuelve a buscar cuando cambian los filtros de la pantalla (el de Wazuh no).
import { useEffect, useRef, useState } from 'react';
import { getCore, getData } from '../services';
import { buildENSSearchRequest, ENSSearchParams } from './search-request';

export const useEsSearch = (params: ENSSearchParams & { refreshKey?: number }) => {
  const [esResults, setEsResults] = useState<any>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>();
  // Se avisa al pasar de bien a error, no en cada refresco que vuelve a fallar.
  const fallaba = useRef(false);
  const clave = JSON.stringify(params);

  useEffect(() => {
    let vigente = true;
    setIsLoading(true);

    getData()
      .search.search({ params: buildENSSearchRequest(params) })
      .toPromise()
      .then((respuesta: any) => {
        if (!vigente) return;
        setEsResults(respuesta?.rawResponse ?? {});
        setError(undefined);
        fallaba.current = false;
      })
      .catch((fallo: any) => {
        if (!vigente) return;
        setError(fallo);
        if (fallaba.current) return;
        fallaba.current = true;
        getCore().notifications.toasts.addDanger({
          title: 'ENSFácil: no se pudo consultar el índice',
          text: String(fallo?.message || fallo),
        });
      })
      .finally(() => {
        if (vigente) setIsLoading(false);
      });

    return () => {
      vigente = false;
    };
    // `clave` resume todos los parámetros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return { esResults, isLoading, error };
};
