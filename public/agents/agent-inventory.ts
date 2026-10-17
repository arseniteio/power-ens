// Inventario de agentes desde `wazuh-monitoring-*`, que el propio Wazuh
// rellena cada 15 minutos con cada agente. Sustituye a la API de Wazuh: el
// plugin no necesita sus credenciales. Se lee como el usuario que mira.
import { ENS_MONITORING_INDEX } from '../../common/constants';
import { ENS_MANAGER_AGENT_ID } from '../ens/core/scope/measurement-planes';
import type { ENSAgentScope } from '../ens/core/scope/types';
import { getCore, getData } from '../services';
import { withRequestTimeout } from '../platform/request-timeout';

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
              _source: ['id', 'name', 'group', 'status', 'timestamp', 'manager', 'os'],
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

// El sistema operativo del agente, para detectar su tipo en Configuración
// (Windows, Linux). Solo los campos de texto que se usan; un agente que nunca
// se ha conectado no trae `os`.
const sistemaDe = (valor: any): ENSAgentScope['os'] => {
  if (!valor || typeof valor !== 'object') return undefined;
  const os: NonNullable<ENSAgentScope['os']> = {};
  (['platform', 'name', 'version', 'uname'] as const).forEach(campo => {
    if (typeof valor[campo] === 'string' && valor[campo].trim()) os[campo] = valor[campo].trim();
  });
  return Object.keys(os).length ? os : undefined;
};

const gruposDe = (valor: unknown): string[] => {
  if (Array.isArray(valor)) return valor.map(g => String(g).trim()).filter(Boolean);
  if (typeof valor === 'string') return valor.split(',').map(g => g.trim()).filter(Boolean);
  return [];
};

export const inventoryFromMonitoring = (aggregations: any, now: number = Date.now()): ENSAgentInventory => {
  let masReciente: number | undefined;
  // El manager (000) no se escribe en wazuh-monitoring: su nombre sale del
  // campo `manager` del documento más reciente que lo trae. Un agente que
  // nunca se ha conectado no lo trae (comprobado en wazuh4 el 08/10/2026) y la
  // pasada escribe todos con el mismo instante: el primero no puede decidir.
  let nombreDelManager: string | undefined;
  let instanteDelManager = -Infinity;
  // Un agente por id normalizado: si dos cubos dan el mismo (`24` y `024`),
  // queda el del dato más reciente; sin fecha, cuenta como el más antiguo.
  const porId = new Map<string, { agente: ENSAgentScope; instante: number }>();

  for (const cubo of aggregations?.agentes?.buckets || []) {
    const doc = cubo?.ultimo?.hits?.hits?.[0]?._source;
    const id = idDeAgente(doc?.id ?? cubo?.key);
    if (!id) continue;

    const instante = Date.parse(String(doc?.timestamp ?? ''));
    if (!Number.isNaN(instante) && (masReciente === undefined || instante > masReciente)) masReciente = instante;
    const manager = typeof doc?.manager === 'string' ? doc.manager.trim() : '';
    if (manager && !Number.isNaN(instante) && instante > instanteDelManager) {
      instanteDelManager = instante;
      nombreDelManager = manager;
    }

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
        ...(sistemaDe(doc?.os) ? { os: sistemaDe(doc?.os) } : {}),
      },
    });
  }

  // Un agente dado de baja deja de aparecer en wazuh-monitoring (uno
  // desconectado sigue apareciendo, con su estado): queda fuera el que no
  // tiene dato en la última hora del inventario, contada desde su dato más
  // reciente y no desde el reloj, para que un inventario parado no se vacíe.
  // Sin fecha no se sabe: se queda.
  const vigente = (instante: number) =>
    masReciente === undefined || instante === -Infinity || masReciente - instante <= ENS_INVENTORY_MAX_AGE_MS;

  const agents = [...porId.values()]
    .filter(v => vigente(v.instante))
    .map(v => v.agente)
    .sort((a, b) => a.id.localeCompare(b.id));

  const stale = masReciente === undefined || now - masReciente > ENS_INVENTORY_MAX_AGE_MS;

  // Si hay inventario y no trae un 000, se añade el manager: es quien escribe
  // ese inventario, así que con el inventario al día está activo; antiguo, no
  // se sabe y no se le pone estado.
  if (agents.length && !agents.some(a => a.id === ENS_MANAGER_AGENT_ID)) {
    agents.unshift({
      id: ENS_MANAGER_AGENT_ID,
      name: nombreDelManager,
      groups: [],
      ...(stale ? {} : { status: 'active' }),
    });
  }

  return {
    agents,
    newestTimestamp: masReciente === undefined ? undefined : new Date(masReciente).toISOString(),
    stale,
  };
};

export const staleInventoryMessage = (newestTimestamp?: string): string =>
  newestTimestamp
    ? `El último dato de wazuh-monitoring es de ${newestTimestamp}: un alta o una baja reciente puede no verse todavía.`
    : 'El inventario de wazuh-monitoring no trae ninguna fecha: no se sabe si está al día y un alta o una baja reciente puede no verse.';

export const loadENSAgentInventory = async (): Promise<ENSAgentScope[]> => {
  const respuesta: any = await withRequestTimeout(
    signal => getData().search.search(
      { params: buildMonitoringInventoryRequest() },
      { abortSignal: signal }
    ).toPromise(),
    'inventario de agentes'
  );
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
