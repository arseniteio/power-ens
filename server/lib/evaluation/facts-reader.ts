// Lectura de hechos y de agregaciones, como el usuario que mira.
//
// SIN DATOS A MEDIAS. OpenSearch responde 200 con resultados parciales si algún
// shard falla (cláusulas de más, el cortacircuitos de memoria, un shard sin
// asignar). Cada búsqueda va con `allow_partial_search_results=false`, y aun
// así se comprueba la respuesta: con un shard fallido, un tiempo agotado o una
// búsqueda cortada antes de tiempo, la evaluación falla con el motivo y no se
// juzga ni se guarda nada.
//
// SIN PIT. `search_after` sobre una ventana fija (su final es el instante en que
// empieza la evaluación), ordenada por fecha con un desempate `keyword`
// (`FACTS_SORT`): los hechos solo se añaden, así que las páginas no se mueven.
// Un PIT sobre `wazuh-alerts-*` abriría un contexto por shard (381 en el
// laboratorio, más que `search.max_open_pit_context`).
import { ENS_ALERTS_INDEX } from '../../../common/constants';
import { ENGINE_SOURCE_FIELDS, FACTS_SORT } from './queries';

export const FACTS_PAGE_SIZE = 5000;
// Los hechos que se tienen a la vez en memoria por lectura (un control en una
// máquina). Por encima, la evaluación se para con un error claro antes de
// poner en riesgo el proceso del dashboard.
export const MAX_FACTS_PER_READ = 250000;

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

// La respuesta está entera, o se lanza `ENSIncompleteDataError`.
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

// Una búsqueda que no admite resultados parciales.
export const searchComplete = async (client: any, params: { index?: string; body: unknown }, what: string): Promise<any> => {
  const { body } = await client.search({ ...params, allow_partial_search_results: false });
  assertCompleteResponse(body, what);
  return body;
};

export interface ENSFactsReadStats {
  pages: number;
  hits: number;
}

export const newReadStats = (): ENSFactsReadStats => ({ pages: 0, hits: 0 });

// Recorre TODOS los hechos de la consulta y llama a `onPage` con cada página.
export const readAllFacts = async (
  client: any,
  query: unknown,
  onPage: (hits: any[]) => void,
  stats: ENSFactsReadStats = newReadStats(),
  options: { pageSize?: number; maxFacts?: number; what?: string; signal?: { aborted: boolean } } = {}
): Promise<ENSFactsReadStats> => {
  const pageSize = options.pageSize || FACTS_PAGE_SIZE;
  const maxFacts = options.maxFacts ?? MAX_FACTS_PER_READ;
  const what = options.what || 'los hechos';
  let after: unknown[] | undefined;
  let leidos = 0;

  for (;;) {
    throwIfCancelled(options.signal);
    const respuesta = await searchComplete(
      client,
      {
        index: ENS_ALERTS_INDEX,
        body: {
          size: pageSize,
          track_total_hits: false,
          _source: ENGINE_SOURCE_FIELDS,
          sort: FACTS_SORT,
          query,
          ...(after ? { search_after: after } : {}),
        },
      },
      what
    );
    const hits: any[] = respuesta?.hits?.hits || [];

    stats.pages += 1;
    stats.hits += hits.length;
    leidos += hits.length;
    if (leidos > maxFacts) throw new ENSTooManyFactsError(what, maxFacts);
    onPage(hits);

    if (hits.length < pageSize) break;
    after = hits[hits.length - 1]?.sort;
    if (!after) break;
    // Sin desempate (`id` falta) dos hechos del mismo instante no se pueden
    // separar entre páginas: se perderían o se repetirían en silencio.
    if (after.slice(1).every(valor => valor === null || valor === undefined)) {
      throw new ENSIncompleteDataError(`hay hechos sin \`id\` en ${what}: no se pueden leer por páginas sin perder ninguno`);
    }
  }

  return stats;
};
