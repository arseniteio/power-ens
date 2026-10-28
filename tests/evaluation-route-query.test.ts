/** Evaluation route parameters as they really arrive. */
import * as fs from 'fs';
import * as path from 'path';
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { createEvaluationHandlers } from '../server/lib/evaluation-handlers';
import { buildEvaluationQuerySchema, EVALUATION_QUERY_FIELDS } from '../server/routes/evaluation-query';
import { setServices } from '../public/services';
import { fetchEvaluation, fetchEvaluationProbe, fetchTraceabilityPage } from '../public/evaluation/evaluation-client';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';

declare const process: { exit(code: number): void };
declare const __dirname: string;
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) failures.push(n);
};
const root = path.join(__dirname, '..');
const lee = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

const schema = {
  string: (o: { maxLength: number }) => ({ tipo: 'string', maxLength: o.maxLength, opcional: false }),
  maybe: (t: any) => ({ ...t, opcional: true }),
  object: (props: Record<string, any>, options: { unknowns: string }) => ({
    validate: (value: Record<string, unknown>) => {
      const output: Record<string, unknown> = {};
      for (const [clave, v] of Object.entries(value || {})) {
        const type = props[clave];
        if (!type) {
          if (options.unknowns === 'ignore') continue;
          throw Object.assign(new Error(`[request query.${clave}]: definition for this key is missing`), { statusCode: 400 });
        }
        if (typeof v !== 'string') throw Object.assign(new Error(`[request query.${clave}]: expected value of type [string] but got [${typeof v}]`), { statusCode: 400 });
        if (v.length > type.maxLength) throw Object.assign(new Error(`[request query.${clave}]: value has length [${v.length}] but it must have a maximum length of [${type.maxLength}].`), { statusCode: 400 });
        output[clave] = v;
      }
      return output;
    },
  }),
};
const ruta = buildEvaluationQuerySchema(schema);
const declaredItems = Object.keys(EVALUATION_QUERY_FIELDS);

const asUrl = (query: Record<string, unknown>) =>
  new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();
const ofUrl = (string: string) => Object.fromEntries(new URLSearchParams(string));

const requested: { path: string; query: Record<string, unknown> }[] = [];
setServices({ http: { get: async (p: string, o: any) => { requested.push({ path: p, query: o.query }); return { statusCode: 200, error: 0, data: {} }; } } } as any, {} as any);

