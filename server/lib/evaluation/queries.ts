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
import { ENS_CROSS_CONTROL_EVENT_TYPES, ENS_CROSS_CONTROL_HEARTBEAT } from '../../../common/ens/core/control-partition';

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

// El orden de lectura: del más reciente al más antiguo (como los recibía el
// navegador), y un desempate determinista con campos `keyword` que llevan
// todas las alertas de Wazuh (`id` es único por manager). Nunca `_id`: ordenar
// por `_id` carga su fielddata para todos los documentos de cada shard.
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

// LA SONDA. Una sola consulta sin documentos: cuántos hechos hay y el más
// reciente, en total, por control y máquina (lo que decide qué filas hay que
// recalcular), los que no nombran ningún control, los de los tipos que op.acc.3
// lee de otros controles; de cada máquina, su primer hecho de la ventana (la
// presencia) y el nombre del último; y el último latido de cada día de cada
// máquina, de cualquier control (ver `control-partition.ts`).
// `past`: los días pasados ENTEROS de la ventana (desde el primer día
// completo hasta el inicio de hoy, en la zona de quien mira). Cuántos hechos
// hay ahí, por control y máquina, sin control y de los tipos cruzados: si no
// cambia, los puntos ya calculados de esos días siguen valiendo aunque lleguen
// hechos nuevos (que son de hoy).
export const buildProbeRequest = (filters: unknown[], controlIds: string[], timeZone?: string, past?: { from: string; to: string }) => {
  const pasado = past ? { past: { filter: { range: { '@timestamp': { gte: past.from, lt: past.to } } } } } : {};
  const porMaquina = (aggs?: Record<string, unknown>) => ({
    terms: { field: 'agent.id', size: 10000 },
    aggs: { newest: { max: { field: '@timestamp' } }, ...pasado, ...(aggs || {}) },
  });
  const cruzados = Object.entries(ENS_CROSS_CONTROL_EVENT_TYPES).filter(([id]) => controlIds.includes(id));
  return {
    index: ENS_ALERTS_INDEX,
    body: {
      size: 0,
      track_total_hits: true,
      query: { bool: { filter: filters } },
      aggs: {
        newest: { max: { field: '@timestamp' } },
        oldest: { min: { field: '@timestamp' } },
        // Los índices con hechos de la ventana: las lecturas los nombran en
        // lugar del comodín (cada índice de más es coste en cada llamada).
        indices: { terms: { field: '_index', size: 500 } },
        controls: {
          filters: {
            filters: Object.fromEntries(controlIds.map(id => [id, buildENSControlFactsFilter(id)])),
          },
          aggs: {
            newest: { max: { field: '@timestamp' } },
            oldest: { min: { field: '@timestamp' } },
            ...pasado,
            agents: porMaquina({ oldest: { min: { field: '@timestamp' } } }),
          },
        },
        orphans: {
          filter: buildENSFactsWithoutControlFilter(),
          aggs: { newest: { max: { field: '@timestamp' } }, ...pasado, agents: porMaquina() },
        },
        ...Object.fromEntries(
          cruzados.map(([id, tipos]) => [
            `cross:${id}`,
            {
              filter: { bool: { filter: [{ terms: { 'data.event': tipos } }], must_not: [buildENSControlFactsFilter(id)] } },
              aggs: { agents: porMaquina() },
            },
          ])
        ),
        ...(ENS_CROSS_CONTROL_HEARTBEAT.some(id => controlIds.includes(id))
          ? {
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
            }
          : {}),
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

// Los hechos de los días pasados enteros de la ventana (ver `buildProbeRequest`).
export interface ENSPastFactsCount {
  total: number;
  agents: Record<string, number>;
}

export interface ENSProbeResult extends ENSFactsCount {
  controls: Record<string, ENSFactsCount & { agents: Record<string, ENSFactsCount> }>;
  orphans: ENSFactsCount & { agents: Record<string, ENSFactsCount> };
  cross: Record<string, Record<string, ENSFactsCount>>;
  // Por máquina, el último latido de cada día (de cualquier control).
  heartbeats: Record<string, string[]>;
  // Cada máquina: su primer hecho de la ventana (la presencia), el último y
  // cuántos tiene.
  presence: { agentId: string; agentName?: string; earliest: string; newest?: string; count: number }[];
  // Los índices con hechos de la ventana (sin lista fiable, `undefined`).
  indices?: string[];
  // Aparte (no entra en la huella de las filas): los hechos de los días
  // pasados enteros, por control, sin control y de los tipos cruzados.
  past?: { controls: Record<string, ENSPastFactsCount>; orphans: ENSPastFactsCount; cross: Record<string, ENSPastFactsCount> };
}

const fecha = (agg: any): string | undefined =>
  agg && typeof agg.value === 'number' ? new Date(agg.value).toISOString() : undefined;

const porMaquinaDe = (agg: any): Record<string, ENSFactsCount> =>
  Object.fromEntries(
    (agg?.buckets || []).map((b: any) => [
      String(b.key),
      { count: Number(b.doc_count || 0), newest: fecha(b.newest), oldest: fecha(b.oldest) },
    ])
  );

export const readProbeResponse = (body: any): ENSProbeResult => {
  const aggs = body?.aggregations || {};
  const total = body?.hits?.total;
  const indices = aggs.indices && !(Number(aggs.indices.sum_other_doc_count) > 0)
    ? (aggs.indices.buckets || []).map((b: any) => String(b.key))
    : undefined;
  const pasadoDe = (agg: any): ENSPastFactsCount => ({
    total: Number(agg?.past?.doc_count || 0),
    agents: Object.fromEntries((agg?.agents?.buckets || []).map((b: any) => [String(b.key), Number(b.past?.doc_count || 0)])),
  });
  const conPasado = Boolean(aggs.orphans?.past);
  return {
    indices,
    past: conPasado
      ? {
          controls: Object.fromEntries(Object.entries(aggs.controls?.buckets || {}).map(([id, b]: [string, any]) => [id, pasadoDe(b)])),
          orphans: pasadoDe(aggs.orphans),
          cross: Object.fromEntries(
            Object.entries(aggs)
              .filter(([nombre]) => nombre.startsWith('cross:'))
              .map(([nombre, agg]: [string, any]) => [nombre.slice('cross:'.length), pasadoDe(agg)])
          ),
        }
      : undefined,
    count: typeof total === 'number' ? total : Number(total?.value || 0),
    newest: fecha(aggs.newest),
    oldest: fecha(aggs.oldest),
    controls: Object.fromEntries(
      Object.entries(aggs.controls?.buckets || {}).map(([id, b]: [string, any]) => [
        id,
        { count: Number(b?.doc_count || 0), newest: fecha(b?.newest), oldest: fecha(b?.oldest), agents: porMaquinaDe(b?.agents) },
      ])
    ),
    orphans: { count: Number(aggs.orphans?.doc_count || 0), newest: fecha(aggs.orphans?.newest), agents: porMaquinaDe(aggs.orphans?.agents) },
    cross: Object.fromEntries(
      Object.entries(aggs)
        .filter(([nombre]) => nombre.startsWith('cross:'))
        .map(([nombre, agg]: [string, any]) => [nombre.slice('cross:'.length), porMaquinaDe(agg?.agents)])
    ),
    heartbeats: Object.fromEntries(
      (aggs.heartbeats?.agents?.buckets || []).map((b: any) => [
        String(b.key),
        (b.days?.buckets || []).map((d: any) => fecha(d.last)).filter(Boolean),
      ])
    ),
    presence: (aggs.agents?.buckets || [])
      .map((b: any) => ({
        agentId: String(b.key),
        agentName: b.last?.hits?.hits?.[0]?._source?.agent?.name,
        earliest: fecha(b.first),
        newest: fecha(b.latest),
        count: Number(b.doc_count || 0),
      }))
      .filter((p: any) => p.earliest)
      .sort((a: any, b: any) => a.agentId.localeCompare(b.agentId)),
  };
};

// Cuántas hojas puede ocupar la poda. OpenSearch cuenta TODAS las hojas de
// la consulta contra `indices.query.bool.max_clause_count` (1024 por defecto),
// y los filtros de la vista ya ocupan unas 80: lo que no cabe, se lee.
export const PRUNING_MAX_LEAVES = 400;

// Los hechos de un control en UNA máquina: los suyos, los que no nombran
// ningún control y, si el control los lee, los de los tipos que lee de otros
// controles. Con la poda de sus hechos de estado. `agentId` vacío: los del
// control en todo el alcance de `viewFilters` (solo para evaluar un control
// que ninguna máquina mide, como el motor).
export const buildFactsQuery = (
  viewFilters: unknown[],
  controlId: string,
  agentId: string | undefined,
  pruning?: unknown
) => {
  const tiposAjenos = ENS_CROSS_CONTROL_EVENT_TYPES[controlId] || [];
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
              ...(tiposAjenos.length ? [{ terms: { 'data.event': tiposAjenos } }] : []),
            ],
            minimum_should_match: 1,
          },
        },
      ],
      ...(pruning ? { must_not: [pruning] } : {}),
    },
  };
};

