/** The save route accepts every key the browser sends, and hands the handler what it sent (OSD `schema.object`). */
import { existsSync } from 'fs';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
declare const require: any;

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  if (!ok) failures.push(name);
};

// Always the stand-in; and the dashboard's own package when reachable (build image, a dashboard install, the variable).
const REAL = [
  process.env.POWER_ENS_OSD_CONFIG_SCHEMA,
  '/osd/node_modules/@osd/config-schema',
  '/usr/share/wazuh-dashboard/node_modules/@osd/config-schema',
].find(path => path && existsSync(path));
const SCHEMAS: { label: string; module: any }[] = [
  { label: 'stand-in (tests/fixtures/osd-config-schema.ts)', module: require('./fixtures/osd-config-schema') },
  ...(REAL ? [{ label: `@osd/config-schema from ${REAL}`, module: require(REAL) }] : []),
];
if (!REAL) console.log('  (the real @osd/config-schema is not reachable here: only the stand-in runs)');

let current: any;
const Module = require('module');
const load = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  if (request === '@osd/config-schema') return current;
  if (/kibana-services$/.test(request)) return {};
  return load.call(this, request, ...rest);
};

const client = require('../common/ens/configuration/services/configuration-http-client');
const { POWER_ENS_CONFIGURATION_PATH } = require('../common/constants');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const ROUTES = require.resolve('../server/routes/configuration');

// The bodies the browser really sends, through its own client.
const bodies: any[] = [];
client.setENSConfigurationHttp(() => ({
  get: async () => ({}),
  put: async (_path: string, options: any) => {
    bodies.push(JSON.parse(options.body));
    return { statusCode: 200, error: 0, data: { configuration: null, metadata: null } };
  },
}));

(async () => {
  const configuration = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
  await client.saveENSConfiguration(configuration, 'Cambio de prueba.', { seqNo: 4, primaryTerm: 1 });
  await client.saveENSConfiguration(configuration, 'Primer guardado.', null);
  await client.saveENSConfiguration(configuration);
  const keys = Array.from(new Set(bodies.flatMap(body => Object.keys(body)))).sort();
  check('the browser sends configuration, changeReason and expectedVersion', JSON.stringify(keys) === '["changeReason","configuration","expectedVersion"]', keys);

  SCHEMAS.forEach(({ label, module }) => {
    console.log(`  schema: ${label}`);
    current = module;
    delete require.cache[ROUTES];
    const { registerConfigurationRoutes } = require(ROUTES);
    const routes: any[] = [];
    const router = {
      get: (config: any) => routes.push({ method: 'GET', ...config }),
      put: (config: any) => routes.push({ method: 'PUT', ...config }),
      post: (config: any) => routes.push({ method: 'POST', ...config }),
    };
    registerConfigurationRoutes(router, { logger: { info() {}, warn() {}, error() {}, debug() {} }, securityEnabled: true });
    const save = routes.find(route => route.method === 'PUT' && route.path === POWER_ENS_CONFIGURATION_PATH);
    // What the handler receives: the schema's validated output, or the error the route answers with.
    const handed = (body: unknown): { value?: any; error?: string } => {
      try {
        return { value: save.validate.body.validate(body, {}, 'request body') };
      } catch (error: any) {
        return { error: error?.message || String(error) };
      }
    };
    const [withVersion, withNull, without] = bodies.map(handed);
    check(`${label}: a version reaches the handler as the object sent`, !withVersion.error && JSON.stringify(withVersion.value.expectedVersion) === '{"seqNo":4,"primaryTerm":1}', withVersion);
    check(`${label}: null reaches it as null («there was none»)`, !withNull.error && withNull.value.expectedVersion === null, withNull);
    check(`${label}: an absent key reaches it as undefined (an old client is not «expects none»)`, !without.error && without.value.expectedVersion === undefined, without);
    check(`${label}: changeReason and configuration reach it`, withVersion.value?.changeReason === 'Cambio de prueba.' && typeof withVersion.value?.configuration === 'object');
    check(`${label}: a key the route does not declare is refused (a missing key fails here)`, /request body\.otraClave\]: definition for this key is missing/.test(handed({ ...bodies[0], otraClave: 1 }).error || ''), handed({ ...bodies[0], otraClave: 1 }));
    check(`${label}: a malformed version is refused`, !!handed({ ...bodies[0], expectedVersion: { seqNo: 'x', primaryTerm: 1 } }).error);
  });

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
