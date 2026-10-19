// Lo que dicen las pantallas cuando la búsqueda de los hechos falla. Lo que
// queda en `esResults` es de la búsqueda anterior (o nada, y todo saldría a
// cero o «sin datos»): no se enseña como si fuera de ahora. Sin React: lo
// prueba tests/facts-read-error.test.ts.

export const FACTS_READ_ERROR_TITLE = 'No se pudieron leer los hechos';

export const factsReadErrorCause = (error: unknown): string => {
  const mensaje = (error as any)?.message ?? (typeof error === 'string' ? error : '');
  const texto = String(mensaje || '').trim();
  return texto || 'el índice no respondió y no dio motivo';
};

export const factsReadErrorText = (error: unknown): string =>
  `${FACTS_READ_ERROR_TITLE}: ${factsReadErrorCause(error)}. No se muestran resultados hasta que la búsqueda vuelva a funcionar: los que había eran de la búsqueda anterior.`;

// Lo mismo para la evaluación del servidor (desde 1.2.0 las pantallas que
// juzgan no buscan hechos: piden el resultado).
export const EVALUATION_ERROR_TITLE = 'No se pudo evaluar';

export const evaluationErrorText = (error: unknown): string =>
  `${EVALUATION_ERROR_TITLE}: ${factsReadErrorCause(error)}. No se muestra ningún resultado hasta que la evaluación vuelva a funcionar: lo que había no vale como de ahora.`;
