// Lo que decide `useEsSearch` en cada cambio de parámetros, sin React para
// poder probarlo. Dos claves: la de los datos (filtros, agregaciones, tope,
// orden) y el `refreshKey`, que solo pide «vuelve a mirar».

export type ENSSearchDecision = 'start' | 'skip' | 'abort-and-start';

// - Nada en curso: se busca.
// - En curso la misma búsqueda de datos (solo ha subido el `refreshKey`, o el
//   mismo render repetido): se espera a esa respuesta, que sigue valiendo; ni
//   se lanza otra ni se tira la que viene.
// - En curso otra búsqueda de datos: ya no sirve; se cancela y se lanza la nueva.
export const decideSearch = (enCurso: string | undefined, nueva: string): ENSSearchDecision => {
  if (enCurso === undefined) return 'start';
  return enCurso === nueva ? 'skip' : 'abort-and-start';
};

// La clave de los datos: todo menos el `refreshKey`.
export const searchDataKey = (params: Record<string, unknown>): string => {
  const { refreshKey, ...datos } = params || {};
  return JSON.stringify(datos);
};

// Una cancelación pedida por la propia pantalla no es un fallo: ni aviso ni
// estado de error.
export const isAbortError = (fallo: any, signal?: { aborted: boolean }): boolean =>
  Boolean(signal?.aborted) || fallo?.name === 'AbortError';

// Avisos repetidos: 17 filas que fallan igual a la vez dan un solo aviso. El
// registro es del módulo (compartido por todas las búsquedas) y recuerda cuándo
// se dio cada mensaje.
export const ENS_SEARCH_TOAST_WINDOW_MS = 60 * 1000;

export const shouldToast = (
  registro: Map<string, number>,
  mensaje: string,
  ahora: number,
  ventana: number = ENS_SEARCH_TOAST_WINDOW_MS
): boolean => {
  const anterior = registro.get(mensaje);
  if (anterior !== undefined && ahora - anterior < ventana) return false;
  registro.set(mensaje, ahora);
  return true;
};
