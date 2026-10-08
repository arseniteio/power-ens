// La barra de búsqueda y las fechas del propio dashboard sobre el patrón
// `wazuh-alerts-*`, los filtros que de ella salen para `useEsSearch` y el
// marco que la pinta con sus avisos. La usan las pestañas Controles y Eventos.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { EuiButton, EuiCallOut, EuiSpacer } from '@elastic/eui';
// Del plugin data, solo tipos: lo de ejecución sale de su contrato de
// arranque (`getData()`). Un import de valor de `src/plugins/data/public`
// mete una copia entera del plugin data en el nuestro.
import type { Filter, IndexPattern, Query, TimeRange } from '../../../../src/plugins/data/public';
import { ENSFACIL_PLUGIN_ID, ENS_ALERTS_INDEX } from '../../common/constants';
import { LoadingSpinner } from '../platform/loading-spinner';
import { getData, getNavigation } from '../services';
import { findIndexPatternByTitle, IndexPatternLookup } from './alerts-index-pattern';
import { buildAlertsSearchFilters } from './alerts-search-filters';

export interface AlertsSearchBar {
  searchBar: React.ReactNode;
  // Para `useEsSearch`: la consulta, los filtros y las fechas de la barra.
  filters: unknown[];
  // Para el `refreshKey` de `useEsSearch`: sube con «Actualizar» y con el
  // refresco automático. Con un rango absoluto los filtros recalculados
  // tienen el mismo JSON y, sin él, no se volvería a buscar.
  refreshKey: number;
  // Ya se sabe si el patrón está, no está o no se pudo leer.
  ready: boolean;
  // Se pudo leer la lista de patrones y no está.
  missingIndexPattern: boolean;
  // No se pudo leer (permisos, red): la causa. No es «no existe».
  patternError?: string;
  // Por qué no se ha aplicado la consulta de la barra (DQL mal escrita, PPL,
  // SQL): mientras dure, se busca sin ella, con los filtros y las fechas.
  queryError?: string;
  // Vuelve a buscar el patrón (tras un `patternError`).
  retry: () => void;
}

export const useAlertsSearchBar = (): AlertsSearchBar => {
  const data = getData();
  const [busqueda, setBusqueda] = useState<IndexPatternLookup<IndexPattern> | undefined>();
  const [intento, setIntento] = useState(0);
  // Con `useDefaultBehaviors` la barra guarda la consulta, los filtros y las
  // fechas en los servicios del dashboard: de ahí se leen y se escuchan.
  const [query, setQuery] = useState<Query>(() => data.query.queryString.getQuery());
  const [filtros, setFiltros] = useState<Filter[]>(() => data.query.filterManager.getFilters());
  const [rango, setRango] = useState<TimeRange>(() => data.query.timefilter.timefilter.getTime());
  // «Actualizar» sin cambios y el refresco automático: vuelven a resolver un
  // rango relativo contra la hora de ahora y, con ello, a buscar.
  const [pasada, setPasada] = useState(0);
  const indexPattern = busqueda?.indexPattern;

  useEffect(() => {
    let vigente = true;
    setBusqueda(undefined);
    findIndexPatternByTitle(data.indexPatterns, ENS_ALERTS_INDEX).then(resultado => {
      if (vigente) setBusqueda(resultado);
    });
    return () => {
      vigente = false;
    };
  }, [data, intento]);

  useEffect(() => {
    const { filterManager, queryString } = data.query;
    const { timefilter } = data.query.timefilter;
    const suscripciones = [
      filterManager.getUpdates$().subscribe(() => setFiltros(filterManager.getFilters())),
      queryString.getUpdates$().subscribe((q: Query) => setQuery(q)),
      timefilter.getTimeUpdate$().subscribe(() => setRango(timefilter.getTime())),
      timefilter.getAutoRefreshFetch$().subscribe(() => setPasada(n => n + 1)),
    ];
    return () => suscripciones.forEach(s => s.unsubscribe());
  }, [data]);

  // Memorizado sobre lo guardado en el estado, nunca recalculado en cada
  // render: con un rango relativo el filtro de fechas lleva la hora de ahora,
  // y un filtro nuevo en cada render haría que cada búsqueda provocara otra.
  // `getOpenSearchQuery` lee la consulta, los filtros y las fechas de los
  // mismos servicios que este estado escucha: `query`, `filtros` y `rango`
  // están en las dependencias para recalcular cuando cambian.
  const { filters, queryError } = useMemo(
    () =>
      buildAlertsSearchFilters(
        { indexPattern, filters: filtros, timeRange: rango },
        {
          buildQuery: (patron: IndexPattern) => data.query.getOpenSearchQuery(patron),
          buildTimeFilter: (patron: IndexPattern, intervalo: TimeRange) =>
            data.query.timefilter.timefilter.createFilter(patron, intervalo),
        }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, indexPattern, query, filtros, rango, pasada]
  );

  // Las props de la barra, estables entre renders.
  const patrones = useMemo(() => (indexPattern ? [indexPattern] : []), [indexPattern]);
  const alEnviar = useCallback((_cambio: unknown, esCambio?: boolean) => {
    // La barra avisa con `true` de cada cambio, que ya llega por los
    // servicios, y con `false` de «Actualizar» sin cambios.
    if (esCambio === false) setPasada(n => n + 1);
  }, []);
  const retry = useCallback(() => setIntento(n => n + 1), []);

  const { TopNavMenu } = getNavigation().ui;
  const searchBar = indexPattern ? (
    <TopNavMenu
      appName={ENSFACIL_PLUGIN_ID}
      showSearchBar
      useDefaultBehaviors
      indexPatterns={patrones}
      onQuerySubmit={alEnviar}
    />
  ) : null;

  return {
    searchBar,
    filters,
    refreshKey: pasada,
    ready: busqueda !== undefined,
    missingIndexPattern: busqueda !== undefined && !busqueda.indexPattern && !busqueda.error,
    patternError: busqueda?.error,
    queryError,
    retry,
  };
};

// La barra con sus avisos y, debajo, la vista. La vista (`children`) solo se
// monta con el patrón encontrado: así su primera búsqueda ya lleva las fechas
// de la barra y no recorre todo el índice. Los avisos duran lo que dura la
// causa, no un toast que se va.
export const AlertsSearchFrame = ({ barra, children }: { barra: AlertsSearchBar; children: React.ReactNode }) => {
  if (!barra.ready) {
    return <LoadingSpinner message={`Buscando el patrón de índice ${ENS_ALERTS_INDEX}…`} />;
  }

  if (barra.patternError) {
    return (
      <EuiCallOut
        color="danger"
        iconType="alert"
        title={`No se pudo leer el patrón de índice ${ENS_ALERTS_INDEX}: esta vista no puede buscar`}
      >
        <p>{barra.patternError}</p>
        <EuiButton size="s" color="danger" onClick={barra.retry}>
          Reintentar
        </EuiButton>
      </EuiCallOut>
    );
  }

  if (barra.missingIndexPattern) {
    return (
      <EuiCallOut
        color="warning"
        iconType="alert"
        title={`No existe el patrón de índice ${ENS_ALERTS_INDEX}: créalo desde Wazuh (o Dashboards Management) para usar esta vista`}
      />
    );
  }

  return (
    <>
      {barra.searchBar}
      <EuiSpacer size="m" />
      {barra.queryError && (
        <>
          <EuiCallOut
            color="warning"
            iconType="alert"
            title="No se ha aplicado la consulta de la barra: se busca solo con sus filtros y sus fechas"
          >
            <p>{barra.queryError}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}
      {children}
    </>
  );
};
