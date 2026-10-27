// Server queries against the facts. Pure: tested by `tests/evaluation-queries.test.ts` without an index.
// The filters are THE SAME as the browser used (configuration window, view scope, ENS facts), with the window in
// absolute instants so a paged read always sees the same set even if new facts arrive.
import { ENS_ALERTS_INDEX } from '../../../common/constants';
import { ENSCatalog } from '../../../common/ens/catalog';
import {
  buildENSAllControlsFactsFilter,
  buildENSControlFactsFilter,
  buildENSFactsWithoutControlFilter,
  ENS_CONTROL_ID_FIELDS,
} from '../../../common/ens/dashboard/all-controls-facts-filter';
import { resolveENSEvaluationTimeRange } from '../../../common/ens/core/data-source/evaluation-time-range';
import { buildENSScopeAgentQueryFilter } from '../../../common/ens/core/scope/engine';
import type { ENSAgentScope } from '../../../common/ens/core/scope/types';
import {
  getStateFactCollectorField,
  getStateFactEventTypes,
  getStateFactOwnerEvidenceIds,
} from '../../../common/ens/core/evidence/state-facts';
import { getEvidenceDefinitions } from '../../../common/ens/core/evidence/registry';
import { OPERATIONAL_ALERT_KEY_FIELDS } from '../../../common/ens/core/dashboard-adapter/presenters/impact-events.presenter';
import type { OperationalIncident } from '../../../common/ens/core/dashboard-adapter/presenters/impact-events.presenter';

// The only fields the engine reads of each fact (`normalizeWazuhAlert`); no `raw`.
export const ENGINE_SOURCE_FIELDS = [
  'data',
  'agent.id',
  'agent.name',
  'rule.id',
  'rule.description',
  'rule.groups',
  '@timestamp',
  'timestamp',
  'location',
  'input.type',
  'id',
];

// Read order: newest first, with a deterministic tiebreaker on `keyword` fields every Wazuh alert has (`id` is
// unique per manager). Never `_id`: sorting by it loads its fielddata for every document of each shard.
export const FACTS_SORT = [
  { '@timestamp': { order: 'desc' } },
  { id: { order: 'asc', missing: '_last', unmapped_type: 'keyword' } },
  { 'manager.name': { order: 'asc', missing: '_last', unmapped_type: 'keyword' } },
  { 'agent.id': { order: 'asc', missing: '_last', unmapped_type: 'keyword' } },
];

export interface ENSEvaluationWindow {
  from: string;
  to: string;
}

const UNITS: Record<string, number> = { m: 60e3, h: 3600e3, d: 86400e3 };

// `now-30d` -> instant. Anything not understood is treated as the default window.
const instant = (expression: string, now: number): number => {
  if (expression === 'now') return now;
  const m = /^now-(\d+)([mhd])$/.exec(expression);
  return m ? now - Number(m[1]) * UNITS[m[2]] : now - 30 * UNITS.d;
};

export const resolveEvaluationWindow = (evaluationPeriod: string, now: Date): ENSEvaluationWindow => {
  const range = resolveENSEvaluationTimeRange(evaluationPeriod);
  return {
    from: new Date(instant(range.from, now.getTime())).toISOString(),
    to: new Date(instant(range.to, now.getTime())).toISOString(),
  };
};

export const catalogControlIds = (): string[] => ENSCatalog.map(control => control.id);

// Filters of a view: window, scope (the machine and, if present, the manager) and ENS facts; exactly the set the
// panel judged.
export const buildViewFilters = (
  window: ENSEvaluationWindow,
  scopeAgents: ENSAgentScope[],
  agentId?: string
): unknown[] => [
  { range: { '@timestamp': { gte: window.from, lte: window.to } } },
  buildENSScopeAgentQueryFilter(scopeAgents, agentId),
  buildENSAllControlsFactsFilter(catalogControlIds()),
];

