/** Names shared by the manifest, constants and scripts are the same. */
import * as fs from 'fs';
import * as path from 'path';
import {
  ENSFACIL_ADMIN_ROLES,
  ENSFACIL_API_BASE,
  ENSFACIL_APP_CATEGORY,
  ENSFACIL_APP_ORDER,
  ENSFACIL_APP_TITLE,
  ENSFACIL_PLUGIN_ID,
} from '../common/constants';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

const root = path.join(__dirname, '..');
const lee = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

check('the manifest id is ENSFACIL_PLUGIN_ID', JSON.parse(lee('opensearch_dashboards.json')).id === ENSFACIL_PLUGIN_ID, JSON.parse(lee('opensearch_dashboards.json')).id);
check('and the package.json name', JSON.parse(lee('package.json')).name === ENSFACIL_PLUGIN_ID);
check('the API hangs from the id', ENSFACIL_API_BASE === `/api/${ENSFACIL_PLUGIN_ID}`, ENSFACIL_API_BASE);
check('build-plugin.sh compiles into plugins/<id>', lee('config/build-plugin.sh').includes(`DEST="$OSD_SRC/plugins/${ENSFACIL_PLUGIN_ID}"`));
check('deploy-plugin.sh accepts the id, and only that', new RegExp(`^\\s*${ENSFACIL_PLUGIN_ID}\\) ;;`, 'm').test(lee('config/deploy-plugin.sh')) && !/^\s*wazuh\|/m.test(lee('config/deploy-plugin.sh')));

check('title ENSFácil', ENSFACIL_APP_TITLE === 'ENSFácil', ENSFACIL_APP_TITLE);
check('order 401', ENSFACIL_APP_ORDER === 401, ENSFACIL_APP_ORDER);
check(
  'Wazuh\'s «Security operations» category',
  JSON.stringify(ENSFACIL_APP_CATEGORY) ===
    JSON.stringify({ id: 'wz-category-security-operations', label: 'Security operations', order: 400, euiIconType: 'securityApp' }),
  ENSFACIL_APP_CATEGORY
);

const role = lee('config/create-admin-role.sh').match(/^ROLE=([A-Za-z0-9_-]+)\s*$/m)?.[1];
check('create-admin-role.sh creates a role', Boolean(role), role);
check('and it is one of ENSFACIL_ADMIN_ROLES', !!role && ENSFACIL_ADMIN_ROLES.includes(role), { rol: role, ENSFACIL_ADMIN_ROLES });
check('con all_access', ENSFACIL_ADMIN_ROLES.includes('all_access'));

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
