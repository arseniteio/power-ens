import { ENS_ALERTS_INDEX } from '../../common/constants';

export interface ENSSearchParams {
  preAppliedFilters?: unknown[];
  preAppliedAggs?: Record<string, unknown>;
  size?: number;
  from?: number;
  sorting?: unknown[];
}

const clause = (filter: any): { incluir?: unknown; excluir?: unknown } => {
  if (!filter) return {};
  if (filter.meta) {
    if (filter.meta.disabled) return {};
    const { meta, $state, query, ...rest } = filter;
    const searchQuery = query ?? rest;
    return meta.negate ? { excluir: searchQuery } : { incluir: searchQuery };
  }
  return { incluir: filter };
};

export const buildENSSearchRequest = ({
  preAppliedFilters = [],
  preAppliedAggs,
  size = 10,
  from = 0,
  sorting = [],
}: ENSSearchParams) => {
  const clauses = preAppliedFilters.map(clause);
  const filter = clauses.map(c => c.incluir).filter(Boolean);
  const mustNot = clauses.map(c => c.excluir).filter(Boolean);

  return {
    index: ENS_ALERTS_INDEX,
    body: {
      size,
      from,
      track_total_hits: true,
      ...(sorting.length ? { sort: sorting } : {}),
      query: { bool: { filter, ...(mustNot.length ? { must_not: mustNot } : {}) } },
      ...(preAppliedAggs && Object.keys(preAppliedAggs).length ? { aggs: preAppliedAggs } : {}),
    },
  };
};