// THE PROBE. One query without documents: how many facts and the latest, in total, per control and machine
// (which rows to recompute), those naming no control, those of the types op.acc.3 reads from other controls; per
// machine, its first fact in the window (presence) and the name of the last; and the last heartbeat of each day
// of each machine, any control (see `control-partition.ts`).
// `past`: WHOLE past days of the window (first full day to the start of today, in the viewer's zone): counts per
// control and machine, without control and of crossed types. If unchanged, the points already computed for those
// days stay valid even when new facts (today's) arrive.
export const buildProbeRequest = (filters: unknown[], controlIds: string[], timeZone?: string, past?: { from: string; to: string }) => {
  const pastDay = past ? { past: { filter: { range: { '@timestamp': { gte: past.from, lt: past.to } } } } } : {};
  const byMachine = (aggs?: Record<string, unknown>) => ({
    terms: { field: 'agent.id', size: 10000 },
    aggs: { newest: { max: { field: '@timestamp' } }, ...pastDay, ...(aggs || {}) },
  });
  return {
    index: ENS_ALERTS_INDEX,
    body: {
      size: 0,
      track_total_hits: true,
      query: { bool: { filter: filters } },
      aggs: {
        newest: { max: { field: '@timestamp' } },
        oldest: { min: { field: '@timestamp' } },
        // Indices with facts in the window: reads name them instead of the wildcard (each extra index costs on
        // every call).
        indices: { terms: { field: '_index', size: 500 } },
        controls: {
          filters: {
            filters: Object.fromEntries(controlIds.map(id => [id, buildENSControlFactsFilter(id)])),
          },
          aggs: {
            newest: { max: { field: '@timestamp' } },
            oldest: { min: { field: '@timestamp' } },
            ...pastDay,
            agents: byMachine({ oldest: { min: { field: '@timestamp' } } }),
          },
        },
        orphans: {
          filter: buildENSFactsWithoutControlFilter(),
          aggs: { newest: { max: { field: '@timestamp' } }, ...pastDay, agents: byMachine() },
        },
        heartbeats: {
          filter: { term: { 'data.event': 'collector_run' } },
          aggs: {
            agents: {
              terms: { field: 'agent.id', size: 10000 },
              aggs: {
                days: {
                  date_histogram: {
                    field: '@timestamp',
                    calendar_interval: 'day',
                    time_zone: timeZone || 'UTC',
                    min_doc_count: 1,
                  },
                  aggs: { last: { max: { field: '@timestamp' } } },
                },
              },
            },
          },
        },
        agents: {
          terms: { field: 'agent.id', size: 10000 },
          aggs: {
            first: { min: { field: '@timestamp' } },
            latest: { max: { field: '@timestamp' } },
            last: { top_hits: { size: 1, sort: [{ '@timestamp': { order: 'desc' } }], _source: ['agent.name'] } },
          },
        },
      },
    },
  };
};

export interface ENSFactsCount {
  count: number;
  newest?: string;
  oldest?: string;
}

// Facts of the whole past days of the window (see `buildProbeRequest`).
export interface ENSPastFactsCount {
  total: number;
  agents: Record<string, number>;
}

export interface ENSProbeResult extends ENSFactsCount {
  controls: Record<string, ENSFactsCount & { agents: Record<string, ENSFactsCount> }>;
  orphans: ENSFactsCount & { agents: Record<string, ENSFactsCount> };
  // Per machine, the last heartbeat of each day (any control).
  heartbeats: Record<string, string[]>;
  // Each machine: its first fact in the window (presence), the last, and how many it has.
  presence: { agentId: string; agentName?: string; earliest: string; newest?: string; count: number }[];
  // Indices with facts in the window (`undefined` without a reliable list).
  indices?: string[];
  // Apart (not part of the row fingerprint): facts of whole past days, per control and without control.
  past?: { controls: Record<string, ENSPastFactsCount>; orphans: ENSPastFactsCount };
}

const date = (agg: any): string | undefined =>
  agg && typeof agg.value === 'number' ? new Date(agg.value).toISOString() : undefined;

const byMachineOf = (agg: any): Record<string, ENSFactsCount> =>
  Object.fromEntries(
    (agg?.buckets || []).map((b: any) => [
      String(b.key),
      { count: Number(b.doc_count || 0), newest: date(b.newest), oldest: date(b.oldest) },
    ])
  );

