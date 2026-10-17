// Las consultas del servidor contra los hechos. Puras: las prueba
// `tests/evaluation-queries.test.ts` sin índice.
//
// Los filtros son LOS MISMOS que usaba el navegador (ventana de la
// configuración, alcance de la vista y hechos ENS), con la ventana en
// instantes absolutos: así una lectura paginada ve siempre el mismo conjunto
// aunque lleguen hechos nuevos mientras se lee.
import { ENS_ALERTS_INDEX } from '../../../common/constants';
import { ENSCatalog } from '../../../common/ens/catalog';
import {
  buildENSAllControlsFactsFilter,
  buildENSControlFactsFilter,
  buildENSFactsWithoutControlFilter,
} from '../../../common/ens/dashboard/all-controls-facts-filter';
import { resolveENSEvaluationTimeRange } from '../../../common/ens/core/data-source/evaluation-time-range';
import { buildENSScopeAgentQueryFilter } from '../../../common/ens/core/scope/engine';
import type { ENSAgentScope } from '../../../common/ens/core/scope/types';
import {
  getStateFactCollectorField,
  getStateFactOwnerEvidenceIds,
} from '../../../common/ens/core/evidence/state-facts';

// Lo único que lee el motor de cada hecho (`normalizeWazuhAlert`). Sin `raw`:
// el documento entero no lo lee nadie.
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

// El orden en que el navegador recibía los hechos (más recientes primero) y
// un desempate estable para `search_after`.
export const FACTS_SORT = [{ '@timestamp': { order: 'desc' } }, { _id: { order: 'asc' } }];

export interface ENSEvaluationWindow {
  from: string;
  to: string;
}

const UNIDADES: Record<string, number> = { m: 60e3, h: 3600e3, d: 86400e3 };

// `now-30d` → instante. Lo que no se entienda, como la ventana por defecto.
const instante = (expresion: string, now: number): number => {
  if (expresion === 'now') return now;
  const m = /^now-(\d+)([mhd])$/.exec(expresion);
  return m ? now - Number(m[1]) * UNIDADES[m[2]] : now - 30 * UNIDADES.d;
};

export const resolveEvaluationWindow = (evaluationPeriod: string, now: Date): ENSEvaluationWindow => {
  const rango = resolveENSEvaluationTimeRange(evaluationPeriod);
  return {
    from: new Date(instante(rango.from, now.getTime())).toISOString(),
    to: new Date(instante(rango.to, now.getTime())).toISOString(),
  };
};

export const catalogControlIds = (): string[] => ENSCatalog.map(control => control.id);

// Los filtros de una vista: ventana, alcance (la máquina y, si está, el
// manager) y hechos ENS. Es exactamente el conjunto que juzgaba el panel.
export const buildViewFilters = (
  window: ENSEvaluationWindow,
  scopeAgents: ENSAgentScope[],
  agentId?: string
): unknown[] => [
  { range: { '@timestamp': { gte: window.from, lte: window.to } } },
  buildENSScopeAgentQueryFilter(scopeAgents, agentId),
  buildENSAllControlsFactsFilter(catalogControlIds()),
];

// LA SONDA. Unos cientos de bytes: cuántos hechos hay y el más reciente, en
// total, por control y sin control; y de cada máquina, su primer hecho de la
// ventana (la presencia, ver `control-partition.ts`) y el nombre del último.
export const buildProbeRequest = (filters: unknown[], controlIds: string[]) => ({
  index: ENS_ALERTS_INDEX,
  body: {
    size: 0,
    track_total_hits: true,
    query: { bool: { filter: filters } },
    aggs: {
      newest: { max: { field: '@timestamp' } },
      oldest: { min: { field: '@timestamp' } },
      controls: {
        filters: {
          filters: Object.fromEntries(controlIds.map(id => [id, buildENSControlFactsFilter(id)])),
        },
        aggs: { newest: { max: { field: '@timestamp' } }, oldest: { min: { field: '@timestamp' } } },
      },
      orphans: {
        filter: buildENSFactsWithoutControlFilter(),
        aggs: { newest: { max: { field: '@timestamp' } } },
      },
      agents: {
        terms: { field: 'agent.id', size: 10000 },
        aggs: {
          first: { min: { field: '@timestamp' } },
          last: { top_hits: { size: 1, sort: [{ '@timestamp': { order: 'desc' } }], _source: ['agent.name'] } },
        },
      },
    },
  },
});

