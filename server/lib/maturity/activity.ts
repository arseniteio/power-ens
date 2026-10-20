// Days with facts per control and machine over the maturity's own period: aggregations only, in bounded groups.
import { ENS_ALERTS_INDEX } from '../../../common/constants';
import { buildENSControlFactsFilter } from '../../../common/ens/dashboard/all-controls-facts-filter';
import { dayIn } from '../../../common/ens/maturity/maturity-engine';
import type { ENSMaturityActivity } from '../../../common/ens/maturity/maturity-engine';

// Well below `search.max_buckets` (65,535 by default).
export const MAX_ACTIVITY_BUCKETS = 20000;

const DAY_FORMAT = 'yyyy-MM-dd';

// The indexer formats each day (`key_as_string`): no date formatting per bucket here.
const dayOf = (bucket: any, timeZone: string): string =>
  typeof bucket?.key_as_string === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bucket.key_as_string) ? bucket.key_as_string : dayIn(new Date(Number(bucket.key)), timeZone);

export const buildActivityRequest = (filters: unknown[], controlIds: string[], timeZone: string) => ({
  index: ENS_ALERTS_INDEX,
  ignore_unavailable: true,
  body: {
    size: 0,
    query: { bool: { filter: filters } },
    aggs: {
      controls: {
        filters: { filters: Object.fromEntries(controlIds.map(id => [id, buildENSControlFactsFilter(id)])) },
        aggs: {
          agents: {
            terms: { field: 'agent.id', size: 10000 },
            aggs: {
              days: { date_histogram: { field: '@timestamp', calendar_interval: 'day', time_zone: timeZone, format: DAY_FORMAT, min_doc_count: 1 } },
            },
          },
        },
      },
    },
  },
});

// Each machine's first ENS fact in the period (when it entered the scope), and the oldest ENS fact kept at all.
export const buildMachinesRequest = (filters: unknown[], scopeFilters: unknown[]) => ({
  index: ENS_ALERTS_INDEX,
  ignore_unavailable: true,
  body: {
    size: 0,
    query: { bool: { filter: scopeFilters } },
    aggs: {
      oldest: { min: { field: '@timestamp' } },
      period: { filter: { bool: { filter: filters } }, aggs: { agents: { terms: { field: 'agent.id', size: 10000 }, aggs: { first: { min: { field: '@timestamp' } } } } } },
    },
  },
});

export const readMachinesResponse = (body: any, timeZone: string): { oldest?: string; since: Map<string, string> } => {
  const oldest = body?.aggregations?.oldest?.value;
  return {
    oldest: typeof oldest === 'number' ? new Date(oldest).toISOString() : undefined,
    since: new Map(
      (body?.aggregations?.period?.agents?.buckets || [])
        .filter((agent: any) => typeof agent?.first?.value === 'number')
        .map((agent: any) => [String(agent.key), dayIn(new Date(agent.first.value), timeZone)])
    ),
  };
};

// Groups of controls whose buckets (controls x machines x days) fit in one search.
export const groupActivityControls = (controlIds: string[], machines: number, days: number): string[][] => {
  const size = Math.max(1, Math.floor(MAX_ACTIVITY_BUCKETS / (Math.max(1, machines) * Math.max(1, days + 2))));
  const groups: string[][] = [];
  for (let i = 0; i < controlIds.length; i += size) groups.push(controlIds.slice(i, i + size));
  return groups;
};

// Each control's days (YYYY-MM-DD in the zone) on each machine, and on any machine.
export const readActivityResponse = (body: any, timeZone: string): Map<string, ENSMaturityActivity> => {
  const buckets = body?.aggregations?.controls?.buckets || {};
  return new Map(
    Object.entries<any>(buckets).map(([controlId, bucket]) => {
      const machines = (bucket?.agents?.buckets || []).map((agent: any) => ({
        agentId: String(agent.key),
        days: (agent?.days?.buckets || []).filter((day: any) => Number(day.doc_count) > 0).map((day: any) => dayOf(day, timeZone)),
      }));
      const days = Array.from(new Set<string>(machines.flatMap((machine: { days: string[] }) => machine.days))).sort();
      return [controlId, { days, machines }];
    })
  );
};
