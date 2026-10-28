// What the screens say when the fact search fails. What remains in `esResults` belongs to the previous search, so it is not shown as current. No React: tested in tests/facts-read-error.test.ts.

export const FACTS_READ_ERROR_TITLE = 'No se pudieron leer los hechos';

const factsReadErrorCause = (error: unknown): string => {
  const message = (error as any)?.message ?? (typeof error === 'string' ? error : '');
  const text = String(message || '').trim();
  return text || 'el índice no respondió y no dio motivo';
};

export const factsReadErrorText = (error: unknown): string =>
  `${FACTS_READ_ERROR_TITLE}: ${factsReadErrorCause(error)}. No se muestran resultados hasta que la búsqueda vuelva a funcionar: los que había eran de la búsqueda anterior.`;

export const EVALUATION_ERROR_TITLE = 'No se pudo evaluar';

export const evaluationErrorText = (error: unknown): string =>
  `${EVALUATION_ERROR_TITLE}: ${factsReadErrorCause(error)}. No se muestra ningún resultado hasta que la evaluación vuelva a funcionar: lo que había no vale como de ahora.`;
