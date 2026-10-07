/**
 *   npx --yes tsx tests/router-search.test.ts
 */
// Las funciones puras, sin React: `use-router-search` las reexporta junto a
// los hooks, que necesitan react-router-dom y no cargan fuera del dashboard.
import { parseRouterSearch, withRouterSearch } from '../public/routing/router-search';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

comprueba('lee control y agentId', JSON.stringify(parseRouterSearch('?tabView=plugins&control=op.acc.1&agentId=024')) === '{"tabView":"plugins","control":"op.acc.1","agentId":"024"}');
comprueba('sin ?', parseRouterSearch('control=mp.info.6').control === 'mp.info.6');
comprueba('vacío', JSON.stringify(parseRouterSearch('')) === '{}');
comprueba('cambia y conserva el resto', withRouterSearch('?tabView=controls&agentId=024', { agentId: '028' }) === '?tabView=controls&agentId=028');
comprueba('quita con undefined', withRouterSearch('?tabView=controls&agentId=024', { agentId: undefined }) === '?tabView=controls');
comprueba('quitarlo todo deja vacío', withRouterSearch('?agentId=024', { agentId: '' }) === '');

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
