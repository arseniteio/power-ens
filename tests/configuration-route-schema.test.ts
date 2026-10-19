/** The save route accepts every key the browser sends: its body schema forbids any other (OSD `schema.object`). */
import { existsSync } from 'fs';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
declare const require: any;
declare const __dirname: string;

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  if (!ok) failures.push(name);
};

// The dashboard's own package when reachable (CI build image, a dashboard install, or the variable); else the stand-in.
const REAL = [
  process.env.ENSFACIL_OSD_CONFIG_SCHEMA,
  '/osd/node_modules/@osd/config-schema',
  '/usr/share/wazuh-dashboard/node_modules/@osd/config-schema',
].find(path => path && existsSync(path));
const configSchema = REAL ? require(REAL) : require('./fixtures/osd-config-schema');
console.log(`  schema: ${REAL ? `@osd/config-schema from ${REAL}` : 'stand-in (tests/fixtures/osd-config-schema.ts)'}`);

const Module = require('module');
const load = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  if (request === '@osd/config-schema') return configSchema;
  if (/kibana-services$/.test(request)) return {};
  return load.call(this, request, ...rest);
};

const { registerConfigurationRoutes } = require('../server/routes/configuration');
const { ENSFACIL_CONFIGURATION_PATH } = require('../common/constants');
const client = require('../common/ens/configuration/services/configuration-http-client');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');

const routes: { method: string; path: string; validate: any }[] = [];
const router = {
  get: (config: any) => routes.push({ method: 'GET', ...config }),
  put: (config: any) => routes.push({ method: 'PUT', ...config }),
  post: (config: any) => routes.push({ method: 'POST', ...config }),
};
registerConfigurationRoutes(router, { logger: { info() {}, warn() {}, error() {}, debug() {} }, securityEnabled: true });
const save = routes.find(route => route.method === 'PUT' && route.path === ENSFACIL_CONFIGURATION_PATH)!;

// The bodies the browser really sends, through its own client.
const bodies: any[] = [];
client.setENSConfigurationHttp(() => ({
  get: async () => ({}),
  put: async (_path: string, options: any) => {
    bodies.push(JSON.parse(options.body));
    return { statusCode: 200, error: 0, data: { configuration: null, metadata: null } };
  },
}));

const validate = (body: unknown): string | undefined => {
  try {
    save.validate.body.validate(body, {}, 'request body');
    return undefined;
  } catch (error: any) {
    return error?.message || String(error);
  }
};

(async () => {
  const configuration = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
  await client.saveENSConfiguration(configuration, 'Cambio de prueba.', { seqNo: 4, primaryTerm: 1 });
  await client.saveENSConfiguration(configuration, 'Primer guardado.', null);
  await client.saveENSConfiguration(configuration);
  const keys = Array.from(new Set(bodies.flatMap(body => Object.keys(body)))).sort();
  check('the browser sends configuration, changeReason and expectedVersion', JSON.stringify(keys) === '["changeReason","configuration","expectedVersion"]', keys);
  bodies.forEach((body, index) => check(`the route accepts the browser body ${index + 1} (${Object.keys(body).join(', ')})`, validate(body) === undefined, validate(body)));
  check('a body with a key the route does not declare is refused (a missing key fails here)', /request body\.otraClave\]: definition for this key is missing/.test(validate({ ...bodies[0], otraClave: 1 }) || ''), validate({ ...bodies[0], otraClave: 1 }));
  check('a malformed version is refused', !!validate({ ...bodies[0], expectedVersion: { seqNo: 'x', primaryTerm: 1 } }));

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
