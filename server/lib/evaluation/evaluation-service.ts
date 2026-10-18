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
import { ENS_CONFIGURATION_INDEX } from '../../../common/constants';
import { buildMonitoringInventoryRequest, inventoryFromMonitoring } from '../../../common/agents/agent-inventory';
import { ENSCatalog } from '../../../common/ens/catalog';
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
import { createImpactEventsAccumulator } from '../../../common/ens/core/dashboard-adapter/presenters/impact-events.presenter';
import { normalizeWazuhAlerts } from '../../../common/ens/core/data-source/data-source-engine';
import type { ENSNormalizedEvent } from '../../../common/ens/core/data-source/types';
import type { ENSComplianceResult, ENSTraceabilityResult } from '../../../common/ens/core/evaluation/types';
import { buildENSControlFactsFilter } from '../../../common/ens/dashboard/all-controls-facts-filter';
import { computeStateFactPruningCutoffs } from '../../../common/ens/core/evidence/state-facts';
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
  // Los filtros del alcance ENTERO: el servidor evalúa siempre todas las
  // máquinas y la vista de una sale de sus filas (ver `deriveForAgent`).
  filters: unknown[];
  probe: ENSProbeResult;
  presenceEvents: ENSNormalizedEvent[];
  baseFingerprint: string;
  timeZone?: string;
}

// Un punto de la serie de UN control a fecha de un corte.
interface CutPoint {
  status: string;
  score?: number;
}

// Los días pasados de un control: el resultado del conjunto y el de cada fila.
interface StoredCuts {
  consolidated: CutPoint[];
  rows: Record<string, CutPoint>[];
}

// Lo que se guarda de un control evaluado. Sin hechos: solo resultados.
interface StoredPartition {
  result?: ENSComplianceResult;
  traceability: ENSTraceabilityResult[];
  traceabilityTotal: number;
  // Las filas de las máquinas que lo miden, sin su trazabilidad (de cada una
  // se guardan las primeras entradas y el total).
  rows: { agentId: string; result: ENSComplianceResult; traceability: ENSTraceabilityResult[]; traceabilityTotal: number }[];
  impact: [string, string][];
  stats: ENSControlComputeStats;
  cuts: Record<string, StoredCuts>;
}

const ROW_TRACEABILITY_CAP = 100;

