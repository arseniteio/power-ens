// La evaluación en el servidor del plugin.
//
// El navegador no descarga hechos para juzgar: pide aquí el resultado. El
// servidor lee los hechos de la ventana ENTERA, como el usuario que mira, de UN
// control en UNA máquina a la vez, los juzga con el MISMO motor que usaba el
// navegador (`common/ens/core`) y los suelta antes de leer los siguientes.
//
//   1. Contexto: quién mira, la configuración activa, el alcance (inventario de
//      wazuh-monitoring) y una SONDA sin documentos: hechos por control y
//      máquina (cuántos y el más reciente), los que no nombran control, la
//      presencia de cada máquina y sus latidos (ver `queries.ts`).
//   2. Cada fila (un control en una máquina que lo mide): si su huella es la
//      misma y no tiene más de 60 minutos, la guardada; si cambió, la guardada
//      se enseña al instante (marcada) y se recalcula detrás; si no hay
//      ninguna, se calcula: latidos → poda de los hechos de estado → hechos de
//      esa máquina página a página → motor → se sueltan.
//   3. La vista de conjunto de cada control se consolida con la consolidación
//      del motor (`consolidateENSControlRows`); la de una máquina sale de sus
//      filas. El estado del panel se arma con `assembleENSComplianceState`.
//      Todo da lo mismo que el motor sobre todos los hechos a la vez.
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
import type { ENSComplianceState } from '../../../common/ens/core/compliance-state/types';
import {
  assembleENSComplianceState,
  buildENSHeartbeatEvents,
  buildENSPresenceEvents,
  consolidateENSControlRows,
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
import { ENS_EVALUATION_LIMITS } from '../../../common/ens/evaluation/limits';
import { readActiveENSConfiguration } from '../configuration-storage';
import { resolveCurrentUser } from '../current-user';
import { Cancellable, CacheEntry, EVALUATION_TTL_MS, EvaluationCache, Semaphore, SharedTasks } from './cache';
import { newReadStats, readAllFacts, searchComplete, throwIfCancelled } from './facts-reader';
import type { ENSFactsReadStats } from './facts-reader';
import {
  buildCollectorRunsQuery,
  buildDailyCountsRequest,
  buildFactsQuery,
  buildImpactEventsRequest,
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
  timeZone: string;
}

export interface ENSEvaluationClients {
  asCurrentUser: any;
  asInternalUser: any;
}

export interface ENSRunOptions {
  // Responder con lo guardado aunque ya no valga, y recalcular detrás.
  allowStale?: boolean;
  // Quien espera la respuesta (se cancela si se va).
  signal?: Cancellable;
}

// Una petición mal hecha: 400 con el motivo.
export class ENSBadRequestError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ENSBadRequestError';
  }
}

