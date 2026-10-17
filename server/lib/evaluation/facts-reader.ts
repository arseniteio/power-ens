// Lectura paginada de hechos, como el usuario que mira. Sin el tope de 10.000:
// `search_after` sobre un punto en el tiempo (PIT), página a página, y quien
// llama decide qué se queda de cada una. Si el indexador no deja abrir el PIT
// (versión o permisos), se pagina igual sin él: la ventana es de instantes
// absolutos, así que un hecho que llega mientras se lee no cambia lo leído.
import { ENS_ALERTS_INDEX } from '../../../common/constants';
import { ENGINE_SOURCE_FIELDS, FACTS_SORT } from './queries';

export const FACTS_PAGE_SIZE = 5000;
const PIT_KEEP_ALIVE = '2m';

export interface ENSFactsReadStats {
  pages: number;
  hits: number;
  // Bytes aproximados que han llegado del indexador (el JSON de los hits).
  bytes: number;
  pit: boolean;
}

export const newReadStats = (): ENSFactsReadStats => ({ pages: 0, hits: 0, bytes: 0, pit: false });

const abrirPit = async (client: any): Promise<string | undefined> => {
  try {
    const { body } = await client.transport.request({
      method: 'POST',
      path: `/${ENS_ALERTS_INDEX}/_search/point_in_time`,
      querystring: { keep_alive: PIT_KEEP_ALIVE },
    });
    return typeof body?.pit_id === 'string' ? body.pit_id : undefined;
  } catch {
    return undefined;
  }
};

const cerrarPit = async (client: any, pitId: string): Promise<void> => {
  try {
    await client.transport.request({ method: 'DELETE', path: '/_search/point_in_time', body: { pit_id: [pitId] } });
  } catch {
    // Caduca solo en dos minutos.
  }
};

// Recorre TODOS los hechos de la consulta y llama a `onPage` con cada página.
export const readAllFacts = async (
  client: any,
  query: unknown,
  onPage: (hits: any[]) => void,
  stats: ENSFactsReadStats = newReadStats(),
  options: { usePit?: boolean; pageSize?: number } = {}
): Promise<ENSFactsReadStats> => {
  const pageSize = options.pageSize || FACTS_PAGE_SIZE;
  const pitId = options.usePit === false ? undefined : await abrirPit(client);
  stats.pit = stats.pit || Boolean(pitId);
  let after: unknown[] | undefined;

  try {
    for (;;) {
      const body: Record<string, unknown> = {
        size: pageSize,
        track_total_hits: false,
        _source: ENGINE_SOURCE_FIELDS,
        sort: FACTS_SORT,
        query,
        ...(after ? { search_after: after } : {}),
        ...(pitId ? { pit: { id: pitId, keep_alive: PIT_KEEP_ALIVE } } : {}),
      };
      const { body: respuesta } = pitId
        ? await client.search({ body })
        : await client.search({ index: ENS_ALERTS_INDEX, body });
      const hits: any[] = respuesta?.hits?.hits || [];

      stats.pages += 1;
      stats.hits += hits.length;
      stats.bytes += JSON.stringify(hits).length;
      onPage(hits);

      if (hits.length < pageSize) break;
      after = hits[hits.length - 1]?.sort;
      if (!after) break;
    }
  } finally {
    if (pitId) await cerrarPit(client, pitId);
  }

  return stats;
};
