/**
 *   npx --yes tsx tests/agent-inventory.test.ts
 */
import { buildMonitoringInventoryRequest, ENS_INVENTORY_MAX_AGE_MS, inventoryFromMonitoring } from '../public/agents/agent-inventory';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

const cubo = (key: string, source: any) => ({ key, ultimo: { hits: { hits: [{ _source: source }] } } });
const ahora = Date.parse('2026-10-07T12:30:00Z');
const aggs = {
  agentes: {
    buckets: [
      cubo('028', { id: '028', name: 'ldap', group: ['default', 'ens'], status: 'active', timestamp: '2026-10-07T12:15:00Z' }),
      cubo('024', { id: '024', name: 'real', group: 'ens,ens-copias', status: 'active', timestamp: '2026-10-07T12:15:00Z' }),
      cubo('000', { id: '000', name: 'Wazuh-4', status: 'active', timestamp: '2026-10-07T12:00:00Z' }),
      cubo('24', { id: 24, name: 'numérico', timestamp: '2026-10-07T12:00:00Z' }),
    ],
  },
};
const inv = inventoryFromMonitoring(aggs, ahora);

comprueba('cuatro agentes, por id', inv.agents.map(a => a.id).join(',') === '000,024,024,028', inv.agents.map(a => a.id));
comprueba('grupos como lista', JSON.stringify(inv.agents.find(a => a.name === 'ldap')?.groups) === '["default","ens"]');
comprueba('grupos como texto con comas', JSON.stringify(inv.agents.find(a => a.name === 'real')?.groups) === '["ens","ens-copias"]');
comprueba('sin grupos: lista vacía', JSON.stringify(inv.agents.find(a => a.id === '000')?.groups) === '[]');
comprueba('id numérico a tres cifras', inv.agents.some(a => a.name === 'numérico' && a.id === '024'));
comprueba('estado', inv.agents.find(a => a.name === 'ldap')?.status === 'active');
comprueba('el dato más reciente', inv.newestTimestamp === '2026-10-07T12:15:00.000Z');
comprueba('15 minutos: no está antiguo', inv.stale === false);
comprueba('más de 1 h: antiguo', inventoryFromMonitoring(aggs, ahora + ENS_INVENTORY_MAX_AGE_MS).stale === true);
comprueba('sin cubos: vacío y antiguo', (() => { const v = inventoryFromMonitoring(undefined, ahora); return v.agents.length === 0 && v.stale; })());
const q: any = buildMonitoringInventoryRequest();
comprueba('lee wazuh-monitoring-*', q.index === 'wazuh-monitoring-*');
comprueba('el último documento de cada agente', q.body.aggs.agentes.aggs.ultimo.top_hits.size === 1 && q.body.aggs.agentes.aggs.ultimo.top_hits.sort[0].timestamp.order === 'desc');

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
