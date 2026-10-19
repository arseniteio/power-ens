// Filters the dashboard search bar adds to the ENS screen queries. No React or dashboard: the builders come from outside (the data plugin start contract in the app).

export interface AlertsSearchBuilders<P, T> {
  buildQuery: (indexPattern: P) => unknown;
  buildTimeFilter: (indexPattern: P, timeRange: T) => unknown;
}

export interface AlertsSearchFilters {
  filters: unknown[];
  queryError?: string;
}

const UNSUPPORTED_LANGUAGE = 'Esta vista solo admite consultas DQL o Lucene';

export const buildAlertsSearchFilters = <P, F, T>(
  { indexPattern, filters, timeRange }: { indexPattern?: P; filters: F[]; timeRange: T },
  { buildQuery, buildTimeFilter }: AlertsSearchBuilders<P, T>
): AlertsSearchFilters => {
  if (!indexPattern) return { filters: [] };

  // With a badly written query the dashboard throws, and with a language that does not translate to DSL (PPL, SQL) it returns `{ type: 'unsupported' }`. Neither may reach OpenSearch or break the view.
  let queryError: string;
  try {
    const dsl = buildQuery(indexPattern) as { bool?: unknown } | undefined;
    if (dsl && dsl.bool) return { filters: [dsl] };
    queryError = UNSUPPORTED_LANGUAGE;
  } catch (failure) {
    queryError = String((failure as Error)?.message || failure);
  }

  // Search without the query and warn: the bar filters as they are (the request strips `meta`, skips disabled ones and negates negated ones) and the dates.
  return {
    filters: [...filters, buildTimeFilter(indexPattern, timeRange)].filter(Boolean),
    queryError,
  };
};
