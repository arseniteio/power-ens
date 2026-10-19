/** App tabs. */
import { ENS_TABS, resolveTab } from '../public/app/tabs';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

check(
  'today\'s tabs, in their order and ids',
  JSON.stringify(ENS_TABS.map(t => [t.id, t.name])) ===
    JSON.stringify([
      ['dashboard', 'Panel'], ['overview', 'Vista general'], ['configuration', 'Configuración'], ['controls', 'Controles'],
      ['plugins', 'Detalle del control'], ['ens-informes', 'Informes'], ['evidences', 'Evidencias'], ['events', 'Eventos'],
    ]),
  ENS_TABS.map(t => t.id)
);
check('Configuration loads on its own; the rest, after loading configuration and scope', ENS_TABS.filter(t => !t.withBootstrap).map(t => t.id).join() === 'configuration');
check('no tabView: Panel', resolveTab(undefined).id === 'dashboard');
check('unknown tabView: Panel', resolveTab('no-existe').id === 'dashboard');
check('valid tabView', resolveTab('plugins').id === 'plugins');

console.log(failures.length ? `\n${failures.length} FALLOS` : '\nTODO OK');
process.exit(failures.length ? 1 : 0);