// Los latidos de un control en una máquina: con ellos se calcula la poda antes
// de leer el resto.
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

// Los eventos operativos del panel (copias, restauraciones…): cuántos hechos
// hay de cada tipo en la vista. Se agrupa por `data.event` y el tipo se compara
// en minúsculas, como el presentador.
export const buildImpactEventsRequest = (filters: unknown[]) => ({
  index: ENS_ALERTS_INDEX,
  body: {
    size: 0,
    query: {
      bool: {
        filter: filters,
        must_not: [
          ...['data.demo', 'data.synthetic', 'data.is_synthetic', 'data.isSynthetic'].map(field => ({
            // En Wazuh, `data.*` se mapea `keyword` (comprobado en el laboratorio):
            // se comparan cadenas, como hace `normalizeBoolean`.
            terms: { [field]: ['true', 'True', 'TRUE', '1', 'yes', 'Yes', 'YES'] },
          })),
          { exists: { field: 'data.test_id' } },
          { exists: { field: 'data.testId' } },
        ],
      },
    },
    aggs: { types: { terms: { field: 'data.event', size: 2000 } } },
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

// --- poda exacta para el instante actual y los días de la serie ------------

const SIN_VALOR = '__none__';
const CAMPOS_EVIDENCIA_ALTERNATIVOS = ['data.evidenceId', 'data.ev_id', 'data.evidencias'];

// El último hecho de estado de cada recolector, tipo y evidencia, día a día:
// con él se calcula el corte EXACTO del motor (`computeStateFactCutoffsByCollector`).
// Solo hechos que el normalizador atribuye igual: `data.ensfacil` del control,
// `data.event` del tipo, la máquina en `agent.id`.
// Las agregaciones del último hecho de estado de UN control (dentro de una
// consulta ya acotada a sus hechos de estado en una máquina).
const stateFactLastSeenAggs = (controlId: string, timeZone: string) => {
  const campo = getStateFactCollectorField(controlId);
  const porDia = {
    days: {
      date_histogram: { field: '@timestamp', calendar_interval: 'day', time_zone: timeZone, min_doc_count: 1 },
      aggs: { last: { max: { field: '@timestamp' } } },
    },
  };
  const porTipo = {
    types: {
      terms: { field: 'data.event', size: 200 },
      aggs: { ids: { terms: { field: 'data.evidence_id', size: 200, missing: SIN_VALOR }, aggs: porDia } },
    },
  };
  return {
    alt: { filter: { bool: { should: CAMPOS_EVIDENCIA_ALTERNATIVOS.map(field => ({ exists: { field } })), minimum_should_match: 1 } } },
    // Un campo con varios valores en un mismo hecho (una lista) no se
    // atribuye bien a un solo cubo: se compara cuántos valores hay con
    // cuántos hechos lo llevan.
    ...Object.fromEntries(
      ['data.event', 'data.evidence_id', ...(campo ? [`data.${campo}`] : [])].flatMap((field, i) => [
        [`values_${i}`, { value_count: { field } }],
        [`docs_${i}`, { filter: { exists: { field } } }],
      ])
    ),
    collectors: campo
      ? { terms: { field: `data.${campo}`, size: 200, missing: SIN_VALOR }, aggs: porTipo }
      : { filters: { filters: { [SIN_VALOR]: { match_all: {} } } }, aggs: porTipo },
  };
};

const hechosDeEstadoDe = (controlId: string) => [
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
    query: { bool: { filter: [...viewFilters, { term: { 'agent.id': agentId } }, ...hechosDeEstadoDe(controlId)] } },
    aggs: stateFactLastSeenAggs(controlId, timeZone),
  },
});

// Lo mismo para TODOS los controles con hechos de estado de una máquina, en
// una sola consulta (una agregación por control, con su propio filtro).
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
        { filter: { bool: { filter: hechosDeEstadoDe(controlId) } }, aggs: stateFactLastSeenAggs(controlId, timeZone) },
      ])
    ),
  },
});