// El id de una máquina como lo escribe el inventario (`24` → `024`).
const normalizeAgentId = (value: string): string => {
  const texto = value.trim();
  return /^\d+$/.test(texto) ? texto.padStart(3, '0') : texto;
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

// Los parámetros de la petición, comprobados. Lo que depende del alcance (que
// la máquina esté en él) se comprueba con el contexto (`run`).
export const normalizeQuery = (query: Record<string, unknown>): ENSEvaluationQuery => {
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const controlId = texto(query.controlId);
  if (controlId && !ENSCatalog.some(control => control.id === controlId)) {
    throw new ENSBadRequestError(`El control «${controlId}» no está en el catálogo de ENSFácil.`);
  }
  const agente = texto(query.agentId);
  const agentId = agente ? normalizeAgentId(agente) : undefined;
  if (agente && (!agentId || agentId.length > 64)) {
    throw new ENSBadRequestError(`«${agente}» no es un identificador de máquina válido.`);
  }
  const zona = texto(query.timeZone);
  if (zona && !isValidTimeZone(zona)) {
    throw new ENSBadRequestError(`«${zona}» no es una zona horaria IANA válida.`);
  }
  const include = texto(query.include);
  if (include && !['summary', 'results', 'dashboard', 'control'].includes(include)) {
    throw new ENSBadRequestError(`Vista desconocida: «${include}».`);
  }
  const dias = query.timelineDays === undefined || query.timelineDays === '' ? 0 : Number(query.timelineDays);
  if (!Number.isInteger(dias) || dias < 0 || dias > ENS_EVALUATION_LIMITS.maxTimelineDays) {
    throw new ENSBadRequestError(`Los días de la serie van de 0 a ${ENS_EVALUATION_LIMITS.maxTimelineDays}.`);
  }
  return {
    agentId,
    controlId,
    include: (include as ENSEvaluationInclude) || (controlId ? 'control' : 'summary'),
    timelineDays: dias,
    timeZone: zona || 'UTC',
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
  // Los filtros del alcance ENTERO: el servidor evalúa siempre todas las
  // máquinas; la vista de una sale de sus filas.
  filters: unknown[];
  probe: ENSProbeResult;
  // Los hechos de presencia de todas las máquinas (identidad y nombres).
  presenceEvents: ENSNormalizedEvent[];
  presenceOf: Map<string, ENSNormalizedEvent>;
  heartbeatsOf: Map<string, ENSNormalizedEvent[]>;
  timeZone: string;
}

// Un punto de la serie de una fila a fecha de un corte.
interface CutPoint {
  status: string;
  score?: number;
}

// Lo que se guarda de una fila (un control en una máquina). Sin hechos.
interface StoredRow {
  result?: ENSComplianceResult;
  traceability: ENSTraceabilityResult[];
  traceabilityTotal: number;
  cuts: Record<string, CutPoint[]>;
  stats: ENSRowComputeStats;
  // Con qué configuración y alcance se calculó: una entrada de otra
  // configuración no se enseña ni mientras se recalcula.
  configurationKey: string;
  scopeKey: string;
}

export interface ENSRowComputeStats {
  controlId: string;
  agentId: string;
  hits: number;
  pages: number;
  events: number;
  fetchMs: number;
  evaluateMs: number;
  pruned: boolean;
}

// El resultado tal cual, salvo la trazabilidad (la lista de hechos del
// control, decenas de miles con op.acc.3).
export const withoutTraceability = (result: ENSComplianceResult): ENSComplianceResult => ({
  ...result,
  traceability: [],
});

const hasStateFacts = (controlId: string): boolean =>
  getEvidenceDefinitions(controlId).some(definition => (definition.stateFactEventTypes || []).length > 0);

// La configuración activa se relee solo si cambia su sello: el documento lleva
// el historial y pesa cientos de KB. El sello incluye `_seq_no` y
// `_primary_term`: cambian con cualquier escritura, aunque no toque las fechas.
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

// La vista de UNA máquina sale de las filas del conjunto: su fila si el
// control se mide en ella; la del manager si es un control de organización;
// nada si no se mide. `null` cuando no se puede decidir desde las filas (un
// control de organización sin fila del manager): entonces se evalúa aparte.
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
    // Sin fila: la máquina no está en su alcance declarado (sin resultado).
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
  // Lecturas pesadas (un control en una máquina) a la vez.
  maxConcurrentReads?: number;
  // Hechos en memoria a la vez por lectura.
  maxFactsPerRead?: number;
  // Tamaño de lo guardado de las filas (JSON).
  maxStoredBytes?: number;
}

// La vista de un control para la petición: su resultado, su trazabilidad y
// sus filas (las del panel).
export interface ENSViewPartition {
  controlId: string;
  result?: ENSComplianceResult;
  traceability: ENSTraceabilityResult[];
  traceabilityTotal: number;
  rows: { agentId: string; result: ENSComplianceResult }[];
  cutsOf: (key: string) => (CutPoint | undefined)[] | undefined;
}

export const createEvaluationService = ({
  logger,
  securityEnabled,
  clock = () => new Date(),
  maxConcurrentReads = 2,
  maxFactsPerRead,
  maxStoredBytes = 48 * 1024 * 1024,
}: ENSEvaluationServiceOptions) => {
  const reloj = () => clock().getTime();
  const jsonBytes = (value: unknown) => JSON.stringify(value).length;
  const rows = new EvaluationCache<StoredRow>(4000, EVALUATION_TTL_MS, reloj, maxStoredBytes, jsonBytes);
  // Los días pasados de una serie no cambian en el día: hasta 26 h (la clave
  // lleva el día y la zona; solo zonas IANA válidas llegan aquí).
  const timelines = new EvaluationCache<any[]>(200, 26 * 3600 * 1000, reloj);
  const impacts = new EvaluationCache<ImpactEventsModel>(200, EVALUATION_TTL_MS, reloj);
  const inventories = new EvaluationCache<{ agents: ENSAgentScope[]; stale: boolean; newestTimestamp?: string }>(100, 60 * 1000, reloj);
  const configurations = new EvaluationCache<{ configuration: ENSConfigurationVersion; updatedAt?: string; key: string }>(4, 24 * 3600 * 1000, reloj);
  const tasks = new SharedTasks<StoredRow>();
  const reads = new Semaphore(maxConcurrentReads);
  const leer = { maxFacts: maxFactsPerRead };

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
      const body = await searchComplete(clients.asCurrentUser, buildMonitoringInventoryRequest(), 'el inventario de agentes');
      const leido = inventoryFromMonitoring(body?.aggregations, now.getTime());
      inventory = { agents: normalizeInventory(leido.agents), stale: leido.stale, newestTimestamp: leido.newestTimestamp };
      inventories.set(userKey, 'inventory', inventory);
    }
    const scope = resolveENSScopeAgents(inventory.agents, configuration.scope);
    if (query.agentId && !scope.some(agent => agent.id === query.agentId)) {
      throw new ENSBadRequestError(`La máquina ${query.agentId} no está en el alcance ENS.`);
    }
    const scopeKey = sha(scope.map(agent => [agent.id, agent.name, agent.groups]));

    const window = resolveEvaluationWindow(configuration.global.evaluationPeriod, now);
    const filters = buildViewFilters(window, scope);
    const probe = readProbeResponse(
      await searchComplete(clients.asCurrentUser, buildProbeRequest(filters, catalogControlIds(), query.timeZone), 'la sonda de hechos')
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

  // La huella de una fila: lo que, si cambia, cambia su resultado.
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

  // La de un control sin filas (lo evalúa el motor sobre todos sus hechos).
  const fallbackFingerprint = (ctx: ENSEvaluationContext, controlId: string): string =>
    sha(ctx.configurationKey, ctx.scopeKey, controlId, ctx.probe.controls[controlId] || null, ctx.probe.orphans, ctx.presenceEvents.map(e => e.agentId));

  // La huella de la vista: la que compara la sonda del navegador.
  const viewFingerprint = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): string => {
    const { forControl } = identitiesOf(ctx);
    return sha(
      ctx.configurationKey,
      ctx.scopeKey,
      query.agentId || '*',
      controlsOf(query).map(controlId => {
        const filas = forControl(controlId).map(agent => rowFingerprint(ctx, controlId, agent.agentId));
        return filas.length ? filas : fallbackFingerprint(ctx, controlId);
      })
    );
  };

  // --- 2. una fila -------------------------------------------------------------

  const readFacts = async (client: any, query: unknown, stats: ENSFactsReadStats, what: string, signal?: Cancellable): Promise<any[]> => {
    const hits: any[] = [];
    await readAllFacts(client, query, page => {
      for (const hit of page) hits.push(hit);
    }, stats, { ...leer, what, signal });
    return hits;
  };

  // Lee los hechos de un control en la máquina `factsAgent` (o en todo el
  // alcance, sin ella), los evalúa para la vista `viewAgent` y, si se pide,
  // también a fecha de cada día pasado de `cuts`. Suelta los hechos al
  // terminar.
  const computeRow = (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    controlId: string,
    factsAgent: string | undefined,
    viewAgent: string | undefined,
    cuts: { key: string; plan: ENSTimelineCutPlan[] } | undefined,
    signal: Cancellable
  ): Promise<StoredRow> =>
    reads.use(async () => {
      throwIfCancelled(signal);
      const started = Date.now();
      const stats = newReadStats();
      const que = `${controlId}${factsAgent ? ` en ${factsAgent}` : ''}`;
      let pruning: unknown;

      // La poda de los hechos de estado se calcula con los latidos de la
      // máquina, a fecha del instante más antiguo que se va a evaluar.
      if (factsAgent && hasStateFacts(controlId)) {
        const runs = await readFacts(clients.asCurrentUser, buildCollectorRunsQuery(ctx.filters, controlId, factsAgent), stats, `los latidos de ${que}`, signal);
        const at = cuts?.plan.length ? cuts.plan[0].cutoff : ctx.now;
        pruning = buildStateFactPruningClause(controlId, computeStateFactPruningCutoffs(controlId, normalizeWazuhAlerts(runs), at));
      }

      const hits = await readFacts(clients.asCurrentUser, buildFactsQuery(ctx.filters, controlId, factsAgent, pruning), stats, `los hechos de ${que}`, signal);
      const fetchMs = Date.now() - started;
      throwIfCancelled(signal);

      const evaluateStarted = Date.now();
      const sinteticos = factsAgent
        ? [
            ...(ctx.presenceOf.has(factsAgent) ? [ctx.presenceOf.get(factsAgent)!] : []),
            ...(ENS_CROSS_CONTROL_HEARTBEAT.includes(controlId) ? ctx.heartbeatsOf.get(factsAgent) || [] : []),
          ]
        : [
            ...ctx.presenceEvents,
            ...(ENS_CROSS_CONTROL_HEARTBEAT.includes(controlId) ? [...ctx.heartbeatsOf.values()].flat() : []),
          ];
      const events = [...normalizeWazuhAlerts(hits), ...sinteticos];
      hits.length = 0;
      const level = ctx.configuration.global.ensLevel;

      // Bloque síncrono: la configuración activa del motor es la de esta
      // petición mientras se evalúa (otra petición solo puede colarse en un
      // `await`, y aquí no hay ninguno). La resolución por máquina (Task 3)
      // lee de ahí.
      ensConfigurationRepository.replaceActive(ctx.configuration);
      const evalua = (lista: ENSNormalizedEvent[], instante: Date) =>
        factsAgent
          ? evaluateENSControlRow(controlId, level, lista, viewAgent as string, ctx.scope, instante)
          : evaluateENSControlPartition(controlId, level, lista, undefined, ctx.scope, instante).result;
      const result = evalua(events, ctx.now);

      const puntos: CutPoint[] = [];
      if (cuts?.plan.length) {
        const ascending = events
          .map(event => ({ event, time: Date.parse(event.timestamp) }))
          .filter(item => Number.isFinite(item.time) && item.time <= ctx.now.getTime())
          .sort((left, right) => left.time - right.time);
        let cursor = 0;
        for (const cut of cuts.plan) {
          const limite = cut.cutoff.getTime();
          while (cursor < ascending.length && ascending[cursor].time <= limite) cursor += 1;
          const enCorte = evalua(ascending.slice(0, cursor).map(item => item.event), cut.cutoff);
          puntos.push({ status: enCorte?.status || 'NO_EVALUABLE', score: enCorte?.score });
        }
      }

      const traceability = result?.traceability || [];
      return {
        result: result && withoutTraceability(result),
        traceability: traceability.slice(0, ENS_EVALUATION_LIMITS.traceabilityStored),
        traceabilityTotal: traceability.length,
        cuts: cuts ? { [cuts.key]: puntos } : {},
        configurationKey: ctx.configurationKey,
        scopeKey: ctx.scopeKey,
        stats: {
          controlId,
          agentId: factsAgent || '*',
          hits: stats.hits,
          pages: stats.pages,
          events: events.length - sinteticos.length,
          fetchMs,
          evaluateMs: Date.now() - evaluateStarted,
          pruned: Boolean(pruning),
        },
      };
    });

  // --- 3. lo guardado, lo que se recalcula y lo que se espera ---------------

  interface Obtained {
    row: StoredRow;
    storedAt: number;
    stale: boolean;
    computed: boolean;
  }

  // Una fila: guardada y vigente; guardada pero vieja (se enseña y se
  // recalcula detrás, si se permite y es de la misma configuración); o se
  // calcula ahora, compartiendo el cálculo con quien ya lo esté haciendo.
  const obtain = async (
    key: string,
    fingerprint: string,
    ctx: ENSEvaluationContext,
    needCuts: string | undefined,
    compute: (signal: Cancellable) => Promise<StoredRow>,
    options: ENSRunOptions,
    background: { started: number }
  ): Promise<Obtained> => {
    const entrada = rows.peek(key);
    const sirve = (e: CacheEntry<StoredRow>) => !needCuts || Boolean(e.value.cuts[needCuts]);
    if (entrada && rows.isFresh(entrada, fingerprint) && sirve(entrada)) {
      return { row: entrada.value, storedAt: entrada.storedAt, stale: false, computed: false };
    }
    const tarea = `${key}|${fingerprint}|${needCuts || ''}`;
    const guarda = (row: StoredRow) => {
      const previa = rows.peek(key);
      // Los días pasados ya calculados con la misma huella se conservan.
      const cuts = previa && previa.fingerprint === fingerprint ? { ...previa.value.cuts, ...row.cuts } : row.cuts;
      rows.set(key, fingerprint, { ...row, cuts });
      return row;
    };
    if (
      options.allowStale &&
      entrada &&
      sirve(entrada) &&
      entrada.value.configurationKey === ctx.configurationKey &&
      entrada.value.scopeKey === ctx.scopeKey
    ) {
      if (!tasks.has(tarea)) {
        background.started += 1;
        tasks
          .run(tarea, signal => compute(signal).then(guarda))
          .catch(error => logger.warn(`ENSFácil: no se pudo refrescar ${key}: ${error?.message || error}`));
      }
      return { row: entrada.value, storedAt: entrada.storedAt, stale: true, computed: false };
    }
    const row = await tasks.run(tarea, signal => compute(signal).then(guarda), options.signal || new CancelSignalNever());
    return { row, storedAt: clock().getTime(), stale: false, computed: true };
  };

  // --- 4. una vista ---------------------------------------------------------

  const timelinePlan = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): ENSTimelineCutPlan[] => {
    if (!query.timelineDays) return [];
    const propios = (agentes: string[]) => ctx.probe.presence.filter(p => agentes.includes(p.agentId));
    let primero: number | undefined;
    let cuantos = 0;
    if (query.controlId) {
      const hechos = ctx.probe.controls[query.controlId];
      if (query.agentId) {
        // La serie de una máquina empieza con su primer hecho del control (o
        // con el del manager, para un control de organización).
        const delAgente = [query.agentId, ENS_MANAGER_AGENT_ID].map(id => hechos?.agents[id]).filter(Boolean) as any[];
        primero = delAgente.length ? Math.min(...delAgente.map(h => Date.parse(h.oldest || h.newest))) : undefined;
        cuantos = delAgente.reduce((n, h) => n + h.count, 0);
      } else {
        primero = hechos?.oldest ? Date.parse(hechos.oldest) : undefined;
        cuantos = hechos?.count || 0;
      }
    } else if (query.agentId) {
      const lista = propios([query.agentId, ENS_MANAGER_AGENT_ID]);
      primero = lista.length ? Math.min(...lista.map(p => Date.parse(p.earliest))) : undefined;
      cuantos = lista.reduce((n, p) => n + (p.count || 0), 0);
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

  const viewFilters = (ctx: ENSEvaluationContext, agentId?: string) =>
    agentId ? buildViewFilters(ctx.window, ctx.scope, agentId) : ctx.filters;

  const dailyCounts = async (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, query: ENSEvaluationQuery, cuts: ENSTimelineCutPlan[]): Promise<number[]> => {
    const base = viewFilters(ctx, query.agentId);
    const filters = query.controlId ? [...base, buildENSControlFactsFilter(query.controlId)] : base;
    const body = await searchComplete(clients.asCurrentUser, buildDailyCountsRequest(filters, query.timeZone), 'los hechos por día');
    const dias = (body?.aggregations?.days?.buckets || []).map((b: any) => ({ at: Number(b.key), n: Number(b.doc_count || 0) }));
    return cuts.map(cut => dias.filter((d: any) => d.at <= cut.cutoff.getTime()).reduce((s: number, d: any) => s + d.n, 0));
  };

  const impactEvents = async (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, query: ENSEvaluationQuery, fingerprint: string) => {
    const clave = `i|${ctx.userKey}|${query.agentId || '*'}`;
    const guardado = impacts.get(clave, fingerprint);
    if (guardado) return guardado;
    // Los de la vista: la máquina y el manager, o todo el alcance.
    const body = await searchComplete(clients.asCurrentUser, buildImpactEventsRequest(viewFilters(ctx, query.agentId)), 'los eventos operativos');
    const modelo = buildImpactEventsModelFromCounts(
      Object.fromEntries((body?.aggregations?.types?.buckets || []).map((b: any) => [String(b.key), Number(b.doc_count || 0)]))
    );
    impacts.set(clave, fingerprint, modelo);
    return modelo;
  };

  const run = async (clients: ENSEvaluationClients, query: ENSEvaluationQuery, options: ENSRunOptions = {}) => {
    const started = Date.now();
    const ctx = await loadContext(clients, query);
    const controls = controlsOf(query);
    const plan = timelinePlan(ctx, query);
    const pastCuts = plan.filter(cut => !cut.isCurrent);
    const cutsKey = sha(query.timeZone, pastCuts.map(cut => cut.cutoff.toISOString()));
    const tKey = ['t', ctx.userKey, query.agentId || '*', query.controlId || '*', query.timelineDays, query.timeZone, startOfDayIn(ctx.now, query.timeZone).toISOString()].join('|');
    const tFingerprint = sha(ctx.configurationKey, ctx.scopeKey, cutsKey);
    const cachedTimeline = query.timelineDays ? timelines.get(tKey, tFingerprint) : undefined;
    const needCuts = Boolean(query.timelineDays) && !cachedTimeline && pastCuts.length > 0 ? cutsKey : undefined;
    const cutsArg = needCuts ? { key: cutsKey, plan: pastCuts } : undefined;
    const background = { started: 0 };
    const usados: Obtained[] = [];
    const level = ctx.configuration.global.ensLevel;
    const { all: identidades, forControl } = identitiesOf(ctx);
    const nombre = (agentId: string) => identidades.find(agent => agent.agentId === agentId)?.agentName;
    const sinIdentidades = identidades.length === 0;

    // Las filas de cada control (en paralelo hasta el límite de lecturas: las
    // que salen de la memoria no esperan).
    const filasDe = new Map<string, { agentId: string; agentName?: string; got: Obtained }[]>();
    const sinFilas = new Map<string, Obtained>();
    await Promise.all(
      controls.map(async controlId => {
        const agentes = sinIdentidades ? [] : forControl(controlId);
        // Sin filas, las máquinas declaradas fuera del alcance todavía dan la
        // vista consolidada (sin leer nada); solo si tampoco las hay, el motor
        // evalúa el control sobre todos sus hechos sin fila.
        if (!agentes.length && !sinIdentidades) {
          ensConfigurationRepository.replaceActive(ctx.configuration);
          if (consolidateENSControlRows(controlId, level, [], ctx.presenceEvents, ctx.scope, ctx.now)) {
            filasDe.set(controlId, []);
            return;
          }
        }
        if (!agentes.length) {
          const got = await obtain(
            `f|${ctx.userKey}|${controlId}`,
            fallbackFingerprint(ctx, controlId),
            ctx,
            needCuts,
            signal => computeRow(clients, ctx, controlId, undefined, undefined, cutsArg, signal),
            options,
            background
          );
          usados.push(got);
          sinFilas.set(controlId, got);
          filasDe.set(controlId, []);
          return;
        }
        const filas = await Promise.all(
          agentes.map(async agent => {
            const got = await obtain(
              `r|${ctx.userKey}|${controlId}|${agent.agentId}`,
              rowFingerprint(ctx, controlId, agent.agentId),
              ctx,
              needCuts,
              signal => computeRow(clients, ctx, controlId, agent.agentId, agent.agentId, cutsArg, signal),
              options,
              background
            );
            usados.push(got);
            return { agentId: agent.agentId, agentName: agent.agentName, got };
          })
        );
        filasDe.set(controlId, filas);
      })
    );

    // La vista de cada control.
    ensConfigurationRepository.replaceActive(ctx.configuration);
    const views = new Map<string, ENSViewPartition>();
    for (const controlId of controls) {
      const filas = filasDe.get(controlId) || [];
      const fallback = sinFilas.get(controlId);
      let view: ENSViewPartition | undefined;
      if (!query.agentId) {
        if (fallback) {
          view = {
            controlId,
            result: fallback.row.result,
            traceability: fallback.row.traceability,
            traceabilityTotal: fallback.row.traceabilityTotal,
            rows: [],
            cutsOf: key => fallback.row.cuts[key],
          };
        } else {
          const conTraza = filas
            .filter(f => f.got.row.result)
            .map(f => ({ agentId: f.agentId, agentName: f.agentName, result: { ...f.got.row.result!, traceability: f.got.row.traceability } }));
          const consolidado = consolidateENSControlRows(controlId, level, conTraza, ctx.presenceEvents, ctx.scope, ctx.now);
          const traza = consolidado?.traceability || [];
          const guardadas = conTraza.reduce((n, f) => n + f.result.traceability.length, 0);
          const totales = filas.reduce((n, f) => n + f.got.row.traceabilityTotal, 0);
          view = {
            controlId,
            result: consolidado && withoutTraceability(consolidado),
            traceability: traza.slice(0, ENS_EVALUATION_LIMITS.traceabilityStored),
            traceabilityTotal: traza.length - guardadas + totales,
            rows: conTraza.map(f => ({ agentId: f.agentId, result: withoutTraceability(f.result) })),
            cutsOf: key => {
              if (filas.some(f => !f.got.row.cuts[key])) return undefined;
              return pastCuts.map((cut, i) => {
                const enCorte = consolidateENSControlRows(
                  controlId,
                  level,
                  filas.map(f => ({ agentId: f.agentId, agentName: f.agentName, result: resultStatusStub(controlId, f.got.row.cuts[key][i].status, f.got.row.cuts[key][i].score) })),
                  ctx.presenceEvents,
                  ctx.scope,
                  cut.cutoff
                );
                return enCorte ? { status: enCorte.status, score: enCorte.score } : undefined;
              });
            },
          };
        }
      } else {
        const decision = deriveForAgent(controlId, query.agentId, filas.map(f => f.agentId), ctx.scope);
        let fila =
          decision?.from === 'row'
            ? filas.find(f => f.agentId === query.agentId)?.got.row
            : decision?.from === 'manager'
            ? filas.find(f => f.agentId === ENS_MANAGER_AGENT_ID)?.got.row
            : undefined;
        if (!decision) {
          // Un control de organización sin fila del manager: se evalúa la
          // vista con los hechos del manager, como el motor.
          const got = await obtain(
            `d|${ctx.userKey}|${controlId}|${query.agentId}`,
            rowFingerprint(ctx, controlId, ENS_MANAGER_AGENT_ID),
            ctx,
            needCuts,
            signal => computeRow(clients, ctx, controlId, ENS_MANAGER_AGENT_ID, query.agentId, cutsArg, signal),
            options,
            background
          );
          usados.push(got);
          fila = got.row;
          ensConfigurationRepository.replaceActive(ctx.configuration);
        }
        const propia = decision?.from === 'row' ? fila : undefined;
        view = {
          controlId,
          result: fila?.result,
          traceability: fila?.traceability || [],
          traceabilityTotal: fila?.traceabilityTotal || 0,
          rows: propia?.result ? [{ agentId: query.agentId, result: propia.result }] : [],
          cutsOf: key => (fila ? fila.cuts[key] : pastCuts.map(() => undefined)),
        };
      }
      views.set(controlId, view);
    }

    const parts: ENSControlPartition[] = controls.map(controlId => ({
      controlId,
      result: views.get(controlId)?.result,
      rows: views.get(controlId)?.rows || [],
    }));
    const state: ENSComplianceState | undefined = query.controlId
      ? undefined
      : assembleENSComplianceState(parts, query.agentId, ctx.scope, ctx.presenceEvents);

    // La serie: días pasados (guardados o recién calculados) + el presente.
    let timeline: any[] | undefined;
    if (query.timelineDays) {
      let pasados = cachedTimeline;
      if (!pasados) {
        const eventos = pastCuts.length ? await dailyCounts(clients, ctx, query, pastCuts) : [];
        ensConfigurationRepository.replaceActive(ctx.configuration);
        const porControl = controls.map(controlId => views.get(controlId)?.cutsOf(cutsKey));
        pasados = pastCuts.map((cut, index) => {
          const base = { date: cut.cutoff.toISOString(), label: cut.label, isCurrent: false, events: eventos[index] || 0 };
          const puntos = porControl.map(lista => lista?.[index]);
          if (query.controlId) {
            return { ...base, score: puntos[0]?.score, status: puntos[0]?.status || 'NO_EVALUABLE' };
          }
          // El número del panel en ese día: el mismo resumen del motor, sobre
          // los controles con resultado en la vista.
          const resultados = controls
            .map((controlId, i) => (puntos[i] ? resultStatusStub(controlId, puntos[i]!.status, puntos[i]!.score) : undefined))
            .filter((r): r is ENSComplianceResult => Boolean(r));
          return { ...base, score: buildComplianceState(resultados).controlSummary.scoreAverage };
        });
        if (!usados.some(u => u.stale)) timelines.set(tKey, tFingerprint, pasados);
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

    const refreshing = usados.some(u => u.stale);
    const fingerprint = viewFingerprint(ctx, query);
    const impact = query.include === 'dashboard' ? await impactEvents(clients, ctx, query, fingerprint) : undefined;
    const calculadas = usados.filter(u => u.computed);

    const meta = {
      // Con algo viejo a la vista, la huella no es la de los datos: la sonda
      // siguiente la verá distinta y el navegador volverá a pedir.
      fingerprint: refreshing ? `refreshing:${fingerprint}` : fingerprint,
      refreshing,
      // Cuándo se calculó lo que se enseña (lo más antiguo de ello).
      computedAt: new Date(usados.length ? Math.min(...usados.map(u => u.storedAt)) : ctx.now.getTime()).toISOString(),
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
        computed: calculadas.length,
        refreshingInBackground: background.started,
        hits: calculadas.reduce((n, u) => n + u.row.stats.hits, 0),
        rows: calculadas.map(u => u.row.stats),
      },
    };

    return { ctx, query, meta, state, views, timeline, impact, rowName: nombre };
  };

  return { loadContext, run, viewFingerprint, rows, timelines, tasks, reads };
};

// Una espera que nunca se cancela (llamadas internas y pruebas).
class CancelSignalNever implements Cancellable {
  readonly aborted = false;
  onAbort(): void {}
}

// Cuántos hechos ve la vista y el más reciente: los de la máquina (y del
// manager, que también lee) o los de todo el alcance; de un control, los suyos.
const factsOfView = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): { count: number; newest?: string } => {
  if (query.controlId) {
    const hechos = ctx.probe.controls[query.controlId];
    if (query.agentId) {
      const propios = [query.agentId, ENS_MANAGER_AGENT_ID].map(id => hechos?.agents[id]).filter(Boolean) as any[];
      return { count: propios.reduce((n, h) => n + h.count, 0), newest: propios.map(h => h.newest).filter(Boolean).sort().pop() };
    }
    return { count: hechos?.count || 0, newest: hechos?.newest };
  }
  if (query.agentId) {
    const propios = ctx.probe.presence.filter(p => p.agentId === query.agentId || p.agentId === ENS_MANAGER_AGENT_ID);
    return { count: propios.reduce((n, p) => n + (p.count || 0), 0), newest: propios.map(p => p.newest).filter(Boolean).sort().pop() };
  }
  return { count: ctx.probe.count, newest: ctx.probe.newest };
};

export type ENSEvaluationService = ReturnType<typeof createEvaluationService>;
