// Days with facts of each control on each machine in the evaluation window: what L1 (any fact), L2 (recurrence)
// and L3 (continuity) read. Aggregations only, no documents, read as the viewing user like every other fact. The
// controls go in groups so that no search builds more buckets than the indexer allows.
import { buildENSControlFactsFilter } from '../../../common/ens/dashboard/all-controls-facts-filter';
import { dayIn } from '../../../common/ens/maturity/maturity-engine';
import type { ENSMaturityActivity } from '../../../common/ens/maturity/maturity-engine';

// Well below `search.max_buckets` (65,535 by default).
export const MAX_ACTIVITY_BUCKETS = 20000;

export const buildActivityRequest = (filters: unknown[], controlIds: string[], timeZone: string, index: string) => ({
  index,
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
              days: { date_histogram: { field: '@timestamp', calendar_interval: 'day', time_zone: timeZone, min_doc_count: 1 } },
            },
          },
        },
      },
    },
  },
});

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
        days: (agent?.days?.buckets || [])
          .filter((day: any) => Number(day.doc_count) > 0)
          .map((day: any) => dayIn(new Date(Number(day.key)), timeZone)),
      }));
      const days = Array.from(new Set<string>(machines.flatMap((machine: { days: string[] }) => machine.days))).sort();
      return [controlId, { days, machines }];
    })
  );
};
