// Facts that reveal each agent's system type, for Configuración: the inventory tells Windows from Linux, but a Zimbra LDAP server is just another Ubuntu; only its collector facts (`data.plano = directorio`) reveal it.
import { ENS_ALERTS_INDEX } from '../../common/constants';
import { normalizeAgentId } from '../../common/agent-configuration';
import { getData } from '../services';
import { withRequestTimeout } from '../../common/platform/request-timeout';

export interface ENSAgentPlatformFacts {
  planes: Record<string, number>;
  backupOrigins: Record<string, number>;
}

const ENS_PLATFORM_FACTS_WINDOW = 'now-30d';

const buildPlatformFactsRequest = () => ({
  index: ENS_ALERTS_INDEX,
  body: {
    size: 0,
    track_total_hits: false,
    query: {
      bool: {
        filter: [
          { range: { timestamp: { gte: ENS_PLATFORM_FACTS_WINDOW } } },
          { exists: { field: 'data.power_ens' } },
        ],
      },
    },
    aggs: {
      agentes: {
        terms: { field: 'agent.id', size: 10000 },
        aggs: {
          planos: { terms: { field: 'data.plano', size: 20 } },
          copias: {
            filter: { term: { 'data.power_ens': 'mp.info.6' } },
            aggs: { origenes: { terms: { field: 'data.origen', size: 10 } } },
          },
        },
      },
    },
  },
});

const countBuckets = (buckets: any[] | undefined): Record<string, number> => {
  const output: Record<string, number> = {};
  (buckets || []).forEach(bucket => {
    const key = String(bucket?.key ?? '').trim();
    if (key) output[key] = (output[key] || 0) + (Number(bucket?.doc_count) || 0);
  });
  return output;
};

const platformFactsFromAggregations = (aggregations: any): Record<string, ENSAgentPlatformFacts> => {
  const output: Record<string, ENSAgentPlatformFacts> = {};
  (aggregations?.agentes?.buckets || []).forEach((bucket: any) => {
    const id = normalizeAgentId(bucket?.key);
    if (!id) return;
    output[id] = {
      planes: countBuckets(bucket?.planos?.buckets),
      backupOrigins: countBuckets(bucket?.copias?.origenes?.buckets),
    };
  });
  return output;
};

export const loadAgentPlatformFacts = async (): Promise<Record<string, ENSAgentPlatformFacts>> => {
  const response: any = await withRequestTimeout(
    signal => getData().search.search(
      { params: buildPlatformFactsRequest() },
      { abortSignal: signal }
    ).toPromise(),
    'hechos para detectar el tipo de sistema'
  );
  return platformFactsFromAggregations(response?.rawResponse?.aggregations);
};
