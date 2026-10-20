// Evaluation on the plugin server.
import { createHash } from 'crypto';
import { deflateRawSync, inflateRawSync } from 'zlib';
import type { Logger } from '../../../../src/core/server';
import { ENS_CONFIGURATION_INDEX } from '../../../common/constants';
import { buildMonitoringInventoryRequest, inventoryFromMonitoring } from '../../../common/agents/agent-inventory';
import { ENSCatalog, isPendingMeasurement } from '../../../common/ens/catalog';
import { defaultENSConfigurationTemplate } from '../../../common/ens/configuration/data/default-configuration';
import { ensConfigurationRepository } from '../../../common/ens/configuration/repository';
import { assertENSConfigurationVersion } from '../../../common/ens/configuration/services/configuration-structure-validator';
import type { ENSConfigurationVersion } from '../../../common/ens/configuration/types';
import { toTemplateModel } from '../../../common/ens/configuration/agents/configuration-resolver';
import { normalizeOrganizationData } from '../../../common/ens/configuration/organization/organization-data-migration';
import { buildComplianceState } from '../../../common/ens/core/compliance-state';
import type { ENSComplianceState } from '../../../common/ens/core/compliance-state/types';
import {
  assembleENSComplianceState,
  buildENSHeartbeatEvents,
  buildENSPresenceEvents,
  consolidateENSControlRows,
  ENS_CROSS_CONTROL_EVENT_TYPES,
  ENS_CROSS_CONTROL_HEARTBEAT,
  ENSControlPartition,
  evaluateENSControlPartition,
  evaluateENSControlRow,
  listENSControlRowAgents,
  resultStatusStub,
} from '../../../common/ens/core/control-partition';
import { buildImpactEventsModelFromCounts } from '../../../common/ens/core/dashboard-adapter/presenters/impact-events.presenter';
import type { ImpactEventsModel } from '../../../common/ens/core/dashboard-adapter/models/impact-events.model';
import { normalizeWazuhAlerts } from '../../../common/ens/core/data-source/data-source-engine';
import type { ENSNormalizedEvent } from '../../../common/ens/core/data-source/types';
import type { ENSComplianceResult, ENSTraceabilityResult } from '../../../common/ens/core/evaluation/types';
import { buildENSControlFactsFilter } from '../../../common/ens/dashboard/all-controls-facts-filter';
import { computeStateFactCutoffsByCollector } from '../../../common/ens/core/evidence/state-facts';
import { getEvidenceDefinitions } from '../../../common/ens/core/evidence/registry';
import { normalizeInventory, resolveENSScopeAgents } from '../../../common/ens/core/scope/runtime';
import {
  ENS_MANAGER_AGENT_ID,
  isControlMeasuredOnAgent,
  isManagerAgentId,
  isManagerOnlyControl,
} from '../../../common/ens/core/scope/measurement-planes';
import type { ENSAgentScope } from '../../../common/ens/core/scope/types';
import { planENSTimelineCuts, startOfDayIn } from '../../../common/ens/core/timeline/timeline-cuts';
import type { ENSTimelineCutPlan } from '../../../common/ens/core/timeline/timeline-cuts';
import { ENS_EVALUATION_LIMITS } from '../../../common/ens/evaluation/limits';
import { readActiveENSConfiguration } from '../configuration-storage';
import { resolveCurrentUser } from '../current-user';
import { Cancellable, CancelSignal, EVALUATION_TTL_MS, EvaluationCache, Semaphore } from './cache';
import { ENSTooManyFactsError, MAX_FACTS_PER_READ, newReadStats, readAllFacts, searchComplete, throwIfCancelled, yieldToEventLoop } from './facts-reader';
import type { ENSFactsReadStats } from './facts-reader';
import {
  buildAgentRunsQuery,
  buildAgentSideQuery,
  buildAgentStateFactLastSeenRequest,
  buildAgentStreamQuery,
  buildCollectorRunsQuery,
  buildDailyCountsRequest,
  factsIndexFor,
  mergeFactsInOrder,
  readAgentStateFactLastSeen,
  sideFactBelongsTo,
  STREAM_SORT,
  buildFactsQuery,
  buildImpactEventsRequest,
  buildProbeRequest,
  buildStateFactKeepClause,
  buildStateFactLastSeenRequest,
  buildViewFilters,
  prunableRanges,
  readStateFactLastSeen,
  catalogControlIds,
  readProbeResponse,
  resolveEvaluationWindow,
} from './queries';
import type { ENSEvaluationWindow, ENSProbeResult, ENSStateFactLastSeen } from './queries';
import { overviewQueryFlags, perControlOfPoint, perControlOfResults } from './overview-fields';

export type ENSEvaluationInclude = 'summary' | 'results' | 'dashboard' | 'control' | 'overview';

export interface ENSEvaluationQuery {
  agentId?: string;
  controlId?: string;
  include: ENSEvaluationInclude;
  // Series days (0 or none: no series). The panel asks 7, the detail 30.
  timelineDays?: number;
  // Viewer's IANA time zone: decides what "a day" is in the series.
  timeZone: string;
  // Per-control figures of each series point (`overview-fields.ts`).
  timelineControls?: boolean;
}

export interface ENSEvaluationClients {
  asCurrentUser: any;
  asInternalUser: any;
}

// A malformed request: 400 with the reason.
export class ENSBadRequestError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ENSBadRequestError';
  }
}

// Machine id as the inventory writes it (`24` -> `024`).
const normalizeAgentId = (value: string): string => {
  const text = value.trim();
  return /^\d+$/.test(text) ? text.padStart(3, '0') : text;
};

const sha = (...parts: unknown[]): string =>
  createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16);

