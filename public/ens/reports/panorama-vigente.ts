// Qué panorama (el resultado de todos los controles) enseña el informe que lo
// pide, render a render, sin React para poder probarlo.
//
// El problema que resuelve: `useEsSearch` conserva la respuesta anterior
// mientras busca, y en el PRIMER render después de cambiar la consulta (otro
// periodo, otra máquina) todavía dice `isLoading=false` con los hechos VIEJOS.
// Un panorama calculado ahí y marcado con la clave nueva enseñaría el de otra
// máquina o de otro periodo, con el PDF activo. Por eso una respuesta solo se
// marca con la clave que estaba EN CURSO cuando llegó.
//
// Y el contrario: durante un refresco de la MISMA consulta (cada 15 s) se sigue
// enseñando el último panorama, sin parpadeo, y el PDF sigue activo.

export interface ENSPanoramaMemoria<T> {
  // La clave de la última consulta que se vio en curso.
  claveEnCurso?: string;
  // El último panorama respondido, con la clave de SU consulta.
  ultima?: { clave: string; valor: T };
}

// Antes de calcular: ¿los hechos que hay ahora son de la consulta `clave`?
// Solo si no hay ninguna en curso y la última que estuvo en curso es esta.
export const anotaConsulta = <T>(
  memoria: ENSPanoramaMemoria<T>,
  clave: string,
  isLoading: boolean
): boolean => {
  if (isLoading) {
    memoria.claveEnCurso = clave;
  }

  return !isLoading && memoria.claveEnCurso === clave;
};

// Después de calcular: el panorama que vale para `clave`. `respuesta` es el
// calculado con los hechos de esta clave (solo si `anotaConsulta` lo permitió).
// Sin panorama de esta clave, `cargando`: SIN_DATOS y PDF desactivado. Con un
// fallo, ni panorama ni carga: el fallo se dice aparte.
export const panoramaVigente = <T>(
  memoria: ENSPanoramaMemoria<T>,
  clave: string,
  error: unknown,
  respuesta: T | undefined
): { valor?: T; cargando: boolean } => {
  if (respuesta !== undefined && !error) {
    memoria.ultima = { clave, valor: respuesta };
  }

  const valor = !error && memoria.ultima?.clave === clave ? memoria.ultima.valor : undefined;

  return { valor, cargando: valor === undefined && !error };
};