export const readProbeResponse = (body: any): ENSProbeResult => {
  const aggs = body?.aggregations || {};
  const total = body?.hits?.total;
  const indices = aggs.indices && !(Number(aggs.indices.sum_other_doc_count) > 0)
    ? (aggs.indices.buckets || []).map((b: any) => String(b.key))
    : undefined;
  const pastOf = (agg: any): ENSPastFactsCount => ({
    total: Number(agg?.past?.doc_count || 0),
    agents: Object.fromEntries((agg?.agents?.buckets || []).map((b: any) => [String(b.key), Number(b.past?.doc_count || 0)])),
  });
  const withPast = Boolean(aggs.orphans?.past);
  return {
    indices,
    past: withPast
      ? {
          controls: Object.fromEntries(Object.entries(aggs.controls?.buckets || {}).map(([id, b]: [string, any]) => [id, pastOf(b)])),
          orphans: pastOf(aggs.orphans),
        }
      : undefined,
    count: typeof total === 'number' ? total : Number(total?.value || 0),
    newest: date(aggs.newest),
    oldest: date(aggs.oldest),
    controls: Object.fromEntries(
      Object.entries(aggs.controls?.buckets || {}).map(([id, b]: [string, any]) => [
        id,
        { count: Number(b?.doc_count || 0), newest: date(b?.newest), oldest: date(b?.oldest), agents: byMachineOf(b?.agents) },
      ])
    ),
    orphans: { count: Number(aggs.orphans?.doc_count || 0), newest: date(aggs.orphans?.newest), agents: byMachineOf(aggs.orphans?.agents) },
    heartbeats: Object.fromEntries(
      (aggs.heartbeats?.agents?.buckets || []).map((b: any) => [
        String(b.key),
        (b.days?.buckets || []).map((d: any) => date(d.last)).filter(Boolean),
      ])
    ),
    presence: (aggs.agents?.buckets || [])
      .map((b: any) => ({
        agentId: String(b.key),
        agentName: b.last?.hits?.hits?.[0]?._source?.agent?.name,
        earliest: date(b.first),
        newest: date(b.latest),
        count: Number(b.doc_count || 0),
      }))
      .filter((p: any) => p.earliest)
      .sort((a: any, b: any) => a.agentId.localeCompare(b.agentId)),
  };
};

// How many leaves pruning may use. OpenSearch counts ALL leaves of the query against
// `indices.query.bool.max_clause_count` (1024 by default) and the view filters already take about 80: what does
// not fit is read.
export const PRUNING_MAX_LEAVES = 400;

// Facts of a control on ONE machine: its own and those naming no control, with its state facts pruned. Empty `agentId`: the control's facts across the
// whole `viewFilters` scope (only to evaluate a control no machine measures, like the engine).
export const buildFactsQuery = (
  viewFilters: unknown[],
  controlId: string,
  agentId: string | undefined,
  pruning?: unknown
) => {
  return {
    bool: {
      filter: [
        ...viewFilters,
        ...(agentId ? [{ term: { 'agent.id': agentId } }] : []),
        {
          bool: {
            should: [
              buildENSControlFactsFilter(controlId),
              buildENSFactsWithoutControlFilter(),
            ],
            minimum_should_match: 1,
          },
        },
      ],
      ...(pruning ? { must_not: [pruning] } : {}),
    },
  };
};

// Heartbeats of a control on a machine: used to compute the pruning before reading the rest.
export const buildCollectorRunsQuery = (viewFilters: unknown[], controlId: string, agentId: string) => ({
  bool: {
    filter: [
      ...viewFilters,
      { term: { 'agent.id': agentId } },
      buildENSControlFactsFilter(controlId),
      { term: { 'data.event': 'collector_run' } },
    ],
  },
});

