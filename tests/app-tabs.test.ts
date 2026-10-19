/**
 *   npx --yes tsx tests/app-tabs.test.ts
 */
import { ENS_TABS, resolveTab } from '../public/app/tabs';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

comprueba(
  'las pestañas de hoy, en su orden e ids',
  JSON.stringify(ENS_TABS.map(t => [t.id, t.name])) ===
    JSON.stringify([
      ['dashboard', 'Panel'], ['overview', 'Vista general'], ['configuration', 'Configuración'], ['controls', 'Controles'],
      ['plugins', 'Detalle del control'], ['ens-informes', 'Informes'], ['evidences', 'Evidencias'], ['events', 'Eventos'],
    ]),
  ENS_TABS.map(t => t.id)
);
comprueba('Configuración se carga sola; el resto, tras cargar configuración y alcance', ENS_TABS.filter(t => !t.withBootstrap).map(t => t.id).join() === 'configuration');
comprueba('sin tabView: Panel', resolveTab(undefined).id === 'dashboard');
comprueba('tabView desconocido: Panel', resolveTab('no-existe').id === 'dashboard');
comprueba('tabView válido', resolveTab('plugins').id === 'plugins');

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
