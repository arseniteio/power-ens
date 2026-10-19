/**
 * Tarjeta de ENSFácil en la portada de OpenSearch Dashboards.
 *
 *   npx --yes tsx tests/home-card.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildHomeCard, registerHomeCard, type HomeFeatureCatalogueEntry } from '../public/home-card';

declare const process: { exit(code: number): void };

const fallos: string[] = [];
const comprueba = (nombre: string, condicion: boolean, detalle: unknown = ''): void => {
  console.log(`  ${condicion ? 'ok  ' : 'FAIL'} ${nombre}${!condicion && detalle !== '' ? ` — ${String(detalle)}` : ''}`);
  if (!condicion) fallos.push(nombre);
};

const registradas: HomeFeatureCatalogueEntry[] = [];
const home = { featureCatalogue: { register: (e: HomeFeatureCatalogueEntry) => void registradas.push(e) } };

comprueba('con home: registra', registerHomeCard(home, '/logo.png') === true);
comprueba('una sola tarjeta', registradas.length === 1, registradas.length);
const t = registradas[0];
comprueba('id ensfacil', t?.id === 'ensfacil');
comprueba('título ENSFácil', t?.title === 'ENSFácil');
comprueba('icono = logo', t?.icon === '/logo.png');
comprueba('abre la app', t?.path === '/app/ensfacil');
comprueba('visible en la portada', t?.showOnHomePage === true);
comprueba('sección «Manage your data»', t?.category === 'admin');
comprueba('con descripción', (t?.description ?? '').length > 20);

comprueba('sin home: no falla', registerHomeCard(undefined, '/logo.png') === false);
comprueba('home sin catálogo: no falla', registerHomeCard({}, '/logo.png') === false);
const repetida = { featureCatalogue: { register: () => { throw new Error('Feature with id [ensfacil] has already been registered'); } } };
comprueba('id repetido: no tumba el plugin', registerHomeCard(repetida, '/logo.png') === false);
comprueba('buildHomeCard es puro', JSON.stringify(buildHomeCard('x')) === JSON.stringify(buildHomeCard('x')));

const plugin = fs.readFileSync(path.join(__dirname, '..', 'public', 'plugin.ts'), 'utf8');
comprueba('plugin.ts registra la tarjeta con el logo', /registerHomeCard\(deps\?\.home, ensLogo\)/.test(plugin));

console.log(fallos.length ? `\n${fallos.length} FAILURES` : '\nALL OK');
process.exit(fallos.length ? 1 : 0);
