// El cuerpo de cada consulta de las pantallas ENS contra los hechos. Mismo
// contenido que la búsqueda de Wazuh que sustituye: los filtros de la
// pantalla, el tope, el orden y las agregaciones.
import { ENS_ALERTS_INDEX } from '../../common/constants';

export interface ENSSearchParams {
  preAppliedFilters?: unknown[];
  preAppliedAggs?: Record<string, unknown>;
  size?: number;
  from?: number;
  sorting?: unknown[];
}

// Los filtros llegan como DSL suelto ({ range }, { bool }…) o como filtros de
// la barra ({ meta, query }): de estos cuenta su `query`, se saltan los
// desactivados y los negados van a must_not.
const clausula = (filtro: any): { incluir?: unknown; excluir?: unknown } => {
  if (!filtro) return {};
  if (filtro.meta) {
    if (filtro.meta.disabled) return {};
    const consulta = filtro.query ?? filtro;
    return filtro.meta.negate ? { excluir: consulta } : { incluir: consulta };
  }
  return { incluir: filtro };
};

export const buildENSSearchRequest = ({
  preAppliedFilters = [],
  preAppliedAggs,
  size = 10,
  from = 0,
  sorting = [],
}: ENSSearchParams) => {
  const clausulas = preAppliedFilters.map(clausula);
  const filter = clausulas.map(c => c.incluir).filter(Boolean);
  const mustNot = clausulas.map(c => c.excluir).filter(Boolean);

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
