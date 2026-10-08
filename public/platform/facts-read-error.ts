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
