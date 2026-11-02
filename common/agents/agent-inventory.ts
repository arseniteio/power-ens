import { ENS_MONITORING_INDEX } from '../constants';
import { ENS_MANAGER_AGENT_ID } from '../ens/core/scope/measurement-planes';
import type { ENSAgentScope } from '../ens/core/scope/types';
import { dateTimeLabel } from '../ens/core/date-label';

const ENS_INVENTORY_MAX_AGE_MS = 60 * 60 * 1000;

interface ENSAgentInventory {
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
  let managerName: string | undefined;
  let managerTimestamp = -Infinity;
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

  const current = (timestamp: number) =>
    mostRecent === undefined || timestamp === -Infinity || mostRecent - timestamp <= ENS_INVENTORY_MAX_AGE_MS;

  const agents = [...byId.values()]
    .filter(v => current(v.timestamp))
    .map(v => v.agent)
    .sort((a, b) => a.id.localeCompare(b.id));

  const stale = mostRecent === undefined || now - mostRecent > ENS_INVENTORY_MAX_AGE_MS;

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
    ? `Inventario de agentes sin actualizar desde ${dateTimeLabel(newestTimestamp)}.`
    : 'Inventario de agentes sin fecha.';
