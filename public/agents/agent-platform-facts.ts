// Hechos que delatan el tipo de sistema de cada agente, para Configuración.
//
// El inventario distingue Windows de Linux (`os.platform`), pero un servidor
// LDAP de Zimbra es un Ubuntu más: solo lo delatan los hechos de su recolector,
// con `data.plano = directorio`. Las variantes de copias de mp.info.6 salen de
// `data.origen` (`pbs`, `zimbra-ne`).
//
// Es UNA agregación sobre 30 días (`size: 0`): por agente, cuántos hechos de
// cada plano y de cada origen de mp.info.6. No baja ni un documento.
import { ENS_ALERTS_INDEX } from '../../common/constants';
import { normalizeAgentId } from '../../common/agent-configuration';
import { getData } from '../services';
import { withRequestTimeout } from '../../common/platform/request-timeout';

export interface ENSAgentPlatformFacts {
  // Hechos por valor de `data.plano` en la ventana.
  planes: Record<string, number>;
  // Hechos de mp.info.6 por valor de `data.origen`.
  backupOrigins: Record<string, number>;
}

export const ENS_PLATFORM_FACTS_WINDOW = 'now-30d';

export const buildPlatformFactsRequest = () => ({
  index: ENS_ALERTS_INDEX,
  body: {
    size: 0,
    track_total_hits: false,
    query: {
      bool: {
        filter: [
          { range: { timestamp: { gte: ENS_PLATFORM_FACTS_WINDOW } } },
          { exists: { field: 'data.ensfacil' } },
        ],
      },
    },
    aggs: {
      agentes: {
        terms: { field: 'agent.id', size: 10000 },
        aggs: {
          planos: { terms: { field: 'data.plano', size: 20 } },
          copias: {
            filter: { term: { 'data.ensfacil': 'mp.info.6' } },
            aggs: { origenes: { terms: { field: 'data.origen', size: 10 } } },
          },
        },
      },
    },
  },
});

const cuenta = (cubos: any[] | undefined): Record<string, number> => {
  const salida: Record<string, number> = {};
  (cubos || []).forEach(cubo => {
    const clave = String(cubo?.key ?? '').trim();
    if (clave) salida[clave] = (salida[clave] || 0) + (Number(cubo?.doc_count) || 0);
  });
  return salida;
};

export const platformFactsFromAggregations = (aggregations: any): Record<string, ENSAgentPlatformFacts> => {
  const salida: Record<string, ENSAgentPlatformFacts> = {};
  (aggregations?.agentes?.buckets || []).forEach((cubo: any) => {
    const id = normalizeAgentId(cubo?.key);
    if (!id) return;
    salida[id] = {
      planes: cuenta(cubo?.planos?.buckets),
      backupOrigins: cuenta(cubo?.copias?.origenes?.buckets),
    };
  });
  return salida;
};

export const loadAgentPlatformFacts = async (): Promise<Record<string, ENSAgentPlatformFacts>> => {
  const respuesta: any = await withRequestTimeout(
    signal => getData().search.search(
      { params: buildPlatformFactsRequest() },
      { abortSignal: signal }
    ).toPromise(),
    'hechos para detectar el tipo de sistema'
  );
  return platformFactsFromAggregations(respuesta?.rawResponse?.aggregations);
};
