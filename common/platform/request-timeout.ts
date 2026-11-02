export const ENS_REQUEST_TIMEOUT_MS = 60000;

export class ENSRequestTimeoutError extends Error {
  constructor(operation: string) {
    super(`La consulta de ${operation} ha superado el tiempo de espera. Reintenta y revisa la conexión con el indexador.`);
    this.name = 'ENSRequestTimeoutError';
  }
}

export const withRequestTimeout = async <T>(
  request: (signal: AbortSignal) => Promise<T>,
  operation: string,
  controller: AbortController = new AbortController(),
  timeoutMs: number = ENS_REQUEST_TIMEOUT_MS,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ENSRequestTimeoutError(operation));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => request(controller.signal)), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};
