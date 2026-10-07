// La búsqueda del patrón de índice de la barra. Sin React ni dashboard: el
// servicio llega de fuera (en la app, `data.indexPatterns` del contrato de
// arranque) y así lo prueba tests/alerts-index-pattern.test.ts.
//
// Por su título exacto en la lista de patrones. No vale
// `indexPatterns.find('wazuh-alerts-*')`: busca con simple_query_string sobre
// el título, que es un campo `text`, y ese texto no encuentra nada (comprobado
// contra el índice del dashboard de wazuh4 el 07/10/2026).

export interface IndexPatternLookupService<P> {
  // OSD 2.19.5: `getIdsWithTitle(refresh = false)`; con `true` vuelve a leer
  // los patrones guardados en lugar de servir la lista de la primera vez.
  getIdsWithTitle: (refresh?: boolean) => Promise<Array<{ id: string; title: string }>>;
  get: (id: string) => Promise<P>;
}

// Tres salidas que la vista distingue: encontrado (`indexPattern`), no existe
// (ni patrón ni error) y no se ha podido saber (`error`, con su causa: sin
// permiso, sin red…). Un fallo al leer no es «no existe».
export interface IndexPatternLookup<P> {
  indexPattern?: P;
  error?: string;
}

export const findIndexPatternByTitle = async <P>(
  service: IndexPatternLookupService<P>,
  title: string
): Promise<IndexPatternLookup<P>> => {
  try {
    // Recién leída: un patrón creado con la página abierta (después de que
    // otra pantalla llenara la caché) se encuentra al volver a la pestaña.
    const lista = await service.getIdsWithTitle(true);
    const encontrado = lista.find(p => p.title === title);
    if (!encontrado) return {};
    return { indexPattern: await service.get(encontrado.id) };
  } catch (fallo) {
    return { error: String((fallo as Error)?.message || fallo) };
  }
};
