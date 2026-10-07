// La barra de búsqueda y las fechas del propio dashboard sobre el patrón
// `wazuh-alerts-*`, y los filtros que de ella salen para `useEsSearch`.
// La usan las pestañas Controles y Eventos.
import React, { useEffect, useMemo, useState } from 'react';
import { opensearchQuery } from '../../../../src/plugins/data/public';
import type { Filter, IndexPattern, Query, TimeRange } from '../../../../src/plugins/data/public';
import { ENSFACIL_PLUGIN_ID, ENS_ALERTS_INDEX } from '../../common/constants';
import { getCore, getData, getNavigation } from '../services';
import { buildAlertsSearchFilters } from './alerts-search-filters';

type DataStart = ReturnType<typeof getData>;

// El patrón se busca por su título exacto en la lista de patrones. No vale
// `indexPatterns.find('wazuh-alerts-*')`: busca con simple_query_string sobre
// el título, que es un campo `text`, y ese texto no encuentra nada (comprobado
// contra el índice del dashboard de wazuh4 el 07/10/2026).
const buscaPatron = async (data: DataStart): Promise<IndexPattern | undefined> => {
  const lista = await data.indexPatterns.getIdsWithTitle();
  const encontrado = lista.find(p => p.title === ENS_ALERTS_INDEX);

  return encontrado ? data.indexPatterns.get(encontrado.id) : undefined;
};

export const useAlertsSearchBar = () => {
  const data = getData();
  const [indexPattern, setIndexPattern] = useState<IndexPattern | undefined>();
  const [buscado, setBuscado] = useState(false);
  // Con `useDefaultBehaviors` la barra guarda la consulta, los filtros y las
  // fechas en los servicios del dashboard: de ahí se leen y se escuchan.
  const [query, setQuery] = useState<Query>(() => data.query.queryString.getQuery());
  const [filtros, setFiltros] = useState<Filter[]>(() => data.query.filterManager.getFilters());
  const [rango, setRango] = useState<TimeRange>(() => data.query.timefilter.timefilter.getTime());
  // «Actualizar» sin cambios y el refresco automático: vuelven a resolver un
  // rango relativo contra la hora de ahora y, con ello, a buscar.
  const [pasada, setPasada] = useState(0);

  useEffect(() => {
    let vigente = true;
    const { filterManager, queryString } = data.query;
    const { timefilter } = data.query.timefilter;

    buscaPatron(data)
      .then(patron => {
        if (vigente) setIndexPattern(patron);
      })
      .catch((fallo: any) => {
        if (!vigente) return;
        getCore().notifications.toasts.addDanger({
          title: `ENSFácil: no se pudo leer el patrón de índice ${ENS_ALERTS_INDEX}`,
          text: String(fallo?.message || fallo),
        });
      })
      .finally(() => {
        if (vigente) setBuscado(true);
      });

    const suscripciones = [
      filterManager.getUpdates$().subscribe(() => setFiltros(filterManager.getFilters())),
      queryString.getUpdates$().subscribe((q: Query) => setQuery(q)),
      timefilter.getTimeUpdate$().subscribe(() => setRango(timefilter.getTime())),
      timefilter.getAutoRefreshFetch$().subscribe(() => setPasada(n => n + 1)),
    ];

    return () => {
      vigente = false;
      suscripciones.forEach(s => s.unsubscribe());
    };
  }, [data]);

  // Memorizado sobre lo guardado en el estado, nunca recalculado en cada
  // render: con un rango relativo el filtro de fechas lleva la hora de ahora,
  // y un filtro nuevo en cada render haría que cada búsqueda provocara otra.
  const { filters, queryError } = useMemo(
    () =>
      buildAlertsSearchFilters(
        { indexPattern, query, filters: filtros, timeRange: rango },
        {
          buildQuery: (patron: IndexPattern, consultas: Query[], conFiltros: Filter[]) =>
            opensearchQuery.buildOpenSearchQuery(
              patron,
              consultas,
              conFiltros,
              opensearchQuery.getOpenSearchQueryConfig(getCore().uiSettings)
            ),
          buildTimeFilter: (patron: IndexPattern, intervalo: TimeRange) =>
            data.query.timefilter.timefilter.createFilter(patron, intervalo),
        }
      ),
    [data, indexPattern, query, filtros, rango, pasada]
  );

  useEffect(() => {
    if (!queryError) return;
    getCore().notifications.toasts.addWarning({
      title: 'ENSFácil: no se ha aplicado la consulta de la barra',
      text: queryError,
    });
  }, [queryError]);

  const { TopNavMenu } = getNavigation().ui;
  const searchBar = indexPattern ? (
    <TopNavMenu
      appName={ENSFACIL_PLUGIN_ID}
      showSearchBar
      useDefaultBehaviors
      indexPatterns={[indexPattern]}
      onQuerySubmit={(_cambio: unknown, esCambio?: boolean) => {
        // La barra avisa con `true` de cada cambio, que ya llega por los
        // servicios, y con `false` de «Actualizar» sin cambios.
        if (esCambio === false) setPasada(n => n + 1);
      }}
    />
  ) : null;

  return { searchBar, filters, ready: buscado, missingIndexPattern: buscado && !indexPattern };
};
