/** Power ENS card on the OpenSearch Dashboards home page. */
import * as fs from 'fs';
import * as path from 'path';
import { buildHomeCard, registerHomeCard, type HomeFeatureCatalogueEntry } from '../public/home-card';

declare const process: { exit(code: number): void };

const failures: string[] = [];
const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${!condition && detail !== '' ? ` — ${String(detail)}` : ''}`);
  if (!condition) failures.push(name);
};

const registered: HomeFeatureCatalogueEntry[] = [];
const home = { featureCatalogue: { register: (e: HomeFeatureCatalogueEntry) => void registered.push(e) } };

check('with home: registers', registerHomeCard(home, '/logo.png') === true);
check('a single card', registered.length === 1, registered.length);
const t = registered[0];
check('id powerEns', t?.id === 'powerEns');
check('title Power ENS', t?.title === 'Power ENS');
check('icon = logo', t?.icon === '/logo.png');
check('opens the app', t?.path === '/app/powerEns');
check('visible on the home page', t?.showOnHomePage === true);
check('section «Manage your data»', t?.category === 'admin');
check('with description', (t?.description ?? '').length > 20);

check('without home: does not fail', registerHomeCard(undefined, '/logo.png') === false);
check('home without catalog: does not fail', registerHomeCard({}, '/logo.png') === false);
const duplicate = { featureCatalogue: { register: () => { throw new Error('Feature with id [powerEns] has already been registered'); } } };
check('repeated id: does not bring the plugin down', registerHomeCard(duplicate, '/logo.png') === false);
check('buildHomeCard is pure', JSON.stringify(buildHomeCard('x')) === JSON.stringify(buildHomeCard('x')));

const plugin = fs.readFileSync(path.join(__dirname, '..', 'public', 'plugin.ts'), 'utf8');
check('plugin.ts registers the card with the logo', /registerHomeCard\(deps\?\.home, ensLogo\)/.test(plugin));

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
