// Los filtros que la barra de búsqueda del dashboard añade a las consultas de
// las pantallas ENS: la consulta y los filtros de la barra en DSL, y las
// fechas. Sin React ni dashboard: los constructores llegan de fuera
// (`opensearchQuery.buildOpenSearchQuery` y el `createFilter` del timefilter)
// y así lo prueban las pruebas.
//
// CUIDADO CON EL BUCLE. Con un rango relativo («últimas 24 horas») el filtro
// de fechas sale con un instante absoluto nuevo en cada llamada, y
// `useEsSearch` vuelve a buscar en cuanto cambian sus parámetros. Esta función
// se llama SOLO dentro de un `useMemo` sobre lo guardado en el estado (patrón,
// consulta, filtros, rango): llamada en cada render, cada búsqueda provocaría
// la siguiente.

export interface AlertsSearchBuilders<P, Q, F, T> {
  buildQuery: (indexPattern: P, queries: Q[], filters: F[]) => unknown;
  buildTimeFilter: (indexPattern: P, timeRange: T) => unknown;
}

export interface AlertsSearchFilters {
  filters: unknown[];
  // Por qué no se ha aplicado la consulta de la barra, si no se ha aplicado.
  queryError?: string;
}

const LENGUAJE_NO_ADMITIDO = 'Esta vista solo admite consultas DQL o Lucene';

export const buildAlertsSearchFilters = <P, Q, F, T>(
  { indexPattern, query, filters, timeRange }: { indexPattern?: P; query: Q; filters: F[]; timeRange: T },
  { buildQuery, buildTimeFilter }: AlertsSearchBuilders<P, Q, F, T>
): AlertsSearchFilters => {
  if (!indexPattern) return { filters: [] };

  // `buildOpenSearchQuery` lanza con una consulta mal escrita y, con un
  // lenguaje que no traduce (PPL, SQL), devuelve `{ type: 'unsupported' }` en
  // vez de DSL. Ninguna de las dos cosas puede llegar a OpenSearch ni tumbar
  // la vista: se busca sin la consulta, con los filtros de la barra, y se avisa.
  const traduce = (consultas: Q[]): { dsl?: unknown; error?: string } => {
    try {
      const dsl = buildQuery(indexPattern, consultas, filters) as { bool?: unknown } | undefined;
      return dsl && dsl.bool ? { dsl } : { error: LENGUAJE_NO_ADMITIDO };
    } catch (fallo) {
      return { error: String((fallo as Error)?.message || fallo) };
    }
  };

  const conConsulta = traduce([query]);
  const consulta = conConsulta.dsl ? conConsulta.dsl : traduce([]).dsl;
  const fechas = buildTimeFilter(indexPattern, timeRange);

  return {
    filters: [consulta, fechas].filter(Boolean),
    ...(conConsulta.error ? { queryError: conConsulta.error } : {}),
  };
};
