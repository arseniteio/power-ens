// La evaluación en el servidor del plugin.
//
// El navegador ya no descarga hechos para juzgar: pide aquí el resultado. El
// servidor lee los hechos de la ventana ENTERA (sin el tope de 10.000), como
// el usuario que mira, control a control, los juzga con el MISMO motor que
// usaba el navegador (`common/ens/core`) y devuelve el resultado compacto.
//
//   1. Contexto: quién mira, la configuración activa, el alcance (inventario
//      de wazuh-monitoring) y una SONDA de unos cientos de bytes: cuántos
//      hechos hay por control y el más reciente, y el primero de cada máquina.
//   2. Por cada control: si su huella (configuración, alcance, hechos del
//      control, presencia) es la misma y no ha caducado, el resultado guardado;
//      si no, se leen sus hechos página a página —sin los de estado que el
//      motor descartaría (`computeStateFactPruningCutoffs`)—, se evalúa y se
//      sueltan.
//   3. El estado del panel se arma con los resultados de cada control
//      (`assembleENSComplianceState`), igual que el motor sobre todo.
//   4. La serie diaria: los días pasados se calculan una vez al día.
//
// La respuesta de cada vista está descrita en `server/README.md`.
import { createHash } from 'crypto';
import type { Logger } from '../../../../src/core/server';
import { buildMonitoringInventoryRequest, inventoryFromMonitoring } from '../../../common/agents/agent-inventory';
import { defaultENSConfigurationTemplate } from '../../../common/ens/configuration/data/default-configuration';
import { ensConfigurationRepository } from '../../../common/ens/configuration/repository';
import { assertENSConfigurationVersion } from '../../../common/ens/configuration/services/configuration-structure-validator';
import type { ENSConfigurationVersion } from '../../../common/ens/configuration/types';
import { buildComplianceState } from '../../../common/ens/core/compliance-state';
import {
  assembleENSComplianceState,
  buildENSPresenceEvents,
  ENSControlPartition,
  evaluateENSControlPartition,
} from '../../../common/ens/core/control-partition';
import { buildENSDashboardModel } from '../../../common/ens/core/dashboard-adapter/dashboard-adapter';
import { createImpactEventsAccumulator } from '../../../common/ens/core/dashboard-adapter/presenters/impact-events.presenter';
import { normalizeWazuhAlerts } from '../../../common/ens/core/data-source/data-source-engine';
import type { ENSNormalizedEvent } from '../../../common/ens/core/data-source/types';
import type { ENSComplianceResult, ENSTraceabilityResult } from '../../../common/ens/core/evaluation/types';
import { buildENSControlFactsFilter } from '../../../common/ens/dashboard/all-controls-facts-filter';
import { computeStateFactPruningCutoffs } from '../../../common/ens/core/evidence/state-facts';
import { getEvidenceDefinitions } from '../../../common/ens/core/evidence/registry';
import { normalizeInventory, resolveENSScopeAgents } from '../../../common/ens/core/scope/runtime';
import type { ENSAgentScope } from '../../../common/ens/core/scope/types';
import { planENSTimelineCuts, startOfDayIn } from '../../../common/ens/core/timeline/timeline-cuts';
import type { ENSTimelineCutPlan } from '../../../common/ens/core/timeline/timeline-cuts';
import { readActiveENSConfiguration } from '../configuration-storage';
import { resolveCurrentUser } from '../current-user';
import { EVALUATION_TTL_MS, EvaluationCache, InFlight, Semaphore } from './cache';
import { newReadStats, readAllFacts } from './facts-reader';
import type { ENSFactsReadStats } from './facts-reader';
import {
  buildCollectorRunsQuery,
  buildDailyCountsRequest,
  buildFactsQuery,
  buildProbeRequest,
  buildStateFactPruningClause,
  buildViewFilters,
  catalogControlIds,
  readProbeResponse,
  resolveEvaluationWindow,
} from './queries';
import type { ENSEvaluationWindow, ENSProbeResult } from './queries';

export type ENSEvaluationInclude = 'summary' | 'results' | 'dashboard' | 'control';

export interface ENSEvaluationQuery {
  agentId?: string;
  controlId?: string;
  include: ENSEvaluationInclude;
  // Días de la serie (0 o nada: sin serie). El panel pide 7 y el detalle 30.
  timelineDays?: number;
  // Zona horaria de quien mira (IANA): decide qué es «un día» en la serie.
  timeZone?: string;
}

export interface ENSEvaluationClients {
  asCurrentUser: any;
  asInternalUser: any;
}