export const readAgentStateFactLastSeen = (controlIds: string[], body: any): Map<string, ENSStateFactLastSeen> =>
  new Map(controlIds.map((controlId, i) => [controlId, readStateFactLastSeen(controlId, { aggregations: body?.aggregations?.[`c${i}`] })]));

export interface ENSStateFactLastSeen {
  // Recolectores con hechos de estado (`''` sin campo de recolector).
  collectors: string[];
  lastFactOf: (collector: string, evidenceId: string, at: number) => number | undefined;
}

export const readStateFactLastSeen = (controlId: string, body: any): ENSStateFactLastSeen => {
  const aggs = body?.aggregations || {};
  // Sin poder atribuir cada hecho a su recolector, tipo y evidencia no se poda
  // nada (sin último hecho, ningún recolector tiene corte):
  //   - hechos que declaran la evidencia en otro campo;
  //   - algún campo con varios valores en el mismo hecho;
  //   - cubos que no cupieron en la respuesta (`sum_other_doc_count`).
  const multivalor = Object.keys(aggs)
    .filter(k => k.startsWith('values_'))
    .some(k => Number(aggs[k]?.value) > Number(aggs[`docs_${k.slice(7)}`]?.doc_count));
  const recortado = (nodo: any): boolean =>
    Boolean(nodo) &&
    typeof nodo === 'object' &&
    (Number(nodo.sum_other_doc_count) > 0 || Object.values(nodo).some(v => (Array.isArray(v) ? v.some(recortado) : recortado(v))));
  const atribuible = !(Number(aggs.alt?.doc_count) > 0) && !multivalor && !recortado(aggs.collectors);
  const maximos = new Map<string, number[]>();
  const cubos = Array.isArray(aggs.collectors?.buckets)
    ? aggs.collectors.buckets
    : Object.entries(aggs.collectors?.buckets || {}).map(([key, b]: [string, any]) => ({ key, ...b }));
  const collectors: string[] = [];
  for (const c of cubos) {
    const collector = String(c.key) === SIN_VALOR ? '' : String(c.key).trim();
    collectors.push(collector);
    for (const t of c.types?.buckets || []) {
      for (const id of t.ids?.buckets || []) {
        const clave = `${collector}|${t.key}|${String(id.key) === SIN_VALOR ? '' : id.key}`;
        const dias = (id.days?.buckets || []).map((d: any) => Number(d.last?.value)).filter(Number.isFinite);
        maximos.set(clave, [...(maximos.get(clave) || []), ...dias].sort((a, b) => a - b));
      }
    }
  }
  const tiposDe = (evidenceId: string) =>
    [...getStateFactEventTypes(controlId)].filter(tipo => getStateFactOwnerEvidenceIds(controlId, tipo).includes(evidenceId));
  return {
    collectors: [...new Set(collectors)],
    lastFactOf: (collector, evidenceId, at) => {
      if (!atribuible) return undefined;
      let ultimo: number | undefined;
      for (const tipo of tiposDe(evidenceId)) {
        for (const id of [evidenceId, '']) {
          for (const m of maximos.get(`${collector}|${tipo}|${id}`) || []) {
            if (m <= at && (ultimo === undefined || m > ultimo)) ultimo = m;
          }
        }
      }
      return ultimo;
    },
  };
};