// Operational SOC alerts of the panel (ENS-DASH-004): per type, one bucket per incident key over the window, newest first, at most `OPERATIONAL_ALERTS_PER_TYPE`, with its fact count and last timestamp (`multi_terms`, OpenSearch 2.1+; checked on wazuh-indexer 4.14.7).
export const OPERATIONAL_ALERTS_PER_TYPE = 100;
// Each shard proposes its 500 most recent incidents: counts are exact unless an incident falls outside one shard's 500.
const OPERATIONAL_ALERTS_SHARD_SIZE = 500;
// Key values are cut on read: the label shows 140 characters and the cache must not hold unbounded motives.
export const OPERATIONAL_ALERT_FIELD_MAX = 500;
const ALERT_KEY_MISSING = '__none__';

// The read: the incidents, and whether some type had more than the bound (the total is then a lower bound).
export interface OperationalIncidentsRead {
  incidents: OperationalIncident[];
  truncated: boolean;
}

export const buildImpactEventsRequest = (filters: unknown[]) => ({
  index: ENS_ALERTS_INDEX,
  body: {
    size: 0,
    query: {
      bool: {
        // Only the alert types and only ACTIVE controls: the bound is spent on what the panel can show.
        filter: [
          ...filters,
          { terms: { 'data.event': Object.keys(OPERATIONAL_ALERT_KEY_FIELDS) } },
          { terms: { 'data.ensfacil': ENSCatalog.filter(control => control.status === 'ACTIVE').map(control => control.id) } },
        ],
        must_not: [
          ...['data.demo', 'data.synthetic', 'data.is_synthetic', 'data.isSynthetic'].map(field => ({
            // In Wazuh `data.*` is mapped `keyword` (checked in the lab): strings are compared, like
            // `normalizeBoolean`.
            terms: { [field]: ['true', 'True', 'TRUE', '1', 'yes', 'Yes', 'YES'] },
          })),
          { exists: { field: 'data.test_id' } },
          { exists: { field: 'data.testId' } },
        ],
      },
    },
    aggs: Object.fromEntries(
      Object.entries(OPERATIONAL_ALERT_KEY_FIELDS).map(([eventType, fields]) => [
        eventType,
        {
          filter: { term: { 'data.event': eventType } },
          aggs: {
            incidents: {
              multi_terms: {
                terms: [{ field: 'agent.id' }, ...fields.map(name => ({ field: `data.${name}`, missing: ALERT_KEY_MISSING }))],
                size: OPERATIONAL_ALERTS_PER_TYPE,
                shard_size: OPERATIONAL_ALERTS_SHARD_SIZE,
                order: { last: 'desc' },
              },
              aggs: { last: { max: { field: '@timestamp' } } },
            },
          },
        },
      ])
    ),
  },
});

// The incidents of that response, as `operationalIncidentsFromEvents` would group the same facts in memory.
export const readOperationalIncidents = (aggregations: any): OperationalIncidentsRead => ({
  incidents: Object.entries(OPERATIONAL_ALERT_KEY_FIELDS).flatMap(([eventType, fields]) =>
    (aggregations?.[eventType]?.incidents?.buckets || []).flatMap((bucket: any) => {
      const last = Number(bucket?.last?.value);
      const [agentId, ...values] = (Array.isArray(bucket?.key) ? bucket.key : []).map((value: unknown) => String(value ?? ''));
      if (!agentId || !Number.isFinite(last)) return [];
      const valueOf = (i: number) => (values[i] === undefined || values[i] === ALERT_KEY_MISSING ? '' : values[i].slice(0, OPERATIONAL_ALERT_FIELD_MAX));
      return [
        {
          eventType,
          agentId,
          fields: Object.fromEntries(fields.map((name, i) => [name, valueOf(i)])),
          count: Number(bucket.doc_count || 0),
          lastObserved: new Date(last).toISOString(),
        },
      ];
    })
  ),
  truncated: Object.keys(OPERATIONAL_ALERT_KEY_FIELDS).some(eventType => Number(aggregations?.[eventType]?.incidents?.sum_other_doc_count || 0) > 0),
});