export interface ENSFactsCount {
  count: number;
  newest?: string;
  oldest?: string;
}

export interface ENSProbeResult extends ENSFactsCount {
  controls: Record<string, ENSFactsCount>;
  orphans: ENSFactsCount;
  presence: { agentId: string; agentName?: string; earliest: string }[];
}

const fecha = (agg: any): string | undefined =>
  agg && typeof agg.value === 'number' ? new Date(agg.value).toISOString() : undefined;

export const readProbeResponse = (body: any): ENSProbeResult => {
  const aggs = body?.aggregations || {};
  const total = body?.hits?.total;
  return {
    count: typeof total === 'number' ? total : Number(total?.value || 0),
    newest: fecha(aggs.newest),
    oldest: fecha(aggs.oldest),
    controls: Object.fromEntries(
      Object.entries(aggs.controls?.buckets || {}).map(([id, b]: [string, any]) => [
        id,
        { count: Number(b?.doc_count || 0), newest: fecha(b?.newest), oldest: fecha(b?.oldest) },
      ])
    ),
    orphans: { count: Number(aggs.orphans?.doc_count || 0), newest: fecha(aggs.orphans?.newest) },
    presence: (aggs.agents?.buckets || [])
      .map((b: any) => ({
        agentId: String(b.key),
        agentName: b.last?.hits?.hits?.[0]?._source?.agent?.name,
        earliest: fecha(b.first),
      }))
      .filter((p: any) => p.earliest)
      .sort((a: any, b: any) => a.agentId.localeCompare(b.agentId)),
  };
};

// Los hechos de estado que el servidor no necesita leer (ver
// `computeStateFactPruningCutoffs`). Cada clave `agente|recolector|tipo` con su
// corte se convierte en «hechos de ese tipo, de esa máquina y ese recolector,
// de este control, hasta el corte». Solo los que el normalizador leería igual:
// con `data.event` (el tipo), `agent.id` (la máquina), `@timestamp` (la fecha),
// `data.ensfacil` (el control) y sin declarar una evidencia que no sea dueña
// del tipo. Ante cualquier duda, el hecho se lee.
export const buildStateFactPruningClause = (
  controlId: string,
  cutoffs: Map<string, number>
): unknown | undefined => {
  if (!cutoffs.size) return undefined;
  const campo = getStateFactCollectorField(controlId);

  const should = [...cutoffs.entries()].map(([clave, corte]) => {
    const [agente, recolector, tipo] = clave.split('|');
    const duenas = getStateFactOwnerEvidenceIds(controlId, tipo);
    const filter: unknown[] = [
      { term: { 'data.ensfacil': controlId } },
      { term: { 'agent.id': agente } },
      { term: { 'data.event': tipo } },
      { range: { '@timestamp': { lte: new Date(corte).toISOString() } } },
      {
        bool: {
          must_not: ['data.evidenceId', 'data.ev_id', 'data.evidencias'].map(field => ({ exists: { field } })),
          should: [
            { bool: { must_not: { exists: { field: 'data.evidence_id' } } } },
            { terms: { 'data.evidence_id': duenas } },
          ],
          minimum_should_match: 1,
        },
      },
    ];
    if (campo) {
      filter.push(
        recolector
          ? { term: { [`data.${campo}`]: recolector } }
          : { bool: { must_not: { exists: { field: `data.${campo}` } } } }
      );
    }
    return { bool: { filter } };
  });

  return { bool: { should, minimum_should_match: 1 } };
};

// Los hechos de un control (o los que no nombran ninguno), con su poda.
export const buildFactsQuery = (
  viewFilters: unknown[],
  controlId: string | null,
  pruning?: unknown
) => ({
  bool: {
    filter: [
      ...viewFilters,
      controlId === null ? buildENSFactsWithoutControlFilter() : buildENSControlFactsFilter(controlId),
    ],
    ...(pruning ? { must_not: [pruning] } : {}),
  },
});

// Los latidos de un control: con ellos se calcula la poda antes de leer el
// resto.
export const buildCollectorRunsQuery = (viewFilters: unknown[], controlId: string) => ({
  bool: {
    filter: [
      ...viewFilters,
      buildENSControlFactsFilter(controlId),
      { term: { 'data.event': 'collector_run' } },
    ],
  },
});

// Cuántos hechos hay hasta el final de cada día (para el número de eventos de
// cada punto de la serie).
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
