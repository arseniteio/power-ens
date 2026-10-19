/** Router search. */
import { readFileSync } from 'fs';
import { parseRouterSearch, withRouterSearch } from '../public/routing/router-search';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

check('reads control and agentId', JSON.stringify(parseRouterSearch('?tabView=plugins&control=op.acc.1&agentId=024')) === '{"tabView":"plugins","control":"op.acc.1","agentId":"024"}');
check('sin ?', parseRouterSearch('control=mp.info.6').control === 'mp.info.6');
check('empty', JSON.stringify(parseRouterSearch('')) === '{}');
check('changes and keeps the rest', withRouterSearch('?tabView=controls&agentId=024', { agentId: '028' }) === '?tabView=controls&agentId=028');
check('removes with undefined', withRouterSearch('?tabView=controls&agentId=024', { agentId: undefined }) === '?tabView=controls');
check('removing everything leaves it empty', withRouterSearch('?agentId=024', { agentId: '' }) === '');

check('back from the detail: the control goes, the rest stays', withRouterSearch('?tabView=plugins&control=op.acc.1&agentId=024', { control: undefined }) === '?tabView=plugins&agentId=024');
{
  const controles = readFileSync(`${__dirname}/../public/ens/controls/index.tsx`, 'utf8');
  const goBack = controles.match(/onBack=\{\(\) => ([^\n]*)\}/)?.[1] || '';
  check('«Volver» removes the control from the URL', /updateUrl\(\{ control: undefined \}\)/.test(goBack) && !/setSelectedControl/.test(controles), goBack);
}

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
