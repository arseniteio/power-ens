/**
 *   npx --yes tsx tests/agent-inventory.test.ts
 */
import { buildMonitoringInventoryRequest, ENS_INVENTORY_MAX_AGE_MS, inventoryFromMonitoring, staleInventoryMessage } from '../common/agents/agent-inventory';

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

// `24` y `024` son el mismo agente: queda uno, el del dato más reciente.
comprueba('tres agentes, por id, sin duplicar el 024', inv.agents.map(a => a.id).join(',') === '000,024,028', inv.agents.map(a => a.id));
comprueba('del 024 queda el más reciente', inv.agents.find(a => a.id === '024')?.name === 'real', inv.agents.find(a => a.id === '024'));
comprueba('grupos como lista', JSON.stringify(inv.agents.find(a => a.name === 'ldap')?.groups) === '["default","ens"]');
comprueba('grupos como texto con comas', JSON.stringify(inv.agents.find(a => a.name === 'real')?.groups) === '["ens","ens-copias"]');
comprueba('sin grupos: lista vacía', JSON.stringify(inv.agents.find(a => a.id === '000')?.groups) === '[]');
comprueba('id numérico a tres cifras', inventoryFromMonitoring({ agentes: { buckets: [cubo('7', { id: 7, name: 'solo', timestamp: '2026-10-07T12:15:00Z' })] } }, ahora).agents.some(a => a.id === '007'));
{
  // El orden de los cubos no decide: gana el más reciente aunque llegue después.
  const v = inventoryFromMonitoring({ agentes: { buckets: [
    cubo('024', { id: '024', name: 'viejo', timestamp: '2026-10-07T12:00:00Z' }),
    cubo('24', { id: 24, name: 'nuevo', timestamp: '2026-10-07T12:15:00Z' }),
  ] } }, ahora);
  const sinManager = v.agents.filter(a => a.id !== '000');
  comprueba('duplicado: gana el más reciente, llegue cuando llegue', sinManager.length === 1 && sinManager[0].name === 'nuevo', v.agents);
}
comprueba('estado', inv.agents.find(a => a.name === 'ldap')?.status === 'active');
comprueba('el dato más reciente', inv.newestTimestamp === '2026-10-07T12:15:00.000Z');
comprueba('15 minutos: no está antiguo', inv.stale === false);
comprueba('más de 1 h: antiguo', inventoryFromMonitoring(aggs, ahora + ENS_INVENTORY_MAX_AGE_MS).stale === true);
comprueba('sin cubos: vacío y antiguo', (() => { const v = inventoryFromMonitoring(undefined, ahora); return v.agents.length === 0 && v.stale; })());
comprueba('aviso de antiguo con fecha', staleInventoryMessage('2026-10-07T12:15:00.000Z').includes('2026-10-07T12:15:00.000Z'));
comprueba('aviso de antiguo sin fecha: ni «undefined» ni vacío', (() => { const m = staleInventoryMessage(undefined); return !m.includes('undefined') && /no trae ninguna fecha/.test(m); })(), staleInventoryMessage(undefined));
{
  // Un agente dado de baja deja de escribirse en wazuh-monitoring: su último
  // dato se queda atrás. Uno desconectado se sigue escribiendo y se queda.
  const v = inventoryFromMonitoring({ agentes: { buckets: [
    cubo('024', { id: '024', name: 'real', status: 'active', timestamp: '2026-10-07T12:15:00Z' }),
    cubo('031', { id: '031', name: 'apagada', status: 'disconnected', timestamp: '2026-10-07T12:15:00Z' }),
    cubo('029', { id: '029', name: 'borrada', status: 'active', timestamp: '2026-10-07T09:15:00Z' }),
    cubo('030', { id: '030', name: 'justo 1 h', status: 'active', timestamp: '2026-10-07T11:15:00Z' }),
  ] } }, ahora);
  const ids = v.agents.map(a => a.id).join(',');
  comprueba('dado de baja (3 h por detrás del dato más reciente): fuera del inventario', !ids.includes('029'), ids);
  comprueba('desconectado pero escrito: se queda, con su estado', v.agents.find(a => a.id === '031')?.status === 'disconnected', v.agents);
  comprueba('justo 1 h por detrás: todavía dentro', ids.includes('030'), ids);
  // Se cuenta desde el dato más reciente, no desde el reloj: un inventario
  // parado se avisa como antiguo pero no se vacía.
  const parado = inventoryFromMonitoring({ agentes: { buckets: [
    cubo('024', { id: '024', name: 'real', timestamp: '2026-10-07T12:15:00Z' }),
  ] } }, ahora + 6 * ENS_INVENTORY_MAX_AGE_MS);
  comprueba('inventario parado: antiguo pero no vacío', parado.stale && parado.agents.some(a => a.id === '024'), parado);
}
{
  // El manager (000) no está en wazuh-monitoring: entra con el nombre del campo
  // `manager` del documento más reciente, sin grupos, y activo si el
  // inventario está al día.
  const buckets = [
    cubo('024', { id: '024', name: 'real', status: 'active', timestamp: '2026-10-07T12:00:00Z', manager: 'viejo' }),
    cubo('028', { id: '028', name: 'ldap', status: 'active', timestamp: '2026-10-07T12:15:00Z', manager: 'Wazuh-4' }),
  ];
  const v = inventoryFromMonitoring({ agentes: { buckets } }, ahora);
  const m = v.agents.find(a => a.id === '000');
  comprueba('sin cubo 000: el manager entra', Boolean(m), v.agents);
  comprueba('su nombre: el campo manager del documento más reciente', m?.name === 'Wazuh-4', m);
  comprueba('sin grupos', JSON.stringify(m?.groups) === '[]', m);
  comprueba('inventario al día: activo', m?.status === 'active', m);
  const antiguo = inventoryFromMonitoring({ agentes: { buckets } }, ahora + 2 * ENS_INVENTORY_MAX_AGE_MS).agents.find(a => a.id === '000');
  comprueba('inventario antiguo: sin estado', Boolean(antiguo) && antiguo?.status === undefined, antiguo);
  const sinCampo = inventoryFromMonitoring({ agentes: { buckets: [cubo('024', { id: '024', timestamp: '2026-10-07T12:15:00Z' })] } }, ahora).agents.find(a => a.id === '000');
  comprueba('sin campo manager: entra sin nombre (el alcance pone el de reserva)', Boolean(sinCampo) && !sinCampo?.name, sinCampo);
  comprueba('con cubo 000: no se duplica ni se cambia', inv.agents.filter(a => a.id === '000').length === 1 && inv.agents.find(a => a.id === '000')?.name === 'Wazuh-4');
  comprueba('sin inventario: no se inventa el manager', inventoryFromMonitoring(undefined, ahora).agents.length === 0);
  // En wazuh4, la pasada escribe todos con el mismo instante y el agente que
  // nunca se ha conectado no trae `manager`: no puede dejar al manager sin nombre.
  const empate = inventoryFromMonitoring({ agentes: { buckets: [
    cubo('033', { id: '033', name: 'nunca', status: 'never_connected', timestamp: '2026-10-07T12:15:00.929Z' }),
    cubo('024', { id: '024', name: 'real', status: 'active', timestamp: '2026-10-07T12:15:00.929Z', manager: 'Wazuh-4' }),
  ] } }, ahora).agents.find(a => a.id === '000');
  comprueba('el documento más reciente sin campo manager no lo borra', empate?.name === 'Wazuh-4', empate);
  const posterior = inventoryFromMonitoring({ agentes: { buckets: [
    cubo('024', { id: '024', name: 'real', timestamp: '2026-10-07T12:00:00Z', manager: 'Wazuh-4' }),
    cubo('033', { id: '033', name: 'nunca', timestamp: '2026-10-07T12:15:00Z' }),
  ] } }, ahora).agents.find(a => a.id === '000');
  comprueba('ni aunque sea posterior', posterior?.name === 'Wazuh-4', posterior);
}
const q: any = buildMonitoringInventoryRequest();
comprueba('lee wazuh-monitoring-*', q.index === 'wazuh-monitoring-*');
comprueba('pide el campo manager', q.body.aggs.agentes.aggs.ultimo.top_hits._source.includes('manager'));
comprueba('el último documento de cada agente', q.body.aggs.agentes.aggs.ultimo.top_hits.size === 1 && q.body.aggs.agentes.aggs.ultimo.top_hits.sort[0].timestamp.order === 'desc');

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