export const isValidTimeZone = (timeZone?: string): boolean => {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

// Checked request parameters. What depends on the scope (the machine being in it) is checked with the context
// (`run`).
export const normalizeQuery = (query: Record<string, unknown>): ENSEvaluationQuery => {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const controlId = text(query.controlId);
  if (controlId && !ENSCatalog.some(control => control.id === controlId)) {
    throw new ENSBadRequestError(`El control «${controlId}» no está en el catálogo de ENSFácil.`);
  }
  const agentName = text(query.agentId);
  const agentId = agentName ? normalizeAgentId(agentName) : undefined;
  if (agentName && (!agentId || agentId.length > 64)) {
    throw new ENSBadRequestError(`«${agentName}» no es un identificador de máquina válido.`);
  }
  const zone = text(query.timeZone);
  if (zone && !isValidTimeZone(zone)) {
    throw new ENSBadRequestError(`«${zone}» no es una zona horaria IANA válida.`);
  }
  const include = text(query.include);
  if (include && !['summary', 'results', 'dashboard', 'control', 'overview'].includes(include)) {
    throw new ENSBadRequestError(`Vista desconocida: «${include}».`);
  }
  if (include === 'overview' && controlId) {
    throw new ENSBadRequestError('La Vista general es de todos los controles: sin «controlId».');
  }
  const days = query.timelineDays === undefined || query.timelineDays === '' ? 0 : Number(query.timelineDays);
  if (!Number.isInteger(days) || days < 0 || days > ENS_EVALUATION_LIMITS.maxTimelineDays) {
    throw new ENSBadRequestError(`Los días de la serie van de 0 a ${ENS_EVALUATION_LIMITS.maxTimelineDays}.`);
  }
  return {
    agentId,
    controlId,
    include: (include as ENSEvaluationInclude) || (controlId ? 'control' : 'summary'),
    timelineDays: days,
    timeZone: zone || 'UTC',
    ...overviewQueryFlags(query),
  };
};

export interface ENSEvaluationContext {
  now: Date;
  userKey: string;
  configuration: ENSConfigurationVersion;
  configurationKey: string;
  configurationUpdatedAt?: string;
  scope: ENSAgentScope[];
  scopeKey: string;
  inventory: { stale: boolean; newestTimestamp?: string; agents: number };
  window: ENSEvaluationWindow;
  // Filters of the WHOLE scope: the server always evaluates all machines; a machine's view comes from its rows.
  filters: unknown[];
  probe: ENSProbeResult;
  // Where facts are read: the window's indices (or the wildcard).
  factsIndex: string;
  // Presence facts of all machines (identity and names).
  presenceEvents: ENSNormalizedEvent[];
  presenceOf: Map<string, ENSNormalizedEvent>;
  heartbeatsOf: Map<string, ENSNormalizedEvent[]>;
  timeZone: string;
}

// A series point of a row at a cutoff date.
interface CutPoint {
  status: string;
  score?: number;
}

// Series days a row has computed: for a time zone and a today (`key`), the point of each day end (by ISO instant).
interface StoredCuts {
  key: string;
  // With which past-day facts they were computed (`pastSignature`): new facts are today's and do not change
  // them; a late fact dated on a past day does.
  pastKey: string;
  // Instant of the request that started it: between two series of the same day for the same row, the most recent
  // wins.
  asOf: number;
  points: Record<string, CutPoint>;
  // All computed days (stored as they come out). A half-done series passes from one row version to the next and
  // keeps filling.
  complete: boolean;
}

// What is stored of a row (a control on a machine). No facts.
interface StoredRow {
  result?: ENSComplianceResult;
  // Stored traceability (first entries), compressed: almost all of a row's size, read only by the detail and its
  // pages.
  traceability: Buffer | null;
  traceabilityStored: number;
  traceabilityTotal: number;
  cuts?: StoredCuts;
  stats: ENSRowComputeStats;
  // Configuration and scope it was computed with: an entry from another configuration is not shown, not even
  // while recomputing.
  configurationKey: string;
  scopeKey: string;
  // Last background refresh attempt that failed.
  refreshError?: { message: string; at: string };
  // Already replaced by another version (new facts).
  superseded?: boolean;
}

export interface ENSRowComputeStats {
  controlId: string;
  agentId: string;
  hits: number;
  pages: number;
  events: number;
  // Waiting for its turn (read and engine slot).
  queueMs: number;
  // Reading: waiting on the indexer client (response and parsing).
  fetchMs: number;
  // Normalising the facts read.
  normalizeMs: number;
  // The engine, as of now.
  evaluateMs: number;
  // The series (background): read, normalise and evaluate each day.
  seriesFetchMs?: number;
  seriesNormalizeMs?: number;
  cutsMs?: number;
  pruned: boolean;
}

const compresses = (list: ENSTraceabilityResult[]): Buffer | null =>
  list.length ? deflateRawSync(Buffer.from(JSON.stringify(list), 'utf8')) : null;

export const decompressTraceability = (dataItems: Buffer | null): ENSTraceabilityResult[] =>
  dataItems ? JSON.parse(inflateRawSync(dataItems).toString('utf8')) : [];

// Size of a stored row (for the memory cap). The series counts at full size (90 days at most) even if its points
// arrive after storing.
export const storedRowBytes = (row: StoredRow): number =>
  JSON.stringify(row.result || null).length + (row.traceability?.length || 0) + ENS_EVALUATION_LIMITS.maxTimelineDays * 80 + 512;

// The result as is, except traceability (the control's fact list, tens of thousands with op.acc.3).
export const withoutTraceability = (result: ENSComplianceResult): ENSComplianceResult => ({
  ...result,
  traceability: [],
});

const hasStateFacts = (controlId: string): boolean =>
  getEvidenceDefinitions(controlId).some(definition => (definition.stateFactEventTypes || []).length > 0);

// The active configuration is re-read only when its stamp changes: the document carries the history and weighs
// hundreds of KB. The stamp includes `_seq_no` and `_primary_term`, which change on any write.
const readConfigurationStamp = async (client: any): Promise<string | undefined> => {
  const body = await searchComplete(
    client,
    {
      index: ENS_CONFIGURATION_INDEX,
      body: {
        size: 1,
        seq_no_primary_term: true,
        query: { ids: { values: ['active'] } },
        _source: ['updatedAt', 'configuration.updatedAt'],
      },
    },
    'la configuración ENS'
  );
  const hit = body?.hits?.hits?.[0];
  const doc = hit?._source;
  return doc ? `${doc.updatedAt || ''}|${doc.configuration?.updatedAt || ''}|${hit._seq_no ?? ''}|${hit._primary_term ?? ''}` : undefined;
};

// A machine's view comes from the overview rows: its row if the control is measured there; the manager's row for
// an organization control; nothing if not measured. `null` when it cannot be decided from the rows (organization
// control without a manager row): then it is evaluated apart.
export const deriveForAgent = (
  controlId: string,
  agentId: string,
  rowAgents: string[],
  scope: ENSAgentScope[]
): { from: 'row' | 'manager' | 'none' } | null => {
  if (!scope.some(agent => agent.id === agentId)) return null;
  const control = ENSCatalog.find(entry => entry.id === controlId);
  if (!control) return null;
  if (isControlMeasuredOnAgent(control, agentId)) {
    // No row: the machine is not in its declared scope (no result).
    return { from: rowAgents.includes(agentId) ? 'row' : 'none' };
  }
  if (isManagerOnlyControl(control) && !isManagerAgentId(agentId)) {
    return rowAgents.includes(ENS_MANAGER_AGENT_ID) ? { from: 'manager' } : null;
  }
  return { from: 'none' };
};

export interface ENSEvaluationServiceOptions {
  logger: Logger;
  securityEnabled: boolean;
  clock?: () => Date;
  // Heavy reads (a control on a machine) at once. The engine always one at a time.
  maxConcurrentReads?: number;
  // Facts in memory at once per read (~1.7 KB each).
  maxFactsPerRead?: number;
  // Size of the stored rows.
  maxStoredBytes?: number;
  // What the list or panel waits before answering with what exists.
  firstResponseMs?: number;
}

export interface ENSRunOptions {
  // Answer with the stored data even if no longer valid, and recompute behind.
  allowStale?: boolean;
  // Whoever waits for the answer (cancelled if it leaves).
  signal?: Cancellable;
  // "Reintentar": refresh at once what could not be refreshed, no waiting.
  retryRefresh?: boolean;
}

// A control's view for the request: its result, traceability and rows (the panel's).
export interface ENSViewPartition {
  controlId: string;
  result?: ENSComplianceResult;
  traceability: () => ENSTraceabilityResult[];
  traceabilityStored: number;
  traceabilityTotal: number;
  rows: { agentId: string; result: ENSComplianceResult }[];
  // The point of a past day, or `undefined` if not computed yet.
  pointAt: (cutoffIso: string, cutoff: Date) => CutPoint | null | undefined;
}

// The list, the overview and the panel answer at most 1.5 s after starting to read (about 2 s with the context),
// with the rows that exist; the rest keep computing (`meta.pending`).
export const FIRST_RESPONSE_MS = 1500;
// Views that answer in parts.
const PROGRESSIVE: ENSEvaluationInclude[] = ['summary', 'overview', 'dashboard'];
// A failed cold computation is reported in following requests for this time, without relaunching it on every
// browser poll.
const COLD_FAILURE_MS = 30 * 1000;

// Retry delay of a failed refresh (or series): 30 s, 1 min, 2, 4... up to 5 min.
const waitAfterFailureMs = (failures: number): number => Math.min(5 * 60 * 1000, 30 * 1000 * 2 ** Math.max(0, failures - 1));

// What is measured per control, accumulated (for `measure-evaluation.ts`).
export interface ENSControlMetrics {
  rows: number;
  hits: number;
  queueMs: number;
  fetchMs: number;
  normalizeMs: number;
  evaluateMs: number;
  seriesRows: number;
  seriesHits: number;
  seriesFetchMs: number;
  seriesNormalizeMs: number;
  seriesEvaluateMs: number;
}

// A row to compute: control, facts machine and view machine.
interface RowSpec {
  controlId: string;
  factsAgent?: string;
  viewAgent?: string;
}

export const createEvaluationService = ({
  logger,
  securityEnabled,
  clock = () => new Date(),
  maxConcurrentReads = 4,
  maxFactsPerRead = MAX_FACTS_PER_READ,
  maxStoredBytes = 64 * 1024 * 1024,
  firstResponseMs = FIRST_RESPONSE_MS,
}: ENSEvaluationServiceOptions) => {
  const clockValue = () => clock().getTime();
  const rows = new EvaluationCache<StoredRow>(20000, EVALUATION_TTL_MS, clockValue, maxStoredBytes, storedRowBytes);
  // Past days of a series do not change within the day: up to 26 h (the key carries the day and zone; only valid
  // IANA zones arrive here).
  const timelines = new EvaluationCache<{ pasados: any[]; configurationKey: string; scopeKey: string }>(200, 26 * 3600 * 1000, clockValue);
  const impacts = new EvaluationCache<ImpactEventsModel>(200, EVALUATION_TTL_MS, clockValue);
  const inventories = new EvaluationCache<{ agents: ENSAgentScope[]; stale: boolean; newestTimestamp?: string }>(100, 60 * 1000, clockValue);
  const configurations = new EvaluationCache<{ configuration: ENSConfigurationVersion; updatedAt?: string; key: string }>(4, 24 * 3600 * 1000, clockValue);
  // Up to 4 reads at once (the indexer has room) and the engine one at a time (dashboard process CPU). What
  // someone waits for goes ahead of background work (refreshes and series).
  const reads = new Semaphore(maxConcurrentReads);
  const cpu = new Semaphore(1);
  const refreshFailures = new Map<string, { failures: number; nextAt: number }>();
  const coldFailures = new Map<string, { error: unknown; at: number }>();
  const metrics = new Map<string, ENSControlMetrics>();
  const metricsOf = (controlId: string): ENSControlMetrics => {
    let m = metrics.get(controlId);
    if (!m) {
      m = { rows: 0, hits: 0, queueMs: 0, fetchMs: 0, normalizeMs: 0, evaluateMs: 0, seriesRows: 0, seriesHits: 0, seriesFetchMs: 0, seriesNormalizeMs: 0, seriesEvaluateMs: 0 };
      metrics.set(controlId, m);
    }
    return m;
  };

  // --- 1. context ---

  const loadConfiguration = async (clients: ENSEvaluationClients) => {
    const stamp = (await readConfigurationStamp(clients.asInternalUser)) || 'default';
    const cached = configurations.get('active', stamp);
    if (cached) return cached;
    const stored = await readActiveENSConfiguration(clients.asInternalUser, logger);
    // A 1.2.0 document is converted once per load, and the organisation data applied, exactly as the browser does
    // on hydration. Neither changes a parameter the engine reads unless the organisation value says so.
    const configuration = stored?.configuration
      ? normalizeOrganizationData(toTemplateModel(assertENSConfigurationVersion(stored.configuration))).configuration
      : (defaultENSConfigurationTemplate as ENSConfigurationVersion);
    const entry = {
      configuration,
      updatedAt: stored?.updatedAt || (configuration as any).updatedAt,
      key: sha(stamp, stored?.configuration || 'default'),
    };
    configurations.set('active', stamp, entry);
    return entry;
  };

  const loadContext = async (clients: ENSEvaluationClients, query: ENSEvaluationQuery): Promise<ENSEvaluationContext> => {
    const now = clock();
    const user = await resolveCurrentUser(clients.asCurrentUser, securityEnabled);
    // What each user sees depends on their indexer permissions: memory is per user and roles, never shared.
    const userKey = `${user.username}|${[...user.roles].sort().join(',')}`;
    const { configuration, updatedAt, key: configurationKey } = await loadConfiguration(clients);

    let inventory = inventories.get(userKey, 'inventory');
    if (!inventory) {
      const body = await searchComplete(clients.asCurrentUser, buildMonitoringInventoryRequest(), 'el inventario de agentes');
      const readValue2 = inventoryFromMonitoring(body?.aggregations, now.getTime());
      inventory = { agents: normalizeInventory(readValue2.agents), stale: readValue2.stale, newestTimestamp: readValue2.newestTimestamp };
      inventories.set(userKey, 'inventory', inventory);
    }
    const scope = resolveENSScopeAgents(inventory.agents, configuration.scope);
    if (query.agentId && !scope.some(agent => agent.id === query.agentId)) {
      throw new ENSBadRequestError(`La máquina ${query.agentId} no está en el alcance ENS.`);
    }
    const scopeKey = sha(scope.map(agent => [agent.id, agent.name, agent.groups]));

    const window = resolveEvaluationWindow(configuration.global.evaluationPeriod, now);
    const filters = buildViewFilters(window, scope);
    // WHOLE past days of the window: from the first full day (fixed all day even if the window moves) to the
    // start of today.
    const today = startOfDayIn(now, query.timeZone);
    const firstDay = startOfDayIn(new Date(Date.parse(window.from) + 86400e3), query.timeZone);
    const probe = readProbeResponse(
      await searchComplete(
        clients.asCurrentUser,
        buildProbeRequest(filters, catalogControlIds(), query.timeZone, { from: firstDay.toISOString(), to: today.toISOString() }),
        'la sonda de hechos'
      )
    );
    const presenceEvents = buildENSPresenceEvents(probe.presence);

    return {
      now,
      userKey,
      configuration,
      configurationKey,
      configurationUpdatedAt: updatedAt,
      scope,
      scopeKey,
      inventory: { stale: inventory.stale, newestTimestamp: inventory.newestTimestamp, agents: inventory.agents.length },
      window,
      filters,
      probe,
      presenceEvents,
      factsIndex: factsIndexFor(probe.indices, window),
      presenceOf: new Map(presenceEvents.map(event => [event.agentId as string, event])),
      heartbeatsOf: new Map(
        Object.entries(probe.heartbeats).map(([agentId, times]) => [agentId, buildENSHeartbeatEvents([{ agentId, times }])])
      ),
      timeZone: query.timeZone,
    };
  };

  const controlsOf = (query: ENSEvaluationQuery): string[] =>
    query.controlId ? [query.controlId] : catalogControlIds();

  const identitiesOf = (ctx: ENSEvaluationContext) => {
    ensConfigurationRepository.replaceActive(ctx.configuration);
    return { all: listENSControlRowAgents('', ctx.scope, ctx.presenceEvents), forControl: (controlId: string) => listENSControlRowAgents(controlId, ctx.scope, ctx.presenceEvents) };
  };

  // Row fingerprint: what, if it changes, changes its result.
  const rowFingerprint = (ctx: ENSEvaluationContext, controlId: string, agentId: string): string =>
    sha(
      ctx.configurationKey,
      ctx.scopeKey,
      controlId,
      agentId,
      ctx.probe.controls[controlId]?.agents[agentId] || null,
      ctx.probe.orphans.agents[agentId] || null,
      ctx.presenceOf.has(agentId),
      ctx.probe.cross[controlId]?.[agentId] || null,
      ENS_CROSS_CONTROL_HEARTBEAT.includes(controlId) ? (ctx.probe.heartbeats[agentId] || []).slice(-1)[0] || null : null
    );

  // Facts of a row's whole past days (in the viewer's zone): if unchanged, its points of those days stay valid.
  const pastSignature = (ctx: ENSEvaluationContext, spec: RowSpec): string => {
    const past = ctx.probe.past;
    const today = startOfDayIn(ctx.now, ctx.timeZone).getTime();
    if (!spec.factsAgent) {
      return sha(ctx.timeZone, startOfDayIn(ctx.now, ctx.timeZone).toISOString(), past?.controls[spec.controlId]?.total ?? null, past?.orphans.total ?? null);
    }
    const agentName = spec.factsAgent;
    return sha(
      ctx.timeZone,
      startOfDayIn(ctx.now, ctx.timeZone).toISOString(),
      past?.controls[spec.controlId]?.agents[agentName] ?? null,
      past?.orphans.agents[agentName] ?? null,
      past?.cross[spec.controlId]?.agents[agentName] ?? null,
      ENS_CROSS_CONTROL_HEARTBEAT.includes(spec.controlId) ? (ctx.probe.heartbeats[agentName] || []).filter(t => Date.parse(t) < today) : null
    );
  };

  // That of a control without rows (the engine evaluates it over all its facts).
  const fallbackFingerprint = (ctx: ENSEvaluationContext, controlId: string): string =>
    sha(ctx.configurationKey, ctx.scopeKey, controlId, ctx.probe.controls[controlId] || null, ctx.probe.orphans, ctx.presenceEvents.map(e => e.agentId));

  // View fingerprint: the one the browser probe compares.
  const viewFingerprint = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): string => {
    const { forControl } = identitiesOf(ctx);
    return sha(
      ctx.configurationKey,
      ctx.scopeKey,
      query.agentId || '*',
      controlsOf(query).map(controlId => {
        const rows = forControl(controlId).map(agent => rowFingerprint(ctx, controlId, agent.agentId));
        return rows.length ? rows : fallbackFingerprint(ctx, controlId);
      })
    );
  };

  // Cost of computing a row (the facts the probe reports): cheap ones first.
  const weightOf = (ctx: ENSEvaluationContext, controlId: string, agentId?: string): number =>
    agentId ? ctx.probe.controls[controlId]?.agents[agentId]?.count || 0 : ctx.probe.controls[controlId]?.count || 0;

  // Series days each row computes: those of the configuration window (30 by default), in the viewer's zone. They
  // cover any series the screens ask (panel 7, detail 30).
  const seriesOf = (ctx: ENSEvaluationContext) => {
    // One day more than the window: its first day is usually partial and a view's series starts on the day of
    // its first fact.
    const days = Math.min(
      ENS_EVALUATION_LIMITS.maxTimelineDays,
      Math.max(1, Math.ceil((Date.parse(ctx.window.to) - Date.parse(ctx.window.from)) / 86400e3) + 1)
    );
    const plan = planENSTimelineCuts(Date.parse(ctx.window.from), 1, {
      now: ctx.now,
      days: days,
      timeZone: ctx.timeZone,
      maxEvaluatedEvents: Infinity,
    }).filter(cut => !cut.isCurrent);
    return { key: sha(ctx.timeZone, startOfDayIn(ctx.now, ctx.timeZone).toISOString(), days), plan };
  };

  // --- 2. a row ---

  const readFacts = async (ctx: ENSEvaluationContext, client: any, query: unknown, stats: ENSFactsReadStats, what: string, signal?: Cancellable): Promise<any[]> => {
    const hits: any[] = [];
    await readAllFacts(client, query, page => {
      for (const hit of page) hits.push(hit);
    }, stats, { maxFacts: maxFactsPerRead, what, signal, index: ctx.factsIndex });
    return hits;
  };

  // Exact pruning of a machine's state facts as of some instants (see `computeStateFactCutoffsByCollector`):
  // now, for the result; now and each day end, for the series.
  const pruningFor = async (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    controlId: string,
    agentId: string,
    instants: Date[],
    stats: ENSFactsReadStats,
    signal: Cancellable
  ): Promise<unknown | undefined> => {
    if (!hasStateFacts(controlId)) return undefined;
    const subject = `${controlId} en ${agentId}`;
    const runs = await readFacts(ctx, clients.asCurrentUser, buildCollectorRunsQuery(ctx.filters, controlId, agentId), stats, `los latidos de ${subject}`, signal);
    const t0 = Date.now();
    const lastOnes = readStateFactLastSeen(
      controlId,
      await searchComplete(clients.asCurrentUser, buildStateFactLastSeenRequest(ctx.filters, controlId, agentId, ctx.timeZone, ctx.factsIndex), `los últimos hechos de estado de ${subject}`)
    );
    stats.searchMs += Date.now() - t0;
    return keepClauseFor(ctx, controlId, agentId, normalizeWazuhAlerts(runs), lastOnes, instants);
  };

  // Exact pruning clause, with the heartbeats and last fact already read.
  const keepClauseFor = (
    ctx: ENSEvaluationContext,
    controlId: string,
    agentId: string,
    runs: ENSNormalizedEvent[],
    lastOnes: ENSStateFactLastSeen | undefined,
    instants: Date[]
  ): unknown | undefined => {
    if (!lastOnes || !lastOnes.collectors.length) return undefined;
    const cuts = computeStateFactCutoffsByCollector(controlId, runs, instants, lastOnes.lastFactOf, lastOnes.collectors);
    const start = Date.parse(ctx.window.from);
    const gaps = new Map([...cuts.entries()].map(([collector, byInstant]) => [collector, prunableRanges(start, instants.map(i => i.getTime()), byInstant)]));
    return buildStateFactKeepClause(controlId, agentId, gaps);
  };

  // Normalised facts of a row, with the synthetic ones the engine read from other controls (presence and
  // heartbeats).
  const eventsOf = (ctx: ENSEvaluationContext, spec: RowSpec, hits: any[]): { events: ENSNormalizedEvent[]; synthetic: number } => {
    const { controlId, factsAgent } = spec;
    const synthetic = factsAgent
      ? [
          ...(ctx.presenceOf.has(factsAgent) ? [ctx.presenceOf.get(factsAgent)!] : []),
          ...(ENS_CROSS_CONTROL_HEARTBEAT.includes(controlId) ? ctx.heartbeatsOf.get(factsAgent) || [] : []),
        ]
      : [
          ...ctx.presenceEvents,
          ...(ENS_CROSS_CONTROL_HEARTBEAT.includes(controlId) ? [...ctx.heartbeatsOf.values()].flat() : []),
        ];
    return { events: [...normalizeWazuhAlerts(hits), ...synthetic], synthetic: synthetic.length };
  };

  // The engine over some facts as of an instant. Synchronous: the engine's active configuration is this
  // request's while evaluating (another request can only slip in at an `await`, and there is none).
  const evaluatorOf = (ctx: ENSEvaluationContext, spec: RowSpec) => (list: ENSNormalizedEvent[], instant: Date) => {
    ensConfigurationRepository.replaceActive(ctx.configuration);
    const level = ctx.configuration.global.ensLevel;
    return spec.factsAgent
      ? evaluateENSControlRow(spec.controlId, level, list, spec.viewAgent as string, ctx.scope, instant)
      : evaluateENSControlPartition(spec.controlId, level, list, undefined, ctx.scope, instant).result;
  };

  // Normalises and evaluates a row's facts as of now: one engine turn (one at a time). Releases the facts read.
  const evaluateRow = (
    ctx: ENSEvaluationContext,
    spec: RowSpec,
    hits: any[],
    read: { searchMs: number; hits: number; pages: number },
    o: { queueMs: number; pruned: boolean; background: boolean; previous?: StoredRow; signal: Cancellable }
  ): Promise<StoredRow> => {
    const readValue2 = Date.now();
    return cpu.use(async () => {
      const inEngine = Date.now();
      throwIfCancelled(o.signal);
      const { controlId, factsAgent } = spec;
      const { events, synthetic } = eventsOf(ctx, spec, hits);
      hits.length = 0;
      const normalized = Date.now();
      const result = evaluatorOf(ctx, spec)(events, ctx.now);
      const traceability = result?.traceability || [];
      const savedOnes = traceability.slice(0, ENS_EVALUATION_LIMITS.traceabilityStored);
      const series = seriesOf(ctx);
      // Past days already computed today (same zone, configuration, scope and past-day facts) stay valid: the
      // new facts forcing the row to recompute are today's. The series moves to the new version even half done:
      // it is the SAME object and its computer keeps filling it.
      const pastKey = pastSignature(ctx, spec);
      const previous2 = o.previous;
      const pasts =
        previous2 &&
        previous2.configurationKey === ctx.configurationKey &&
        previous2.scopeKey === ctx.scopeKey &&
        previous2.cuts?.key === series.key &&
        previous2.cuts.pastKey === pastKey
          ? previous2.cuts
          : undefined;
      const row: StoredRow = {
        result: result && withoutTraceability(result),
        traceability: compresses(savedOnes),
        traceabilityStored: savedOnes.length,
        traceabilityTotal: traceability.length,
        cuts: pasts,
        configurationKey: ctx.configurationKey,
        scopeKey: ctx.scopeKey,
        stats: {
          controlId,
          agentId: factsAgent || '*',
          hits: read.hits,
          pages: read.pages,
          events: events.length - synthetic,
          queueMs: o.queueMs + (inEngine - readValue2),
          fetchMs: read.searchMs,
          normalizeMs: normalized - inEngine,
          evaluateMs: Date.now() - normalized,
          pruned: o.pruned,
        },
      };
      const m = metricsOf(controlId);
      m.rows += 1;
      m.hits += row.stats.hits;
      m.queueMs += row.stats.queueMs;
      m.fetchMs += row.stats.fetchMs;
      m.normalizeMs += row.stats.normalizeMs;
      m.evaluateMs += row.stats.evaluateMs;
      // Yields the thread before the next row.
      await yieldToEventLoop();
      return row;
    }, { background: o.background });
  };

  // A ROW READ ALONE: op.acc.3 (reads types of other controls), a control without rows (whole scope) and a
  // machine's view of an organization control without a manager row. The read slot is kept until the engine
  // finishes: no more than `maxConcurrentReads` reads in memory.
  // A control without collector reads nothing: no fact can be about it, and its one result needs none.
  const readsNothing = (spec: RowSpec): boolean => isPendingMeasurement(ENSCatalog.find(entry => entry.id === spec.controlId));

  const computeRow = (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    spec: RowSpec,
    signal: Cancellable,
    options: { background: boolean; previous?: StoredRow }
  ): Promise<StoredRow> => {
    const requested = Date.now();
    return reads.use(async () => {
      const reading = Date.now();
      throwIfCancelled(signal);
      const stats = newReadStats();
      const subject = `${spec.controlId}${spec.factsAgent ? ` en ${spec.factsAgent}` : ''}`;
      const pruning = spec.factsAgent && !readsNothing(spec) ? await pruningFor(clients, ctx, spec.controlId, spec.factsAgent, [ctx.now], stats, signal) : undefined;
      const hits = readsNothing(spec)
        ? []
        : await readFacts(ctx, clients.asCurrentUser, buildFactsQuery(ctx.filters, spec.controlId, spec.factsAgent, pruning), stats, `los hechos de ${subject}`, signal);
      return evaluateRow(ctx, spec, hits, { searchMs: stats.searchMs, hits: stats.hits, pages: stats.pages }, {
        queueMs: reading - requested,
        pruned: Boolean(pruning),
        background: options.background,
        previous: options.previous,
        signal,
      });
    }, { background: options.background });
  };

  // --- 3. one stream per machine ---
  // A machine's other rows are read together: a stream sorted by control (or several, by control groups, if the
  // machine has many facts) and, once per machine, what the stream does not carry (facts without `data.ensfacil`
  // or with an old control field), its heartbeats and the last state fact of each control (for pruning). Each
  // control is evaluated as soon as its stretch ends, with its facts in the SAME order as reading it alone
  // (`mergeFactsInOrder`).

  // Facts that roughly fit in a control group of a machine.
  const CHUNK_FACTS = 20000;
  // Pruning leaves of a whole stream (the entire query, below OpenSearch's 1024 clauses).
  const STREAM_PRUNING_MAX_LEAVES = 600;
  const STATE_CONTROLS = catalogControlIds().filter(hasStateFacts);

  class StreamFallbackError extends Error {}

  // An indexer 400 (the query: a mapping or sort it does not support) on the per-machine read: its rows are read
  // one by one, in the usual order. Nothing else: a 401/403 is reported as is, and a 429 or 5xx fails with its
  // reason and is retried with a wait. Own errors (incomplete data, too many facts, cancelled) carry no `meta`.
  const indexerRejection = (error: any): boolean => Number(error?.meta?.statusCode) === 400;

  interface AgentSide {
    runs: ENSNormalizedEvent[];
    lastSeen: Map<string, ENSStateFactLastSeen>;
    sideFor: (controlId: string) => any[];
  }
  // The per-machine apart data is shared between control groups and between requests computing at once with the
  // same window; forgotten 5 minutes after reading.
  const sides = new Map<string, Promise<AgentSide>>();

  const sideOf = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, agentId: string, signal: Cancellable): Promise<AgentSide> => {
    const key = [ctx.userKey, agentId, ctx.configurationKey, ctx.scopeKey, ctx.window.from, ctx.window.to, ctx.timeZone, ctx.factsIndex].join('|');
    const savedValue = sides.get(key);
    if (savedValue) return savedValue;
    const promise = (async () => {
      const stats = newReadStats();
      const t0 = Date.now();
      const [runsHits, sideHits, lastOnes] = await Promise.all([
        readFacts(ctx, clients.asCurrentUser, buildAgentRunsQuery(ctx.filters, agentId), stats, `los latidos de ${agentId}`, signal),
        readFacts(ctx, clients.asCurrentUser, buildAgentSideQuery(ctx.filters, agentId), stats, `los hechos sin control de ${agentId}`, signal),
        searchComplete(
          clients.asCurrentUser,
          buildAgentStateFactLastSeenRequest(ctx.filters, STATE_CONTROLS, agentId, ctx.timeZone, ctx.factsIndex),
          `los últimos hechos de estado de ${agentId}`
        ),
      ]);
      const m = metricsOf('(por máquina)');
      m.rows += 1;
      m.hits += stats.hits;
      m.fetchMs += Date.now() - t0;
      const runs = normalizeWazuhAlerts(runsHits);
      const lastSeen = readAgentStateFactLastSeen(STATE_CONTROLS, lastOnes);
      return { runs, lastSeen, sideFor: (controlId: string) => sideHits.filter(hit => sideFactBelongsTo(hit, controlId)) };
    })();
    // (A slow first load can last over a minute: kept 5.)
    const forgets = () => {
      const t = setTimeout(() => {
        if (sides.get(key) === promise) sides.delete(key);
      }, 5 * 60 * 1000);
      (t as any).unref?.();
    };
    promise.then(forgets, () => sides.delete(key));
    sides.set(key, promise);
    return promise;
  };

  const leavesOf = (q: any): number =>
    Array.isArray(q)
      ? q.reduce((n, x) => n + leavesOf(x), 0)
      : q && typeof q === 'object'
      ? q.bool
        ? ['filter', 'must', 'should', 'must_not'].reduce((n, k) => n + (q.bool[k] ? leavesOf([].concat(q.bool[k])) : 0), 0)
        : 1
      : 0;

  // Reads a control group of a machine and, stretch by stretch, computes its current result (`current`) or its
  // series (`series`).
  const runStreamChunk = (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    agentId: string,
    needs: RowNeed[],
    mode: 'current' | 'series',
    job: Job
  ): Promise<void> => {
    const requested = Date.now();
    const byControl = new Map(needs.map(need => [need.spec.controlId, need]));
    const controlList = [...byControl.keys()];
    const series = seriesOf(ctx);
    const instants = mode === 'series' ? [...series.plan.map(cut => cut.cutoff), ctx.now] : [ctx.now];
    const signal = job.signal;
    return reads.use(async () => {
      const queueMs = Date.now() - requested;
      throwIfCancelled(signal);
      const side = await sideOf(clients, ctx, agentId, signal);
      // Pruning of each control with state facts, while it fits.
      let leaves = 0;
      const prunings: unknown[] = [];
      const pruned = new Set<string>();
      for (const controlId of controlList) {
        if (!hasStateFacts(controlId)) continue;
        const clause = keepClauseFor(ctx, controlId, agentId, side.runs, side.lastSeen.get(controlId), instants);
        if (!clause) continue;
        const n = leavesOf(clause);
        if (leaves + n > STREAM_PRUNING_MAX_LEAVES) continue;
        leaves += n;
        prunings.push(clause);
        pruned.add(controlId);
      }
      const stats = newReadStats();
      const seenOnes = new Set<string>();
      let span: { controlId: string; hits: any[]; desde: number; paginas: number } | undefined;
      const closes = async (controlId: string, hits: any[], searchMs: number, pages: number) => {
        seenOnes.add(controlId);
        const need = byControl.get(controlId);
        if (!need) return;
        const entry = mergeFactsInOrder(hits, side.sideFor(controlId));
        if (mode === 'current') {
          const row = await evaluateRow(ctx, need.spec, entry, { searchMs, hits: entry.length, pages }, {
            queueMs,
            pruned: pruned.has(controlId),
            background: job.background,
            previous: rows.peek(need.key)?.value,
            signal,
          });
          job.resolveRow(need, row);
        } else {
          await seriesForRow(ctx, need, entry, searchMs);
        }
      };
      try {
        await readAllFacts(
          clients.asCurrentUser,
          buildAgentStreamQuery(ctx.filters, agentId, controlList, prunings),
          async page => {
            for (const hit of page) {
              const value = hit?._source?.data?.ensfacil;
              // A fact with several controls in `data.ensfacil`: the stream cannot distribute it like the
              // per-row read; they are read alone.
              if (Array.isArray(value)) throw new StreamFallbackError();
              const controlId = String(value);
              if (!span || span.controlId !== controlId) {
                if (span) {
                  const previous = span;
                  span = undefined;
                  await closes(previous.controlId, previous.hits, stats.searchMs - previous.desde, stats.pages - previous.paginas + 1);
                }
                span = { controlId, hits: [], desde: stats.searchMs, paginas: stats.pages };
              }
              span.hits.push(hit);
              if (span.hits.length > maxFactsPerRead) throw new ENSTooManyFactsError(`${controlId} en ${agentId}`, maxFactsPerRead);
            }
          },
          stats,
          { what: `los hechos de ${agentId}`, signal, index: ctx.factsIndex, sort: STREAM_SORT, idIndex: 2, maxFacts: Number.MAX_SAFE_INTEGER }
        );
      } catch (error: any) {
        if (!indexerRejection(error)) throw error;
        logger.warn(`ENSFácil: the indexer rejected the facts read of ${agentId} (${error?.message}); its rows are read one by one.`);
        throw new StreamFallbackError(error?.message);
      }
      if (span) await closes(span.controlId, span.hits, stats.searchMs - span.desde, stats.pages - span.paginas + 1);
      // Controls with no fact of their own in the window: with the apart data.
      for (const controlId of controlList) if (!seenOnes.has(controlId)) await closes(controlId, [], 0, 0);
    }, { background: job.background });
  };

  // --- 4. jobs: who computes what, and who waits for it ---

  interface RowNeed {
    key: string;
    fingerprint: string;
    spec: RowSpec;
    weight: number;
  }

  interface Job {
    background: boolean;
    pinned: boolean;
    waiters: number;
    signal: CancelSignal;
    resolveRow: (need: RowNeed, row: StoredRow) => void;
  }

  interface PendingRow {
    promise: Promise<StoredRow>;
    resolve: (row: StoredRow) => void;
    reject: (error: unknown) => void;
    job: Job;
  }
  // Rows being computed (by row and fingerprint): whoever arrives joins.
  const inflight = new Map<string, PendingRow>();
  // Foreground jobs in progress (the series does not start while any).
  let foregroundJobs = 0;

  const streamable = (need: RowNeed) =>
    Boolean(need.spec.factsAgent) &&
    need.spec.factsAgent === need.spec.viewAgent &&
    need.key.startsWith('r|') &&
    !(need.spec.controlId in ENS_CROSS_CONTROL_EVENT_TYPES);

  // Groups the rows. A control can be shown only when ALL its rows (one per machine) exist, so controls are
  // split into BANDS, cheap to expensive per the probe, and each band into a per-machine stream (up to
  // `CHUNK_FACTS` facts on the busiest machine). Bands are computed in order, so cheap controls are on every
  // machine soon. Rows read alone go in their weight band.
  const planGroups = (needs: RowNeed[]) => {
    const groups: { agentId?: string; needs: RowNeed[]; weight: number; band: number }[] = [];
    const byControl = new Map<string, RowNeed[]>();
    for (const need of needs) {
      const list = byControl.get(need.spec.controlId) || [];
      list.push(need);
      byControl.set(need.spec.controlId, list);
    }
    const controlList = [...byControl.entries()]
      .map(([controlId, list]) => ({ controlId, lista: list, peso: list.reduce((n, need) => n + need.weight, 0) }))
      .sort((a, b) => a.peso - b.peso);
    let stretchBand = 0;
    let byMachine = new Map<string, number>();
    const inBand: RowNeed[][] = [[]];
    for (const control of controlList) {
      const sum = new Map(byMachine);
      for (const need of control.lista) {
        if (streamable(need)) sum.set(need.spec.factsAgent as string, (sum.get(need.spec.factsAgent as string) || 0) + need.weight);
      }
      const overflows = [...sum.values()].some(n => n > CHUNK_FACTS);
      if (overflows && inBand[stretchBand].length) {
        stretchBand += 1;
        inBand[stretchBand] = [];
        byMachine = new Map();
        for (const need of control.lista) {
          if (streamable(need)) byMachine.set(need.spec.factsAgent as string, (byMachine.get(need.spec.factsAgent as string) || 0) + need.weight);
        }
      } else {
        byMachine = sum;
      }
      inBand[stretchBand].push(...control.lista);
    }
    inBand.forEach((list, band) => {
      const ofMachine = new Map<string, RowNeed[]>();
      for (const need of list) {
        if (streamable(need)) {
          const agentName = need.spec.factsAgent as string;
          ofMachine.set(agentName, [...(ofMachine.get(agentName) || []), need]);
        } else {
          groups.push({ needs: [need], weight: need.weight, band });
        }
      }
      for (const [agentId, ownOnes] of ofMachine) {
        groups.push({ agentId, needs: ownOnes, weight: ownOnes.reduce((n, need) => n + need.weight, 0), band });
      }
    });
    return groups.sort((a, b) => a.band - b.band || a.weight - b.weight);
  };

  // Computes (or joins the computation of) some rows; returns each one's promise. `pinned`: continues if whoever
  // asked leaves (partial answers and refreshes); otherwise it is cancelled when nobody waits.
  const ensureRows = (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    needs: RowNeed[],
    o: { background: boolean; pinned: boolean; signal?: Cancellable; onStored?: (need: RowNeed, row: StoredRow) => void; onFailed?: (need: RowNeed, error: unknown) => void }
  ): Map<string, Promise<StoredRow>> => {
    const output = new Map<string, Promise<StoredRow>>();
    const newOnes: RowNeed[] = [];
    const waitMs = (job: Job) => {
      if (o.pinned) {
        job.pinned = true;
        return;
      }
      job.waiters += 1;
      let loose = false;
      const looseOne = () => {
        if (loose) return;
        loose = true;
        job.waiters -= 1;
        if (job.waiters <= 0 && !job.pinned) job.signal.cancel();
      };
      o.signal?.onAbort(looseOne);
    };
    const seenOnes = new Set<Job>();
    for (const need of needs) {
      const inProgress = inflight.get(`${need.key}|${need.fingerprint}`);
      if (inProgress && !inProgress.job.signal.aborted) {
        if (!seenOnes.has(inProgress.job)) {
          seenOnes.add(inProgress.job);
          waitMs(inProgress.job);
        }
        output.set(need.key, inProgress.promise);
      } else {
        newOnes.push(need);
      }
    }
    for (const group of planGroups(newOnes)) {
      const pendings = new Map<string, PendingRow>();
      const job: Job = {
        background: o.background,
        pinned: false,
        waiters: 0,
        signal: new CancelSignal(),
        resolveRow: (need, row) => {
          const p = pendings.get(need.key);
          if (!p) return;
          pendings.delete(need.key);
          inflight.delete(`${need.key}|${need.fingerprint}`);
          storeRow(clients, ctx, need, row);
          o.onStored?.(need, row);
          p.resolve(row);
        },
      };
      const fails = (need: RowNeed, error: unknown) => {
        const p = pendings.get(need.key);
        if (!p) return;
        pendings.delete(need.key);
        inflight.delete(`${need.key}|${need.fingerprint}`);
        o.onFailed?.(need, error);
        p.reject(error);
      };
      for (const need of group.needs) {
        let resolve!: (row: StoredRow) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<StoredRow>((ok, fail) => {
          resolve = ok;
          reject = fail;
        });
        // Nobody has to wait for it (a refresh): no loose rejection.
        promise.catch(() => undefined);
        const pending = { promise, resolve, reject, job };
        pendings.set(need.key, pending);
        inflight.set(`${need.key}|${need.fingerprint}`, pending);
        output.set(need.key, promise);
      }
      waitMs(job);
      if (!o.background) foregroundJobs += 1;
      const jobItem = async () => {
        try {
          if (group.agentId) {
            await runStreamChunk(clients, ctx, group.agentId, group.needs, 'current', job);
          } else {
            for (const need of group.needs) {
              const row = await computeRow(clients, ctx, need.spec, job.signal, { background: o.background, previous: rows.peek(need.key)?.value });
              job.resolveRow(need, row);
            }
          }
        } catch (error) {
          if (error instanceof StreamFallbackError) {
            for (const need of group.needs.filter(n => pendings.has(n.key))) {
              try {
                job.resolveRow(need, await computeRow(clients, ctx, need.spec, job.signal, { background: o.background, previous: rows.peek(need.key)?.value }));
              } catch (other) {
                fails(need, other);
              }
            }
          } else {
            for (const need of group.needs) fails(need, error);
          }
        } finally {
          for (const need of group.needs) fails(need, new Error('La fila no se calculó.'));
          if (!o.background) {
            foregroundJobs -= 1;
            if (!foregroundJobs) kickSeries();
          }
        }
      };
      void jobItem();
    }
    return output;
  };

  // Stores a freshly computed row and queues its series.
  const storeRow = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, need: RowNeed, row: StoredRow) => {
    refreshFailures.delete(need.key);
    coldFailures.delete(need.key);
    const previous = rows.peek(need.key);
    if (previous && previous.value !== row) previous.value.superseded = true;
    rows.set(need.key, need.fingerprint, row);
    wantSeries(clients, ctx, need);
  };

  // --- 5. the series, in the background ---
  // When no foreground job is running, group by group (cheap first): facts are read with exact pruning for now
  // and each day end and each day is evaluated (newest to oldest, each in its engine turn, behind whatever
  // someone waits for). Points are stored in the row as they come out; views reuse them without reading again.

  interface SeriesWanted {
    clients: ENSEvaluationClients;
    ctx: ENSEvaluationContext;
    need: RowNeed;
    serieKey: string;
  }
  const seriesWanted = new Map<string, SeriesWanted>();
  const seriesFailures = new Map<string, { failures: number; nextAt: number }>();
  let seriesBusy = false;
  let seriesTimer: ReturnType<typeof setTimeout> | undefined;

  // The series goes with the row stored NOW under that key (whatever version: a refresh for new facts does not
  // change it) while it has the same configuration and scope as the request that asked for it.
  const seriesTarget = (ctx: ENSEvaluationContext, need: RowNeed) => {
    const row = rows.peek(need.key)?.value;
    return row && row.configurationKey === ctx.configurationKey && row.scopeKey === ctx.scopeKey ? row : undefined;
  };
  // Does the row already have its whole series (today's, in this zone, with these past-day facts)?
  const seriesDone = (row: StoredRow, seriesKeyValue: string, pastKey: string) =>
    Boolean(row.cuts && row.cuts.key === seriesKeyValue && row.cuts.pastKey === pastKey && row.cuts.complete);

  const wantSeries = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, need: RowNeed) => {
    const seriesKeyValue = seriesOf(ctx).key;
    const row = seriesTarget(ctx, need);
    if (!row || seriesDone(row, seriesKeyValue, pastSignature(ctx, need.spec))) return;
    const key = `${need.key}|${seriesKeyValue}`;
    // A newer row version replaces the one it was waiting for.
    const previous3 = seriesWanted.get(key);
    if (!previous3 || previous3.need.fingerprint !== need.fingerprint) seriesWanted.set(key, { clients, ctx, need, serieKey: seriesKeyValue });
    kickSeries();
  };

  // The series starts a little after the foreground ends: a request arriving just behind (the panel after the
  // list) goes first.
  const SERIES_IDLE_MS = 200;
  function kickSeries() {
    if (seriesBusy || seriesTimer) return;
    if (foregroundJobs > 0) return;  // retried when the foreground ends
    seriesTimer = setTimeout(() => {
      seriesTimer = undefined;
      void nextSeries();
    }, SERIES_IDLE_MS);
  }

  const nextSeries = async () => {
    if (seriesBusy || foregroundJobs > 0) return;
    const now = clock().getTime();
    const readyOnes = [...seriesWanted.entries()].filter(([key, w]) => {
      // The row under that key, whatever version (a refresh does not take it out of the queue); out only if it
      // already has its series, or the row is of another configuration, scope or past days (the new one will ask
      // with its own).
      const row = seriesTarget(w.ctx, w.need);
      if (!row || seriesDone(row, w.serieKey, pastSignature(w.ctx, w.need.spec))) {
        seriesWanted.delete(key);
        return false;
      }
      const failure = seriesFailures.get(w.need.key);
      return !(failure && failure.nextAt > now);
    });
    if (!readyOnes.length) {
      // Those waiting after a failure: looked at again when due.
      if (seriesWanted.size && !seriesTimer) {
        const nextOne = Math.min(...[...seriesWanted.values()].map(w => seriesFailures.get(w.need.key)?.nextAt || now));
        seriesTimer = setTimeout(() => {
          seriesTimer = undefined;
          void nextSeries();
        }, Math.max(1000, nextOne - now));
        (seriesTimer as any).unref?.();
      }
      return;
    }
    // The cheapest group: the stream rows of a machine (same context) or a single row.
    const [, first2] = readyOnes.sort((a, b) => a[1].need.weight - b[1].need.weight)[0];
    const group = streamable(first2.need)
      ? readyOnes.filter(([, w]) => w.ctx === first2.ctx && streamable(w.need) && w.need.spec.factsAgent === first2.need.spec.factsAgent)
      : readyOnes.filter(([, w]) => w === first2);
    let weight = 0;
    const chosen = group.filter(([, w]) => {
      if (weight && weight + w.need.weight > CHUNK_FACTS) return false;
      weight += w.need.weight;
      return true;
    });
    for (const [key] of chosen) seriesWanted.delete(key);
    seriesBusy = true;
    const job: Job = { background: true, pinned: true, waiters: 0, signal: new CancelSignal(), resolveRow: () => undefined };
    try {
      if (streamable(first2.need)) {
        try {
          await runStreamChunk(first2.clients, first2.ctx, first2.need.spec.factsAgent as string, chosen.map(([, w]) => w.need), 'series', job);
        } catch (error) {
          if (!(error instanceof StreamFallbackError)) throw error;
          // As in the load: rows the stream could not do, one by one.
          for (const [, w] of chosen) await computeSeriesSingle(w.clients, w.ctx, w.need);
        }
      } else {
        await computeSeriesSingle(first2.clients, first2.ctx, first2.need);
      }
      for (const [, w] of chosen) seriesFailures.delete(w.need.key);
    } catch (error: any) {
      for (const [key, w] of chosen) {
        const previous3 = seriesFailures.get(w.need.key);
        const failures = (previous3?.failures || 0) + 1;
        seriesFailures.set(w.need.key, { failures, nextAt: clock().getTime() + waitAfterFailureMs(failures) });
        seriesWanted.set(key, w);
      }
      logger.warn(`ENSFácil: could not compute the series (${chosen.length} rows): ${error?.message || error}`);
    } finally {
      seriesBusy = false;
      kickSeries();
    }
  };

  // A row's series with its facts (already read with the series pruning).
  const seriesForRow = async (ctx: ENSEvaluationContext, need: RowNeed, hits: any[], searchMs: number) => {
    const series = seriesOf(ctx);
    const pastKey = pastSignature(ctx, need.spec);
    const row = seriesTarget(ctx, need);
    if (!row || seriesDone(row, series.key, pastKey)) return;
    // A half-done series from a previous version (same past days) keeps filling; if none, a new one.
    const cuts: StoredCuts =
      row.cuts && row.cuts.key === series.key && row.cuts.pastKey === pastKey
        ? row.cuts
        : { key: series.key, pastKey, asOf: ctx.now.getTime(), points: {}, complete: false };
    // The row under that key still wants THIS series: any version, same configuration and scope, while it has no
    // newer one for the same day (computed with newer past-day facts). If a new row version lacks it, it is
    // attached.
    const follows = (): boolean => {
      const actual = seriesTarget(ctx, need);
      if (!actual) return false;
      if (actual.cuts === cuts) return true;
      if (actual.cuts && actual.cuts.key === series.key && (actual.cuts.asOf > cuts.asOf || actual.cuts.pastKey === pastKey)) return false;
      actual.cuts = cuts;
      return true;
    };
    if (!follows()) return;
    const { ascending, normalizeMs, n } = await cpu.use(async () => {
      const t0 = Date.now();
      const total = hits.length;
      const { events } = eventsOf(ctx, need.spec, hits);
      hits.length = 0;
      const order = events
        .map(event => ({ event, time: Date.parse(event.timestamp) }))
        .filter(item => Number.isFinite(item.time) && item.time <= ctx.now.getTime())
        .sort((left, right) => left.time - right.time);
      return { ascending: order, normalizeMs: Date.now() - t0, n: total };
    }, { background: true });
    const until = (limitValue: number) => {
      let it = 0;
      let hi = ascending.length;
      while (it < hi) {
        const mid = (it + hi) >> 1;
        if (ascending[mid].time <= limitValue) it = mid + 1;
        else hi = mid;
      }
      return it;
    };
    const evaluates = evaluatorOf(ctx, need.spec);
    let evaluateMs = 0;
    for (const cut of [...series.plan].sort((a, b) => b.cutoff.getTime() - a.cutoff.getTime())) {
      const iso = cut.cutoff.toISOString();
      // Already computed (a half-done series being resumed).
      if (cuts.points[iso]) continue;
      // Another configuration, scope or past days: the series is no longer valid.
      if (!follows()) return;
      // Each day takes an engine turn: what someone waits for goes ahead.
      await cpu.use(async () => {
        await yieldToEventLoop();
        const t0 = Date.now();
        const atCut = evaluates(ascending.slice(0, until(cut.cutoff.getTime())).map(item => item.event), cut.cutoff);
        cuts.points[iso] = { status: atCut?.status || 'NO_EVALUABLE', score: atCut?.score };
        evaluateMs += Date.now() - t0;
      }, { background: true });
    }
    if (!follows()) return;
    cuts.complete = true;
    const actual = seriesTarget(ctx, need);
    if (actual) {
      actual.stats.cutsMs = evaluateMs;
      actual.stats.seriesFetchMs = searchMs;
      actual.stats.seriesNormalizeMs = normalizeMs;
    }
    const m = metricsOf(need.spec.controlId);
    m.seriesRows += 1;
    m.seriesHits += n;
    m.seriesFetchMs += searchMs;
    m.seriesNormalizeMs += normalizeMs;
    m.seriesEvaluateMs += evaluateMs;
  };

  // The series of a row read alone.
  const computeSeriesSingle = async (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, need: RowNeed) => {
    const series = seriesOf(ctx);
    const row = seriesTarget(ctx, need);
    if (!row || seriesDone(row, series.key, pastSignature(ctx, need.spec))) return;
    const stats = newReadStats();
    const instants = [...series.plan.map(cut => cut.cutoff), ctx.now];
    const subject = `${need.spec.controlId}${need.spec.factsAgent ? ` en ${need.spec.factsAgent}` : ''}`;
    const signal = new CancelSignal();
    const hits = readsNothing(need.spec) ? [] : await reads.use(async () => {
      const pruning = need.spec.factsAgent ? await pruningFor(clients, ctx, need.spec.controlId, need.spec.factsAgent, instants, stats, signal) : undefined;
      return readFacts(ctx, clients.asCurrentUser, buildFactsQuery(ctx.filters, need.spec.controlId, need.spec.factsAgent, pruning), stats, `la serie de ${subject}`, signal);
    }, { background: true });
    await seriesForRow(ctx, need, hits, stats.searchMs);
  };

  // --- 6. a view ---

  const timelinePlan = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): ENSTimelineCutPlan[] => {
    if (!query.timelineDays) return [];
    const ownItems = (agentNames: string[]) => ctx.probe.presence.filter(p => agentNames.includes(p.agentId));
    let first2: number | undefined;
    let howMany = 0;
    if (query.controlId) {
      const facts = ctx.probe.controls[query.controlId];
      if (query.agentId) {
        // A machine's series starts at its first fact of the control (or the manager's, for an organization
        // control).
        const ofAgent = [query.agentId, ENS_MANAGER_AGENT_ID].map(id => facts?.agents[id]).filter(Boolean) as any[];
        first2 = ofAgent.length ? Math.min(...ofAgent.map(h => Date.parse(h.oldest || h.newest))) : undefined;
        howMany = ofAgent.reduce((n, h) => n + h.count, 0);
      } else {
        first2 = facts?.oldest ? Date.parse(facts.oldest) : undefined;
        howMany = facts?.count || 0;
      }
    } else if (query.agentId) {
      const list = ownItems([query.agentId, ENS_MANAGER_AGENT_ID]);
      first2 = list.length ? Math.min(...list.map(p => Date.parse(p.earliest))) : undefined;
      howMany = list.reduce((n, p) => n + (p.count || 0), 0);
    } else {
      first2 = ctx.probe.oldest ? Date.parse(ctx.probe.oldest) : undefined;
      howMany = ctx.probe.count;
    }
    return planENSTimelineCuts(first2, howMany, {
      now: ctx.now,
      days: query.timelineDays,
      timeZone: query.timeZone,
      // No budget: past days are computed once a day.
      maxEvaluatedEvents: Infinity,
    });
  };

  const viewFilters = (ctx: ENSEvaluationContext, agentId?: string) =>
    agentId ? buildViewFilters(ctx.window, ctx.scope, agentId) : ctx.filters;

  const dailyCounts = async (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, query: ENSEvaluationQuery, cuts: ENSTimelineCutPlan[]): Promise<number[]> => {
    const base = viewFilters(ctx, query.agentId);
    const filters = query.controlId ? [...base, buildENSControlFactsFilter(query.controlId)] : base;
    const body = await searchComplete(clients.asCurrentUser, { ...buildDailyCountsRequest(filters, query.timeZone), index: ctx.factsIndex }, 'los hechos por día');
    const days = (body?.aggregations?.days?.buckets || []).map((b: any) => ({ at: Number(b.key), n: Number(b.doc_count || 0) }));
    return cuts.map(cut => days.filter((d: any) => d.at <= cut.cutoff.getTime()).reduce((s: number, d: any) => s + d.n, 0));
  };

  const impactEvents = async (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, query: ENSEvaluationQuery, fingerprint: string) => {
    const key = `i|${ctx.userKey}|${query.agentId || '*'}`;
    const savedValue = impacts.get(key, fingerprint);
    if (savedValue) return savedValue;
    // The view's: the machine and the manager, or the whole scope.
    const body = await searchComplete(clients.asCurrentUser, { ...buildImpactEventsRequest(viewFilters(ctx, query.agentId)), index: ctx.factsIndex }, 'los eventos operativos');
    const model = buildImpactEventsModelFromCounts(
      Object.fromEntries((body?.aggregations?.types?.buckets || []).map((b: any) => [String(b.key), Number(b.doc_count || 0)]))
    );
    impacts.set(key, fingerprint, model);
    return model;
  };

  interface UsedRow {
    key: string;
    need: RowNeed;
    row: StoredRow;
    storedAt: number;
    stale: boolean;
    computed: boolean;
  }

  // Refreshes behind the stored rows that are no longer valid (what is shown is the stored data). A new attempt
  // clears the previous error; if it fails it is noted with its time and the next waits longer.
  const refreshStale = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, stale: RowNeed[], options: ENSRunOptions): number => {
    const now = clock().getTime();
    const due = stale.filter(need => {
      if (inflight.has(`${need.key}|${need.fingerprint}`)) return false;
      const failure = refreshFailures.get(need.key);
      return !(failure && failure.nextAt > now && !options.retryRefresh);
    });
    for (const need of due) {
      const entry = rows.peek(need.key);
      if (entry) entry.value.refreshError = undefined;
    }
    if (due.length) {
      ensureRows(clients, ctx, due, {
        background: true,
        pinned: true,
        onFailed: (need, error: any) => {
          if (error?.statusCode === 499) return;
          const previous3 = refreshFailures.get(need.key);
          const failures = (previous3?.failures || 0) + 1;
          refreshFailures.set(need.key, { failures, nextAt: clock().getTime() + waitAfterFailureMs(failures) });
          const actual = rows.peek(need.key);
          if (actual) actual.value.refreshError = { message: String(error?.message || error), at: clock().toISOString() };
          logger.warn(`ENSFácil: could not refresh ${need.key}: ${error?.message || error}`);
        },
      });
    }
    // Failures of rows no longer stored are not kept.
    if (refreshFailures.size > rows.size + 100) {
      for (const key of [...refreshFailures.keys()]) if (!rows.peek(key)) refreshFailures.delete(key);
    }
    return due.length;
  };

  const run = async (clients: ENSEvaluationClients, query: ENSEvaluationQuery, options: ENSRunOptions = {}) => {
    const started = Date.now();
    const ctx = await loadContext(clients, query);
    const controls = controlsOf(query);
    const plan = timelinePlan(ctx, query);
    const pastCuts = plan.filter(cut => !cut.isCurrent);
    const cutsKey = sha(query.timeZone, pastCuts.map(cut => cut.cutoff.toISOString()));
    const tKey = ['t', ctx.userKey, query.agentId || '*', query.controlId || '*', query.timelineDays, query.timeZone, startOfDayIn(ctx.now, query.timeZone).toISOString()].join('|');
    const series = seriesOf(ctx);
    const progressive = PROGRESSIVE.includes(query.include);
    const level = ctx.configuration.global.ensLevel;
    const { all: identities, forControl } = identitiesOf(ctx);
    const name = (agentId: string) => identities.find(agent => agent.agentId === agentId)?.agentName;
    const withoutIdentities = identities.length === 0;

    // 1. The rows of each control.
    const rowsOf = new Map<string, { agentId: string; agentName?: string; need: RowNeed }[]>();
    const withoutRows = new Map<string, RowNeed>();
    const needs: RowNeed[] = [];
    for (const controlId of controls) {
      const agentNames = withoutIdentities ? [] : forControl(controlId);
      // Without rows, machines declared out of scope still give the consolidated view (reading nothing); only if
      // there are none does the engine evaluate the control over all its facts without a row.
      if (!agentNames.length && !withoutIdentities) {
        ensConfigurationRepository.replaceActive(ctx.configuration);
        if (consolidateENSControlRows(controlId, level, [], ctx.presenceEvents, ctx.scope, ctx.now)) {
          rowsOf.set(controlId, []);
          continue;
        }
      }
      if (!agentNames.length) {
        const need = { key: `f|${ctx.userKey}|${controlId}`, fingerprint: fallbackFingerprint(ctx, controlId), spec: { controlId }, weight: weightOf(ctx, controlId) };
        needs.push(need);
        withoutRows.set(controlId, need);
        rowsOf.set(controlId, []);
        continue;
      }
      const rows = agentNames.map(agent => {
        const need: RowNeed = {
          key: `r|${ctx.userKey}|${controlId}|${agent.agentId}`,
          fingerprint: rowFingerprint(ctx, controlId, agent.agentId),
          spec: { controlId, factsAgent: agent.agentId, viewAgent: agent.agentId },
          weight: weightOf(ctx, controlId, agent.agentId),
        };
        needs.push(need);
        return { agentId: agent.agentId, agentName: agent.agentName, need };
      });
      rowsOf.set(controlId, rows);
    }

    // The memory cap follows the scope: room for at least 10 users with all their rows (~60 KB each), between
    // `maxStoredBytes` and 4 times that.
    rows.setMaxBytes(Math.min(maxStoredBytes * 4, Math.max(maxStoredBytes, needs.length * 60 * 1024 * 10)));

    // 2. What is stored (valid or old) and what must be computed.
    const readyOnes = new Map<string, UsedRow>();
    const old: RowNeed[] = [];
    const cold: RowNeed[] = [];
    for (const need of needs) {
      const entry = rows.peek(need.key);
      if (entry && rows.isFresh(entry, need.fingerprint)) {
        readyOnes.set(need.key, { key: need.key, need, row: entry.value, storedAt: entry.storedAt, stale: false, computed: false });
      } else if (
        options.allowStale &&
        entry &&
        entry.value.configurationKey === ctx.configurationKey &&
        entry.value.scopeKey === ctx.scopeKey
      ) {
        readyOnes.set(need.key, { key: need.key, need, row: entry.value, storedAt: entry.storedAt, stale: true, computed: false });
        old.push(need);
      } else {
        // A row that failed AFTER answering (the first load continues behind): the next poll reports the error
        // once, instead of relaunching the computation unnoticed.
        const failure = coldFailures.get(need.key);
        if (failure) {
          coldFailures.delete(need.key);
          if (!inflight.has(`${need.key}|${need.fingerprint}`) && !options.retryRefresh && clock().getTime() - failure.at < COLD_FAILURE_MS) {
            throw failure.error;
          }
        }
        cold.push(need);
      }
    }
    const refreshingInBackground = refreshStale(clients, ctx, old, options);

    // 3. Cold: the list and the panel answer with what exists at `firstResponseMs` and the rest continues
    // behind; other views wait.
    const promises = ensureRows(clients, ctx, cold, {
      background: false,
      pinned: progressive,
      signal: options.signal,
      onFailed: (need, error: any) => {
        if (error?.statusCode !== 499) coldFailures.set(need.key, { error, at: clock().getTime() });
      },
    });
    const errorList: unknown[] = [];
    const tracking = cold.map(need =>
      promises.get(need.key)!.then(
        row => {
          readyOnes.set(need.key, { key: need.key, need, row, storedAt: clock().getTime(), stale: false, computed: true });
        },
        error => {
          errorList.push(error);
        }
      )
    );
    if (tracking.length) {
      if (progressive) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          Promise.all(tracking),
          new Promise<void>(resolve => {
            timer = setTimeout(resolve, firstResponseMs);
          }),
        ]);
        if (timer) clearTimeout(timer);
      } else {
        await Promise.all(tracking);
      }
    }
    if (errorList.length) {
      // Already reported to whoever asked: not repeated in the next request.
      for (const need of cold) coldFailures.delete(need.key);
      throw errorList[0];
    }

    // 4. The view of each control with all its rows ready.
    // Only points of today's series, in this zone and with the SAME past-day facts the probe reports now (a late
    // fact invalidates it).
    const pastOf = new Map(needs.map(need => [need.key, pastSignature(ctx, need.spec)]));
    const pointOf = (row: StoredRow, iso: string, need: RowNeed): CutPoint | undefined =>
      row.cuts && row.cuts.key === series.key && row.cuts.pastKey === (pastOf.get(need.key) ?? pastSignature(ctx, need.spec))
        ? row.cuts.points[iso]
        : undefined;
    ensConfigurationRepository.replaceActive(ctx.configuration);
    const withTraces = query.include === 'control';
    const views = new Map<string, ENSViewPartition>();
    const pendings: string[] = [];
    const used: UsedRow[] = [];
    for (const controlId of controls) {
      const rowList = rowsOf.get(controlId) || [];
      const fallbackNeed = withoutRows.get(controlId);
      const ownOnes = [...rowList.map(f => f.need), ...(fallbackNeed ? [fallbackNeed] : [])];
      if (ownOnes.some(need => !readyOnes.has(need.key))) {
        pendings.push(controlId);
        continue;
      }
      ownOnes.forEach(need => used.push(readyOnes.get(need.key)!));
      const rowOf = (need: RowNeed) => readyOnes.get(need.key)!.row;
      let view: ENSViewPartition;
      if (!query.agentId) {
        if (fallbackNeed) {
          const row = rowOf(fallbackNeed);
          view = {
            controlId,
            result: row.result,
            traceability: () => decompressTraceability(row.traceability),
            traceabilityStored: row.traceabilityStored,
            traceabilityTotal: row.traceabilityTotal,
            rows: [],
            pointAt: iso => pointOf(row, iso, fallbackNeed),
          };
        } else {
          // The set's traceability is decompressed only for the detail.
          const withTrace = rowList
            .filter(f => rowOf(f.need).result)
            .map(f => ({
              agentId: f.agentId,
              agentName: f.agentName,
              result: { ...rowOf(f.need).result!, traceability: withTraces ? decompressTraceability(rowOf(f.need).traceability) : [] },
            }));
          const consolidated = consolidateENSControlRows(controlId, level, withTrace, ctx.presenceEvents, ctx.scope, ctx.now);
          const trace = consolidated?.traceability || [];
          const savedOnes = withTraces ? rowList.reduce((n, f) => n + rowOf(f.need).traceabilityStored, 0) : 0;
          const totals = rowList.reduce((n, f) => n + rowOf(f.need).traceabilityTotal, 0);
          const list = trace.slice(0, ENS_EVALUATION_LIMITS.traceabilityStored);
          view = {
            controlId,
            result: consolidated && withoutTraceability(consolidated),
            traceability: () => list,
            traceabilityStored: list.length,
            traceabilityTotal: trace.length - savedOnes + totals,
            rows: withTrace.map(f => ({ agentId: f.agentId, result: withoutTraceability(f.result) })),
            pointAt: (iso, cutoff) => {
              const points = rowList.map(f => pointOf(rowOf(f.need), iso, f.need));
              if (points.some(p => p === undefined)) return undefined;
              ensConfigurationRepository.replaceActive(ctx.configuration);
              const atCut = consolidateENSControlRows(
                controlId,
                level,
                rowList.map((f, i) => ({ agentId: f.agentId, agentName: f.agentName, result: resultStatusStub(controlId, points[i]!.status, points[i]!.score) })),
                ctx.presenceEvents,
                ctx.scope,
                cutoff
              );
              return atCut ? { status: atCut.status, score: atCut.score } : null;
            },
          };
        }
      } else if (fallbackNeed && !isManagerAgentId(query.agentId) && isPendingMeasurement(ENSCatalog.find(entry => entry.id === controlId))) {
        // A control without collector has one result, the same on every machine: no row of its own. The manager's
        // view carries only what is measured on it.
        const row = rowOf(fallbackNeed);
        view = {
          controlId,
          result: row.result,
          traceability: () => decompressTraceability(row.traceability),
          traceabilityStored: row.traceabilityStored,
          traceabilityTotal: row.traceabilityTotal,
          rows: [],
          pointAt: iso => pointOf(row, iso, fallbackNeed),
        };
      } else {
        const decision = deriveForAgent(controlId, query.agentId, rowList.map(f => f.agentId), ctx.scope);
        let ofRow: RowNeed | undefined =
          decision?.from === 'row'
            ? rowList.find(f => f.agentId === query.agentId)!.need
            : decision?.from === 'manager'
            ? rowList.find(f => f.agentId === ENS_MANAGER_AGENT_ID)!.need
            : undefined;
        let rowItem = ofRow ? rowOf(ofRow) : undefined;
        if (!decision) {
          // An organization control without a manager row: the view is evaluated with the manager's facts, like
          // the engine.
          const need: RowNeed = {
            key: `d|${ctx.userKey}|${controlId}|${query.agentId}`,
            fingerprint: rowFingerprint(ctx, controlId, ENS_MANAGER_AGENT_ID),
            spec: { controlId, factsAgent: ENS_MANAGER_AGENT_ID, viewAgent: query.agentId },
            weight: weightOf(ctx, controlId, ENS_MANAGER_AGENT_ID),
          };
          ofRow = need;
          const entry = rows.peek(need.key);
          if (entry && rows.isFresh(entry, need.fingerprint)) {
            rowItem = entry.value;
            used.push({ key: need.key, need, row: entry.value, storedAt: entry.storedAt, stale: false, computed: false });
          } else {
            const row = await ensureRows(clients, ctx, [need], { background: false, pinned: false, signal: options.signal }).get(need.key)!;
            rowItem = row;
            used.push({ key: need.key, need, row, storedAt: clock().getTime(), stale: false, computed: true });
          }
          ensConfigurationRepository.replaceActive(ctx.configuration);
        }
        const own = decision?.from === 'row' ? rowItem : undefined;
        const f = rowItem;
        const ofF = ofRow;
        view = {
          controlId,
          result: f?.result,
          traceability: () => (f ? decompressTraceability(f.traceability) : []),
          traceabilityStored: f?.traceabilityStored || 0,
          traceabilityTotal: f?.traceabilityTotal || 0,
          rows: own?.result ? [{ agentId: query.agentId, result: own.result }] : [],
          // No row (not measured here), no point: `null`.
          pointAt: iso => (f && ofF ? pointOf(f, iso, ofF) : null),
        };
      }
      views.set(controlId, view);
    }

    const parts: ENSControlPartition[] = controls
      .filter(controlId => views.has(controlId))
      .map(controlId => ({ controlId, result: views.get(controlId)?.result, rows: views.get(controlId)?.rows || [] }));
    const state: ENSComplianceState | undefined = query.controlId
      ? undefined
      : assembleENSComplianceState(parts, query.agentId, ctx.scope, ctx.presenceEvents);

    // 5. The series: past days (stored or taken from each row's series) + the present. Never waits: if a day is
    // missing the view answers without series (`meta.seriesPending`) and the series is computed behind.
    let timeline: any[] | undefined;
    let seriesPending = false;
    // The last good series is shown while the new one is computed.
    let seriesRefreshing = false;
    if (query.timelineDays) {
      if (pendings.length) {
        // With rows still to compute, no series either: today's point would come from some controls and look
        // like all of them.
        seriesPending = true;
      } else {
        // Past days of this view, stored until the next day while the configuration, scope and past-day facts of
        // its rows do not change (even if some row is refreshing: new facts are today's).
        const tFingerprint = sha(ctx.configurationKey, ctx.scopeKey, cutsKey, needs.map(need => pastOf.get(need.key) ?? null));
        let pasts = timelines.get(tKey, tFingerprint)?.pasados;
        if (!pasts) {
          const byControl = pastCuts.map(cut => controls.map(controlId => views.get(controlId)!.pointAt(cut.cutoff.toISOString(), cut.cutoff)));
          if (byControl.some(points => points.some(p => p === undefined))) {
            for (const u of used) wantSeries(clients, ctx, u.need);
            // The last good series of this view (same day, zone, configuration and scope), marked as refreshing:
            // only today's point is current.
            const previous = timelines.peek(tKey)?.value;
            if (previous && previous.configurationKey === ctx.configurationKey && previous.scopeKey === ctx.scopeKey) {
              pasts = previous.pasados;
              seriesRefreshing = true;
            } else {
              seriesPending = true;
            }
          } else {
            const events = pastCuts.length ? await dailyCounts(clients, ctx, query, pastCuts) : [];
            pasts = pastCuts.map((cut, index) => {
              const base = { date: cut.cutoff.toISOString(), label: cut.label, isCurrent: false, events: events[index] || 0 };
              const points = byControl[index];
              if (query.controlId) {
                return { ...base, score: points[0]?.score, status: points[0]?.status || 'NO_EVALUABLE' };
              }
              // The panel number on that day: the engine's same summary over the controls with a result in the
              // view.
              const results = controls
                .map((controlId, i) => (points[i] ? resultStatusStub(controlId, points[i]!.status, points[i]!.score) : undefined))
                .filter((r): r is ENSComplianceResult => Boolean(r));
              return { ...base, score: buildComplianceState(results).controlSummary.scoreAverage, controls: perControlOfPoint(controls, points) };
            });
            timelines.set(tKey, tFingerprint, { pasados: pasts, configurationKey: ctx.configurationKey, scopeKey: ctx.scopeKey });
          }
        }
        if (pasts) {
          const today = plan.find(cut => cut.isCurrent);
          const actual = query.controlId ? views.get(query.controlId)?.result : undefined;
          timeline = [
            ...pasts,
            ...(today
              ? [
                  {
                    date: today.cutoff.toISOString(),
                    label: today.label,
                    isCurrent: true,
                    events: factsOfView(ctx, query).count,
                    ...(query.controlId
                      ? { score: actual?.score, status: actual?.status || 'NO_EVALUABLE' }
                      : { score: state!.controlSummary.scoreAverage, controls: perControlOfResults(state!.results) }),
                  },
                ]
              : []),
          ];
        }
      }
    }

    const refreshing = used.some(u => u.stale);
    const fingerprint = viewFingerprint(ctx, query);
    const impact = query.include === 'dashboard' && !pendings.length ? await impactEvents(clients, ctx, query, fingerprint) : undefined;
    const computed = used.filter(u => u.computed);
    // A refresh error is reported while no other attempt is in progress (a new attempt clears it; if it also
    // fails it is noted with its time).
    const errorList2 = used
      .filter(u => u.stale && !inflight.has(`${u.need.key}|${u.need.fingerprint}`))
      .map(u => u.row.refreshError)
      .filter(Boolean) as { message: string; at: string }[];
    const refreshError = errorList2.sort((a, b) => b.at.localeCompare(a.at))[0];
    const pendingRows = needs.filter(need => !readyOnes.has(need.key)).length;

    const meta = {
      // With something old in view, or rows or series pending, the fingerprint is not that of the data: the next
      // probe sees it different and the browser asks again.
      fingerprint: refreshing || seriesPending || seriesRefreshing || pendings.length ? `refreshing:${fingerprint}` : fingerprint,
      refreshing: refreshing || seriesPending || seriesRefreshing || pendings.length > 0,
      // Rows still being computed (the list, the overview and the panel answer without waiting): how many and of
      // which controls.
      pending: pendings.length ? { rows: pendingRows, controls: pendings, total: needs.length } : undefined,
      seriesPending,
      // The last background refresh that failed (what is shown predates it).
      refreshError,
      // Current rows are still valid now (same fingerprint): only stale data shows its own, older time.
      computedAt: new Date(
        (refreshing || seriesPending || seriesRefreshing || pendings.length) && used.length
          ? Math.min(...used.map(u => u.storedAt))
          : ctx.now.getTime()
      ).toISOString(),
      evaluatedAt: ctx.now.toISOString(),
      configurationUpdatedAt: ctx.configurationUpdatedAt,
      level,
      window: ctx.window,
      agentId: query.agentId,
      controlId: query.controlId,
      facts: factsOfView(ctx, query),
      scope: ctx.scope.map(agent => ({ id: agent.id, name: agent.name, status: agent.status })),
      inventory: ctx.inventory,
      stats: {
        totalMs: Date.now() - started,
        computed: computed.length,
        refreshingInBackground,
        hits: computed.reduce((n, u) => n + u.row.stats.hits, 0),
        rows: computed.map(u => u.row.stats),
      },
    };

    return { ctx, query, meta, state, views, timeline, impact, rowName: name };
  };

  // What remains to do in the background (to wait for it to finish).
  const backgroundWork = () => ({
    rows: inflight.size,
    series: seriesWanted.size + (seriesBusy ? 1 : 0),
    reads: reads.running + reads.queued,
    engine: cpu.running + cpu.queued,
  });
  const idle = () => {
    const w = backgroundWork();
    return !w.rows && !w.series && !w.reads && !w.engine;
  };

  return {
    loadContext,
    run,
    viewFingerprint,
    rows,
    timelines,
    // Rows being computed (tests wait for them to finish).
    tasks: {
      get size() {
        return inflight.size;
      },
    },
    reads,
    cpu,
    metrics,
    backgroundWork,
    idle,
  };
};

// Facts the view sees and the latest: the machine's (and the manager's, which it also reads) or the whole
// scope's; for a control, its own.
const factsOfView = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): { count: number; newest?: string } => {
  if (query.controlId) {
    const facts = ctx.probe.controls[query.controlId];
    if (query.agentId) {
      const ownItems = [query.agentId, ENS_MANAGER_AGENT_ID].map(id => facts?.agents[id]).filter(Boolean) as any[];
      return { count: ownItems.reduce((n, h) => n + h.count, 0), newest: ownItems.map(h => h.newest).filter(Boolean).sort().pop() };
    }
    return { count: facts?.count || 0, newest: facts?.newest };
  }
  if (query.agentId) {
    const ownItems = ctx.probe.presence.filter(p => p.agentId === query.agentId || p.agentId === ENS_MANAGER_AGENT_ID);
    return { count: ownItems.reduce((n, p) => n + (p.count || 0), 0), newest: ownItems.map(p => p.newest).filter(Boolean).sort().pop() };
  }
  return { count: ctx.probe.count, newest: ctx.probe.newest };
};

export type ENSEvaluationService = ReturnType<typeof createEvaluationService>;