// Cuántas entradas de la trazabilidad de un control se guardan y se sirven
// (las más recientes). El total se dice siempre.
export const TRACEABILITY_CAP = 2000;

const sha = (...parts: unknown[]): string =>
  createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16);

const isValidTimeZone = (timeZone?: string): string | undefined => {
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return undefined;
  }
};

export const normalizeQuery = (query: Partial<ENSEvaluationQuery>): ENSEvaluationQuery => ({
  agentId: query.agentId ? String(query.agentId).trim() || undefined : undefined,
  controlId: query.controlId ? String(query.controlId).trim() || undefined : undefined,
  include: (['summary', 'results', 'dashboard', 'control'] as const).includes(query.include as any)
    ? (query.include as ENSEvaluationInclude)
    : query.controlId
    ? 'control'
    : 'summary',
  timelineDays: Math.max(0, Math.min(90, Math.floor(Number(query.timelineDays) || 0))),
  timeZone: isValidTimeZone(query.timeZone),
});

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
  filters: unknown[];
  probe: ENSProbeResult;
  presenceEvents: ENSNormalizedEvent[];
  baseFingerprint: string;
}

// Lo que se guarda de un control evaluado. Sin hechos: solo resultados.
interface StoredPartition {
  result?: ENSComplianceResult;
  // Filas de las máquinas, reducidas a lo que suma el panel.
  rows: { agentId: string; result: ENSComplianceResult }[];
  traceability?: ENSTraceabilityResult[];
  traceabilityTotal: number;
  impact: [string, string][];
  stats: ENSControlComputeStats;
}

export interface ENSControlComputeStats {
  controlId: string;
  fromCache: boolean;
  hits: number;
  pages: number;
  bytes: number;
  pit: boolean;
  events: number;
  fetchMs: number;
  evaluateMs: number;
  pruned: boolean;
}

// Un punto de la serie de UN control a fecha de un corte.
interface CutPoint {
  status: string;
  score?: number;
}

const resultStub = (result: ENSComplianceResult): ENSComplianceResult =>
  ({
    control: result.control,
    status: result.status,
    score: result.score,
    requirements: [],
    evidences: [],
  } as unknown as ENSComplianceResult);

// El resultado tal cual, salvo la trazabilidad: la lista de hechos del
// control (decenas de miles con op.acc.3), que no hace falta para juzgar ni
// para pintar ninguna pantalla de resumen.
export const withoutTraceability = (result: ENSComplianceResult): ENSComplianceResult => ({
  ...result,
  traceability: [],
});

const mergeByFactOrder = (a: any[], b: any[]): any[] => {
  if (!b.length) return a;
  if (!a.length) return b;
  const clave = (h: any) => [Number(h?.sort?.[0] ?? Date.parse(h?._source?.['@timestamp'])), String(h?._id ?? '')] as const;
  return [...a, ...b].sort((x, y) => {
    const [tx, ix] = clave(x);
    const [ty, iy] = clave(y);
    return ty - tx || (ix < iy ? -1 : ix > iy ? 1 : 0);
  });
};

const hasStateFacts = (controlId: string): boolean =>
  getEvidenceDefinitions(controlId).some(definition => (definition.stateFactEventTypes || []).length > 0);

export interface ENSEvaluationServiceOptions {
  logger: Logger;
  securityEnabled: boolean;
  clock?: () => Date;
  // Sin PIT (pruebas, o un indexador que no lo admita).
  usePit?: boolean;
  maxConcurrentEvaluations?: number;
}

