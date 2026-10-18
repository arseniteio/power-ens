// La evaluación en el servidor del plugin.
//
// El navegador no descarga hechos para juzgar: pide aquí el resultado. El
// servidor lee los hechos de la ventana ENTERA, como el usuario que mira, de UN
// control en UNA máquina a la vez, los juzga con el MISMO motor que usaba el
// navegador (`common/ens/core`) y los suelta al terminar.
//
//   1. Contexto: quién mira, la configuración activa, el alcance (inventario de
//      wazuh-monitoring) y una SONDA sin documentos: hechos por control y
//      máquina (cuántos y el más reciente), los que no nombran control, la
//      presencia de cada máquina y sus latidos (ver `queries.ts`).
//   2. Cada fila (un control en una máquina que lo mide): si su huella es la
//      misma y no tiene más de 60 minutos, la guardada; si cambió, la guardada
//      se enseña al instante (marcada) y se recalcula detrás; si no hay
//      ninguna, se calcula: latidos → poda de los hechos de estado → hechos de
//      esa máquina página a página → motor (de uno en uno) → se sueltan.
//      Hasta 4 lecturas a la vez; las filas baratas primero. La lista y el
//      panel responden con lo que ya está (`meta.pending`) y el resto sigue
//      detrás.
//   3. La vista de conjunto de cada control se consolida con la consolidación
//      del motor (`consolidateENSControlRows`); la de una máquina sale de sus
//      filas. El estado del panel se arma con `assembleENSComplianceState`.
//      Todo da lo mismo que el motor sobre todos los hechos a la vez.
//   4. La serie diaria: cuando la fila ya está, en segundo plano y detrás de
//      todo lo demás, se evalúa el final de cada día de la ventana y se guarda
//      en la fila; hasta entonces las vistas que la piden dicen
//      `meta.seriesPending`.
//
// La respuesta de cada vista está descrita en `server/README.md`.
import { createHash } from 'crypto';
import { deflateRawSync, inflateRawSync } from 'zlib';
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
  // Días de la serie (0 o nada: sin serie). El panel pide 7 y el detalle 30.
  timelineDays?: number;
  // Zona horaria de quien mira (IANA): decide qué es «un día» en la serie.
  timeZone: string;
  // Las cifras por control de cada punto de la serie (`overview-fields.ts`).
  timelineControls?: boolean;
}

export interface ENSEvaluationClients {
  asCurrentUser: any;
  asInternalUser: any;
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
  if (include && !['summary', 'results', 'dashboard', 'control', 'overview'].includes(include)) {
    throw new ENSBadRequestError(`Vista desconocida: «${include}».`);
  }
  if (include === 'overview' && controlId) {
    throw new ENSBadRequestError('La Vista general es de todos los controles: sin «controlId».');
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
  // Los filtros del alcance ENTERO: el servidor evalúa siempre todas las
  // máquinas; la vista de una sale de sus filas.
  filters: unknown[];
  probe: ENSProbeResult;
  // Dónde se leen los hechos: los índices de la ventana (o el comodín).
  factsIndex: string;
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

// Los días de la serie que tiene calculados una fila: para una zona horaria y
// un día de hoy (`key`), el punto de cada final de día (por su instante ISO).
interface StoredCuts {
  key: string;
  points: Record<string, CutPoint>;
  // Todos los días calculados (se van guardando a medida que salen).
  complete: boolean;
}

// Lo que se guarda de una fila (un control en una máquina). Sin hechos.
interface StoredRow {
  result?: ENSComplianceResult;
  // La trazabilidad guardada (las primeras entradas), comprimida: es casi
  // todo el tamaño de una fila y solo la leen la ficha y sus páginas.
  traceability: Buffer | null;
  traceabilityStored: number;
  traceabilityTotal: number;
  cuts?: StoredCuts;
  stats: ENSRowComputeStats;
  // Con qué configuración y alcance se calculó: una entrada de otra
  // configuración no se enseña ni mientras se recalcula.
  configurationKey: string;
  scopeKey: string;
  // El último intento de refrescarla en segundo plano que falló.
  refreshError?: { message: string; at: string };
  // Ya la sustituyó otra (hechos nuevos): su serie pendiente no se calcula.
  superseded?: boolean;
}

export interface ENSRowComputeStats {
  controlId: string;
  agentId: string;
  hits: number;
  pages: number;
  events: number;
  // Esperando su turno (plaza de lectura y motor).
  queueMs: number;
  // Leyendo: esperando al cliente del indexador (respuesta y análisis).
  fetchMs: number;
  // Normalizando los hechos leídos.
  normalizeMs: number;
  // El motor, a fecha de ahora.
  evaluateMs: number;
  // La serie (en segundo plano): leer, normalizar y evaluar cada día.
  seriesFetchMs?: number;
  seriesNormalizeMs?: number;
  cutsMs?: number;
  pruned: boolean;
}

const comprime = (lista: ENSTraceabilityResult[]): Buffer | null =>
  lista.length ? deflateRawSync(Buffer.from(JSON.stringify(lista), 'utf8')) : null;

export const descomprime = (datos: Buffer | null): ENSTraceabilityResult[] =>
  datos ? JSON.parse(inflateRawSync(datos).toString('utf8')) : [];

// Lo que ocupa una fila guardada (para el tope de la memoria).
// La serie se cuenta con su tamaño completo (90 días como mucho), aunque sus
// puntos vayan llegando después de guardar la fila.
export const storedRowBytes = (row: StoredRow): number =>
  JSON.stringify(row.result || null).length + (row.traceability?.length || 0) + ENS_EVALUATION_LIMITS.maxTimelineDays * 80 + 512;

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
  // Lecturas pesadas (un control en una máquina) a la vez. El motor, de una
  // en una siempre.
  maxConcurrentReads?: number;
  // Hechos en memoria a la vez por lectura (~1,7 KB de memoria por hecho).
  maxFactsPerRead?: number;
  // Tamaño de lo guardado de las filas.
  maxStoredBytes?: number;
  // Lo que espera la lista o el panel antes de responder con lo que ya está.
  firstResponseMs?: number;
}

export interface ENSRunOptions {
  // Responder con lo guardado aunque ya no valga, y recalcular detrás.
  allowStale?: boolean;
  // Quien espera la respuesta (se cancela si se va).
  signal?: Cancellable;
  // «Reintentar»: refrescar ya lo que no se pudo refrescar, sin esperar.
  retryRefresh?: boolean;
}

// La vista de un control para la petición: su resultado, su trazabilidad y
// sus filas (las del panel).
export interface ENSViewPartition {
  controlId: string;
  result?: ENSComplianceResult;
  traceability: () => ENSTraceabilityResult[];
  traceabilityStored: number;
  traceabilityTotal: number;
  rows: { agentId: string; result: ENSComplianceResult }[];
  // El punto de un día pasado, o `undefined` si aún no está calculado.
  pointAt: (cutoffIso: string, cutoff: Date) => CutPoint | null | undefined;
}

// La lista, la Vista general y el panel responden, como mucho a los 1,5 s de
// empezar a leer (unos 2 s con el contexto), con las filas que ya están; las
// demás siguen calculándose detrás (`meta.pending`).
export const FIRST_RESPONSE_MS = 1500;
// Las vistas que responden por partes.
const PROGRESSIVE: ENSEvaluationInclude[] = ['summary', 'overview', 'dashboard'];
// Un cálculo en frío que falló se dice en las peticiones siguientes durante
// este tiempo (sin volver a lanzarlo en cada sondeo del navegador).
const COLD_FAILURE_MS = 30 * 1000;

// Lo que tarda en reintentarse un refresco (o una serie) que falló: 30 s,
// 1 min, 2, 4… hasta 5 min.
const esperaTrasFallo = (fallos: number): number => Math.min(5 * 60 * 1000, 30 * 1000 * 2 ** Math.max(0, fallos - 1));

// Lo que se mide de cada control, acumulado (para `measure-evaluation.ts`).
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

// Una fila por calcular: control, máquina de los hechos y máquina de la vista.
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
  const reloj = () => clock().getTime();
  const rows = new EvaluationCache<StoredRow>(20000, EVALUATION_TTL_MS, reloj, maxStoredBytes, storedRowBytes);
  // Los días pasados de una serie no cambian en el día: hasta 26 h (la clave
  // lleva el día y la zona; solo zonas IANA válidas llegan aquí).
  const timelines = new EvaluationCache<any[]>(200, 26 * 3600 * 1000, reloj);
  const impacts = new EvaluationCache<ImpactEventsModel>(200, EVALUATION_TTL_MS, reloj);
  const inventories = new EvaluationCache<{ agents: ENSAgentScope[]; stale: boolean; newestTimestamp?: string }>(100, 60 * 1000, reloj);
  const configurations = new EvaluationCache<{ configuration: ENSConfigurationVersion; updatedAt?: string; key: string }>(4, 24 * 3600 * 1000, reloj);
  // Hasta 4 lecturas a la vez (el indexador va sobrado) y el motor de uno en
  // uno (es CPU del proceso del dashboard). Lo que alguien espera pasa delante
  // de lo que se hace en segundo plano (refrescos y series).
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

