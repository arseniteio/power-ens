import { ENS_VERDICTS_INDEX } from '../../../common/constants';
import type { ENSEngineVerdict } from '../../../common/ens/core/engine-verdicts';

// Until the engine has run once the index does not exist: no verdicts, not an error.
const search = (body: unknown) => ({ index: ENS_VERDICTS_INDEX, ignore_unavailable: true, body });

const ofRow = (controlId: string, agentId: string) => [{ term: { control: controlId } }, { term: { 'agent.id': agentId } }];

// First and newest control verdict per control and machine: a row is recomputed only when the newest changes.
export const buildVerdictsProbeRequest = (controlIds: string[], from: string) =>
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
      controls: {
        terms: { field: 'control', size: controlIds.length },
        aggs: { agents: { terms: { field: 'agent.id', size: 10000 }, aggs: { newest: { max: { field: '@timestamp' } }, oldest: { min: { field: '@timestamp' } } } } },
      },
    },
  });

export type ENSVerdictsProbe = Record<string, Record<string, { newest: string; oldest: string; count: number }>>;

export const readVerdictsProbe = (body: any): ENSVerdictsProbe =>
  Object.fromEntries(
    (body?.aggregations?.controls?.buckets || []).map((control: any) => [
      control.key,
      Object.fromEntries(
        (control.agents?.buckets || [])
          .filter((agent: any) => Number.isFinite(agent.newest?.value))
          .map((agent: any) => [
            agent.key,
            { newest: new Date(agent.newest.value).toISOString(), oldest: new Date(agent.oldest.value).toISOString(), count: agent.doc_count },
          ])
      ),
    ])
  );

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
