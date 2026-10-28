/** The maturity routes accept every key the browser sends, and hand the handler what it sent (OSD `schema.object`). */
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

const http = require('../common/ens/configuration/services/configuration-http-client');
const client = require('../common/ens/maturity/maturity-http-client');
const { POWER_ENS_MATURITY_PATH } = require('../common/constants');
const ROUTES = require.resolve('../server/routes/maturity');

// What the browser really sends, through its own client.
const bodies: any[] = [];
const queries: any[] = [];
http.setENSConfigurationHttp(() => ({
  get: async (_path: string, options: any) => {
    queries.push(options.query);
    return { statusCode: 200, error: 0, data: { snapshots: [] } };
  },
  put: async (_path: string, options: any) => {
    bodies.push(JSON.parse(options.body));
    return { statusCode: 200, error: 0, data: { configuration: {}, metadata: {}, record: {} } };
  },
}));

(async () => {
  const assessment = { level: 3, reviewer: 'Luis', date: '2026-10-19', justification: 'Revisado' };
  await client.saveMaturityEntry({ controlId: 'op.acc.1', kind: 'assessment', entry: assessment, expectedVersion: { seqNo: 4, primaryTerm: 1 } });
  await client.saveMaturityEntry({ controlId: 'op.acc.1', kind: 'review', entry: { date: '2026-10-01', reviewer: 'Ana', result: 'CONFORME', actions: '' }, expectedVersion: null });
  await client.saveMaturityEntry({ controlId: 'op.acc.1', kind: 'indicators', entry: { minScore: 80, reviewPeriodDays: 365 }, expectedVersion: { seqNo: 5, primaryTerm: 1 } });
  await client.fetchMaturitySnapshots({ from: '2026-01-01', to: '2026-10-20', controlId: 'op.acc.1' });
  await client.fetchMaturitySnapshots({ from: '2026-01-01', to: '2026-10-20' });
  const keys = Array.from(new Set(bodies.flatMap(body => Object.keys(body)))).sort();
  check('the browser sends controlId, kind, entry and expectedVersion', JSON.stringify(keys) === '["controlId","entry","expectedVersion","kind"]', keys);

  SCHEMAS.forEach(({ label, module }) => {
    console.log(`  schema: ${label}`);
    current = module;
    delete require.cache[ROUTES];
    const { registerMaturityRoutes } = require(ROUTES);
    const routes: any[] = [];
    const router = {
      get: (config: any) => routes.push({ method: 'GET', ...config }),
      put: (config: any) => routes.push({ method: 'PUT', ...config }),
      post: (config: any) => routes.push({ method: 'POST', ...config }),
    };
    registerMaturityRoutes(router, { logger: { info() {}, warn() {}, error() {}, debug() {} }, securityEnabled: true, maturity: {} });
    const save = routes.find(route => route.method === 'PUT' && route.path === POWER_ENS_MATURITY_PATH);
    const read = routes.find(route => route.method === 'GET' && route.path === `${POWER_ENS_MATURITY_PATH}/snapshots`);
    const run = (validator: any, value: unknown, where: string): { value?: any; error?: string } => {
      try {
        return { value: validator.validate(value, {}, where) };
      } catch (error: any) {
        return { error: error?.message || String(error) };
      }
    };
    const [withVersion, withNull] = bodies.map(body => run(save.validate.body, body, 'request body'));
    const { expectedVersion: _dropped, ...withoutVersion } = bodies[0];
    const without = run(save.validate.body, withoutVersion, 'request body');
    check(`${label}: an assessment reaches the handler as sent`, !withVersion.error && JSON.stringify(withVersion.value.entry) === JSON.stringify(assessment) && withVersion.value.kind === 'assessment' && withVersion.value.controlId === 'op.acc.1', withVersion);
    check(`${label}: the version reaches it as the object sent`, JSON.stringify(withVersion.value?.expectedVersion) === '{"seqNo":4,"primaryTerm":1}');
    check(`${label}: null reaches it as null`, !withNull.error && withNull.value.expectedVersion === null, withNull);
    check(`${label}: the client always sends the version`, bodies.every(body => 'expectedVersion' in body));
    check(`${label}: a body without it reaches the handler as null («there was none»: it can only create)`, !without.error && without.value.expectedVersion === null, without);
    check(`${label}: a key the route does not declare is refused`, /definition for this key is missing/.test(run(save.validate.body, { ...bodies[0], otraClave: 1 }, 'request body').error || ''));
    check(`${label}: a malformed version is refused`, !!run(save.validate.body, { ...bodies[0], expectedVersion: { seqNo: 'x', primaryTerm: 1 } }, 'request body').error);
    const [oneControl, all] = queries.map(query => run(read.validate.query, query, 'request query'));
    check(`${label}: the snapshots query reaches it as sent`, !oneControl.error && oneControl.value.controlId === 'op.acc.1' && oneControl.value.from === '2026-01-01' && oneControl.value.to === '2026-10-20', oneControl);
    check(`${label}: without controlId too`, !all.error && all.value.controlId === undefined, all);
  });

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