  // Cuánto cuesta calcular una fila (los hechos que dice la sonda): las
  // baratas primero.
  const weightOf = (ctx: ENSEvaluationContext, controlId: string, agentId?: string): number =>
    agentId ? ctx.probe.controls[controlId]?.agents[agentId]?.count || 0 : ctx.probe.controls[controlId]?.count || 0;

  // Los días de la serie que calcula cada fila: los de la ventana de la
  // configuración (30 en la de por defecto), en la zona de quien mira. Cubren
  // cualquier serie que pidan las pantallas (el panel 7, la ficha 30).
  const seriesOf = (ctx: ENSEvaluationContext) => {
    // Un día más que la ventana: su primer día suele ser parcial y la serie
    // de una vista empieza en el día de su primer hecho.
    const dias = Math.min(
      ENS_EVALUATION_LIMITS.maxTimelineDays,
      Math.max(1, Math.ceil((Date.parse(ctx.window.to) - Date.parse(ctx.window.from)) / 86400e3) + 1)
    );
    const plan = planENSTimelineCuts(Date.parse(ctx.window.from), 1, {
      now: ctx.now,
      days: dias,
      timeZone: ctx.timeZone,
      maxEvaluatedEvents: Infinity,
    }).filter(cut => !cut.isCurrent);
    return { key: sha(ctx.timeZone, startOfDayIn(ctx.now, ctx.timeZone).toISOString(), dias), plan };
  };

  // --- 2. una fila -------------------------------------------------------------

  const readFacts = async (ctx: ENSEvaluationContext, client: any, query: unknown, stats: ENSFactsReadStats, what: string, signal?: Cancellable): Promise<any[]> => {
    const hits: any[] = [];
    await readAllFacts(client, query, page => {
      for (const hit of page) hits.push(hit);
    }, stats, { maxFacts: maxFactsPerRead, what, signal, index: ctx.factsIndex });
    return hits;
  };

