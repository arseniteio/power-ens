// Searches as the viewing user. OpenSearch answers 200 with partial results if a shard fails: each search sends
// `allow_partial_search_results=false` and the response is still checked, so nothing is judged on partial data.

export class ENSIncompleteDataError extends Error {
  statusCode = 503;
  constructor(detail: string) {
    super(`Datos incompletos: ${detail}. No se ha evaluado nada con ellos; reintentar.`);
    this.name = 'ENSIncompleteDataError';
  }
}

export class ENSEvaluationCancelledError extends Error {
  statusCode = 499;
  constructor() {
    super('Evaluación cancelada: nadie espera ya su resultado.');
    this.name = 'ENSEvaluationCancelledError';
  }
}

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

export const searchComplete = async (client: any, params: Record<string, unknown> & { body: unknown }, what: string): Promise<any> => {
  const { body } = await client.search({ ...params, allow_partial_search_results: false });
  assertCompleteResponse(body, what);
  return body;
};
