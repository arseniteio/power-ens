/** Agent inventory. */
import { buildMonitoringInventoryRequest, ENS_INVENTORY_MAX_AGE_MS, inventoryFromMonitoring, staleInventoryMessage } from '../common/agents/agent-inventory';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

const bucket = (key: string, source: any) => ({ key, ultimo: { hits: { hits: [{ _source: source }] } } });
const now = Date.parse('2026-10-07T12:30:00Z');
const aggs = {
  agentes: {
    buckets: [
      bucket('028', { id: '028', name: 'ldap', group: ['default', 'ens'], status: 'active', timestamp: '2026-10-07T12:15:00Z' }),
      bucket('024', { id: '024', name: 'real', group: 'ens,ens-copias', status: 'active', timestamp: '2026-10-07T12:15:00Z' }),
      bucket('000', { id: '000', name: 'Wazuh-4', status: 'active', timestamp: '2026-10-07T12:00:00Z' }),
      bucket('24', { id: 24, name: 'numérico', timestamp: '2026-10-07T12:00:00Z' }),
    ],
  },
};
const inv = inventoryFromMonitoring(aggs, now);

check('three agents, by id, without duplicating 024', inv.agents.map(a => a.id).join(',') === '000,024,028', inv.agents.map(a => a.id));
check('for 024 the most recent remains', inv.agents.find(a => a.id === '024')?.name === 'real', inv.agents.find(a => a.id === '024'));
check('groups as a list', JSON.stringify(inv.agents.find(a => a.name === 'ldap')?.groups) === '["default","ens"]');
check('groups as comma-separated text', JSON.stringify(inv.agents.find(a => a.name === 'real')?.groups) === '["ens","ens-copias"]');
check('no groups: empty list', JSON.stringify(inv.agents.find(a => a.id === '000')?.groups) === '[]');
check('numeric id to three digits', inventoryFromMonitoring({ agentes: { buckets: [bucket('7', { id: 7, name: 'solo', timestamp: '2026-10-07T12:15:00Z' })] } }, now).agents.some(a => a.id === '007'));
{
  const v = inventoryFromMonitoring({ agentes: { buckets: [
    bucket('024', { id: '024', name: 'viejo', timestamp: '2026-10-07T12:00:00Z' }),
    bucket('24', { id: 24, name: 'nuevo', timestamp: '2026-10-07T12:15:00Z' }),
  ] } }, now);
  const sinManager = v.agents.filter(a => a.id !== '000');
  check('duplicate: the most recent wins, whenever it arrives', sinManager.length === 1 && sinManager[0].name === 'nuevo', v.agents);
}
check('estado', inv.agents.find(a => a.name === 'ldap')?.status === 'active');
check('the most recent data', inv.newestTimestamp === '2026-10-07T12:15:00.000Z');
check('15 minutes: not stale', inv.stale === false);
check('over 1 h: stale', inventoryFromMonitoring(aggs, now + ENS_INVENTORY_MAX_AGE_MS).stale === true);
check('no buckets: empty and stale', (() => { const v = inventoryFromMonitoring(undefined, now); return v.agents.length === 0 && v.stale; })());
check('stale warning with date', staleInventoryMessage('2026-10-07T12:15:00.000Z').includes('2026-10-07T12:15:00.000Z'));
check('stale warning without date: neither «undefined» nor empty', (() => { const m = staleInventoryMessage(undefined); return !m.includes('undefined') && /no trae ninguna fecha/.test(m); })(), staleInventoryMessage(undefined));
{
  const v = inventoryFromMonitoring({ agentes: { buckets: [
    bucket('024', { id: '024', name: 'real', status: 'active', timestamp: '2026-10-07T12:15:00Z' }),
    bucket('031', { id: '031', name: 'apagada', status: 'disconnected', timestamp: '2026-10-07T12:15:00Z' }),
    bucket('029', { id: '029', name: 'borrada', status: 'active', timestamp: '2026-10-07T09:15:00Z' }),
    bucket('030', { id: '030', name: 'justo 1 h', status: 'active', timestamp: '2026-10-07T11:15:00Z' }),
  ] } }, now);
  const ids = v.agents.map(a => a.id).join(',');
  check('deregistered (3 h behind the most recent data): out of the inventory', !ids.includes('029'), ids);
  check('disconnected but written: stays, with its status', v.agents.find(a => a.id === '031')?.status === 'disconnected', v.agents);
  check('exactly 1 h behind: still in', ids.includes('030'), ids);
  const parado = inventoryFromMonitoring({ agentes: { buckets: [
    bucket('024', { id: '024', name: 'real', timestamp: '2026-10-07T12:15:00Z' }),
  ] } }, now + 6 * ENS_INVENTORY_MAX_AGE_MS);
  check('stopped inventory: stale but not empty', parado.stale && parado.agents.some(a => a.id === '024'), parado);
}
{
  const buckets = [
    bucket('024', { id: '024', name: 'real', status: 'active', timestamp: '2026-10-07T12:00:00Z', manager: 'viejo' }),
    bucket('028', { id: '028', name: 'ldap', status: 'active', timestamp: '2026-10-07T12:15:00Z', manager: 'Wazuh-4' }),
  ];
  const v = inventoryFromMonitoring({ agentes: { buckets } }, now);
  const m = v.agents.find(a => a.id === '000');
  check('without bucket 000: the manager enters', Boolean(m), v.agents);
  check('its name: the manager field of the most recent document', m?.name === 'Wazuh-4', m);
  check('no groups', JSON.stringify(m?.groups) === '[]', m);
  check('up-to-date inventory: active', m?.status === 'active', m);
  const stale = inventoryFromMonitoring({ agentes: { buckets } }, now + 2 * ENS_INVENTORY_MAX_AGE_MS).agents.find(a => a.id === '000');
  check('stale inventory: no status', Boolean(stale) && stale?.status === undefined, stale);
  const sinCampo = inventoryFromMonitoring({ agentes: { buckets: [bucket('024', { id: '024', timestamp: '2026-10-07T12:15:00Z' })] } }, now).agents.find(a => a.id === '000');
  check('no manager field: enters without a name (the scope supplies the fallback)', Boolean(sinCampo) && !sinCampo?.name, sinCampo);
  check('with bucket 000: not duplicated or changed', inv.agents.filter(a => a.id === '000').length === 1 && inv.agents.find(a => a.id === '000')?.name === 'Wazuh-4');
  check('no inventory: the manager is not invented', inventoryFromMonitoring(undefined, now).agents.length === 0);
  const tie = inventoryFromMonitoring({ agentes: { buckets: [
    bucket('033', { id: '033', name: 'nunca', status: 'never_connected', timestamp: '2026-10-07T12:15:00.929Z' }),
    bucket('024', { id: '024', name: 'real', status: 'active', timestamp: '2026-10-07T12:15:00.929Z', manager: 'Wazuh-4' }),
  ] } }, now).agents.find(a => a.id === '000');
  check('the most recent document without a manager field does not delete it', tie?.name === 'Wazuh-4', tie);
  const posterior = inventoryFromMonitoring({ agentes: { buckets: [
    bucket('024', { id: '024', name: 'real', timestamp: '2026-10-07T12:00:00Z', manager: 'Wazuh-4' }),
    bucket('033', { id: '033', name: 'nunca', timestamp: '2026-10-07T12:15:00Z' }),
  ] } }, now).agents.find(a => a.id === '000');
  check('not even if it is later', posterior?.name === 'Wazuh-4', posterior);
}
const q: any = buildMonitoringInventoryRequest();
check('lee wazuh-monitoring-*', q.index === 'wazuh-monitoring-*');
check('asks for the manager field', q.body.aggs.agentes.aggs.ultimo.top_hits._source.includes('manager'));
check('the last document of each agent', q.body.aggs.agentes.aggs.ultimo.top_hits.size === 1 && q.body.aggs.agentes.aggs.ultimo.top_hits.sort[0].timestamp.order === 'desc');

console.log(failures.length ? `\n${failures.length} FALLOS` : '\nTODO OK');
process.exit(failures.length ? 1 : 0);
