/**
 * Los nombres que comparten el manifiesto, las constantes y los scripts son
 * los mismos, y son los de las restricciones globales del plan: cambiar uno
 * en un sitio y no en otro rompe el plugin sin que nada lo diga.
 *
 *   npx --yes tsx tests/shared-names.test.ts
 */
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
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

const raiz = path.join(__dirname, '..');
const lee = (f: string) => fs.readFileSync(path.join(raiz, f), 'utf8');

// El id: manifiesto, package.json, rutas del servidor y scripts.
comprueba('el id del manifiesto es ENSFACIL_PLUGIN_ID', JSON.parse(lee('opensearch_dashboards.json')).id === ENSFACIL_PLUGIN_ID, JSON.parse(lee('opensearch_dashboards.json')).id);
comprueba('y el nombre del package.json', JSON.parse(lee('package.json')).name === ENSFACIL_PLUGIN_ID);
comprueba('la API cuelga del id', ENSFACIL_API_BASE === `/api/${ENSFACIL_PLUGIN_ID}`, ENSFACIL_API_BASE);
comprueba('build-plugin.sh compila en plugins/<id>', lee('config/build-plugin.sh').includes(`DEST="$OSD_SRC/plugins/${ENSFACIL_PLUGIN_ID}"`));
comprueba('deploy-plugin.sh acepta el id, y solo ese', new RegExp(`^\\s*${ENSFACIL_PLUGIN_ID}\\) ;;`, 'm').test(lee('config/deploy-plugin.sh')) && !/^\s*wazuh\|/m.test(lee('config/deploy-plugin.sh')));

// La app, como en las restricciones globales del plan.
comprueba('título ENSFácil', ENSFACIL_APP_TITLE === 'ENSFácil', ENSFACIL_APP_TITLE);
comprueba('orden 401', ENSFACIL_APP_ORDER === 401, ENSFACIL_APP_ORDER);
comprueba(
  'categoría «Security operations» de Wazuh',
  JSON.stringify(ENSFACIL_APP_CATEGORY) ===
    JSON.stringify({ id: 'wz-category-security-operations', label: 'Security operations', order: 400, euiIconType: 'securityApp' }),
  ENSFACIL_APP_CATEGORY
);

// El rol que crea el script es uno de los que el servidor deja administrar.
const rol = lee('config/create-admin-role.sh').match(/^ROL=([A-Za-z0-9_-]+)\s*$/m)?.[1];
comprueba('create-admin-role.sh crea un rol', Boolean(rol), rol);
comprueba('y es uno de ENSFACIL_ADMIN_ROLES', !!rol && ENSFACIL_ADMIN_ROLES.includes(rol), { rol, ENSFACIL_ADMIN_ROLES });
comprueba('con all_access', ENSFACIL_ADMIN_ROLES.includes('all_access'));

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
