/** The art. 32 routes (and a declared entry on the maturity route) accept what the browser sends, as it sent it. */
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
  process.env.ENSFACIL_OSD_CONFIG_SCHEMA,
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
const annual = require('../common/ens/annual-report/annual-report-http-client');
const maturityClient = require('../common/ens/maturity/maturity-http-client');
const { ENSFACIL_ANNUAL_REPORT_PATH, ENSFACIL_MATURITY_PATH } = require('../common/constants');
const ANNUAL_ROUTES = require.resolve('../server/routes/annual-report');
const MATURITY_ROUTES = require.resolve('../server/routes/maturity');

// What the browser really sends, through its own clients.
const queries: any[] = [];
const posts: any[] = [];
const puts: any[] = [];
http.setENSConfigurationHttp(() => ({
  get: async (_path: string, options: any) => {
    queries.push(options.query);
    return { statusCode: 200, error: 0, data: { period: '2026', periods: [] } };
  },
  post: async (_path: string, options: any) => {
    posts.push(JSON.parse(options.body));
    return { statusCode: 200, error: 0, data: { frozen: {}, report: {} } };
  },
  put: async (_path: string, options: any) => {
    puts.push(JSON.parse(options.body));
    return { statusCode: 200, error: 0, data: { record: {}, version: null } };
  },
}));

(async () => {
  await annual.fetchAnnualReport();
  await annual.fetchAnnualReport({ period: '2026' });
  await annual.fetchAnnualReport({ period: '2026', revision: 1 });
  await annual.freezeAnnualReport({ period: '2026', reason: 'Cierre del ejercicio', expectedRevision: null });
  await annual.freezeAnnualReport({ period: '2026', reason: 'Corrección', expectedRevision: 1 });
  const declaration = { applies: 'si', level: 3, reference: 'POL-SEG-01', owner: 'RSEG', date: '2026-10-01' };
  await maturityClient.saveMaturityEntry({ controlId: 'org.1', kind: 'declaration', entry: declaration, expectedVersion: { seqNo: 3, primaryTerm: 1 } });
  await maturityClient.saveMaturityEntry({ controlId: 'op.mon.2', kind: 'resources', entry: { period: '2027', ictBudget: 1000, reference: 'x', owner: 'y' }, expectedVersion: null });
  const keys = Array.from(new Set(posts.flatMap(body => Object.keys(body)))).sort();
  check('the browser freezes with period, reason and expectedRevision', JSON.stringify(keys) === '["expectedRevision","period","reason"]', keys);
  check('the browser always sends expectedRevision', posts.every(body => 'expectedRevision' in body));

  SCHEMAS.forEach(({ label, module }) => {
    console.log(`  schema: ${label}`);
    current = module;
    delete require.cache[ANNUAL_ROUTES];
    delete require.cache[MATURITY_ROUTES];
    const routes: any[] = [];
    const router = {
      get: (config: any) => routes.push({ method: 'GET', ...config }),
      put: (config: any) => routes.push({ method: 'PUT', ...config }),
      post: (config: any) => routes.push({ method: 'POST', ...config }),
    };
    const logger = { info() {}, warn() {}, error() {}, debug() {} };
    require(ANNUAL_ROUTES).registerAnnualReportRoutes(router, { logger, securityEnabled: true, annualReport: {} });
    require(MATURITY_ROUTES).registerMaturityRoutes(router, { logger, securityEnabled: true, maturity: {} });
    const read = routes.find(route => route.method === 'GET' && route.path === ENSFACIL_ANNUAL_REPORT_PATH);
    const freeze = routes.find(route => route.method === 'POST' && route.path === `${ENSFACIL_ANNUAL_REPORT_PATH}/freeze`);
    const save = routes.find(route => route.method === 'PUT' && route.path === ENSFACIL_MATURITY_PATH);
    const run = (validator: any, value: unknown, where: string): { value?: any; error?: string } => {
      try {
        return { value: validator.validate(value, {}, where) };
      } catch (error: any) {
        return { error: error?.message || String(error) };
      }
    };
    const [none, onePeriod, oneRevision] = queries.map(query => run(read.validate.query, query, 'request query'));
    check(`${label}: GET without query`, !none.error && none.value.period === undefined, none);
    check(`${label}: GET with the period`, !onePeriod.error && onePeriod.value.period === '2026', onePeriod);
    check(`${label}: GET with a revision (as text, the service checks it)`, !oneRevision.error && oneRevision.value.revision === '1', oneRevision);
    check(`${label}: GET with an unknown key is refused`, /definition for this key is missing/.test(run(read.validate.query, { period: '2026', otra: '1' }, 'request query').error || ''));
    const [firstFreeze, regenerate] = posts.map(body => run(freeze.validate.body, body, 'request body'));
    check(`${label}: a first freeze reaches the handler with null`, !firstFreeze.error && firstFreeze.value.expectedRevision === null && firstFreeze.value.reason === 'Cierre del ejercicio', firstFreeze);
    check(`${label}: a regeneration reaches it with the revision read`, !regenerate.error && regenerate.value.expectedRevision === 1, regenerate);
    const { expectedRevision: _dropped, ...withoutRevision } = posts[0];
    const without = run(freeze.validate.body, withoutRevision, 'request body');
    check(`${label}: without expectedRevision it reaches the handler as null (only a first freeze)`, !without.error && without.value.expectedRevision === null, without);
    check(`${label}: a freeze with an unknown key is refused`, /definition for this key is missing/.test(run(freeze.validate.body, { ...posts[0], extra: 1 }, 'request body').error || ''));
    check(`${label}: a freeze without period is refused`, Boolean(run(freeze.validate.body, { reason: 'x', expectedRevision: null }, 'request body').error));
    const [declared, resources] = puts.map(body => run(save.validate.body, body, 'request body'));
    check(`${label}: a declared entry reaches the maturity route as sent`, !declared.error && declared.value.kind === 'declaration' && declared.value.controlId === 'org.1' && JSON.stringify(declared.value.entry) === JSON.stringify(declaration), declared);
    check(`${label}: the ICT totals reach it too`, !resources.error && resources.value.kind === 'resources' && resources.value.expectedVersion === null, resources);
  });

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