export interface ENSControlComputeStats {
  controlId: string;
  agentId?: string;
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

// Lo mínimo de un resultado que necesita el resumen del motor
// (`buildComplianceState`) para sumar el número del panel en un día pasado.
const pointAsResult = (controlId: string, point: CutPoint): ENSComplianceResult =>
  ({
    control: { id: controlId },
    status: point.status,
    score: point.score,
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

// La configuración activa se relee solo si cambia su fecha: el documento
// lleva el historial de auditoría y pesa cientos de KB.
const readConfigurationStamp = async (client: any): Promise<string | undefined> => {
  const { body } = await client.search({
    index: ENS_CONFIGURATION_INDEX,
    body: {
      size: 1,
      query: { ids: { values: ['active'] } },
      _source: ['updatedAt', 'configuration.updatedAt'],
    },
  });
  const doc = body?.hits?.hits?.[0]?._source;
  return doc ? `${doc.updatedAt || ''}|${doc.configuration?.updatedAt || ''}` : undefined;
};

// La vista de UNA máquina sale de las filas del conjunto, sin volver a leer
// ni a evaluar: es lo que hace `getENSComplianceResultByControl` con la
// máquina (ver `evaluateENSControlPartition`). Su fila si el control se mide
// en ella; la del manager si es un control de organización; nada si no se
// mide. `null` cuando no se puede decidir desde las filas (una máquina fuera
// del alcance, o un control de organización sin fila del manager): entonces
// se evalúa directamente.
export const deriveForAgent = (
  controlId: string,
  agentId: string,
  rows: { agentId: string }[],
  scope: ENSAgentScope[]
): { from: 'row' | 'manager' | 'none' } | null => {
  if (!scope.some(agent => agent.id === agentId)) return null;
  const control = ENSCatalog.find(entry => entry.id === controlId);
  if (!control) return null;
  if (isControlMeasuredOnAgent(control, agentId)) {
    // Sin fila: la máquina no está en su alcance declarado (sin resultado).
    return { from: rows.some(row => row.agentId === agentId) ? 'row' : 'none' };
  }
  if (isManagerOnlyControl(control) && !isManagerAgentId(agentId)) {
    return rows.some(row => row.agentId === ENS_MANAGER_AGENT_ID) ? { from: 'manager' } : null;
  }
  return { from: 'none' };
};

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
  const reloj = () => clock().getTime();
  // Cada control guardado pesa hasta unos MB (resultado, filas y las 2.000
  // entradas de trazabilidad); 120 son unas cinco vistas completas (usuarios).
  const partitions = new EvaluationCache<StoredPartition>(120, EVALUATION_TTL_MS, reloj);
  // Los días pasados de una serie no cambian en el día: se guardan hasta 26 h
  // (la clave lleva el día, así que el de mañana es otra entrada).
  const timelines = new EvaluationCache<any[]>(200, 26 * 3600 * 1000, reloj);
  const inventories = new EvaluationCache<{ agents: ENSAgentScope[]; stale: boolean; newestTimestamp?: string }>(100, 60 * 1000, reloj);
  const configurations = new EvaluationCache<{ configuration: ENSConfigurationVersion; updatedAt?: string; key: string }>(4, 24 * 3600 * 1000, reloj);
  const inFlight = new InFlight<any>();
  const semaphore = new Semaphore(maxConcurrentEvaluations);

  // --- 1. contexto ---------------------------------------------------------

  const loadConfiguration = async (clients: ENSEvaluationClients) => {
    const stamp = (await readConfigurationStamp(clients.asInternalUser)) || 'default';
    const cached = configurations.get('active', stamp);
    if (cached) return cached;
    const stored = await readActiveENSConfiguration(clients.asInternalUser, logger);
    const configuration = stored?.configuration
      ? assertENSConfigurationVersion(stored.configuration)
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
    // Lo que ve cada uno depende de sus permisos en el indexador: la memoria
    // es por usuario y roles, nunca compartida.
    const userKey = `${user.username}|${[...user.roles].sort().join(',')}`;
    const { configuration, updatedAt, key: configurationKey } = await loadConfiguration(clients);

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
    const filters = buildViewFilters(window, scope);
    const { body: probeBody } = await clients.asCurrentUser.search(buildProbeRequest(filters, catalogControlIds()));
    const probe = readProbeResponse(probeBody);
    const presenceEvents = buildENSPresenceEvents(probe.presence, query.timeZone);

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
      timeZone: query.timeZone,
      baseFingerprint: sha(
        configurationKey,
        scopeKey,
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

  // La huella de la vista: lo que compara la sonda del navegador. Es la de
  // sus controles sobre el alcance entero (la vista de una máquina sale del
  // conjunto, así que cambia con él).
  const viewFingerprint = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): string =>
    sha(ctx.baseFingerprint, query.agentId || '*', controlsOf(query).map(id => controlFingerprint(ctx, id)));

  const partitionKey = (ctx: ENSEvaluationContext, agentId: string | undefined, controlId: string) =>
    ['p', ctx.userKey, agentId || '*', controlId, ctx.timeZone || ''].join('|');

  // --- 2. un control ---------------------------------------------------------

  const readFacts = async (client: any, query: unknown, stats: ENSFactsReadStats): Promise<any[]> => {
    const hits: any[] = [];
    await readAllFacts(client, query, page => {
      for (const hit of page) hits.push(hit);
    }, stats, { usePit });
    return hits;
  };

  const capRow = (row: { agentId: string; result: ENSComplianceResult }) => ({
    agentId: row.agentId,
    result: withoutTraceability(row.result),
    traceability: (row.result.traceability || []).slice(0, ROW_TRACEABILITY_CAP),
    traceabilityTotal: (row.result.traceability || []).length,
  });

  // Lee los hechos de UN control (de todo el alcance, o de una máquina y el
  // manager si `agentId`), lo evalúa y, si se pide, también a fecha de cada
  // día pasado de `cuts`.
  const computeControl = async (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    controlId: string,
    agentId: string | undefined,
    cuts: { key: string; plan: ENSTimelineCutPlan[] } | undefined,
    orphanHits: any[]
  ): Promise<StoredPartition> => {
    const started = Date.now();
    const stats = newReadStats();
    const filters = agentId ? buildViewFilters(ctx.window, ctx.scope, agentId) : ctx.filters;
    let pruning: unknown;

    // La poda de los hechos de estado se calcula con los latidos del control,
    // a fecha del instante más antiguo que se va a evaluar.
    if (hasStateFacts(controlId)) {
      const runs = await readFacts(clients.asCurrentUser, buildCollectorRunsQuery(filters, controlId), stats);
      const at = cuts?.plan.length ? cuts.plan[0].cutoff : ctx.now;
      pruning = buildStateFactPruningClause(controlId, computeStateFactPruningCutoffs(controlId, normalizeWazuhAlerts(runs), at));
    }

    const hits = mergeByFactOrder(await readFacts(clients.asCurrentUser, buildFactsQuery(filters, controlId, pruning), stats), orphanHits);
    const fetchMs = Date.now() - started;

    const evaluateStarted = Date.now();
    const events = [...normalizeWazuhAlerts(hits), ...ctx.presenceEvents];
    const level = ctx.configuration.global.ensLevel;

    // Bloque síncrono: la configuración activa del motor es la de esta
    // petición mientras se evalúa (otra petición solo puede colarse en un
    // `await`, y aquí no hay ninguno). El motor la resuelve para cada fila
    // (`getActiveControlConfiguration(control, agente)`: valor del agente →
    // plantillas → organización, uniones en el manager), igual que en el
    // navegador.
    ensConfigurationRepository.replaceActive(ctx.configuration);
    const partition = evaluateENSControlPartition(controlId, level, events, agentId, ctx.scope, ctx.now);

    // Los días pasados: el mismo motor sobre lo conocido hasta el final de
    // cada día, a fecha de ese día (ver `timeline-cuts.ts`).
    const storedCuts: Record<string, StoredCuts> = {};
    if (cuts?.plan.length) {
      const ascending = events
        .map(event => ({ event, time: Date.parse(event.timestamp) }))
        .filter(item => Number.isFinite(item.time) && item.time <= ctx.now.getTime())
        .sort((left, right) => left.time - right.time);
      const consolidated: CutPoint[] = [];
      const rows: Record<string, CutPoint>[] = [];
      let cursor = 0;
      for (const cut of cuts.plan) {
        const limite = cut.cutoff.getTime();
        while (cursor < ascending.length && ascending[cursor].time <= limite) cursor += 1;
        const prefix = ascending.slice(0, cursor).map(item => item.event);
        const enCorte = evaluateENSControlPartition(controlId, level, prefix, agentId, ctx.scope, cut.cutoff);
        consolidated.push({ status: enCorte.result?.status || 'NO_EVALUABLE', score: enCorte.result?.score });
        rows.push(Object.fromEntries(enCorte.rows.map(row => [row.agentId, { status: row.result.status, score: row.result.score }])));
      }
      storedCuts[cuts.key] = { consolidated, rows };
    }

    const impact = createImpactEventsAccumulator();
    impact.add(events);
    const traceability = partition.result?.traceability || [];

    return {
      result: partition.result && withoutTraceability(partition.result),
      traceability: traceability.slice(0, TRACEABILITY_CAP),
      traceabilityTotal: traceability.length,
      rows: partition.rows.map(capRow),
      impact: impact.entries(),
      cuts: storedCuts,
      stats: {
        controlId,
        agentId,
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
  };

  // --- 3. una vista ---------------------------------------------------------

  const timelinePlan = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): ENSTimelineCutPlan[] => {
    if (!query.timelineDays) return [];
    let primero: number | undefined;
    let cuantos = 0;
    if (query.controlId) {
      const hechos = ctx.probe.controls[query.controlId];
      primero = hechos?.oldest ? Date.parse(hechos.oldest) : undefined;
      cuantos = hechos?.count || 0;
    } else if (query.agentId) {
      // La serie de una máquina empieza con su primer hecho (o el del manager,
      // que también lee).
      const propios = ctx.probe.presence.filter(p => p.agentId === query.agentId || p.agentId === ENS_MANAGER_AGENT_ID);
      primero = propios.length ? Math.min(...propios.map(p => Date.parse(p.earliest))) : undefined;
      cuantos = propios.reduce((n, p) => n + (p.count || 0), 0);
    } else {
      primero = ctx.probe.oldest ? Date.parse(ctx.probe.oldest) : undefined;
      cuantos = ctx.probe.count;
    }
    return planENSTimelineCuts(primero, cuantos, {
      now: ctx.now,
      days: query.timelineDays,
      timeZone: query.timeZone,
      // Sin presupuesto: los días pasados se calculan una vez al día.
      maxEvaluatedEvents: Infinity,
    });
  };

  const dailyCounts = async (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    query: ENSEvaluationQuery,
    cuts: ENSTimelineCutPlan[]
  ): Promise<number[]> => {
    const base = query.agentId ? buildViewFilters(ctx.window, ctx.scope, query.agentId) : ctx.filters;
    const filters = query.controlId ? [...base, buildENSControlFactsFilter(query.controlId)] : base;
    const { body } = await clients.asCurrentUser.search(buildDailyCountsRequest(filters, query.timeZone));
    const dias = (body?.aggregations?.days?.buckets || []).map((b: any) => ({ at: Number(b.key), n: Number(b.doc_count || 0) }));
    return cuts.map(cut => dias.filter((d: any) => d.at <= cut.cutoff.getTime()).reduce((s: number, d: any) => s + d.n, 0));
  };

  // La vista de una máquina para un control, desde lo guardado del conjunto.
  const viewOf = (
    star: StoredPartition,
    controlId: string,
    agentId: string | undefined,
    scope: ENSAgentScope[]
  ): ENSViewPartition | null => {
    if (!agentId) {
      return {
        controlId,
        result: star.result,
        traceability: star.traceability,
        traceabilityTotal: star.traceabilityTotal,
        rows: star.rows,
        cutsOf: key => star.cuts[key]?.consolidated,
      };
    }
    const decision = deriveForAgent(controlId, agentId, star.rows, scope);
    if (!decision) return null;
    const fila =
      decision.from === 'row'
        ? star.rows.find(row => row.agentId === agentId)
        : decision.from === 'manager'
        ? star.rows.find(row => row.agentId === ENS_MANAGER_AGENT_ID)
        : undefined;
    const filaDe = decision.from === 'row' ? agentId : decision.from === 'manager' ? ENS_MANAGER_AGENT_ID : undefined;
    return {
      controlId,
      result: fila?.result,
      traceability: fila?.traceability || [],
      traceabilityTotal: fila?.traceabilityTotal || 0,
      rows: decision.from === 'row' && fila ? [fila] : [],
      cutsOf: key =>
        star.cuts[key] && filaDe
          ? star.cuts[key].rows.map(rows => rows[filaDe] || { status: 'NO_EVALUABLE' })
          : star.cuts[key]
          ? star.cuts[key].rows.map(() => undefined)
          : undefined,
    };
  };

  const run = async (clients: ENSEvaluationClients, query: ENSEvaluationQuery, options: { fullTraceability?: boolean } = {}) => {
    const started = Date.now();
    const ctx = await loadContext(clients, query);
    const controls = controlsOf(query);
    const plan = timelinePlan(ctx, query);
    const pastCuts = plan.filter(cut => !cut.isCurrent);
    const cutsKey = sha(pastCuts.map(cut => cut.cutoff.toISOString()));
    const tKey = ['t', ctx.userKey, query.agentId || '*', query.controlId || '*', query.timelineDays, query.timeZone || '', startOfDayIn(ctx.now, query.timeZone).toISOString()].join('|');
    const tFingerprint = sha(ctx.configurationKey, ctx.scopeKey, cutsKey);
    const cachedTimeline = query.timelineDays ? timelines.get(tKey, tFingerprint) : undefined;
    const wantCuts = Boolean(query.timelineDays) && !cachedTimeline && pastCuts.length > 0;

    // Los hechos que no nombran ningún control son de todos: se leen una vez.
    const orphanStats = newReadStats();
    let orphanHits: any[] | undefined;
    const orphans = async () => {
      if (orphanHits === undefined) {
        orphanHits = ctx.probe.orphans.count
          ? await readFacts(clients.asCurrentUser, buildFactsQuery(ctx.filters, null), orphanStats)
          : [];
      }
      return orphanHits;
    };

    const views = new Map<string, ENSViewPartition>();
    const impactos: [string, string][][] = [];
    const controlStats: ENSControlComputeStats[] = [];

    for (const controlId of controls) {
      const fingerprint = controlFingerprint(ctx, controlId);
      const starKey = partitionKey(ctx, undefined, controlId);
      let star = partitions.get(starKey, fingerprint);
      if (star && (!wantCuts || star.cuts[cutsKey])) {
        controlStats.push({ ...star.stats, fromCache: true });
      } else {
        star = await computeControl(clients, ctx, controlId, undefined, wantCuts ? { key: cutsKey, plan: pastCuts } : undefined, await orphans());
        partitions.set(starKey, fingerprint, star);
        controlStats.push(star.stats);
      }
      impactos.push(star.impact);

      let view = viewOf(star, controlId, query.agentId, ctx.scope);
      // Lo que no sale de las filas, o la trazabilidad completa de una
      // máquina: se evalúa la vista directamente.
      if (!view || (options.fullTraceability && query.agentId)) {
        const directKey = partitionKey(ctx, query.agentId, controlId);
        let direct = partitions.get(directKey, fingerprint);
        if (!direct || (wantCuts && !direct.cuts[cutsKey])) {
          direct = await computeControl(clients, ctx, controlId, query.agentId, wantCuts ? { key: cutsKey, plan: pastCuts } : undefined, await orphans());
          partitions.set(directKey, fingerprint, direct);
          controlStats.push(direct.stats);
        }
        const d = direct;
        view = {
          controlId,
          result: d.result,
          traceability: d.traceability,
          traceabilityTotal: d.traceabilityTotal,
          rows: d.rows,
          cutsOf: key => d.cuts[key]?.consolidated,
        };
      }
      views.set(controlId, view);
    }

    const parts: ENSControlPartition[] = controls.map(controlId => ({
      controlId,
      result: views.get(controlId)?.result,
      rows: (views.get(controlId)?.rows || []).map(row => ({ agentId: row.agentId, result: row.result })),
    }));
    const state = query.controlId ? undefined : assembleENSComplianceState(parts, query.agentId, ctx.scope, ctx.presenceEvents);

    // La serie: días pasados (guardados o recién calculados) + el presente.
    let timeline: any[] | undefined;
    if (query.timelineDays) {
      let pasados = cachedTimeline;
      if (!pasados) {
        const eventos = pastCuts.length ? await dailyCounts(clients, ctx, query, pastCuts) : [];
        pasados = pastCuts.map((cut, index) => {
          const base = { date: cut.cutoff.toISOString(), label: cut.label, isCurrent: false, events: eventos[index] || 0 };
          const puntos = controls.map(controlId => views.get(controlId)?.cutsOf(cutsKey)?.[index]);
          if (query.controlId) {
            return { ...base, score: puntos[0]?.score, status: puntos[0]?.status || 'NO_EVALUABLE' };
          }
          // El número del panel en ese día: el mismo resumen del motor, sobre
          // los controles con resultado en la vista.
          const resultados = controls
            .map((controlId, i) => (puntos[i] ? pointAsResult(controlId, puntos[i] as CutPoint) : undefined))
            .filter((r): r is ENSComplianceResult => Boolean(r));
          return { ...base, score: buildComplianceState(resultados).controlSummary.scoreAverage };
        });
        timelines.set(tKey, tFingerprint, pasados);
      }
      const hoy = plan.find(cut => cut.isCurrent);
      const actual = query.controlId ? views.get(query.controlId)?.result : undefined;
      timeline = [
        ...pasados,
        ...(hoy
          ? [
              {
                date: hoy.cutoff.toISOString(),
                label: hoy.label,
                isCurrent: true,
                events: factsOfView(ctx, query).count,
                ...(query.controlId
                  ? { score: actual?.score, status: actual?.status || 'NO_EVALUABLE' }
                  : { score: state!.controlSummary.scoreAverage }),
              },
            ]
          : []),
      ];
    }

    const impacto = createImpactEventsAccumulator();
    impactos.forEach(entries => impacto.addEntries(entries));

    const meta = {
      fingerprint: viewFingerprint(ctx, query),
      evaluatedAt: ctx.now.toISOString(),
      configurationUpdatedAt: ctx.configurationUpdatedAt,
      level: ctx.configuration.global.ensLevel,
      window: ctx.window,
      agentId: query.agentId,
      controlId: query.controlId,
      facts: factsOfView(ctx, query),
      scope: ctx.scope.map(agent => ({ id: agent.id, name: agent.name, status: agent.status })),
      inventory: ctx.inventory,
      stats: {
        totalMs: Date.now() - started,
        computed: controlStats.filter(stat => !stat.fromCache).length,
        hits: controlStats.reduce((n, stat) => n + (stat.fromCache ? 0 : stat.hits), 0),
        controls: controlStats,
        orphans: orphanStats.hits,
      },
    };

    return { ctx, query, meta, state, views, timeline, impact: impacto.build() };
  };

  return { loadContext, run, viewFingerprint, partitions, timelines, inFlight, semaphore };
};

export interface ENSViewPartition {
  controlId: string;
  result?: ENSComplianceResult;
  traceability: ENSTraceabilityResult[];
  traceabilityTotal: number;
  rows: { agentId: string; result: ENSComplianceResult; traceability: ENSTraceabilityResult[]; traceabilityTotal: number }[];
  cutsOf: (key: string) => (CutPoint | undefined)[] | undefined;
}

// Cuántos hechos ve la vista y el más reciente: los de la máquina (y del
// manager, que también lee) o los de todo el alcance; de un control, los suyos.
const factsOfView = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): { count: number; newest?: string } => {
  if (query.controlId) {
    const hechos = ctx.probe.controls[query.controlId];
    return { count: hechos?.count || 0, newest: hechos?.newest };
  }
  if (query.agentId) {
    const propios = ctx.probe.presence.filter(p => p.agentId === query.agentId || p.agentId === ENS_MANAGER_AGENT_ID);
    const newest = propios.map(p => p.newest).filter(Boolean).sort().pop();
    return { count: propios.reduce((n, p) => n + (p.count || 0), 0), newest };
  }
  return { count: ctx.probe.count, newest: ctx.probe.newest };
};

export type ENSEvaluationService = ReturnType<typeof createEvaluationService>;
