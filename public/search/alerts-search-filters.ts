
interface AlertsSearchBuilders<P, T> {
  buildQuery: (indexPattern: P) => unknown;
  buildTimeFilter: (indexPattern: P, timeRange: T) => unknown;
}

interface AlertsSearchFilters {
  filters: unknown[];
  queryError?: string;
}

const UNSUPPORTED_LANGUAGE = 'Esta vista solo admite consultas DQL o Lucene';

export const buildAlertsSearchFilters = <P, F, T>(
  { indexPattern, filters, timeRange }: { indexPattern?: P; filters: F[]; timeRange: T },
  { buildQuery, buildTimeFilter }: AlertsSearchBuilders<P, T>
): AlertsSearchFilters => {
  if (!indexPattern) return { filters: [] };

  let queryError: string;
  try {
    const dsl = buildQuery(indexPattern) as { bool?: unknown } | undefined;
    if (dsl && dsl.bool) return { filters: [dsl] };
    queryError = UNSUPPORTED_LANGUAGE;
  } catch (failure) {
    queryError = String((failure as Error)?.message || failure);
  }

  return {
    filters: [...filters, buildTimeFilter(indexPattern, timeRange)].filter(Boolean),
    queryError,
  };
};