(async () => {
  console.log('1. What the server reads is declared');
  const service = lee('server/lib/evaluation/evaluation-service.ts');
  const normalize = service.slice(service.indexOf('export const normalizeQuery'), service.indexOf('export interface ENSEvaluationContext'));
  const handlers = lee('server/lib/evaluation-handlers.ts');
  const fields = lee('server/lib/evaluation/overview-fields.ts');
  const read = new Set<string>([
    ...[...normalize.matchAll(/query\.(\w+)/g)].map(m => m[1]),
    ...[...handlers.matchAll(/request\?\.query\?\.(\w+)/g)].map(m => m[1]),
    ...[...handlers.matchAll(/\bq\.(\w+)/g)].map(m => m[1]),
    ...[...fields.matchAll(/overviewQueryFlags[\s\S]{0,200}?query\.(\w+)/g)].map(m => m[1]),
  ]);
  check('the reads are found (include, timelineDays, timelineControls, retryRefresh, from, size...)', ['include', 'timelineDays', 'timelineControls', 'retryRefresh', 'from', 'size', 'timeZone'].every(c => read.has(c)), [...read]);
  const undeclared2 = [...read].filter(c => !declaredItems.includes(c));
  check('all declared in the route', undeclared2.length === 0, undeclared2);

  console.log('2. What the screens send is declared');
  const screens = ['public/ens/controls/index.tsx', 'public/ens/dashboard/ens-dashboard-main.tsx', 'public/ens/controls/control-detail/index.tsx', 'public/ens/overview/index.tsx', 'public/ens/evidences/index.tsx', 'public/ens/reports/index.tsx'];
  const sent = new Set<string>();
  let calls = 0;
  for (const f of screens) {
    for (const m of lee(f).matchAll(/useEnsEvaluation(?:<[^(]*?>)?\(\s*\{([^}]*)\}/g)) {
      calls += 1;
      for (const c of m[1].matchAll(/(?:^|,)\s*(\w+)\s*(?=[:,]|$)/g)) if (c[1] !== 'enabled') sent.add(c[1]);
    }
  }
  check('the hook separates `enabled` from what it sends', /const \{ enabled = true, \.\.\.requested \} = params;/.test(lee('public/evaluation/use-evaluation.ts')));
  check('the screens\' requests are found (with timelineControls)', calls >= 7 && sent.has('timelineControls') && sent.has('include'), { llamadas: calls, enviados: [...sent] });
  const params = { include: 'summary' as const, timelineDays: 30, timelineControls: true, agentId: '101', controlId: 'op.exp.3' };
  await fetchEvaluation(params, undefined, { retryRefresh: true });
  await fetchEvaluationProbe(params);
  await fetchTraceabilityPage({ controlId: 'op.exp.3', agentId: '101', from: 100, size: 50 });
  requested.forEach(p => Object.keys(p.query).forEach(c => sent.add(c)));
  const undeclared = [...sent].filter(c => !declaredItems.includes(c));
  check('everything sent (and what the client adds: timeZone, retryRefresh, from, size) is declared', undeclared.length === 0 && ['timeZone', 'retryRefresh', 'from', 'size'].every(c => sent.has(c)), undeclared);

  console.log('3. The real queries, through the route and the handler');
  const clock = new Date('2026-10-17T12:00:00Z');
  const hora = (h: number) => new Date(clock.getTime() - h * 3600 * 1000).toISOString();
  let n = 0;
  const fact = (agent: string, name: string, data: Record<string, unknown>, hours: number): FakeDoc => ({
    _id: `h${String(++n).padStart(5, '0')}`,
    _index: 'wazuh-alerts-4.x-2026.10.17',
    _source: { '@timestamp': hora(hours), timestamp: hora(hours), id: `${Date.parse(hora(hours)) / 1000}.${n}`, manager: { name: 'wazuh-manager' }, agent: { id: agent, name: name }, rule: { id: '100', groups: ['ENS'] }, data },
  });
  const docs: FakeDoc[] = [];
  for (const [agent, name] of [['101', 'srv-web01'], ['102', 'ldap01']]) {
    for (const h of [50, 30, 5, 1]) {
      docs.push(fact(agent, name, { power_ens: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
      docs.push(fact(agent, name, { power_ens: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', perfil: name, servicio: 'ssh.service', estado: 'CUMPLE' }, h - 0.01));
    }
  }
  const configuration: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
  configuration.scope = { mode: 'group', agentIds: [], groupIds: ['ens'] };
  configuration.updatedAt = '2026-10-14T10:00:00.000Z';
  const monitor = (id: string, name: string): FakeDoc => ({ _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17', _source: { id, name, group: ['ens'], status: 'active', timestamp: hora(0.1), manager: 'manager' } });
  const index = createFakeIndexer([
    ...docs,
    monitor('101', 'srv-web01'),
    monitor('102', 'ldap01'),
    { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration: configuration, updatedAt: configuration.updatedAt } },
  ], { clock: () => clock.getTime(), user: { user_name: 'ana', roles: ['all_access'] } });
  const logger: any = { info() {}, warn() {}, debug() {}, error() {} };
  const h = createEvaluationHandlers({ logger, securityEnabled: true, service: createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock }) });
  const context = { core: { opensearch: { client: { asCurrentUser: index, asInternalUser: index } } } };
  const response = { ok: (r: any) => ({ status: 200, data: r.body.data }), customError: (r: any) => ({ status: r.statusCode, message: r.body?.message }) };
  const throughRoute = async (string: string, validator = ruta) => {
    let r: any;
    for (let i = 0; i < 600; i++) {
      r = await h.evaluate(context, { query: validator.validate(ofUrl(string)), events: {} }, response);
      if (r.status !== 200 || (!r.data.meta?.pending && !r.data.meta?.seriesPending)) break;
      // Slower than the series idle window (SERIES_IDLE_MS, 200 ms; the screen polls every 2 s), or the background
      // series never gets a turn.
      await new Promise(ready => setTimeout(ready, 300));
    }
    return r;
  };
  requested.length = 0;
  await fetchEvaluation({ include: 'summary', timelineDays: 30, timelineControls: true });
  const trend = asUrl(requested[0].query);
  check('the trend query carries the flag', /(^|&)timelineControls=true(&|$)/.test(trend), trend);
  const withFlag = await throughRoute(trend);
  const points = withFlag.data?.timeline || [];
  check('through the route, the trend receives each control\'s state at each point', withFlag.status === 200 && points.length > 1 && points.every((p: any) => p.controls && Object.keys(p.controls).length > 0), { status: withFlag.status, puntos: points.length, primero: points[0] });
  const withoutTheField = { ...EVALUATION_QUERY_FIELDS };
  delete withoutTheField.timelineControls;
  const oldRoute = schema.object(Object.fromEntries(Object.entries(withoutTheField).map(([k, max]) => [k, schema.maybe(schema.string({ maxLength: max }))])), { unknowns: 'ignore' });
  const withoutFlag = await throughRoute(trend, oldRoute);
  check('undeclared, the route would drop it and the points would arrive without controls (the earlier failure)', withoutFlag.status === 200 && (withoutFlag.data?.timeline || []).every((p: any) => p.controls === undefined));
  const panel = await throughRoute(asUrl({ include: 'dashboard', timelineDays: 7, timeZone: 'UTC' }));
  check('the Panel, through the route, without per-control figures', panel.status === 200 && (panel.data?.timeline || []).length > 0 && panel.data.timeline.every((p: any) => p.controls === undefined));
  const general = await throughRoute(asUrl({ include: 'overview', timeZone: 'UTC' }));
  check('the Overview, through the route: freshness and queue', general.status === 200 && Array.isArray(general.data?.freshness?.cells) && Array.isArray(general.data?.nonConformities));

  console.log('4. The Overview covers all controls');
  const withControl = await h.evaluate(context, { query: ruta.validate(ofUrl(asUrl({ include: 'overview', controlId: 'op.exp.3' }))), events: {} }, response);
  check('include=overview with controlId: 400 with the motive', withControl.status === 400 && /Vista general/.test(withControl.message || ''), withControl);

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
