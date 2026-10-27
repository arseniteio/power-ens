import { ENS_VERDICTS_INDEX } from '../../../common/constants';
import type { ENSEngineVerdict } from '../../../common/ens/core/engine-verdicts';

// Until the engine has run once the index does not exist: no verdicts, not an error.
const search = (body: unknown) => ({ index: ENS_VERDICTS_INDEX, ignore_unavailable: true, body });

const ofRow = (controlId: string, agentId: string) => [{ term: { control: controlId } }, { term: { 'agent.id': agentId } }];

export const VERDICTS_PROBE_PAGE = 1000;

// First and newest control verdict per control and machine, a page at a time: a row is recomputed only when the
// newest changes.
export const buildVerdictsProbeRequest = (controlIds: string[], from: string, after?: Record<string, string>) =>
  search({
    size: 0,
    query: {
      bool: {
        filter: [
          { term: { scope: 'control' } },
          { terms: { control: controlIds } },
          { range: { '@timestamp': { gte: from } } },
        ],
      },
    },
    aggs: {
      rows: {
        composite: {
          size: VERDICTS_PROBE_PAGE,
          sources: [{ control: { terms: { field: 'control' } } }, { agent: { terms: { field: 'agent.id' } } }],
          ...(after ? { after } : {}),
        },
        aggs: { newest: { max: { field: '@timestamp' } }, oldest: { min: { field: '@timestamp' } } },
      },
    },
  });

export type ENSVerdictsProbe = Record<string, Record<string, { newest: string; oldest: string; count: number }>>;

export const addVerdictsProbePage = (probe: ENSVerdictsProbe, body: any): Record<string, string> | undefined => {
  const rows = body?.aggregations?.rows;
  for (const bucket of rows?.buckets || []) {
    if (!Number.isFinite(bucket.newest?.value)) continue;
    const ofControl = (probe[bucket.key.control] = probe[bucket.key.control] || {});
    ofControl[bucket.key.agent] = {
      newest: new Date(bucket.newest.value).toISOString(),
      oldest: new Date(bucket.oldest.value).toISOString(),
      count: bucket.doc_count,
    };
  }
  return (rows?.buckets || []).length === VERDICTS_PROBE_PAGE ? rows?.after_key : undefined;
};

// The engine stamps every verdict of a pass with the same instant, so the latest pass is that instant.
export const buildLatestPassRequest = (controlId: string, agentId: string, newest: string) =>
  search({
    size: 500,
    query: { bool: { filter: [...ofRow(controlId, agentId), { range: { '@timestamp': { gte: newest, lte: newest } } }] } },
  });

export const buildDailyVerdictsRequest = (controlId: string, agentId: string, from: string, to: string) =>
  search({
    size: 500,
    sort: [{ '@timestamp': 'asc' }],
    query: {
      bool: {
        filter: [...ofRow(controlId, agentId), { term: { scope: 'control' } }, { range: { '@timestamp': { gte: from, lte: to } } }],
      },
    },
  });

export const verdictsOf = (body: any): ENSEngineVerdict[] => (body?.hits?.hits || []).map((hit: any) => hit._source);
