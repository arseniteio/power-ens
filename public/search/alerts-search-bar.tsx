// The dashboard search bar and dates over the `wazuh-alerts-*` pattern, the filters it yields for `useEsSearch`, and the frame that draws it with its notices. Used by the Controles and Eventos tabs.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { EuiButton, EuiCallOut, EuiSpacer } from '@elastic/eui';
// Types only from the data plugin: runtime pieces come from its start contract (`getData()`); a value import of `src/plugins/data/public` would bundle a whole copy of the plugin.
import type { Filter, IndexPattern, Query, TimeRange } from '../../../../src/plugins/data/public';
import { POWER_ENS_PLUGIN_ID, ENS_ALERTS_INDEX } from '../../common/constants';
import { LoadingSpinner } from '../platform/loading-spinner';
import { getData, getNavigation } from '../services';
import { findIndexPatternByTitle, IndexPatternLookup } from './alerts-index-pattern';
import { buildAlertsSearchFilters } from './alerts-search-filters';

interface AlertsSearchBar {
  searchBar: React.ReactNode;
  filters: unknown[];
  // For the `refreshKey` of `useEsSearch`: it rises on 'Actualizar' and on auto-refresh. With an absolute range the recomputed filters have the same JSON, so without it no new search would run.
  refreshKey: number;
  ready: boolean;
  missingIndexPattern: boolean;
  patternError?: string;
  queryError?: string;
  retry: () => void;
}

export const useAlertsSearchBar = (): AlertsSearchBar => {
  const data = getData();
  const [search, setSearch] = useState<IndexPatternLookup<IndexPattern> | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState<Query>(() => data.query.queryString.getQuery());
  const [filterList, setFilters] = useState<Filter[]>(() => data.query.filterManager.getFilters());
  const [range, setRange] = useState<TimeRange>(() => data.query.timefilter.timefilter.getTime());
  const [run, setRun] = useState(0);
  const indexPattern = search?.indexPattern;

  useEffect(() => {
    let valid = true;
    setSearch(undefined);
    findIndexPatternByTitle(data.indexPatterns, ENS_ALERTS_INDEX).then(result => {
      if (valid) setSearch(result);
    });
    return () => {
      valid = false;
    };
  }, [data, attempt]);

  useEffect(() => {
    const { filterManager, queryString } = data.query;
    const { timefilter } = data.query.timefilter;
    const subscriptions = [
      filterManager.getUpdates$().subscribe(() => setFilters(filterManager.getFilters())),
      queryString.getUpdates$().subscribe((q: Query) => setQuery(q)),
      timefilter.getTimeUpdate$().subscribe(() => setRange(timefilter.getTime())),
      timefilter.getAutoRefreshFetch$().subscribe(() => setRun(n => n + 1)),
    ];
    return () => subscriptions.forEach(s => s.unsubscribe());
  }, [data]);

  // Memoised on the stored state, never recomputed per render: with a relative range the date filter carries the current time, and a new filter per render would make every search trigger another.
  const { filters, queryError } = useMemo(
    () =>
      buildAlertsSearchFilters(
        { indexPattern, filters: filterList, timeRange: range },
        {
          buildQuery: (pattern: IndexPattern) => data.query.getOpenSearchQuery(pattern),
          buildTimeFilter: (pattern: IndexPattern, interval: TimeRange) =>
            data.query.timefilter.timefilter.createFilter(pattern, interval),
        }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, indexPattern, query, filterList, range, run]
  );

  const patterns = useMemo(() => (indexPattern ? [indexPattern] : []), [indexPattern]);
  const onSubmit = useCallback((_change: unknown, isChange?: boolean) => {
    if (isChange === false) setRun(n => n + 1);
  }, []);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  const { TopNavMenu } = getNavigation().ui;
  const searchBar = indexPattern ? (
    <TopNavMenu
      appName={POWER_ENS_PLUGIN_ID}
      showSearchBar
      useDefaultBehaviors
      indexPatterns={patterns}
      onQuerySubmit={onSubmit}
    />
  ) : null;

  return {
    searchBar,
    filters,
    refreshKey: run,
    ready: search !== undefined,
    missingIndexPattern: search !== undefined && !search.indexPattern && !search.error,
    patternError: search?.error,
    queryError,
    retry,
  };
};

// The bar with its notices and, below, the view. The view (`children`) mounts only with the pattern found, so its first search already carries the bar dates. The notices last as long as their cause.
export const AlertsSearchFrame = ({ barra: bar, children }: { barra: AlertsSearchBar; children: React.ReactNode }) => {
  if (!bar.ready) {
    return <LoadingSpinner message={`Buscando el patrón de índice ${ENS_ALERTS_INDEX}…`} />;
  }

  if (bar.patternError) {
    return (
      <EuiCallOut
        color="danger"
        iconType="alert"
        title={`No se pudo leer el patrón de índice ${ENS_ALERTS_INDEX}: esta vista no puede buscar`}
      >
        <p>{bar.patternError}</p>
        <EuiButton size="s" color="danger" onClick={bar.retry}>
          Reintentar
        </EuiButton>
      </EuiCallOut>
    );
  }

  if (bar.missingIndexPattern) {
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
      {bar.searchBar}
      <EuiSpacer size="m" />
      {bar.queryError && (
        <>
          <EuiCallOut
            color="warning"
            iconType="alert"
            title="No se ha aplicado la consulta de la barra: se busca solo con sus filtros y sus fechas"
          >
            <p>{bar.queryError}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}
      {children}
    </>
  );
};