// Facts up to the end of each day (for the event count of each series point).
export const buildDailyCountsRequest = (filters: unknown[], timeZone?: string) => ({
  index: ENS_ALERTS_INDEX,
  body: {
    size: 0,
    query: { bool: { filter: filters } },
    aggs: {
      days: {
        date_histogram: {
          field: '@timestamp',
          calendar_interval: 'day',
          ...(timeZone ? { time_zone: timeZone } : {}),
          min_doc_count: 1,
        },
      },
    },
  },
});

// --- exact pruning for the current instant and the series days ---

const NO_VALUE = '__none__';
const ALTERNATIVE_EVIDENCE_FIELDS = ['data.evidenceId', 'data.ev_id', 'data.evidencias'];

// The last state fact of each collector, type and evidence, day by day: the engine's EXACT cutoff is computed
// from it (`computeStateFactCutoffsByCollector`). Only facts the normalizer attributes the same way:
// `data.ensfacil` of the control, `data.event` of the type, the machine in `agent.id`.
// Aggregations of the last state fact of ONE control (inside a query already bounded to its state facts on a
// machine).
const stateFactLastSeenAggs = (controlId: string, timeZone: string) => {
  const fieldName = getStateFactCollectorField(controlId);
  const byDay = {
    days: {
      date_histogram: { field: '@timestamp', calendar_interval: 'day', time_zone: timeZone, min_doc_count: 1 },
      aggs: { last: { max: { field: '@timestamp' } } },
    },
  };
  const byTypeMap = {
    types: {
      terms: { field: 'data.event', size: 200 },
      aggs: { ids: { terms: { field: 'data.evidence_id', size: 200, missing: NO_VALUE }, aggs: byDay } },
    },
  };
  return {
    alt: { filter: { bool: { should: ALTERNATIVE_EVIDENCE_FIELDS.map(field => ({ exists: { field } })), minimum_should_match: 1 } } },
    // A field with several values in one fact (a list) cannot be attributed to a single bucket: the number of
    // values is compared with the number of facts carrying it.
    ...Object.fromEntries(
      ['data.event', 'data.evidence_id', ...(fieldName ? [`data.${fieldName}`] : [])].flatMap((field, i) => [
        [`values_${i}`, { value_count: { field } }],
        [`docs_${i}`, { filter: { exists: { field } } }],
      ])
    ),
    collectors: fieldName
      ? { terms: { field: `data.${fieldName}`, size: 200, missing: NO_VALUE }, aggs: byTypeMap }
      : { filters: { filters: { [NO_VALUE]: { match_all: {} } } }, aggs: byTypeMap },
  };
};

const stateFactsOf = (controlId: string) => [
  { term: { 'data.ensfacil': controlId } },
  { terms: { 'data.event': [...getStateFactEventTypes(controlId)] } },
];

export const buildStateFactLastSeenRequest = (
  viewFilters: unknown[],
  controlId: string,
  agentId: string,
  timeZone: string,
  index: string = ENS_ALERTS_INDEX
) => ({
  index,
  body: {
    size: 0,
    query: { bool: { filter: [...viewFilters, { term: { 'agent.id': agentId } }, ...stateFactsOf(controlId)] } },
    aggs: stateFactLastSeenAggs(controlId, timeZone),
  },
});

// The same for ALL controls with state facts of a machine, in one query (one aggregation per control, with its
// own filter).
export const buildAgentStateFactLastSeenRequest = (
  viewFilters: unknown[],
  controlIds: string[],
  agentId: string,
  timeZone: string,
  index: string = ENS_ALERTS_INDEX
) => ({
  index,
  body: {
    size: 0,
    query: { bool: { filter: [...viewFilters, { term: { 'agent.id': agentId } }, { terms: { 'data.ensfacil': controlIds } }] } },
    aggs: Object.fromEntries(
      controlIds.map((controlId, i) => [
        `c${i}`,
        { filter: { bool: { filter: stateFactsOf(controlId) } }, aggs: stateFactLastSeenAggs(controlId, timeZone) },
      ])
    ),
  },
});

export const readAgentStateFactLastSeen = (controlIds: string[], body: any): Map<string, ENSStateFactLastSeen> =>
  new Map(controlIds.map((controlId, i) => [controlId, readStateFactLastSeen(controlId, { aggregations: body?.aggregations?.[`c${i}`] })]));

