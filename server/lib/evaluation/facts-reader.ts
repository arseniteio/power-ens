// Reading of facts and aggregations, as the viewing user.
// NO PARTIAL DATA. OpenSearch answers 200 with partial results if a shard fails. Each search sends
// `allow_partial_search_results=false` and the response is still checked: with a failed shard, a timeout or an
// early-terminated search the evaluation fails with the reason and nothing is judged or stored.
// NO PIT. `search_after` over a fixed window (ending when the evaluation starts), sorted by date with a
// `keyword` tiebreaker (`FACTS_SORT`); facts are only appended, so pages do not move. A PIT on `wazuh-alerts-*`
// would open one context per shard, more than `search.max_open_pit_context`.
import { ENS_ALERTS_INDEX } from '../../../common/constants';
import { ENGINE_SOURCE_FIELDS, FACTS_SORT } from './queries';

export const FACTS_PAGE_SIZE = 5000;
// Facts held in memory at once per read (one control on one machine). Above this the evaluation stops with a
// clear error before endangering the dashboard process: each fact takes ~1.7 KB once read and normalised, so
// 50,000 are ~85 MB (double with two concurrent reads).
export const MAX_FACTS_PER_READ = 50000;

export class ENSIncompleteDataError extends Error {
  statusCode = 503;
  constructor(detail: string) {
    super(`Datos incompletos: ${detail}. No se ha evaluado nada con ellos; reintentar.`);
    this.name = 'ENSIncompleteDataError';
  }
}

export class ENSTooManyFactsError extends Error {
  statusCode = 503;
  constructor(what: string, limit: number) {
    super(`Demasiados hechos para evaluar ${what} de una vez (más de ${limit.toLocaleString('es-ES')}). Acortar el periodo de evaluación o el alcance.`);
    this.name = 'ENSTooManyFactsError';
  }
}

export class ENSEvaluationCancelledError extends Error {
  statusCode = 499;
  constructor() {
    super('Evaluación cancelada: nadie espera ya su resultado.');
    this.name = 'ENSEvaluationCancelledError';
  }
}

// The response is complete, or `ENSIncompleteDataError` is thrown.
export const assertCompleteResponse = (body: any, what: string): void => {
  const shards = body?._shards;
  if (shards && Number(shards.failed) > 0) {
    throw new ENSIncompleteDataError(`${shards.failed} de ${shards.total} shards fallaron al leer ${what}`);
  }
  if (body?.timed_out) {
    throw new ENSIncompleteDataError(`la lectura de ${what} agotó su tiempo en el indexador`);
  }
  if (body?.terminated_early) {
    throw new ENSIncompleteDataError(`la lectura de ${what} terminó antes de tiempo en el indexador`);
  }
};

export const throwIfCancelled = (signal?: { aborted: boolean }): void => {
  if (signal?.aborted) throw new ENSEvaluationCancelledError();
};

// A search that does not allow partial results.
export const searchComplete = async (client: any, params: { index?: string; body: unknown }, what: string): Promise<any> => {
  // With a list of indices (the window's), one that no longer exists does not fail the search.
  const list = typeof params.index === 'string' && params.index.includes(',');
  const { body } = await client.search({ ...params, allow_partial_search_results: false, ...(list ? { ignore_unavailable: true } : {}) });
  assertCompleteResponse(body, what);
  return body;
};

export interface ENSFactsReadStats {
  pages: number;
  hits: number;
  // Time awaited on the indexer client (response and parsing).
  searchMs: number;
}

export const newReadStats = (): ENSFactsReadStats => ({ pages: 0, hits: 0, searchMs: 0 });

// Yields the thread between pages and rows so the dashboard process keeps serving other requests during a
// computation.
export const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

// Walks ALL facts of the query, calling `onPage` with each page.
export const readAllFacts = async (
  client: any,
  query: unknown,
  onPage: (hits: any[]) => void | Promise<void>,
  stats: ENSFactsReadStats = newReadStats(),
  options: {
    pageSize?: number;
    maxFacts?: number;
    what?: string;
    signal?: { aborted: boolean };
    // The index (or the window's list of indices).
    index?: string;
    // Another sort order (the per-machine stream puts the control first) and the position of `id` in it.
    sort?: unknown[];
    idIndex?: number;
  } = {}
): Promise<ENSFactsReadStats> => {
  const pageSize = options.pageSize || FACTS_PAGE_SIZE;
  const sort = options.sort || FACTS_SORT;
  const idIndex = options.idIndex ?? 1;
  const maxFacts = options.maxFacts ?? MAX_FACTS_PER_READ;
  const what = options.what || 'los hechos';
  let after: unknown[] | undefined;
  let readValues = 0;

  for (;;) {
    throwIfCancelled(options.signal);
    const t0 = Date.now();
    const response = await searchComplete(
      client,
      {
        index: options.index || ENS_ALERTS_INDEX,
        body: {
          size: pageSize,
          track_total_hits: false,
          _source: ENGINE_SOURCE_FIELDS,
          sort,
          query,
          ...(after ? { search_after: after } : {}),
        },
      },
      what
    );
    stats.searchMs += Date.now() - t0;
    const hits: any[] = response?.hits?.hits || [];

    stats.pages += 1;
    stats.hits += hits.length;
    readValues += hits.length;
    if (readValues > maxFacts) throw new ENSTooManyFactsError(what, maxFacts);
    await onPage(hits);

    if (hits.length < pageSize) break;
    after = hits[hits.length - 1]?.sort;
    if (!after) break;
    // Without `id` (the per-manager unique tiebreaker) two facts of the same instant cannot be separated across
    // pages: they would be lost or repeated silently.
    if (after[idIndex] === null || after[idIndex] === undefined) {
      throw new ENSIncompleteDataError(`hay hechos sin \`id\` en ${what}: no se pueden leer por páginas sin perder ninguno`);
    }
    await yieldToEventLoop();
  }

  return stats;
};