// Los rangos de fecha que NO hace falta leer de un recolector: lo que queda
// fuera de la unión de (corte, instante] de todos los instantes. Sin corte en
// un instante, todo lo anterior a él se lee.
export const prunableRanges = (
  windowStart: number,
  instants: number[],
  cutoffs: (number | undefined)[]
): { from: number; to: number }[] => {
  const dentro = instants
    .map((hi, i) => ({ lo: cutoffs[i] === undefined ? windowStart - 1 : (cutoffs[i] as number), hi }))
    .filter(r => r.hi > r.lo)
    .sort((a, b) => a.lo - b.lo);
  const unidos: { lo: number; hi: number }[] = [];
  for (const r of dentro) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && r.lo <= ultimo.hi) ultimo.hi = Math.max(ultimo.hi, r.hi);
    else unidos.push({ ...r });
  }
  // Huecos: [inicio, lo1], (hi1, lo2], … Los extremos son instantes en ms;
  // un hecho con fecha igual al corte se descarta (el motor conserva > corte).
  const huecos: { from: number; to: number }[] = [];
  let desde = windowStart;
  for (const u of unidos) {
    if (u.lo >= desde) huecos.push({ from: desde, to: u.lo });
    desde = u.hi + 1;
  }
  return huecos;
};

// La cláusula que deja fuera esos rangos, tipo a tipo (con sus evidencias
// dueñas) y recolector a recolector. Ante cualquier duda el hecho se lee.
export const buildStateFactKeepClause = (
  controlId: string,
  agentId: string,
  gapsByCollector: Map<string, { from: number; to: number }[]>
): unknown | undefined => {
  const campo = getStateFactCollectorField(controlId);
  const todas = getEvidenceDefinitions(controlId).map(definition => definition.id);
  if (!getStateFactEventTypes(controlId).size) return undefined;
  const porTipo = [...getStateFactEventTypes(controlId)].map(tipo => {
    const duenas = getStateFactOwnerEvidenceIds(controlId, tipo);
    const ajenas = todas.filter(id => !duenas.includes(id));
    return {
      bool: {
        filter: [{ term: { 'data.event': tipo } }],
        should: [{ bool: { must_not: { exists: { field: 'data.evidence_id' } } } }, { terms: { 'data.evidence_id': duenas } }],
        minimum_should_match: 1,
        ...(ajenas.length ? { must_not: [{ terms: { 'data.evidence_id': ajenas } }] } : {}),
      },
    };
  });
  // Recolector a recolector mientras quepan sus rangos; los que no caben se
  // leen enteros.
  let hojas = porTipo.length * 4 + 8;
  const caben = [...gapsByCollector.entries()]
    .filter(([, gaps]) => gaps.length)
    .filter(([, gaps]) => {
      if (hojas + gaps.length + 1 > PRUNING_MAX_LEAVES) return false;
      hojas += gaps.length + 1;
      return true;
    });
  const should = caben
    .map(([collector, gaps]) => ({
      bool: {
        filter: [
          ...(campo
            ? [collector ? { term: { [`data.${campo}`]: collector } } : { bool: { must_not: { exists: { field: `data.${campo}` } } } }]
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
        { bool: { should: porTipo, minimum_should_match: 1 } },
        { bool: { should, minimum_should_match: 1 } },
      ],
      must_not: CAMPOS_EVIDENCIA_ALTERNATIVOS.map(field => ({ exists: { field } })),
    },
  };
};


// --- un flujo por máquina ------------------------------------------------------
//
// En el indexador real cuesta cada LLAMADA (0,16-0,34 s, con o sin hechos),
// no los bytes. En lugar de una lectura por control y máquina, se lee una vez
// por máquina (o por grupos de controles de la máquina), ordenado por control:
// cada control se evalúa en cuanto termina su tramo. Lo que el tramo no trae
// se lee aparte, una vez por máquina: los hechos sin `data.ensfacil` o con un
// campo de control antiguo (los que no nombran control van a todas las filas;
// los antiguos, a la de su control) y los latidos (para la poda).

export const ENS_LEGACY_CONTROL_FIELDS = ['data.ens', 'data.control_id', 'data.control'];

// El orden del flujo: por control y, dentro de cada control, el de siempre
// (así cada fila recibe sus hechos en el mismo orden que leyéndola sola).
// `unmapped_type`: la plantilla de Wazuh mapea `data.*` de forma dinámica, y un
// índice diario sin ningún hecho de ENSFácil (un día sin recolectores, los
// anteriores a instalarlo) no mapea `data.ensfacil`; sin él, OpenSearch
// rechaza la búsqueda entera con un 400 («No mapping found … in order to sort
// on»), también con el comodín.
export const STREAM_SORT = [{ 'data.ensfacil': { order: 'asc', missing: '_last', unmapped_type: 'keyword' } }, ...FACTS_SORT];

export const buildAgentStreamQuery = (viewFilters: unknown[], agentId: string, controlIds: string[], prunings: unknown[]) => ({
  bool: {
    filter: [...viewFilters, { term: { 'agent.id': agentId } }, { terms: { 'data.ensfacil': controlIds } }],
    must_not: [...ENS_LEGACY_CONTROL_FIELDS.map(field => ({ exists: { field } })), ...prunings],
  },
});

// Lo que el flujo no lleva: sin `data.ensfacil`, o con un campo de control antiguo.
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

// Los latidos de una máquina, de todos sus controles.
export const buildAgentRunsQuery = (viewFilters: unknown[], agentId: string) => ({
  bool: { filter: [...viewFilters, { term: { 'agent.id': agentId } }, { term: { 'data.event': 'collector_run' } }] },
});

const valoresDeCampo = (data: any, field: string): unknown[] => {
  const v = data?.[field.slice('data.'.length)];
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).filter(x => x !== undefined && x !== null);
};

// ¿Va este hecho (leído aparte) a la fila de este control? Lo mismo que
// decide el filtro de una lectura por fila: lo nombra en cualquiera de los
// cuatro campos, o no nombra ninguno.
export const sideFactBelongsTo = (hit: any, controlId: string): boolean => {
  const data = hit?._source?.data;
  const valores = ENS_CONTROL_ID_FIELDS.map(field => valoresDeCampo(data, field));
  if (valores.every(lista => lista.length === 0)) return true;
  return valores.some(lista => lista.some(valor => String(valor) === controlId));
};

// Compara dos cadenas por punto de código (el orden de los `keyword`).
const porCodigo = (a: string, b: string): number => {
  if (a === b) return 0;
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i].codePointAt(0) as number) - (y[i].codePointAt(0) as number);
    if (d) return d;
  }
  return x.length - y.length;
};

