// Los filtros que la barra de búsqueda del dashboard añade a las consultas de
// las pantallas ENS. Sin React ni dashboard: los constructores llegan de fuera
// y así lo prueban las pruebas. En la app son los del contrato de arranque del
// plugin data (`data.query.getOpenSearchQuery`, `timefilter.createFilter`), no
// un import de `src/plugins/data/public`, que copiaría el plugin data entero
// dentro del nuestro.
//
// CUIDADO CON EL BUCLE. Con un rango relativo («últimas 24 horas») el filtro
// de fechas sale con un instante absoluto nuevo en cada llamada, y
// `useEsSearch` vuelve a buscar en cuanto cambian sus parámetros. Esta función
// se llama SOLO dentro de un `useMemo` sobre lo guardado en el estado (patrón,
// consulta, filtros, rango): llamada en cada render, cada búsqueda provocaría
// la siguiente.

export interface AlertsSearchBuilders<P, T> {
  // La consulta, los filtros y las fechas de la barra en un solo DSL.
  buildQuery: (indexPattern: P) => unknown;
  // Solo las fechas, para cuando la consulta no se puede traducir.
  buildTimeFilter: (indexPattern: P, timeRange: T) => unknown;
}

export interface AlertsSearchFilters {
  filters: unknown[];
  // Por qué no se ha aplicado la consulta de la barra, si no se ha aplicado.
  queryError?: string;
}

const LENGUAJE_NO_ADMITIDO = 'Esta vista solo admite consultas DQL o Lucene';

export const buildAlertsSearchFilters = <P, F, T>(
  { indexPattern, filters, timeRange }: { indexPattern?: P; filters: F[]; timeRange: T },
  { buildQuery, buildTimeFilter }: AlertsSearchBuilders<P, T>
): AlertsSearchFilters => {
  if (!indexPattern) return { filters: [] };

  // Con una consulta mal escrita el dashboard lanza y, con un lenguaje que no
  // traduce a DSL (PPL, SQL), devuelve `{ type: 'unsupported' }`. Ninguna de
  // las dos cosas puede llegar a OpenSearch ni tumbar la vista.
  let queryError: string;
  try {
    const dsl = buildQuery(indexPattern) as { bool?: unknown } | undefined;
    if (dsl && dsl.bool) return { filters: [dsl] };
    queryError = LENGUAJE_NO_ADMITIDO;
  } catch (fallo) {
    queryError = String((fallo as Error)?.message || fallo);
  }

  // Se busca sin la consulta y se avisa: los filtros de la barra tal cual (la
  // petición les quita `meta`, salta los desactivados y niega los negados) y
  // las fechas.
  return {
    filters: [...filters, buildTimeFilter(indexPattern, timeRange)].filter(Boolean),
    queryError,
  };
};