export interface ENSStateFactLastSeen {
  // Collectors with state facts (`''` without a collector field).
  collectors: string[];
  lastFactOf: (collector: string, evidenceId: string, at: number) => number | undefined;
}

export const readStateFactLastSeen = (controlId: string, body: any): ENSStateFactLastSeen => {
  const aggs = body?.aggregations || {};
  // If each fact cannot be attributed to its collector, type and evidence, nothing is pruned (without a last
  // fact, no collector has a cutoff):
  //   - facts declaring the evidence in another field;
  //   - a field with several values in the same fact;
  //   - buckets that did not fit in the response (`sum_other_doc_count`).
  const multiValue = Object.keys(aggs)
    .filter(k => k.startsWith('values_'))
    .some(k => Number(aggs[k]?.value) > Number(aggs[`docs_${k.slice(7)}`]?.doc_count));
  const trimmedValue = (node: any): boolean =>
    Boolean(node) &&
    typeof node === 'object' &&
    (Number(node.sum_other_doc_count) > 0 || Object.values(node).some(v => (Array.isArray(v) ? v.some(trimmedValue) : trimmedValue(v))));
  const attributable = !(Number(aggs.alt?.doc_count) > 0) && !multiValue && !trimmedValue(aggs.collectors);
  const maxima = new Map<string, number[]>();
  const buckets = Array.isArray(aggs.collectors?.buckets)
    ? aggs.collectors.buckets
    : Object.entries(aggs.collectors?.buckets || {}).map(([key, b]: [string, any]) => ({ key, ...b }));
  const collectors: string[] = [];
  for (const c of buckets) {
    const collector = String(c.key) === NO_VALUE ? '' : String(c.key).trim();
    collectors.push(collector);
    for (const t of c.types?.buckets || []) {
      for (const id of t.ids?.buckets || []) {
        const key = `${collector}|${t.key}|${String(id.key) === NO_VALUE ? '' : id.key}`;
        const days = (id.days?.buckets || []).map((d: any) => Number(d.last?.value)).filter(Number.isFinite);
        maxima.set(key, [...(maxima.get(key) || []), ...days].sort((a, b) => a - b));
      }
    }
  }
  const typesOf = (evidenceId: string) =>
    [...getStateFactEventTypes(controlId)].filter(type => getStateFactOwnerEvidenceIds(controlId, type).includes(evidenceId));
  return {
    collectors: [...new Set(collectors)],
    lastFactOf: (collector, evidenceId, at) => {
      if (!attributable) return undefined;
      let last2: number | undefined;
      for (const type of typesOf(evidenceId)) {
        for (const id of [evidenceId, '']) {
          for (const m of maxima.get(`${collector}|${type}|${id}`) || []) {
            if (m <= at && (last2 === undefined || m > last2)) last2 = m;
          }
        }
      }
      return last2;
    },
  };
};

// Date ranges that need NOT be read for a collector: what lies outside the union of (cutoff, instant] over all
// instants. Without a cutoff at an instant, everything before it is read.
export const prunableRanges = (
  windowStart: number,
  instants: number[],
  cutoffs: (number | undefined)[]
): { from: number; to: number }[] => {
  const inside = instants
    .map((hi, i) => ({ lo: cutoffs[i] === undefined ? windowStart - 1 : (cutoffs[i] as number), hi }))
    .filter(r => r.hi > r.lo)
    .sort((a, b) => a.lo - b.lo);
  const joined: { lo: number; hi: number }[] = [];
  for (const r of inside) {
    const last2 = joined[joined.length - 1];
    if (last2 && r.lo <= last2.hi) last2.hi = Math.max(last2.hi, r.hi);
    else joined.push({ ...r });
  }
  // Gaps: [start, lo1], (hi1, lo2], ... Bounds are instants in ms; a fact dated exactly at the cutoff is
  // discarded (the engine keeps > cutoff).
  const gaps: { from: number; to: number }[] = [];
  let since = windowStart;
  for (const u of joined) {
    if (u.lo >= since) gaps.push({ from: since, to: u.lo });
    since = u.hi + 1;
  }
  return gaps;
};