  // La poda exacta de los hechos de estado de una máquina a fecha de unos
  // instantes (ver `computeStateFactCutoffsByCollector`): ahora, para el
  // resultado; ahora y el final de cada día, para la serie.
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
    const que = `${controlId} en ${agentId}`;
    const runs = await readFacts(ctx, clients.asCurrentUser, buildCollectorRunsQuery(ctx.filters, controlId, agentId), stats, `los latidos de ${que}`, signal);
    const t0 = Date.now();
    const ultimos = readStateFactLastSeen(
      controlId,
      await searchComplete(clients.asCurrentUser, buildStateFactLastSeenRequest(ctx.filters, controlId, agentId, ctx.timeZone, ctx.factsIndex), `los últimos hechos de estado de ${que}`)
    );
    stats.searchMs += Date.now() - t0;
    return keepClauseFor(ctx, controlId, agentId, normalizeWazuhAlerts(runs), ultimos, instants);
  };

  // La cláusula de la poda exacta, con los latidos y el último hecho ya leídos.
  const keepClauseFor = (
    ctx: ENSEvaluationContext,
    controlId: string,
    agentId: string,
    runs: ENSNormalizedEvent[],
    ultimos: ENSStateFactLastSeen | undefined,
    instants: Date[]
  ): unknown | undefined => {
    if (!ultimos || !ultimos.collectors.length) return undefined;
    const cortes = computeStateFactCutoffsByCollector(controlId, runs, instants, ultimos.lastFactOf, ultimos.collectors);
    const inicio = Date.parse(ctx.window.from);
    const huecos = new Map([...cortes.entries()].map(([collector, porInstante]) => [collector, prunableRanges(inicio, instants.map(i => i.getTime()), porInstante)]));
    return buildStateFactKeepClause(controlId, agentId, huecos);
  };

  // Los hechos normalizados de una fila, con los sintéticos que el motor
  // leía de otros controles (presencia y latidos).
  const eventsOf = (ctx: ENSEvaluationContext, spec: RowSpec, hits: any[]): { events: ENSNormalizedEvent[]; synthetic: number } => {
    const { controlId, factsAgent } = spec;
    const sinteticos = factsAgent
      ? [
          ...(ctx.presenceOf.has(factsAgent) ? [ctx.presenceOf.get(factsAgent)!] : []),
          ...(ENS_CROSS_CONTROL_HEARTBEAT.includes(controlId) ? ctx.heartbeatsOf.get(factsAgent) || [] : []),
        ]
      : [
          ...ctx.presenceEvents,
          ...(ENS_CROSS_CONTROL_HEARTBEAT.includes(controlId) ? [...ctx.heartbeatsOf.values()].flat() : []),
        ];
    return { events: [...normalizeWazuhAlerts(hits), ...sinteticos], synthetic: sinteticos.length };
  };

  // El motor sobre unos hechos a fecha de un instante. Síncrono: la
  // configuración activa del motor es la de esta petición mientras se evalúa
  // (otra petición solo puede colarse en un `await`, y aquí no hay ninguno).
  const evaluatorOf = (ctx: ENSEvaluationContext, spec: RowSpec) => (lista: ENSNormalizedEvent[], instante: Date) => {
    ensConfigurationRepository.replaceActive(ctx.configuration);
    const level = ctx.configuration.global.ensLevel;
    return spec.factsAgent
      ? evaluateENSControlRow(spec.controlId, level, lista, spec.viewAgent as string, ctx.scope, instante)
      : evaluateENSControlPartition(spec.controlId, level, lista, undefined, ctx.scope, instante).result;
  };

  // Normaliza y evalúa los hechos de una fila a fecha de ahora: un turno del
  // motor (de uno en uno). Suelta los hechos leídos.
  const evaluateRow = (
    ctx: ENSEvaluationContext,
    spec: RowSpec,
    hits: any[],
    read: { searchMs: number; hits: number; pages: number },
    o: { queueMs: number; pruned: boolean; background: boolean; previous?: StoredRow; signal: Cancellable }
  ): Promise<StoredRow> => {
    const leido = Date.now();
    return cpu.use(async () => {
      const enMotor = Date.now();
      throwIfCancelled(o.signal);
      const { controlId, factsAgent } = spec;
      const { events, synthetic } = eventsOf(ctx, spec, hits);
      hits.length = 0;
      const normalizado = Date.now();
      const result = evaluatorOf(ctx, spec)(events, ctx.now);
      const traceability = result?.traceability || [];
      const guardadas = traceability.slice(0, ENS_EVALUATION_LIMITS.traceabilityStored);
      const serie = seriesOf(ctx);
      // Los días pasados ya calculados hoy (en esta zona, con esta
      // configuración y este alcance) siguen valiendo: los hechos nuevos que
      // obligan a recalcular la fila son de ahora.
      const previa = o.previous;
      const pasados =
        previa &&
        previa.configurationKey === ctx.configurationKey &&
        previa.scopeKey === ctx.scopeKey &&
        previa.cuts?.key === serie.key &&
        previa.cuts.complete
          ? previa.cuts
          : undefined;
      const row: StoredRow = {
        result: result && withoutTraceability(result),
        traceability: comprime(guardadas),
        traceabilityStored: guardadas.length,
        traceabilityTotal: traceability.length,
        cuts: pasados,
        configurationKey: ctx.configurationKey,
        scopeKey: ctx.scopeKey,
        stats: {
          controlId,
          agentId: factsAgent || '*',
          hits: read.hits,
          pages: read.pages,
          events: events.length - synthetic,
          queueMs: o.queueMs + (enMotor - leido),
          fetchMs: read.searchMs,
          normalizeMs: normalizado - enMotor,
          evaluateMs: Date.now() - normalizado,
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
      // Cede el hilo antes de la fila siguiente.
      await yieldToEventLoop();
      return row;
    }, { background: o.background });
  };

  // UNA FILA LEÍDA SOLA: op.acc.3 (lee tipos de otros controles), un control
  // sin filas (todo el alcance) y la vista de una máquina de un control de
  // organización sin fila del manager. La plaza de lectura se conserva hasta
  // que el motor termina: no hay más de `maxConcurrentReads` lecturas en memoria.
  const computeRow = (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    spec: RowSpec,
    signal: Cancellable,
    options: { background: boolean; previous?: StoredRow }
  ): Promise<StoredRow> => {
    const pedida = Date.now();
    return reads.use(async () => {
      const enLectura = Date.now();
      throwIfCancelled(signal);
      const stats = newReadStats();
      const que = `${spec.controlId}${spec.factsAgent ? ` en ${spec.factsAgent}` : ''}`;
      const pruning = spec.factsAgent ? await pruningFor(clients, ctx, spec.controlId, spec.factsAgent, [ctx.now], stats, signal) : undefined;
      const hits = await readFacts(ctx, clients.asCurrentUser, buildFactsQuery(ctx.filters, spec.controlId, spec.factsAgent, pruning), stats, `los hechos de ${que}`, signal);
      return evaluateRow(ctx, spec, hits, { searchMs: stats.searchMs, hits: stats.hits, pages: stats.pages }, {
        queueMs: enLectura - pedida,
        pruned: Boolean(pruning),
        background: options.background,
        previous: options.previous,
        signal,
      });
    }, { background: options.background });
  };

  // --- 3. un flujo por máquina ---------------------------------------------------
  //
  // Las demás filas de una máquina se leen juntas: un flujo ordenado por
  // control (o varios, por grupos de controles, si la máquina tiene muchos
  // hechos) y, una vez por máquina, lo que el flujo no lleva (los hechos sin
  // `data.ensfacil` o con un campo de control antiguo), sus latidos y el
  // último hecho de estado de cada control (para la poda). Cada control se
  // evalúa en cuanto termina su tramo, con sus hechos en el MISMO orden que
  // leyéndolo solo (`mergeFactsInOrder`).

  // Los hechos que caben, más o menos, en un grupo de controles de una máquina.
  const CHUNK_FACTS = 20000;
  // Las hojas de la poda de todo un flujo (la consulta entera, por debajo de
  // las 1024 cláusulas de OpenSearch).
  const STREAM_PRUNING_MAX_LEAVES = 600;
  const STATE_CONTROLS = catalogControlIds().filter(hasStateFacts);

  class StreamFallbackError extends Error {}

  // Un rechazo del indexador (4xx de su cliente, con `meta.statusCode`) a la
  // lectura por máquina: sus filas se leen una a una, con el orden de siempre.
  // Los errores propios (datos incompletos, demasiados hechos, cancelada) no
  // traen `meta` y siguen su camino.
  const rechazoDelIndexador = (error: any): boolean => {
    const estado = Number(error?.meta?.statusCode);
    return estado >= 400 && estado < 500 && estado !== 499;
  };

  interface AgentSide {
    runs: ENSNormalizedEvent[];
    lastSeen: Map<string, ENSStateFactLastSeen>;
    sideFor: (controlId: string) => any[];
  }
  // Lo de aparte de cada máquina se comparte entre los grupos de controles y
  // entre las peticiones que calculan a la vez con la misma ventana; se
  // olvida a los 5 minutos de leerlo.
  const sides = new Map<string, Promise<AgentSide>>();

  const sideOf = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, agentId: string, signal: Cancellable): Promise<AgentSide> => {
    const clave = [ctx.userKey, agentId, ctx.configurationKey, ctx.scopeKey, ctx.window.from, ctx.window.to, ctx.timeZone, ctx.factsIndex].join('|');
    const guardado = sides.get(clave);
    if (guardado) return guardado;
    const promesa = (async () => {
      const stats = newReadStats();
      const t0 = Date.now();
      const [runsHits, sideHits, ultimos] = await Promise.all([
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
      const lastSeen = readAgentStateFactLastSeen(STATE_CONTROLS, ultimos);
      return { runs, lastSeen, sideFor: (controlId: string) => sideHits.filter(hit => sideFactBelongsTo(hit, controlId)) };
    })();
    // (Una primera carga lenta puede durar más de un minuto: se guarda 5.)
    const olvida = () => {
      const t = setTimeout(() => {
        if (sides.get(clave) === promesa) sides.delete(clave);
      }, 5 * 60 * 1000);
      (t as any).unref?.();
    };
    promesa.then(olvida, () => sides.delete(clave));
    sides.set(clave, promesa);
    return promesa;
  };

  const hojasDe = (q: any): number =>
    Array.isArray(q)
      ? q.reduce((n, x) => n + hojasDe(x), 0)
      : q && typeof q === 'object'
      ? q.bool
        ? ['filter', 'must', 'should', 'must_not'].reduce((n, k) => n + (q.bool[k] ? hojasDe([].concat(q.bool[k])) : 0), 0)
        : 1
      : 0;

  // Lee un grupo de controles de una máquina y, tramo a tramo, calcula su
  // resultado de ahora (`current`) o su serie (`series`).
  const runStreamChunk = (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    agentId: string,
    needs: RowNeed[],
    mode: 'current' | 'series',
    job: Job
  ): Promise<void> => {
    const pedida = Date.now();
    const porControl = new Map(needs.map(need => [need.spec.controlId, need]));
    const controles = [...porControl.keys()];
    const serie = seriesOf(ctx);
    const instantes = mode === 'series' ? [...serie.plan.map(cut => cut.cutoff), ctx.now] : [ctx.now];
    const signal = job.signal;
    return reads.use(async () => {
      const queueMs = Date.now() - pedida;
      throwIfCancelled(signal);
      const lado = await sideOf(clients, ctx, agentId, signal);
      // La poda de cada control con hechos de estado, mientras quepa.
      let hojas = 0;
      const podas: unknown[] = [];
      const podados = new Set<string>();
      for (const controlId of controles) {
        if (!hasStateFacts(controlId)) continue;
        const clausula = keepClauseFor(ctx, controlId, agentId, lado.runs, lado.lastSeen.get(controlId), instantes);
        if (!clausula) continue;
        const n = hojasDe(clausula);
        if (hojas + n > STREAM_PRUNING_MAX_LEAVES) continue;
        hojas += n;
        podas.push(clausula);
        podados.add(controlId);
      }
      const stats = newReadStats();
      const vistos = new Set<string>();
      let tramo: { controlId: string; hits: any[]; desde: number; paginas: number } | undefined;
      const cierra = async (controlId: string, hits: any[], searchMs: number, pages: number) => {
        vistos.add(controlId);
        const need = porControl.get(controlId);
        if (!need) return;
        const entrada = mergeFactsInOrder(hits, lado.sideFor(controlId));
        if (mode === 'current') {
          const row = await evaluateRow(ctx, need.spec, entrada, { searchMs, hits: entrada.length, pages }, {
            queueMs,
            pruned: podados.has(controlId),
            background: job.background,
            previous: rows.peek(need.key)?.value,
            signal,
          });
          job.resolveRow(need, row);
        } else {
          await seriesForRow(ctx, need, entrada, searchMs);
        }
      };
      try {
        await readAllFacts(
          clients.asCurrentUser,
          buildAgentStreamQuery(ctx.filters, agentId, controles, podas),
          async page => {
            for (const hit of page) {
              const valor = hit?._source?.data?.ensfacil;
              // Un hecho con varios controles en `data.ensfacil`: el flujo no
              // sabe repartirlo como la lectura por fila; se leen solas.
              if (Array.isArray(valor)) throw new StreamFallbackError();
              const controlId = String(valor);
              if (!tramo || tramo.controlId !== controlId) {
                if (tramo) {
                  const anterior = tramo;
                  tramo = undefined;
                  await cierra(anterior.controlId, anterior.hits, stats.searchMs - anterior.desde, stats.pages - anterior.paginas + 1);
                }
                tramo = { controlId, hits: [], desde: stats.searchMs, paginas: stats.pages };
              }
              tramo.hits.push(hit);
              if (tramo.hits.length > maxFactsPerRead) throw new ENSTooManyFactsError(`${controlId} en ${agentId}`, maxFactsPerRead);
            }
          },
          stats,
          { what: `los hechos de ${agentId}`, signal, index: ctx.factsIndex, sort: STREAM_SORT, idIndex: 2, maxFacts: Number.MAX_SAFE_INTEGER }
        );
      } catch (error: any) {
        if (!rechazoDelIndexador(error)) throw error;
        logger.warn(`ENSFácil: el indexador rechazó la lectura de los hechos de ${agentId} (${error?.message}); se leen sus filas una a una.`);
        throw new StreamFallbackError(error?.message);
      }
      if (tramo) await cierra(tramo.controlId, tramo.hits, stats.searchMs - tramo.desde, stats.pages - tramo.paginas + 1);
      // Los controles sin ningún hecho propio en la ventana: con lo de aparte.
      for (const controlId of controles) if (!vistos.has(controlId)) await cierra(controlId, [], 0, 0);
    }, { background: job.background });
  };

  // --- 4. los trabajos: quién calcula qué, y quién lo espera -------------------

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
  // Las filas que se están calculando (por fila y huella): quien llega se une.
  const inflight = new Map<string, PendingRow>();
  // Trabajos de primer plano en curso (la serie no empieza mientras haya).
  let foregroundJobs = 0;

  const streamable = (need: RowNeed) =>
    Boolean(need.spec.factsAgent) &&
    need.spec.factsAgent === need.spec.viewAgent &&
    need.key.startsWith('r|') &&
    !(need.spec.controlId in ENS_CROSS_CONTROL_EVENT_TYPES);

  // Agrupa las filas. Un control solo se puede enseñar cuando están TODAS sus
  // filas (una por máquina): por eso se reparten en FRANJAS de controles, de
  // los baratos a los caros según la sonda, y cada franja en un flujo por
  // máquina (de hasta `CHUNK_FACTS` hechos en la máquina que más tenga). Las
  // franjas se calculan en orden: los controles baratos están enseguida en
  // todas las máquinas. Las filas que se leen solas, en su franja por peso.
  const planGroups = (needs: RowNeed[]) => {
    const grupos: { agentId?: string; needs: RowNeed[]; weight: number; band: number }[] = [];
    const porControl = new Map<string, RowNeed[]>();
    for (const need of needs) {
      const lista = porControl.get(need.spec.controlId) || [];
      lista.push(need);
      porControl.set(need.spec.controlId, lista);
    }
    const controles = [...porControl.entries()]
      .map(([controlId, lista]) => ({ controlId, lista, peso: lista.reduce((n, need) => n + need.weight, 0) }))
      .sort((a, b) => a.peso - b.peso);
    let franja = 0;
    let porMaquina = new Map<string, number>();
    const enFranja: RowNeed[][] = [[]];
    for (const control of controles) {
      const suma = new Map(porMaquina);
      for (const need of control.lista) {
        if (streamable(need)) suma.set(need.spec.factsAgent as string, (suma.get(need.spec.factsAgent as string) || 0) + need.weight);
      }
      const desborda = [...suma.values()].some(n => n > CHUNK_FACTS);
      if (desborda && enFranja[franja].length) {
        franja += 1;
        enFranja[franja] = [];
        porMaquina = new Map();
        for (const need of control.lista) {
          if (streamable(need)) porMaquina.set(need.spec.factsAgent as string, (porMaquina.get(need.spec.factsAgent as string) || 0) + need.weight);
        }
      } else {
        porMaquina = suma;
      }
      enFranja[franja].push(...control.lista);
    }
    enFranja.forEach((lista, band) => {
      const deMaquina = new Map<string, RowNeed[]>();
      for (const need of lista) {
        if (streamable(need)) {
          const agente = need.spec.factsAgent as string;
          deMaquina.set(agente, [...(deMaquina.get(agente) || []), need]);
        } else {
          grupos.push({ needs: [need], weight: need.weight, band });
        }
      }
      for (const [agentId, propias] of deMaquina) {
        grupos.push({ agentId, needs: propias, weight: propias.reduce((n, need) => n + need.weight, 0), band });
      }
    });
    return grupos.sort((a, b) => a.band - b.band || a.weight - b.weight);
  };

  // Calcula (o se une al cálculo de) unas filas. Devuelve la promesa de cada
  // una. `pinned`: sigue aunque se vaya quien lo pidió (respuesta por partes y
  // refrescos); si no, se cancela cuando no queda nadie esperando.
  const ensureRows = (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    needs: RowNeed[],
    o: { background: boolean; pinned: boolean; signal?: Cancellable; onStored?: (need: RowNeed, row: StoredRow) => void; onFailed?: (need: RowNeed, error: unknown) => void }
  ): Map<string, Promise<StoredRow>> => {
    const salida = new Map<string, Promise<StoredRow>>();
    const nuevas: RowNeed[] = [];
    const espera = (job: Job) => {
      if (o.pinned) {
        job.pinned = true;
        return;
      }
      job.waiters += 1;
      let suelto = false;
      const suelta = () => {
        if (suelto) return;
        suelto = true;
        job.waiters -= 1;
        if (job.waiters <= 0 && !job.pinned) job.signal.cancel();
      };
      o.signal?.onAbort(suelta);
    };
    const vistos = new Set<Job>();
    for (const need of needs) {
      const enCurso = inflight.get(`${need.key}|${need.fingerprint}`);
      if (enCurso && !enCurso.job.signal.aborted) {
        if (!vistos.has(enCurso.job)) {
          vistos.add(enCurso.job);
          espera(enCurso.job);
        }
        salida.set(need.key, enCurso.promise);
      } else {
        nuevas.push(need);
      }
    }
    for (const grupo of planGroups(nuevas)) {
      const pendientes = new Map<string, PendingRow>();
      const job: Job = {
        background: o.background,
        pinned: false,
        waiters: 0,
        signal: new CancelSignal(),
        resolveRow: (need, row) => {
          const p = pendientes.get(need.key);
          if (!p) return;
          pendientes.delete(need.key);
          inflight.delete(`${need.key}|${need.fingerprint}`);
          storeRow(clients, ctx, need, row);
          o.onStored?.(need, row);
          p.resolve(row);
        },
      };
      const falla = (need: RowNeed, error: unknown) => {
        const p = pendientes.get(need.key);
        if (!p) return;
        pendientes.delete(need.key);
        inflight.delete(`${need.key}|${need.fingerprint}`);
        o.onFailed?.(need, error);
        p.reject(error);
      };
      for (const need of grupo.needs) {
        let resolve!: (row: StoredRow) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<StoredRow>((ok, ko) => {
          resolve = ok;
          reject = ko;
        });
        // Nadie tiene por qué esperarla (un refresco): sin rechazo suelto.
        promise.catch(() => undefined);
        const pendiente = { promise, resolve, reject, job };
        pendientes.set(need.key, pendiente);
        inflight.set(`${need.key}|${need.fingerprint}`, pendiente);
        salida.set(need.key, promise);
      }
      espera(job);
      if (!o.background) foregroundJobs += 1;
      const trabajo = async () => {
        try {
          if (grupo.agentId) {
            await runStreamChunk(clients, ctx, grupo.agentId, grupo.needs, 'current', job);
          } else {
            for (const need of grupo.needs) {
              const row = await computeRow(clients, ctx, need.spec, job.signal, { background: o.background, previous: rows.peek(need.key)?.value });
              job.resolveRow(need, row);
            }
          }
        } catch (error) {
          if (error instanceof StreamFallbackError) {
            for (const need of grupo.needs.filter(n => pendientes.has(n.key))) {
              try {
                job.resolveRow(need, await computeRow(clients, ctx, need.spec, job.signal, { background: o.background, previous: rows.peek(need.key)?.value }));
              } catch (otro) {
                falla(need, otro);
              }
            }
          } else {
            for (const need of grupo.needs) falla(need, error);
          }
        } finally {
          for (const need of grupo.needs) falla(need, new Error('La fila no se calculó.'));
          if (!o.background) {
            foregroundJobs -= 1;
            if (!foregroundJobs) kickSeries();
          }
        }
      };
      void trabajo();
    }
    return salida;
  };

  // Guarda una fila recién calculada y pone su serie en la cola.
  const storeRow = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, need: RowNeed, row: StoredRow) => {
    refreshFailures.delete(need.key);
    coldFailures.delete(need.key);
    const anterior = rows.peek(need.key);
    if (anterior && anterior.value !== row) anterior.value.superseded = true;
    rows.set(need.key, need.fingerprint, row);
    wantSeries(clients, ctx, need);
  };

  // --- 5. la serie, en segundo plano -------------------------------------------
  //
  // Cuando no queda nada de primer plano en curso, de grupo en grupo (los
  // baratos primero): se leen los hechos con la poda exacta para ahora y el
  // final de cada día y se evalúa cada día (del más reciente al más antiguo,
  // cada uno en su turno del motor, detrás de lo que alguien espere). Los
  // puntos se guardan en la fila según salen; las vistas los reutilizan sin
  // volver a leer.

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

  const seriesVigente = (need: RowNeed) => {
    const entrada = rows.peek(need.key);
    return entrada && entrada.fingerprint === need.fingerprint && !entrada.value.superseded ? entrada.value : undefined;
  };

  const wantSeries = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, need: RowNeed) => {
    const serieKey = seriesOf(ctx).key;
    const fila = seriesVigente(need);
    if (!fila || (fila.cuts && fila.cuts.key === serieKey)) return;
    const clave = `${need.key}|${serieKey}`;
    if (!seriesWanted.has(clave)) seriesWanted.set(clave, { clients, ctx, need, serieKey });
    kickSeries();
  };

  // La serie empieza un poco después de que termine el primer plano: una
  // petición que llega justo detrás (el panel tras la lista) va antes.
  const SERIES_IDLE_MS = 200;
  function kickSeries() {
    if (seriesBusy || seriesTimer) return;
    if (foregroundJobs > 0) return; // vuelve a probar al terminar el primer plano
    seriesTimer = setTimeout(() => {
      seriesTimer = undefined;
      void nextSeries();
    }, SERIES_IDLE_MS);
  }

  const nextSeries = async () => {
    if (seriesBusy || foregroundJobs > 0) return;
    const ahora = clock().getTime();
    const listos = [...seriesWanted.entries()].filter(([clave, w]) => {
      const fila = seriesVigente(w.need);
      if (!fila || (fila.cuts && fila.cuts.key === w.serieKey)) {
        seriesWanted.delete(clave);
        return false;
      }
      const fallo = seriesFailures.get(w.need.key);
      return !(fallo && fallo.nextAt > ahora);
    });
    if (!listos.length) {
      // Las que esperan tras un fallo: se vuelve a mirar cuando toque.
      if (seriesWanted.size && !seriesTimer) {
        const proxima = Math.min(...[...seriesWanted.values()].map(w => seriesFailures.get(w.need.key)?.nextAt || ahora));
        seriesTimer = setTimeout(() => {
          seriesTimer = undefined;
          void nextSeries();
        }, Math.max(1000, proxima - ahora));
        (seriesTimer as any).unref?.();
      }
      return;
    }
    // El grupo más barato: las filas de flujo de una máquina (con el mismo
    // contexto) o una fila suelta.
    const [, primero] = listos.sort((a, b) => a[1].need.weight - b[1].need.weight)[0];
    const grupo = streamable(primero.need)
      ? listos.filter(([, w]) => w.ctx === primero.ctx && streamable(w.need) && w.need.spec.factsAgent === primero.need.spec.factsAgent)
      : listos.filter(([, w]) => w === primero);
    let peso = 0;
    const elegidos = grupo.filter(([, w]) => {
      if (peso && peso + w.need.weight > CHUNK_FACTS) return false;
      peso += w.need.weight;
      return true;
    });
    for (const [clave] of elegidos) seriesWanted.delete(clave);
    seriesBusy = true;
    const job: Job = { background: true, pinned: true, waiters: 0, signal: new CancelSignal(), resolveRow: () => undefined };
    try {
      if (streamable(primero.need)) {
        try {
          await runStreamChunk(primero.clients, primero.ctx, primero.need.spec.factsAgent as string, elegidos.map(([, w]) => w.need), 'series', job);
        } catch (error) {
          if (!(error instanceof StreamFallbackError)) throw error;
          // Como la carga: las filas que el flujo no pudo, una a una.
          for (const [, w] of elegidos) await computeSeriesSingle(w.clients, w.ctx, w.need);
        }
      } else {
        await computeSeriesSingle(primero.clients, primero.ctx, primero.need);
      }
      for (const [, w] of elegidos) seriesFailures.delete(w.need.key);
    } catch (error: any) {
      for (const [clave, w] of elegidos) {
        const previo = seriesFailures.get(w.need.key);
        const failures = (previo?.failures || 0) + 1;
        seriesFailures.set(w.need.key, { failures, nextAt: clock().getTime() + esperaTrasFallo(failures) });
        seriesWanted.set(clave, w);
      }
      logger.warn(`ENSFácil: no se pudo calcular la serie (${elegidos.length} filas): ${error?.message || error}`);
    } finally {
      seriesBusy = false;
      kickSeries();
    }
  };

  // La serie de una fila con sus hechos (ya leídos con la poda de la serie).
  const seriesForRow = async (ctx: ENSEvaluationContext, need: RowNeed, hits: any[], searchMs: number) => {
    const serie = seriesOf(ctx);
    const fila = seriesVigente(need);
    if (!fila || (fila.cuts && fila.cuts.key === serie.key)) return;
    const cuts: StoredCuts = { key: serie.key, points: {}, complete: false };
    fila.cuts = cuts;
    try {
      const { ascending, normalizeMs, n } = await cpu.use(async () => {
        const t0 = Date.now();
        const total = hits.length;
        const { events } = eventsOf(ctx, need.spec, hits);
        hits.length = 0;
        const orden = events
          .map(event => ({ event, time: Date.parse(event.timestamp) }))
          .filter(item => Number.isFinite(item.time) && item.time <= ctx.now.getTime())
          .sort((left, right) => left.time - right.time);
        return { ascending: orden, normalizeMs: Date.now() - t0, n: total };
      }, { background: true });
      const hasta = (limite: number) => {
        let lo = 0;
        let hi = ascending.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (ascending[mid].time <= limite) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      };
      const evalua = evaluatorOf(ctx, need.spec);
      let evaluateMs = 0;
      for (const cut of [...serie.plan].sort((a, b) => b.cutoff.getTime() - a.cutoff.getTime())) {
        // Una fila sustituida por otra más nueva no termina su serie.
        if (!seriesVigente(need)) {
          if (fila.cuts === cuts) fila.cuts = undefined;
          return;
        }
        // Cada día, un turno del motor: lo que alguien espera pasa delante.
        await cpu.use(async () => {
          await yieldToEventLoop();
          const t0 = Date.now();
          const enCorte = evalua(ascending.slice(0, hasta(cut.cutoff.getTime())).map(item => item.event), cut.cutoff);
          cuts.points[cut.cutoff.toISOString()] = { status: enCorte?.status || 'NO_EVALUABLE', score: enCorte?.score };
          evaluateMs += Date.now() - t0;
        }, { background: true });
      }
      cuts.complete = true;
      fila.stats.cutsMs = evaluateMs;
      fila.stats.seriesFetchMs = searchMs;
      fila.stats.seriesNormalizeMs = normalizeMs;
      const m = metricsOf(need.spec.controlId);
      m.seriesRows += 1;
      m.seriesHits += n;
      m.seriesFetchMs += searchMs;
      m.seriesNormalizeMs += normalizeMs;
      m.seriesEvaluateMs += evaluateMs;
    } catch (error) {
      if (fila.cuts === cuts) fila.cuts = undefined;
      throw error;
    }
  };

  // La serie de una fila leída sola.
  const computeSeriesSingle = async (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, need: RowNeed) => {
    const serie = seriesOf(ctx);
    const fila = seriesVigente(need);
    if (!fila || (fila.cuts && fila.cuts.key === serie.key)) return;
    const stats = newReadStats();
    const instantes = [...serie.plan.map(cut => cut.cutoff), ctx.now];
    const que = `${need.spec.controlId}${need.spec.factsAgent ? ` en ${need.spec.factsAgent}` : ''}`;
    const signal = new CancelSignal();
    const hits = await reads.use(async () => {
      const pruning = need.spec.factsAgent ? await pruningFor(clients, ctx, need.spec.controlId, need.spec.factsAgent, instantes, stats, signal) : undefined;
      return readFacts(ctx, clients.asCurrentUser, buildFactsQuery(ctx.filters, need.spec.controlId, need.spec.factsAgent, pruning), stats, `la serie de ${que}`, signal);
    }, { background: true });
    await seriesForRow(ctx, need, hits, stats.searchMs);
  };

  // --- 6. una vista ---------------------------------------------------------

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
    const body = await searchComplete(clients.asCurrentUser, { ...buildDailyCountsRequest(filters, query.timeZone), index: ctx.factsIndex }, 'los hechos por día');
    const dias = (body?.aggregations?.days?.buckets || []).map((b: any) => ({ at: Number(b.key), n: Number(b.doc_count || 0) }));
    return cuts.map(cut => dias.filter((d: any) => d.at <= cut.cutoff.getTime()).reduce((s: number, d: any) => s + d.n, 0));
  };

  const impactEvents = async (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, query: ENSEvaluationQuery, fingerprint: string) => {
    const clave = `i|${ctx.userKey}|${query.agentId || '*'}`;
    const guardado = impacts.get(clave, fingerprint);
    if (guardado) return guardado;
    // Los de la vista: la máquina y el manager, o todo el alcance.
    const body = await searchComplete(clients.asCurrentUser, { ...buildImpactEventsRequest(viewFilters(ctx, query.agentId)), index: ctx.factsIndex }, 'los eventos operativos');
    const modelo = buildImpactEventsModelFromCounts(
      Object.fromEntries((body?.aggregations?.types?.buckets || []).map((b: any) => [String(b.key), Number(b.doc_count || 0)]))
    );
    impacts.set(clave, fingerprint, modelo);
    return modelo;
  };

  interface UsedRow {
    key: string;
    need: RowNeed;
    row: StoredRow;
    storedAt: number;
    stale: boolean;
    computed: boolean;
  }

  // Refresca detrás las filas guardadas que ya no valen (lo que se enseña es
  // lo guardado). Un intento nuevo borra el error del anterior; si falla, se
  // anota con su hora y el siguiente espera cada vez más.
  const refreshStale = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, stale: RowNeed[], options: ENSRunOptions): number => {
    const ahora = clock().getTime();
    const toca = stale.filter(need => {
      if (inflight.has(`${need.key}|${need.fingerprint}`)) return false;
      const fallo = refreshFailures.get(need.key);
      return !(fallo && fallo.nextAt > ahora && !options.retryRefresh);
    });
    for (const need of toca) {
      const entrada = rows.peek(need.key);
      if (entrada) entrada.value.refreshError = undefined;
    }
    if (toca.length) {
      ensureRows(clients, ctx, toca, {
        background: true,
        pinned: true,
        onFailed: (need, error: any) => {
          if (error?.statusCode === 499) return;
          const previo = refreshFailures.get(need.key);
          const failures = (previo?.failures || 0) + 1;
          refreshFailures.set(need.key, { failures, nextAt: clock().getTime() + esperaTrasFallo(failures) });
          const actual = rows.peek(need.key);
          if (actual) actual.value.refreshError = { message: String(error?.message || error), at: clock().toISOString() };
          logger.warn(`ENSFácil: no se pudo refrescar ${need.key}: ${error?.message || error}`);
        },
      });
    }
    // Los fallos de filas que ya no están guardadas no se conservan.
    if (refreshFailures.size > rows.size + 100) {
      for (const clave of [...refreshFailures.keys()]) if (!rows.peek(clave)) refreshFailures.delete(clave);
    }
    return toca.length;
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
    const serie = seriesOf(ctx);
    const progressive = PROGRESSIVE.includes(query.include);
    const level = ctx.configuration.global.ensLevel;
    const { all: identidades, forControl } = identitiesOf(ctx);
    const nombre = (agentId: string) => identidades.find(agent => agent.agentId === agentId)?.agentName;
    const sinIdentidades = identidades.length === 0;

    // 1. Las filas de cada control.
    const filasDe = new Map<string, { agentId: string; agentName?: string; need: RowNeed }[]>();
    const sinFilas = new Map<string, RowNeed>();
    const needs: RowNeed[] = [];
    for (const controlId of controls) {
      const agentes = sinIdentidades ? [] : forControl(controlId);
      // Sin filas, las máquinas declaradas fuera del alcance todavía dan la
      // vista consolidada (sin leer nada); solo si tampoco las hay, el motor
      // evalúa el control sobre todos sus hechos sin fila.
      if (!agentes.length && !sinIdentidades) {
        ensConfigurationRepository.replaceActive(ctx.configuration);
        if (consolidateENSControlRows(controlId, level, [], ctx.presenceEvents, ctx.scope, ctx.now)) {
          filasDe.set(controlId, []);
          continue;
        }
      }
      if (!agentes.length) {
        const need = { key: `f|${ctx.userKey}|${controlId}`, fingerprint: fallbackFingerprint(ctx, controlId), spec: { controlId }, weight: weightOf(ctx, controlId) };
        needs.push(need);
        sinFilas.set(controlId, need);
        filasDe.set(controlId, []);
        continue;
      }
      const filas = agentes.map(agent => {
        const need: RowNeed = {
          key: `r|${ctx.userKey}|${controlId}|${agent.agentId}`,
          fingerprint: rowFingerprint(ctx, controlId, agent.agentId),
          spec: { controlId, factsAgent: agent.agentId, viewAgent: agent.agentId },
          weight: weightOf(ctx, controlId, agent.agentId),
        };
        needs.push(need);
        return { agentId: agent.agentId, agentName: agent.agentName, need };
      });
      filasDe.set(controlId, filas);
    }

    // El tope de la memoria sigue al alcance: que quepan al menos 10 usuarios
    // con todas sus filas (~60 KB cada una), entre `maxStoredBytes` y 4 veces
    // eso.
    rows.setMaxBytes(Math.min(maxStoredBytes * 4, Math.max(maxStoredBytes, needs.length * 60 * 1024 * 10)));

    // 2. Lo guardado (vigente o viejo) y lo que hay que calcular.
    const listos = new Map<string, UsedRow>();
    const viejos: RowNeed[] = [];
    const frios: RowNeed[] = [];
    for (const need of needs) {
      const entrada = rows.peek(need.key);
      if (entrada && rows.isFresh(entrada, need.fingerprint)) {
        listos.set(need.key, { key: need.key, need, row: entrada.value, storedAt: entrada.storedAt, stale: false, computed: false });
      } else if (
        options.allowStale &&
        entrada &&
        entrada.value.configurationKey === ctx.configurationKey &&
        entrada.value.scopeKey === ctx.scopeKey
      ) {
        listos.set(need.key, { key: need.key, need, row: entrada.value, storedAt: entrada.storedAt, stale: true, computed: false });
        viejos.push(need);
      } else {
        // Una fila que falló DESPUÉS de responder (la primera carga sigue
        // detrás): el sondeo siguiente dice el error, una vez, en lugar de
        // relanzar el cálculo sin que nadie se entere.
        const fallo = coldFailures.get(need.key);
        if (fallo) {
          coldFailures.delete(need.key);
          if (!inflight.has(`${need.key}|${need.fingerprint}`) && !options.retryRefresh && clock().getTime() - fallo.at < COLD_FAILURE_MS) {
            throw fallo.error;
          }
        }
        frios.push(need);
      }
    }
    const refreshingInBackground = refreshStale(clients, ctx, viejos, options);

    // 3. En frío: la lista y el panel responden con lo que esté a los
    // `firstResponseMs` y el resto sigue detrás; las demás vistas esperan.
    const promesas = ensureRows(clients, ctx, frios, {
      background: false,
      pinned: progressive,
      signal: options.signal,
      onFailed: (need, error: any) => {
        if (error?.statusCode !== 499) coldFailures.set(need.key, { error, at: clock().getTime() });
      },
    });
    const errores: unknown[] = [];
    const seguimiento = frios.map(need =>
      promesas.get(need.key)!.then(
        row => {
          listos.set(need.key, { key: need.key, need, row, storedAt: clock().getTime(), stale: false, computed: true });
        },
        error => {
          errores.push(error);
        }
      )
    );
    if (seguimiento.length) {
      if (progressive) {
        let temporizador: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          Promise.all(seguimiento),
          new Promise<void>(resolve => {
            temporizador = setTimeout(resolve, firstResponseMs);
          }),
        ]);
        if (temporizador) clearTimeout(temporizador);
      } else {
        await Promise.all(seguimiento);
      }
    }
    if (errores.length) {
      // Dicho ya a quien lo pidió: no se repite en la petición siguiente.
      for (const need of frios) coldFailures.delete(need.key);
      throw errores[0];
    }

    // 4. La vista de cada control con todas sus filas listas.
    const puntoDe = (row: StoredRow, iso: string): CutPoint | undefined =>
      row.cuts && row.cuts.key === serie.key ? row.cuts.points[iso] : undefined;
    ensConfigurationRepository.replaceActive(ctx.configuration);
    const conTrazas = query.include === 'control';
    const views = new Map<string, ENSViewPartition>();
    const pendientes: string[] = [];
    const usados: UsedRow[] = [];
    for (const controlId of controls) {
      const filas = filasDe.get(controlId) || [];
      const fallbackNeed = sinFilas.get(controlId);
      const propias = [...filas.map(f => f.need), ...(fallbackNeed ? [fallbackNeed] : [])];
      if (propias.some(need => !listos.has(need.key))) {
        pendientes.push(controlId);
        continue;
      }
      propias.forEach(need => usados.push(listos.get(need.key)!));
      const filaDe = (need: RowNeed) => listos.get(need.key)!.row;
      let view: ENSViewPartition;
      if (!query.agentId) {
        if (fallbackNeed) {
          const row = filaDe(fallbackNeed);
          view = {
            controlId,
            result: row.result,
            traceability: () => descomprime(row.traceability),
            traceabilityStored: row.traceabilityStored,
            traceabilityTotal: row.traceabilityTotal,
            rows: [],
            pointAt: iso => puntoDe(row, iso),
          };
        } else {
          // La trazabilidad del conjunto solo se descomprime para la ficha.
          const conTraza = filas
            .filter(f => filaDe(f.need).result)
            .map(f => ({
              agentId: f.agentId,
              agentName: f.agentName,
              result: { ...filaDe(f.need).result!, traceability: conTrazas ? descomprime(filaDe(f.need).traceability) : [] },
            }));
          const consolidado = consolidateENSControlRows(controlId, level, conTraza, ctx.presenceEvents, ctx.scope, ctx.now);
          const traza = consolidado?.traceability || [];
          const guardadas = conTrazas ? filas.reduce((n, f) => n + filaDe(f.need).traceabilityStored, 0) : 0;
          const totales = filas.reduce((n, f) => n + filaDe(f.need).traceabilityTotal, 0);
          const lista = traza.slice(0, ENS_EVALUATION_LIMITS.traceabilityStored);
          view = {
            controlId,
            result: consolidado && withoutTraceability(consolidado),
            traceability: () => lista,
            traceabilityStored: lista.length,
            traceabilityTotal: traza.length - guardadas + totales,
            rows: conTraza.map(f => ({ agentId: f.agentId, result: withoutTraceability(f.result) })),
            pointAt: (iso, cutoff) => {
              const puntos = filas.map(f => puntoDe(filaDe(f.need), iso));
              if (puntos.some(p => p === undefined)) return undefined;
              ensConfigurationRepository.replaceActive(ctx.configuration);
              const enCorte = consolidateENSControlRows(
                controlId,
                level,
                filas.map((f, i) => ({ agentId: f.agentId, agentName: f.agentName, result: resultStatusStub(controlId, puntos[i]!.status, puntos[i]!.score) })),
                ctx.presenceEvents,
                ctx.scope,
                cutoff
              );
              return enCorte ? { status: enCorte.status, score: enCorte.score } : null;
            },
          };
        }
      } else {
        const decision = deriveForAgent(controlId, query.agentId, filas.map(f => f.agentId), ctx.scope);
        let fila =
          decision?.from === 'row'
            ? filaDe(filas.find(f => f.agentId === query.agentId)!.need)
            : decision?.from === 'manager'
            ? filaDe(filas.find(f => f.agentId === ENS_MANAGER_AGENT_ID)!.need)
            : undefined;
        if (!decision) {
          // Un control de organización sin fila del manager: se evalúa la
          // vista con los hechos del manager, como el motor.
          const need: RowNeed = {
            key: `d|${ctx.userKey}|${controlId}|${query.agentId}`,
            fingerprint: rowFingerprint(ctx, controlId, ENS_MANAGER_AGENT_ID),
            spec: { controlId, factsAgent: ENS_MANAGER_AGENT_ID, viewAgent: query.agentId },
            weight: weightOf(ctx, controlId, ENS_MANAGER_AGENT_ID),
          };
          const entrada = rows.peek(need.key);
          if (entrada && rows.isFresh(entrada, need.fingerprint)) {
            fila = entrada.value;
            usados.push({ key: need.key, need, row: entrada.value, storedAt: entrada.storedAt, stale: false, computed: false });
          } else {
            const row = await ensureRows(clients, ctx, [need], { background: false, pinned: false, signal: options.signal }).get(need.key)!;
            fila = row;
            usados.push({ key: need.key, need, row, storedAt: clock().getTime(), stale: false, computed: true });
          }
          ensConfigurationRepository.replaceActive(ctx.configuration);
        }
        const propia = decision?.from === 'row' ? fila : undefined;
        const f = fila;
        view = {
          controlId,
          result: f?.result,
          traceability: () => (f ? descomprime(f.traceability) : []),
          traceabilityStored: f?.traceabilityStored || 0,
          traceabilityTotal: f?.traceabilityTotal || 0,
          rows: propia?.result ? [{ agentId: query.agentId, result: propia.result }] : [],
          // Sin fila (no se mide aquí) no hay punto: `null`.
          pointAt: iso => (f ? puntoDe(f, iso) : null),
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

    // 5. La serie: días pasados (guardados o sacados de la serie de cada fila)
    // + el presente. Nunca se espera: si falta algún día, la vista responde
    // sin serie (`meta.seriesPending`) y la serie se calcula detrás.
    let timeline: any[] | undefined;
    let seriesPending = false;
    if (query.timelineDays) {
      let pasados = cachedTimeline;
      if (!pasados && pendientes.length) {
        seriesPending = true;
      } else if (!pasados) {
        const porControl = pastCuts.map(cut => controls.map(controlId => views.get(controlId)!.pointAt(cut.cutoff.toISOString(), cut.cutoff)));
        if (porControl.some(puntos => puntos.some(p => p === undefined))) {
          seriesPending = true;
          for (const u of usados) wantSeries(clients, ctx, u.need);
        } else {
          const eventos = pastCuts.length ? await dailyCounts(clients, ctx, query, pastCuts) : [];
          pasados = pastCuts.map((cut, index) => {
            const base = { date: cut.cutoff.toISOString(), label: cut.label, isCurrent: false, events: eventos[index] || 0 };
            const puntos = porControl[index];
            if (query.controlId) {
              return { ...base, score: puntos[0]?.score, status: puntos[0]?.status || 'NO_EVALUABLE' };
            }
            // El número del panel en ese día: el mismo resumen del motor, sobre
            // los controles con resultado en la vista.
            const resultados = controls
              .map((controlId, i) => (puntos[i] ? resultStatusStub(controlId, puntos[i]!.status, puntos[i]!.score) : undefined))
              .filter((r): r is ENSComplianceResult => Boolean(r));
            return { ...base, score: buildComplianceState(resultados).controlSummary.scoreAverage, controls: perControlOfPoint(controls, puntos) };
          });
          if (!usados.some(u => u.stale)) timelines.set(tKey, tFingerprint, pasados);
        }
      }
      if (pasados) {
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
                    : { score: state!.controlSummary.scoreAverage, controls: perControlOfResults(state!.results) }),
                },
              ]
            : []),
        ];
      }
    }

    const refreshing = usados.some(u => u.stale);
    const fingerprint = viewFingerprint(ctx, query);
    const impact = query.include === 'dashboard' && !pendientes.length ? await impactEvents(clients, ctx, query, fingerprint) : undefined;
    const calculadas = usados.filter(u => u.computed);
    // El error de un refresco se dice mientras no haya otro intento en curso
    // (un intento nuevo lo borra; si también falla, se anota con su hora).
    const errores2 = usados
      .filter(u => u.stale && !inflight.has(`${u.need.key}|${u.need.fingerprint}`))
      .map(u => u.row.refreshError)
      .filter(Boolean) as { message: string; at: string }[];
    const refreshError = errores2.sort((a, b) => b.at.localeCompare(a.at))[0];
    const filasPendientes = needs.filter(need => !listos.has(need.key)).length;

    const meta = {
      // Con algo viejo a la vista, filas o serie pendientes, la huella no es
      // la de los datos: la sonda siguiente la verá distinta y el navegador
      // volverá a pedir.
      fingerprint: refreshing || seriesPending || pendientes.length ? `refreshing:${fingerprint}` : fingerprint,
      refreshing: refreshing || seriesPending || pendientes.length > 0,
      // Filas que aún se están calculando (la lista, la Vista general y el
      // panel responden sin esperarlas): cuántas y de qué controles.
      pending: pendientes.length ? { rows: filasPendientes, controls: pendientes, total: needs.length } : undefined,
      seriesPending,
      // El último refresco en segundo plano que falló (lo que se enseña es lo
      // anterior a él).
      refreshError,
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
        refreshingInBackground,
        hits: calculadas.reduce((n, u) => n + u.row.stats.hits, 0),
        rows: calculadas.map(u => u.row.stats),
      },
    };

    return { ctx, query, meta, state, views, timeline, impact, rowName: nombre };
  };

  // Lo que queda por hacer en segundo plano (para esperar a que termine).
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
    // Las filas que se están calculando (las pruebas esperan a que acaben).
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
