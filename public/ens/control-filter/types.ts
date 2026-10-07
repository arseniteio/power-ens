// Tipos del filtro por prefijo ENS.
//
// Viven en su propio fichero y las pestañas los importan desde
// `../control-filter/types`, nunca desde un barrel de alto nivel: esa es la
// regla de la casa que evita reintroducir el ciclo transitivo del TDZ de
// `Settings`.

// Resultado de aplicar un prefijo a una colección.
//
// `hidden` no es adorno: es la razón de que este tipo exista en vez de devolver
// una lista pelada. Un filtro que solo devuelve lo que pasa deja a la pantalla
// sin forma de decir cuántos hallazgos ha dejado fuera, y un panel corto se lee
// exactamente igual que un panel sin incumplimientos. Quien filtra recibe
// siempre las dos mitades, y `matched.length + hidden.length === total`.
export interface ENSPrefixFilterResult<T> {
  // La consulta ya normalizada (recortada y en minúsculas). Vacía si no hay
  // filtro puesto.
  query: string;

  // Si hay filtro. Se publica aparte de `query` para que la pantalla no tenga
  // que decidir qué cuenta como "vacío".
  isActive: boolean;

  matched: T[];
  hidden: T[];
  total: number;
}
