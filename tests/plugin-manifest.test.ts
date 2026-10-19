/**
 * El repo es un plugin de OpenSearch Dashboards compilable por sí solo y no
 * depende de ningún plugin de Wazuh.
 *
 *   npx --yes tsx tests/plugin-manifest.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';

declare const process: { exit(code: number): void };

const raiz = path.join(__dirname, '..');
const fallos: string[] = [];
const comprueba = (nombre: string, condicion: boolean, detalle: unknown = ''): void => {
  console.log(`  ${condicion ? 'ok  ' : 'FAIL'} ${nombre}${!condicion && detalle !== '' ? ` — ${String(detalle)}` : ''}`);
  if (!condicion) fallos.push(nombre);
};
const lee = (f: string) => JSON.parse(fs.readFileSync(path.join(raiz, f), 'utf8'));

const manifiesto = lee('opensearch_dashboards.json');
const paquete = lee('package.json');

comprueba('id ensfacil', manifiesto.id === 'ensfacil');
comprueba('dashboard 2.19.5', manifiesto.opensearchDashboardsVersion === '2.19.5');
comprueba('servidor y navegador', manifiesto.server === true && manifiesto.ui === true);
comprueba('requisitos: solo el núcleo', JSON.stringify(manifiesto.requiredPlugins) === '["data","navigation"]');
comprueba('opcionales: seguridad y portada', JSON.stringify(manifiesto.optionalPlugins) === '["securityDashboards","home"]');
comprueba(
  'ningún plugin de Wazuh entre las dependencias',
  ![...(manifiesto.requiredPlugins || []), ...(manifiesto.optionalPlugins || []), ...(manifiesto.requiredBundles || [])]
    .some((p: string) => /wazuh/i.test(p))
);
comprueba('package.json se llama ensfacil', paquete.name === 'ensfacil');
comprueba('misma versión de dashboard en package.json', paquete.opensearchDashboards?.version === '2.19.5');
comprueba('misma versión del plugin en los dos', paquete.version === manifiesto.version);
comprueba('pdfmake propio, 0.2.7', paquete.dependencies?.pdfmake === '0.2.7');
comprueba('re2js propio, 2.8.6', paquete.dependencies?.re2js === '2.8.6');

for (const f of [
  'public/index.ts', 'public/plugin.ts', 'public/application.tsx', 'public/services.ts',
  'server/index.ts', 'server/plugin.ts', 'common/constants.ts',
  'public/ens/index.ts', 'public/ens-requirements.ts', 'public/assets/ens-logo.png', 'public/home-card.ts',
]) {
  comprueba(`existe ${f}`, fs.existsSync(path.join(raiz, f)));
}

for (const f of ['dashboard/ens', 'dashboard/app-router.tsx', 'dashboard/ens-requirements.ts']) {
  comprueba(`ya no existe ${f}`, !fs.existsSync(path.join(raiz, f)));
}

console.log(fallos.length ? `\n${fallos.length} FAILURES` : '\nALL OK');
process.exit(fallos.length ? 1 : 0);
