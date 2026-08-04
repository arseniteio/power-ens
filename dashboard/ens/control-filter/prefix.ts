// Filtro por prefijo sobre el espacio de identificadores del ENS.
//
// Los controles y sus requisitos se nombran por familia jerárquica separada por
// puntos: `op` → `op.acc` → `op.acc.1` → `op.acc.1.2`. El filtro de las pestañas
// Evidencias e Informes es un prefijo DE ESE IDENTIFICADOR, no una búsqueda de
// texto libre por la ficha: escribir «op.acc» deja la familia entera, y escribir
// «op.acc.1» deja ese control.
//
// POR QUÉ POR SEGMENTOS Y NO CON `String.startsWith`. Con los tres controles de
// hoy las dos formas dan exactamente el mismo resultado, así que el error sería
// indistinguible de «funciona». Pero el ENS tiene familias que pasan de nueve
// —`op.exp` llega a `op.exp.11`—, y en cuanto exista `op.exp.10`,
// `'op.exp.10'.startsWith('op.exp.1')` es cierto: «op.exp.1» dejaría de
// significar «solo ese control» justo cuando el filtro empieza a hacer falta.
// Se compara segmento a segmento, y `1` no es prefijo de `10`.
//
// EL ÚLTIMO SEGMENTO, Y SOLO ÉL, ADMITE COINCIDENCIA PARCIAL, pero únicamente si
// ningún identificador casa por segmentos completos. Así conviven las dos cosas
// que se esperan de un buscador y que se contradicen entre sí: que «op.a»
// encuentre algo mientras se teclea, y que «op.acc.1» no arrastre a `op.acc.10`
// cuando `op.acc.1` existe. La preferencia por la coincidencia completa es una
// decisión de la COLECCIÓN, no de cada elemento; por eso el filtro se aplica a
// la lista entera y no hay una función `casa(id, consulta)` pública.
//
// Este módulo no importa nada: es lógica pura, comprobable fuera del árbol de
// Wazuh (`tests/filtro-prefijo.test.ts`).

import { ENSPrefixFilterResult } from './types';

// Un identificador ENS partido en segmentos. Se normaliza igual que la consulta
// para que `OP.ACC.1` y `op.acc.1` sean el mismo identificador.
export const splitENSId = (id: string): string[] =>
  String(id).trim().toLowerCase().split('.');

// La consulta tal cual la teclea el operador, lista para comparar. No se toca
// nada más que espacios y mayúsculas: un punto de más es un error de escritura
// suyo y debe dar cero resultados visibles, no una coincidencia inventada.
export const normalizeENSPrefixQuery = (raw: string): string =>
  String(raw ?? '')
    .trim()
    .toLowerCase();

// Todos los segmentos de la consulta coinciden EXACTAMENTE con los primeros del
// identificador. Es la coincidencia buena: «op.acc.1» y `op.acc.10` no casan.
const matchesCompleteSegments = (
  idSegments: string[],
  querySegments: string[]
): boolean =>
  querySegments.length <= idSegments.length &&
  querySegments.every((segment, index) => segment === idSegments[index]);

// Igual que la anterior salvo el ÚLTIMO segmento, que basta con que empiece
// igual. Es la coincidencia de «mientras se teclea» y solo se usa como respaldo.
const matchesTypingPrefix = (
  idSegments: string[],
  querySegments: string[]
): boolean =>
  querySegments.length <= idSegments.length &&
  querySegments.every((segment, index) =>
    index === querySegments.length - 1
      ? idSegments[index].startsWith(segment)
      : segment === idSegments[index]
  );

