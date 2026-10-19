// Agent inventory from `wazuh-monitoring-*`, which Wazuh itself fills every 15 minutes; it replaces the Wazuh API so the plugin needs no credentials. Read as the viewing user.
// The pure part (the query and how its response is read) is in `common/` because the server resolves the scope with the same code as the browser. The browser load is in `public/agents/load-agent-inventory.ts`.
import { ENS_MONITORING_INDEX } from '../constants';
import { ENS_MANAGER_AGENT_ID } from '../ens/core/scope/measurement-planes';
import type { ENSAgentScope } from '../ens/core/scope/types';

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

const agentId = (value: unknown): string => {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) ? text.padStart(3, '0') : text;
};

// The agent's operating system, to detect its type in Configuration (Windows, Linux). Only the text fields used; a never-connected agent has no `os`.
const systemOf = (value: any): ENSAgentScope['os'] => {
  if (!value || typeof value !== 'object') return undefined;
  const os: NonNullable<ENSAgentScope['os']> = {};
  (['platform', 'name', 'version', 'uname'] as const).forEach(field => {
    if (typeof value[field] === 'string' && value[field].trim()) os[field] = value[field].trim();
  });
  return Object.keys(os).length ? os : undefined;
};

const groupsOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(g => String(g).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(g => g.trim()).filter(Boolean);
  return [];
};

export const inventoryFromMonitoring = (aggregations: any, now: number = Date.now()): ENSAgentInventory => {
  let mostRecent: number | undefined;
  // The manager (000) is not written to wazuh-monitoring: its name comes from the `manager` field of the most recent document carrying it. A never-connected agent lacks it, and the pass writes all with the same instant, so the first cannot decide.
  let managerName: string | undefined;
  let managerTimestamp = -Infinity;
  // One agent per normalized id: if two buckets give the same (`24` and `024`), the one with the most recent datum stays; without a date, it counts as the oldest.
  const byId = new Map<string, { agent: ENSAgentScope; timestamp: number }>();

  for (const bucket of aggregations?.agentes?.buckets || []) {
    const doc = bucket?.ultimo?.hits?.hits?.[0]?._source;
    const id = agentId(doc?.id ?? bucket?.key);
    if (!id) continue;

    const timestamp = Date.parse(String(doc?.timestamp ?? ''));
    if (!Number.isNaN(timestamp) && (mostRecent === undefined || timestamp > mostRecent)) mostRecent = timestamp;
    const manager = typeof doc?.manager === 'string' ? doc.manager.trim() : '';
    if (manager && !Number.isNaN(timestamp) && timestamp > managerTimestamp) {
      managerTimestamp = timestamp;
      managerName = manager;
    }

    const order = Number.isNaN(timestamp) ? -Infinity : timestamp;
    const previous = byId.get(id);
    if (previous && previous.timestamp >= order) continue;

    byId.set(id, {
      timestamp: order,
      agent: {
        id,
        name: doc?.name ? String(doc.name) : undefined,
        groups: groupsOf(doc?.group),
        ...(doc?.status ? { status: String(doc.status) } : {}),
        ...(systemOf(doc?.os) ? { os: systemOf(doc?.os) } : {}),
      },
    });
  }

  // A decommissioned agent stops appearing in wazuh-monitoring (a disconnected one keeps appearing, with its status): one with no datum in the last hour of the inventory is dropped, counted from its most recent datum and not the clock, so a stalled inventory does not empty. Without a date it stays.
  const current = (timestamp: number) =>
    mostRecent === undefined || timestamp === -Infinity || mostRecent - timestamp <= ENS_INVENTORY_MAX_AGE_MS;

  const agents = [...byId.values()]
    .filter(v => current(v.timestamp))
    .map(v => v.agent)
    .sort((a, b) => a.id.localeCompare(b.id));

  const stale = mostRecent === undefined || now - mostRecent > ENS_INVENTORY_MAX_AGE_MS;

  // If there is an inventory without a 000, the manager is added: it writes that inventory, so with an up-to-date inventory it is active; if old, unknown and no status is set.
  if (agents.length && !agents.some(a => a.id === ENS_MANAGER_AGENT_ID)) {
    agents.unshift({
      id: ENS_MANAGER_AGENT_ID,
      name: managerName,
      groups: [],
      ...(stale ? {} : { status: 'active' }),
    });
  }

  return {
    agents,
    newestTimestamp: mostRecent === undefined ? undefined : new Date(mostRecent).toISOString(),
    stale,
  };
};

export const staleInventoryMessage = (newestTimestamp?: string): string =>
  newestTimestamp
    ? `El último dato de wazuh-monitoring es de ${newestTimestamp}: un alta o una baja reciente puede no verse todavía.`
    : 'El inventario de wazuh-monitoring no trae ninguna fecha: no se sabe si está al día y un alta o una baja reciente puede no verse.';
