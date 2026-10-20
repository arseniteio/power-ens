/** The repo is a self-contained, buildable OpenSearch Dashboards plugin with no dependency on a Wazuh plugin. */
import * as fs from 'fs';
import * as path from 'path';

declare const process: { exit(code: number): void };

const root = path.join(__dirname, '..');
const failures: string[] = [];
const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${!condition && detail !== '' ? ` — ${String(detail)}` : ''}`);
  if (!condition) failures.push(name);
};
const lee = (f: string) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

const manifest = lee('opensearch_dashboards.json');
const pkg = lee('package.json');

check('id ensfacil', manifest.id === 'ensfacil');
check('dashboard 2.19.5', manifest.opensearchDashboardsVersion === '2.19.5');
check('server and browser', manifest.server === true && manifest.ui === true);
check('requirements: only the core', JSON.stringify(manifest.requiredPlugins) === '["data","navigation"]');
check('optional: security and home', JSON.stringify(manifest.optionalPlugins) === '["securityDashboards","home"]');
check(
  'no Wazuh plugin among the dependencies',
  ![...(manifest.requiredPlugins || []), ...(manifest.optionalPlugins || []), ...(manifest.requiredBundles || [])]
    .some((p: string) => /wazuh/i.test(p))
);
check('package.json is named ensfacil', pkg.name === 'ensfacil');
check('same dashboard version in package.json', pkg.opensearchDashboards?.version === '2.19.5');
check('same plugin version in both', pkg.version === manifest.version);
// The annual report header writes this constant: a release that bumps the manifest bumps it too.
const constants = fs.readFileSync(path.join(root, 'common/constants.ts'), 'utf8');
check('ENSFACIL_PLUGIN_VERSION equals the manifest version', constants.includes(`ENSFACIL_PLUGIN_VERSION = '${manifest.version}'`));
check('own pdfmake, 0.2.7', pkg.dependencies?.pdfmake === '0.2.7');
check('own re2js, 2.8.6', pkg.dependencies?.re2js === '2.8.6');

for (const f of [
  'public/index.ts', 'public/plugin.ts', 'public/application.tsx', 'public/services.ts',
  'server/index.ts', 'server/plugin.ts', 'common/constants.ts',
  'public/ens/index.ts', 'public/ens-requirements.ts', 'public/assets/ens-logo.png', 'public/home-card.ts',
]) {
  check(`${f} exists`, fs.existsSync(path.join(root, f)));
}

for (const f of ['dashboard/ens', 'dashboard/app-router.tsx', 'dashboard/ens-requirements.ts']) {
  check(`${f} no longer exists`, !fs.existsSync(path.join(root, f)));
}

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