// Filtra una colección por prefijo ENS.
//
// `getIds` devuelve todos los identificadores por los que un elemento puede
// responder: para un control, el suyo y los de sus requisitos, que viven en el
// mismo espacio jerárquico. Así «op.acc.1.2» encuentra el control que declara
// ese requisito en vez de no encontrar nada.
export const filterByENSPrefix = <T>(
  items: readonly T[],
  rawQuery: string,
  getIds: (item: T) => string[]
): ENSPrefixFilterResult<T> => {
  const query = normalizeENSPrefixQuery(rawQuery);

  // Sin filtro se ve todo, y nada queda oculto. Es el estado inicial.
  if (!query) {
    return {
      query,
      isActive: false,
      matched: [...items],
      hidden: [],
      total: items.length,
    };
  }

  const querySegments = query.split('.');

  const matching = (
    predicate: (idSegments: string[], querySegments: string[]) => boolean
  ): T[] =>
    items.filter(item =>
      getIds(item).some(id => predicate(splitENSId(id), querySegments))
    );

  const complete = matching(matchesCompleteSegments);

  const matched =
    complete.length > 0 ? complete : matching(matchesTypingPrefix);

  const matchedItems = new Set<T>(matched);

  return {
    query,
    isActive: true,
    matched,
    // Lo que el filtro deja fuera viaja de vuelta para que la pantalla pueda
    // decir cuánto esconde y de qué tipo. Nunca se descarta en silencio.
    hidden: items.filter(item => !matchedItems.has(item)),
    total: items.length,
  };
};

// La familia de un identificador: todos sus segmentos menos el último.
// `op.acc.1` → `op.acc`; `mp.info.6` → `mp.info`.
export const ensFamilyOf = (id: string): string => {
  const segments = splitENSId(id);

  // Un identificador de un solo segmento ya ES su familia. Hoy no existe
  // ninguno (todos los controles del ENS tienen al menos familia y número),
  // pero sin esta rama la familia de `org` sería la cadena vacía.
  return segments.length > 1
    ? segments.slice(0, -1).join('.')
    : segments.join('.');
};

// Compara dos identificadores ENS segmento a segmento, con los números como
// números: `op.exp.2` va antes que `op.exp.10`, que es justo lo que el orden
// alfabético se equivoca en cuanto una familia pasa de nueve controles.
const compareENSIdSegments = (a: string, b: string): number => {
  const aNumber = Number(a);
  const bNumber = Number(b);
  const aIsNumber = a !== '' && Number.isFinite(aNumber);
  const bIsNumber = b !== '' && Number.isFinite(bNumber);

  if (aIsNumber && bIsNumber) {
    return aNumber - bNumber;
  }

  // Un segmento numérico va antes que uno de texto: `mp.info.6.1` antes que
  // `mp.info.6.r1.1`, que es el orden en que los lee un auditor.
  if (aIsNumber) {
    return -1;
  }

  if (bIsNumber) {
    return 1;
  }

  return a < b ? -1 : a > b ? 1 : 0;
};

export const compareENSIds = (a: string, b: string): number => {
  const aSegments = splitENSId(a);
  const bSegments = splitENSId(b);
  const shared = Math.min(aSegments.length, bSegments.length);

  for (let index = 0; index < shared; index += 1) {
    const verdict = compareENSIdSegments(aSegments[index], bSegments[index]);

    if (verdict !== 0) {
      return verdict;
    }
  }

  return aSegments.length - bSegments.length;
};

// Las familias presentes en una lista de identificadores, sin repetir y en
// orden. Son los atajos de un clic de la pantalla: crecen mucho más despacio que
// los controles (tres controles dan dos familias; treinta darían siete u ocho),
// que es lo que permite conservar los botones sin que la barra se desborde.
export const listENSFamilies = (ids: readonly string[]): string[] => {
  const families = ids.map(ensFamilyOf).filter(family => family !== '');

  return [...new Set(families)].sort(compareENSIds);
};

// --- cómo se despliegan los resultados --------------------------------------

// Las secciones van cerradas por defecto: ver la LISTA de controles y abrir el
// que interesa es justamente lo que se pedía, en vez de una tabla plana larga.
//
// La excepción es que el filtro haya dejado exactamente un control: ahí buscar
// y abrir son el mismo gesto y el clic de más sobra. Con dos o más se vuelven a
// cerrar todas, porque el valor de la lista es poder compararlas.
export const isENSSectionOpenByDefault = (matchedCount: number): boolean =>
  matchedCount === 1;

// El estado de una sección: manda lo que el operador haya decidido a mano; si no
// ha tocado esa sección, el criterio por defecto. Vive aquí y no en cada
// pestaña porque las dos tienen que comportarse igual.
export const resolveENSSectionOpenState = (
  explicitState: Record<string, boolean | undefined>,
  controlId: string,
  matchedCount: number
): boolean =>
  explicitState[controlId] ?? isENSSectionOpenByDefault(matchedCount);