export const createEvaluationService = ({
  logger,
  securityEnabled,
  clock = () => new Date(),
  usePit = true,
  maxConcurrentEvaluations = 2,
}: ENSEvaluationServiceOptions) => {
  const partitions = new EvaluationCache<StoredPartition>(600, EVALUATION_TTL_MS, () => clock().getTime());
  // Los días pasados de una serie no cambian en el día: se guardan hasta 26 h
  // (la clave lleva el día, así que el de mañana es otra entrada).
  const timelines = new EvaluationCache<any[]>(200, 26 * 3600 * 1000, () => clock().getTime());
  const inventories = new EvaluationCache<{ agents: ENSAgentScope[]; stale: boolean; newestTimestamp?: string }>(
    100,
    60 * 1000,
    () => clock().getTime()
  );
  const inFlight = new InFlight<any>();
  const semaphore = new Semaphore(maxConcurrentEvaluations);

  // --- 1. contexto ---------------------------------------------------------

  const loadContext = async (clients: ENSEvaluationClients, query: ENSEvaluationQuery): Promise<ENSEvaluationContext> => {
    const now = clock();
    const user = await resolveCurrentUser(clients.asCurrentUser, securityEnabled);
    // Lo que ve cada uno depende de sus permisos en el indexador: la memoria
    // es por usuario y roles, nunca compartida.
    const userKey = `${user.username}|${[...user.roles].sort().join(',')}`;

    const stored = await readActiveENSConfiguration(clients.asInternalUser, logger);
    const configuration = stored?.configuration
      ? assertENSConfigurationVersion(stored.configuration)
      : (defaultENSConfigurationTemplate as ENSConfigurationVersion);
    const configurationKey = sha(stored?.updatedAt || '', stored?.configuration || 'default');

    let inventory = inventories.get(userKey, 'inventory');
    if (!inventory) {
      const { body } = await clients.asCurrentUser.search(buildMonitoringInventoryRequest());
      const leido = inventoryFromMonitoring(body?.aggregations, now.getTime());
      inventory = { agents: normalizeInventory(leido.agents), stale: leido.stale, newestTimestamp: leido.newestTimestamp };
      inventories.set(userKey, 'inventory', inventory);
    }
    const scope = resolveENSScopeAgents(inventory.agents, configuration.scope);
    const scopeKey = sha(scope.map(agent => [agent.id, agent.name, agent.groups]));

    const window = resolveEvaluationWindow(configuration.global.evaluationPeriod, now);
    const filters = buildViewFilters(window, scope, query.agentId);
    const { body: probeBody } = await clients.asCurrentUser.search(buildProbeRequest(filters, catalogControlIds()));
    const probe = readProbeResponse(probeBody);
    const presenceEvents = buildENSPresenceEvents(probe.presence, query.timeZone);

    return {
      now,
      userKey,
      configuration,
      configurationKey,
      configurationUpdatedAt: stored?.updatedAt || (configuration as any).updatedAt,
      scope,
      scopeKey,
      inventory: { stale: inventory.stale, newestTimestamp: inventory.newestTimestamp, agents: inventory.agents.length },
      window,
      filters,
      probe,
      presenceEvents,
      baseFingerprint: sha(
        configurationKey,
        scopeKey,
        query.agentId || '*',
        query.timeZone || '',
        presenceEvents.map(event => [event.agentId, event.agentName, event.timestamp]),
        probe.orphans
      ),
    };
  };

  const controlsOf = (query: ENSEvaluationQuery): string[] =>
    query.controlId ? [query.controlId] : catalogControlIds();

  const controlFingerprint = (ctx: ENSEvaluationContext, controlId: string): string => {
    const hechos = ctx.probe.controls[controlId] || { count: 0 };
    return sha(ctx.baseFingerprint, controlId, hechos.count, hechos.newest || '');
  };

  // La huella de la vista: lo que la sonda del navegador compara.
  const viewFingerprint = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): string =>
    sha(ctx.baseFingerprint, controlsOf(query).map(id => controlFingerprint(ctx, id)));

  const partitionKey = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery, controlId: string) =>
    ['p', ctx.userKey, query.agentId || '*', controlId, query.timeZone || ''].join('|');

  // --- 2. un control ---------------------------------------------------------

  const readFacts = async (client: any, query: unknown, stats: ENSFactsReadStats): Promise<any[]> => {
    const hits: any[] = [];
    await readAllFacts(client, query, page => {
      for (const hit of page) hits.push(hit);
    }, stats, { usePit });
    return hits;
  };

  const computeControl = async (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    query: ENSEvaluationQuery,
    controlId: string,
    cuts: ENSTimelineCutPlan[],
    orphanHits: any[]
  ): Promise<{ stored: StoredPartition; cutPoints: CutPoint[] }> => {
    const started = Date.now();
    const stats = newReadStats();
    let pruning: unknown;

    // La poda de los hechos de estado se calcula con los latidos del control,
    // a fecha del instante más antiguo que se va a evaluar.
    if (hasStateFacts(controlId)) {
      const runs = await readFacts(clients.asCurrentUser, buildCollectorRunsQuery(ctx.filters, controlId), stats);
      const at = cuts.length ? cuts[0].cutoff : ctx.now;
      pruning = buildStateFactPruningClause(
        controlId,
        computeStateFactPruningCutoffs(controlId, normalizeWazuhAlerts(runs), at)
      );
    }

    const hits = mergeByFactOrder(
      await readFacts(clients.asCurrentUser, buildFactsQuery(ctx.filters, controlId, pruning), stats),
      orphanHits
    );
    const fetchMs = Date.now() - started;

    const evaluateStarted = Date.now();
    const events = [...normalizeWazuhAlerts(hits), ...ctx.presenceEvents];
    const level = ctx.configuration.global.ensLevel;

    // Bloque síncrono: la configuración activa del motor es la de esta
    // petición mientras se evalúa (otra petición solo puede colarse en un
    // `await`, y aquí no hay ninguno).
    ensConfigurationRepository.replaceActive(ctx.configuration);
    const partition = evaluateENSControlPartition(controlId, level, events, query.agentId, ctx.scope, ctx.now);

    // Los días pasados de la serie: el mismo motor sobre lo conocido hasta el
    // final de cada día, a fecha de ese día (ver `timeline-cuts.ts`).
    const cutPoints: CutPoint[] = [];
    if (cuts.length) {
      const ascending = events
        .map(event => ({ event, time: Date.parse(event.timestamp) }))
        .filter(item => Number.isFinite(item.time) && item.time <= ctx.now.getTime())
        .sort((left, right) => left.time - right.time);
      let cursor = 0;
      for (const cut of cuts) {
        const limite = cut.cutoff.getTime();
        while (cursor < ascending.length && ascending[cursor].time <= limite) cursor += 1;
        const prefix = ascending.slice(0, cursor).map(item => item.event);
        const enCorte = evaluateENSControlPartition(controlId, level, prefix, query.agentId, ctx.scope, cut.cutoff).result;
        cutPoints.push({ status: enCorte?.status || 'NO_EVALUABLE', score: enCorte?.score });
      }
    }

    const impact = createImpactEventsAccumulator();
    impact.add(events);

    const traceability = partition.result?.traceability || [];
    const stored: StoredPartition = {
      result: partition.result && withoutTraceability(partition.result),
      rows: partition.rows.map(row => ({ agentId: row.agentId, result: resultStub(row.result) })),
      traceability: traceability.slice(0, TRACEABILITY_CAP),
      traceabilityTotal: traceability.length,
      impact: impact.entries(),
      stats: {
        controlId,
        fromCache: false,
        hits: stats.hits,
        pages: stats.pages,
        bytes: stats.bytes,
        pit: stats.pit,
        events: events.length - ctx.presenceEvents.length,
        fetchMs,
        evaluateMs: Date.now() - evaluateStarted,
        pruned: Boolean(pruning),
      },
    };

    return { stored, cutPoints };
  };

  // --- 3. una vista ---------------------------------------------------------

  const timelinePlan = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): ENSTimelineCutPlan[] => {
    if (!query.timelineDays) return [];
    const hechos = query.controlId ? ctx.probe.controls[query.controlId] || { count: 0 } : ctx.probe;
    const primero = hechos.oldest ? Date.parse(hechos.oldest) : undefined;
    return planENSTimelineCuts(primero, hechos.count, {
      now: ctx.now,
      days: query.timelineDays,
      timeZone: query.timeZone,
      // Sin presupuesto: los días pasados se calculan una vez al día.
      maxEvaluatedEvents: Infinity,
    });
  };

  const timelineKey = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery) =>
    [
      't',
      ctx.userKey,
      query.agentId || '*',
      query.controlId || '*',
      query.timelineDays,
      query.timeZone || '',
      startOfDayIn(ctx.now, query.timeZone).toISOString(),
    ].join('|');

  const dailyCounts = async (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    query: ENSEvaluationQuery,
    cuts: ENSTimelineCutPlan[]
  ): Promise<number[]> => {
    const filters = query.controlId ? [...ctx.filters, buildENSControlFactsFilter(query.controlId)] : ctx.filters;
    const { body } = await clients.asCurrentUser.search(buildDailyCountsRequest(filters, query.timeZone));
    const dias = (body?.aggregations?.days?.buckets || []).map((b: any) => ({ at: Number(b.key), n: Number(b.doc_count || 0) }));
    return cuts.map(cut => dias.filter((d: any) => d.at <= cut.cutoff.getTime()).reduce((s: number, d: any) => s + d.n, 0));
  };

  const run = async (clients: ENSEvaluationClients, query: ENSEvaluationQuery) => {
    const started = Date.now();
    const ctx = await loadContext(clients, query);
    const controls = controlsOf(query);
    const plan = timelinePlan(ctx, query);
    const pastCuts = plan.filter(cut => !cut.isCurrent);
    const tKey = timelineKey(ctx, query);
    const tFingerprint = sha(ctx.configurationKey, ctx.scopeKey, ctx.baseFingerprint, pastCuts.map(cut => cut.cutoff.toISOString()));
    const cachedTimeline = query.timelineDays ? timelines.get(tKey, tFingerprint) : undefined;
    const needCuts = Boolean(query.timelineDays) && !cachedTimeline && pastCuts.length > 0;
    const withTrace = query.include === 'control';

    // Los hechos que no nombran ningún control son de todos: se leen una vez.
    const orphanStats = newReadStats();
    const orphanHits = ctx.probe.orphans.count
      ? await readFacts(clients.asCurrentUser, buildFactsQuery(ctx.filters, null), orphanStats)
      : [];

    const stored = new Map<string, StoredPartition>();
    const cutPoints = new Map<string, CutPoint[]>();
    const controlStats: ENSControlComputeStats[] = [];

    for (const controlId of controls) {
      const key = partitionKey(ctx, query, controlId);
      const fingerprint = controlFingerprint(ctx, controlId);
      const cached = partitions.get(key, fingerprint);
      if (cached && !needCuts && (!withTrace || cached.traceability)) {
        stored.set(controlId, cached);
        controlStats.push({ ...cached.stats, fromCache: true });
        continue;
      }
      const computed = await computeControl(clients, ctx, query, controlId, needCuts ? pastCuts : [], orphanHits);
      partitions.set(key, fingerprint, computed.stored);
      stored.set(controlId, computed.stored);
      cutPoints.set(controlId, computed.cutPoints);
      controlStats.push(computed.stored.stats);
    }

    const parts: ENSControlPartition[] = controls.map(controlId => ({
      controlId,
      result: stored.get(controlId)?.result,
      rows: stored.get(controlId)?.rows || [],
    }));
    const state = query.controlId ? undefined : assembleENSComplianceState(parts, query.agentId, ctx.scope, ctx.presenceEvents);

    // La serie: días pasados (guardados o recién calculados) + el presente.
    let timeline: any[] | undefined;
    if (query.timelineDays) {
      let pasados = cachedTimeline;
      if (!pasados) {
        const eventos = pastCuts.length ? await dailyCounts(clients, ctx, query, pastCuts) : [];
        pasados = pastCuts.map((cut, index) => {
          const puntos = controls.map(controlId => cutPoints.get(controlId)?.[index] || { status: 'NO_EVALUABLE' });
          const base = { date: cut.cutoff.toISOString(), label: cut.label, isCurrent: false, events: eventos[index] || 0 };
          if (query.controlId) {
            return { ...base, score: puntos[0].score, status: puntos[0].status };
          }
          // El número del panel en ese día: el mismo resumen del motor.
          return { ...base, score: buildComplianceState(puntos as unknown as ENSComplianceResult[]).controlSummary.scoreAverage };
        });
        timelines.set(tKey, tFingerprint, pasados);
      }
      const hoy = plan.find(cut => cut.isCurrent);
      const actual = query.controlId ? stored.get(query.controlId)?.result : undefined;
      timeline = [
        ...pasados,
        ...(hoy
          ? [
              {
                date: hoy.cutoff.toISOString(),
                label: hoy.label,
                isCurrent: true,
                events: query.controlId ? ctx.probe.controls[query.controlId]?.count || 0 : ctx.probe.count,
                ...(query.controlId
                  ? { score: actual?.score, status: actual?.status || 'NO_EVALUABLE' }
                  : { score: state!.controlSummary.scoreAverage }),
              },
            ]
          : []),
      ];
    }

    const meta = {
      fingerprint: viewFingerprint(ctx, query),
      evaluatedAt: ctx.now.toISOString(),
      configurationUpdatedAt: ctx.configurationUpdatedAt,
      level: ctx.configuration.global.ensLevel,
      window: ctx.window,
      agentId: query.agentId,
      controlId: query.controlId,
      facts: query.controlId
        ? { count: ctx.probe.controls[query.controlId]?.count || 0, newest: ctx.probe.controls[query.controlId]?.newest }
        : { count: ctx.probe.count, newest: ctx.probe.newest },
      scope: ctx.scope.map(agent => ({ id: agent.id, name: agent.name, status: agent.status })),
      inventory: ctx.inventory,
      stats: {
        totalMs: Date.now() - started,
        controls: controlStats,
        orphans: orphanStats.hits,
      },
    };

    return { ctx, query, meta, state, stored, timeline };
  };

  return { loadContext, run, viewFingerprint, partitions, timelines, inFlight, semaphore };
};

export type ENSEvaluationService = ReturnType<typeof createEvaluationService>;