// The clause excluding those ranges, type by type (with their owning evidences) and collector by collector. When
// in doubt the fact is read.
export const buildStateFactKeepClause = (
  controlId: string,
  agentId: string,
  gapsByCollector: Map<string, { from: number; to: number }[]>
): unknown | undefined => {
  const fieldName = getStateFactCollectorField(controlId);
  const allOnes = getEvidenceDefinitions(controlId).map(definition => definition.id);
  if (!getStateFactEventTypes(controlId).size) return undefined;
  const byTypeMap = [...getStateFactEventTypes(controlId)].map(type => {
    const owners = getStateFactOwnerEvidenceIds(controlId, type);
    const foreignOnes = allOnes.filter(id => !owners.includes(id));
    return {
      bool: {
        filter: [{ term: { 'data.event': type } }],
        should: [{ bool: { must_not: { exists: { field: 'data.evidence_id' } } } }, { terms: { 'data.evidence_id': owners } }],
        minimum_should_match: 1,
        ...(foreignOnes.length ? { must_not: [{ terms: { 'data.evidence_id': foreignOnes } }] } : {}),
      },
    };
  });
  // Collector by collector while their ranges fit; those that do not are read whole.
  let leaves = byTypeMap.length * 4 + 8;
  const fit = [...gapsByCollector.entries()]
    .filter(([, gaps]) => gaps.length)
    .filter(([, gaps]) => {
      if (leaves + gaps.length + 1 > PRUNING_MAX_LEAVES) return false;
      leaves += gaps.length + 1;
      return true;
    });
  const should = fit
    .map(([collector, gaps]) => ({
      bool: {
        filter: [
          ...(fieldName
            ? [collector ? { term: { [`data.${fieldName}`]: collector } } : { bool: { must_not: { exists: { field: `data.${fieldName}` } } } }]
            : []),
          { bool: { should: gaps.map(g => ({ range: { '@timestamp': { gte: new Date(g.from).toISOString(), lte: new Date(g.to).toISOString() } } })), minimum_should_match: 1 } },
        ],
      },
    }));
  if (!should.length) return undefined;
  return {
    bool: {
      filter: [
        { term: { 'data.ensfacil': controlId } },
        { term: { 'agent.id': agentId } },
        { bool: { should: byTypeMap, minimum_should_match: 1 } },
        { bool: { should, minimum_should_match: 1 } },
      ],
      must_not: ALTERNATIVE_EVIDENCE_FIELDS.map(field => ({ exists: { field } })),
    },
  };
};


// --- one stream per machine ---
// On the real indexer each CALL costs (0.16-0.34 s), not the bytes. Instead of one read per control and machine,
// it reads once per machine (or per group of its controls), sorted by control: each control is evaluated as soon
// as its stretch ends. What the stretch does not carry is read apart, once per machine: facts without
// `data.ensfacil` or with an old control field (those naming no control go to every row; old ones to their
// control's) and heartbeats (for pruning).

export const ENS_LEGACY_CONTROL_FIELDS = ['data.ens', 'data.control_id', 'data.control'];

// Stream order: by control and, inside each control, the usual order (each row receives its facts in the same
// order as reading it alone).
// `unmapped_type`: the Wazuh template maps `data.*` dynamically, and a daily index without any ENSFácil fact
// (days without collectors, before installation) does not map `data.ensfacil`; without it OpenSearch rejects the
// whole search with a 400 ("No mapping found ... in order to sort on"), wildcard included.
export const STREAM_SORT = [{ 'data.ensfacil': { order: 'asc', missing: '_last', unmapped_type: 'keyword' } }, ...FACTS_SORT];

export const buildAgentStreamQuery = (viewFilters: unknown[], agentId: string, controlIds: string[], prunings: unknown[]) => ({
  bool: {
    filter: [...viewFilters, { term: { 'agent.id': agentId } }, { terms: { 'data.ensfacil': controlIds } }],
    must_not: [...ENS_LEGACY_CONTROL_FIELDS.map(field => ({ exists: { field } })), ...prunings],
  },
});

