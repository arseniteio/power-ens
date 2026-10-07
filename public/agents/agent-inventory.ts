// Inventario de agentes desde `wazuh-monitoring-*`, que el propio Wazuh
// rellena cada 15 minutos con cada agente. Sustituye a la API de Wazuh: el
// plugin no necesita sus credenciales. Se lee como el usuario que mira.
import { ENS_MONITORING_INDEX } from '../../common/constants';
import type { ENSAgentScope } from '../ens/core/scope/types';
import { getCore, getData } from '../services';

export const ENS_INVENTORY_MAX_AGE_MS = 60 * 60 * 1000;

export interface ENSAgentInventory {
  agents: ENSAgentScope[];
  newestTimestamp?: string;
  stale: boolean;
}

export const buildMonitoringInventoryRequest = () => ({
  index: ENS_MONITORING_INDEX,
  body: {
    size: 0,
    query: { range: { timestamp: { gte: 'now-7d' } } },
    aggs: {
      agentes: {
        terms: { field: 'id', size: 10000 },
        aggs: {
          ultimo: {
            top_hits: {
              size: 1,
              sort: [{ timestamp: { order: 'desc' } }],
              _source: ['id', 'name', 'group', 'status', 'timestamp'],
            },
          },
        },
      },
    },
  },
});

const idDeAgente = (valor: unknown): string => {
  const texto = String(valor ?? '').trim();
  return /^\d+$/.test(texto) ? texto.padStart(3, '0') : texto;
};

const gruposDe = (valor: unknown): string[] => {
  if (Array.isArray(valor)) return valor.map(g => String(g).trim()).filter(Boolean);
  if (typeof valor === 'string') return valor.split(',').map(g => g.trim()).filter(Boolean);
  return [];
};

export const inventoryFromMonitoring = (aggregations: any, now: number = Date.now()): ENSAgentInventory => {
  let masReciente: number | undefined;
  // Un agente por id normalizado: si dos cubos dan el mismo (`24` y `024`),
  // queda el del dato más reciente; sin fecha, cuenta como el más antiguo.
  const porId = new Map<string, { agente: ENSAgentScope; instante: number }>();

  for (const cubo of aggregations?.agentes?.buckets || []) {
    const doc = cubo?.ultimo?.hits?.hits?.[0]?._source;
    const id = idDeAgente(doc?.id ?? cubo?.key);
    if (!id) continue;

    const instante = Date.parse(String(doc?.timestamp ?? ''));
    if (!Number.isNaN(instante) && (masReciente === undefined || instante > masReciente)) masReciente = instante;

    const orden = Number.isNaN(instante) ? -Infinity : instante;
    const previo = porId.get(id);
    if (previo && previo.instante >= orden) continue;

    porId.set(id, {
      instante: orden,
      agente: {
        id,
        name: doc?.name ? String(doc.name) : undefined,
        groups: gruposDe(doc?.group),
        ...(doc?.status ? { status: String(doc.status) } : {}),
      },
    });
  }

  const agents = [...porId.values()].map(v => v.agente).sort((a, b) => a.id.localeCompare(b.id));

  return {
    agents,
    newestTimestamp: masReciente === undefined ? undefined : new Date(masReciente).toISOString(),
    stale: masReciente === undefined || now - masReciente > ENS_INVENTORY_MAX_AGE_MS,
  };
};

export const staleInventoryMessage = (newestTimestamp?: string): string =>
  newestTimestamp
    ? `El último dato de wazuh-monitoring es de ${newestTimestamp}: un alta o una baja reciente puede no verse todavía.`
    : 'El inventario de wazuh-monitoring no trae ninguna fecha: no se sabe si está al día y un alta o una baja reciente puede no verse.';

export const loadENSAgentInventory = async (): Promise<ENSAgentScope[]> => {
  const respuesta: any = await getData()
    .search.search({ params: buildMonitoringInventoryRequest() })
    .toPromise();
  const inventario = inventoryFromMonitoring(respuesta?.rawResponse?.aggregations);

  if (!inventario.agents.length) {
    throw new Error(
      'No hay inventario de agentes: la monitorización de agentes de Wazuh (wazuh-monitoring-*) no está activa o este usuario no puede leerla.'
    );
  }

  if (inventario.stale) {
    getCore().notifications.toasts.addWarning({
      title: 'ENSFácil: inventario de agentes antiguo',
      text: staleInventoryMessage(inventario.newestTimestamp),
    });
  }

  return inventario.agents;
};