// El orden de `FACTS_SORT` entre dos hechos, con sus valores de orden (los
// cuatro últimos: el flujo lleva delante el control).
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
    const va = x[i] === null || x[i] === undefined ? null : String(x[i]);
    const vb = y[i] === null || y[i] === undefined ? null : String(y[i]);
    if (va === vb) continue;
    if (va === null) return 1;
    if (vb === null) return -1;
    return porCodigo(va, vb);
  }
  return 0;
};

// Mezcla dos listas ya ordenadas por `FACTS_SORT`.
export const mergeFactsInOrder = (a: any[], b: any[]): any[] => {
  if (!b.length) return a;
  if (!a.length) return b;
  const salida: any[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) salida.push(compareFactsOrder(a[i], b[j]) <= 0 ? a[i++] : b[j++]);
  while (i < a.length) salida.push(a[i++]);
  while (j < b.length) salida.push(b[j++]);
  return salida;
};

// Los índices que leer: los que tienen hechos de la ventana según la sonda
// (y, si siguen el nombre diario de Wazuh, los de cada día de la ventana, por
// si se crea uno después de la sonda). Sin lista fiable, el comodín.
const DIARIO = /^(.*-)(\d{4})\.(\d{2})\.(\d{2})$/;
export const factsIndexFor = (indices: string[] | undefined, window: { from: string; to: string }): string => {
  if (!indices || !indices.length) return ENS_ALERTS_INDEX;
  const nombres = new Set(indices);
  const prefijos = new Set(indices.map(i => DIARIO.exec(i)?.[1]).filter(Boolean) as string[]);
  if (prefijos.size === 1 && indices.every(i => DIARIO.test(i))) {
    const prefijo = [...prefijos][0];
    for (let t = Date.parse(window.from.slice(0, 10)); t <= Date.parse(window.to); t += 86400e3) {
      const d = new Date(t);
      nombres.add(`${prefijo}${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`);
    }
  }
  const lista = [...nombres].sort().join(',');
  // Una URL demasiado larga: el comodín.
  return lista.length > 3000 ? ENS_ALERTS_INDEX : lista;
};