// What the stream does not carry: no `data.ensfacil`, or an old control field.
export const buildAgentSideQuery = (viewFilters: unknown[], agentId: string) => ({
  bool: {
    filter: [
      ...viewFilters,
      { term: { 'agent.id': agentId } },
      {
        bool: {
          should: [
            { bool: { must_not: { exists: { field: 'data.ensfacil' } } } },
            ...ENS_LEGACY_CONTROL_FIELDS.map(field => ({ exists: { field } })),
          ],
          minimum_should_match: 1,
        },
      },
    ],
  },
});

// Heartbeats of a machine, from all its controls.
export const buildAgentRunsQuery = (viewFilters: unknown[], agentId: string) => ({
  bool: { filter: [...viewFilters, { term: { 'agent.id': agentId } }, { term: { 'data.event': 'collector_run' } }] },
});

const fieldValues = (data: any, field: string): unknown[] => {
  const v = data?.[field.slice('data.'.length)];
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).filter(x => x !== undefined && x !== null);
};

// Does this fact (read apart) go to this control's row? Same as the filter of a per-row read: it names it in any
// of the four fields, or names none.
export const sideFactBelongsTo = (hit: any, controlId: string): boolean => {
  const data = hit?._source?.data;
  const values = ENS_CONTROL_ID_FIELDS.map(field => fieldValues(data, field));
  if (values.every(list => list.length === 0)) return true;
  return values.some(list => list.some(value => String(value) === controlId));
};

// Compares two strings by code point (the `keyword` order).
const byCode = (a: string, b: string): number => {
  if (a === b) return 0;
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i].codePointAt(0) as number) - (y[i].codePointAt(0) as number);
    if (d) return d;
  }
  return x.length - y.length;
};

// `FACTS_SORT` order between two facts, with their sort values (the last four: the stream puts the control first).
export const compareFactsOrder = (a: any, b: any): number => {
  const x = (a?.sort || []).slice(-4);
  const y = (b?.sort || []).slice(-4);
  const ta = x[0] === null || x[0] === undefined ? null : Number(x[0]);
  const tb = y[0] === null || y[0] === undefined ? null : Number(y[0]);
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  }
  for (let i = 1; i < 4; i++) {
    const goes = x[i] === null || x[i] === undefined ? null : String(x[i]);
    const vb = y[i] === null || y[i] === undefined ? null : String(y[i]);
    if (goes === vb) continue;
    if (goes === null) return 1;
    if (vb === null) return -1;
    return byCode(goes, vb);
  }
  return 0;
};

// Merges two lists already sorted by `FACTS_SORT`.
export const mergeFactsInOrder = (a: any[], b: any[]): any[] => {
  if (!b.length) return a;
  if (!a.length) return b;
  const output: any[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) output.push(compareFactsOrder(a[i], b[j]) <= 0 ? a[i++] : b[j++]);
  while (i < a.length) output.push(a[i++]);
  while (j < b.length) output.push(b[j++]);
  return output;
};

// Indices to read: those with facts in the window according to the probe (and, if they follow Wazuh's daily
// name, those of each day of the window, in case one is created after the probe). Without a reliable list, the
// wildcard.
const DAILY = /^(.*-)(\d{4})\.(\d{2})\.(\d{2})$/;
export const factsIndexFor = (indices: string[] | undefined, window: { from: string; to: string }): string => {
  if (!indices || !indices.length) return ENS_ALERTS_INDEX;
  const names = new Set(indices);
  const prefixes = new Set(indices.map(i => DAILY.exec(i)?.[1]).filter(Boolean) as string[]);
  if (prefixes.size === 1 && indices.every(i => DAILY.test(i))) {
    const prefix = [...prefixes][0];
    for (let t = Date.parse(window.from.slice(0, 10)); t <= Date.parse(window.to); t += 86400e3) {
      const d = new Date(t);
      names.add(`${prefix}${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`);
    }
  }
  const list = [...names].sort().join(',');
  // URL too long: the wildcard.
  return list.length > 3000 ? ENS_ALERTS_INDEX : list;
};
