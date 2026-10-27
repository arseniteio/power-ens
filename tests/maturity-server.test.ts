/** Maturity on the server: responses, pending inputs, own document and history, daily snapshots and the daily job. */
import { createFakeIndexer, FakeDoc, matchesQuery, pickSource } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { createEvaluationHandlers } from '../server/lib/evaluation-handlers';
import { createMaturityService } from '../server/lib/maturity/maturity-service';
import { createMaturityHandlers } from '../server/lib/maturity-handlers';
import { createConfigurationHandlers } from '../server/lib/configuration-handlers';
import { writeSnapshots } from '../server/lib/maturity/snapshot-storage';
import { createDailySnapshotJob, nextDailyRun } from '../server/lib/maturity/daily-snapshot-job';
import { groupActivityControls, MAX_ACTIVITY_BUCKETS } from '../server/lib/maturity/activity';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';

declare const process: { exit(code: number): void };
declare const require: any;
declare const __dirname: string;
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) failures.push(n);
};
const clone = (value: any) => JSON.parse(JSON.stringify(value));

let clock = new Date('2026-10-20T12:00:00Z');
let n = 0;
const fact = (agent: string, name: string, data: Record<string, unknown>, hours: number): FakeDoc => {
  const at = new Date(clock.getTime() - hours * 3600e3).toISOString();
  return {
    _id: `h${String(++n).padStart(6, '0')}`,
    _index: 'wazuh-alerts-4.x-2026.10',
    _source: { '@timestamp': at, timestamp: at, id: `${Date.parse(at) / 1000}.${n}`, manager: { name: 'wazuh-manager' }, agent: { id: agent, name }, rule: { id: '100', groups: ['ENS'] }, data },
  };
};
const docs: FakeDoc[] = [];
for (let h = 31 * 24; h >= 1; h -= 1) {
  docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
  docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', servicio: 'sshd', estado: 'CUMPLE' }, h - 0.01));
}
const monitor = (id: string, name: string) => ({
  _id: `m${id}`,
  _index: 'wazuh-monitoring-2026.10.20',
  _source: { id, name, group: ['ens'], status: 'active', timestamp: new Date(clock.getTime() - 360e3).toISOString(), manager: 'manager' },
});
const alerts = createFakeIndexer([...docs, monitor('024', 'wazuh-real')], { clock: () => clock.getTime() });

// The first-fact lookup: its only aggregation is one bucket per machine with its earliest fact.
const isFirstFactLookup = (request: any) => Object.keys(request.body?.aggs || {}).join() === 'agents' && Boolean(request.body.aggs.agents.aggs?.first);
// The plugin's own indices (configuration and snapshots), with `_seq_no`, `if_seq_no`, `create` and delete by query.
const OWN = ['wazuh-ens-configuration', 'wazuh-ens-snapshots'];
const createStore = (options: { refuseSnapshots?: boolean; failPurges?: number; failActivity?: boolean; failFirstFacts?: boolean; slow?: number } = {}) => {
  const store = new Map<string, { index: string; source: any; seqNo: number }>();
  let sequence = 0;
  let purgeFailures = options.failPurges || 0;
  const calls = { bulk: [] as string[][], deleteByQuery: 0, templates: [] as any[] };
  const value = (source: any, field: string) => String(field.split('.').reduce((v: any, k) => (v == null ? v : v[k]), source) ?? '');
  const client: any = {
    store,
    calls,
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }), putIndexTemplate: async (request: any) => { calls.templates.push(request); return { body: {} }; } },
    search: async (request: any) => {
      if (options.slow) await new Promise(resolve => setTimeout(resolve, options.slow));
      if (options.failActivity && request.body?.aggs?.controls?.aggs?.agents?.aggs?.days) throw Object.assign(new Error('activity read timed out'), { statusCode: 504 });
      if (options.failFirstFacts && isFirstFactLookup(request)) throw Object.assign(new Error('first facts timed out'), { statusCode: 504 });
      if (!OWN.includes(request.index)) return alerts.search(request);
      const sort = (request.body?.sort || []).map((s: any) => {
        const [field, order]: [string, any] = Object.entries(s)[0] as any;
        return { field, desc: (order?.order || order) === 'desc' };
      });
      let hits = [...store.entries()]
        .filter(([, doc]) => doc.index === request.index)
        .map(([id, doc]) => ({ _id: id, _index: doc.index, _source: doc.source, seqNo: doc.seqNo }))
        .filter(doc => matchesQuery(doc as any, request.body?.query))
        .sort((a, b) => {
          for (const { field, desc } of sort) {
            const r = value(a._source, field).localeCompare(value(b._source, field));
            if (r) return desc ? -r : r;
          }
          return 0;
        });
      const after = request.body?.search_after;
      if (after) hits = hits.filter(doc => sort.map(({ field }: any) => value(doc._source, field)).join('\u0000') > after.join('\u0000'));
      return {
        body: {
          _shards: { total: 1, successful: 1, failed: 0 },
          hits: {
            hits: hits.slice(0, request.body?.size ?? 10).map(doc => ({
              _id: doc._id,
              _source: pickSource(doc._source, request.body?._source),
              sort: sort.map(({ field }: any) => value(doc._source, field)),
              ...(request.body?.seq_no_primary_term ? { _seq_no: doc.seqNo, _primary_term: 1 } : {}),
            })),
          },
        },
      };
    },
    bulk: async (request: any) => {
      const lines = String(request.body).split('\n').filter(Boolean).map(line => JSON.parse(line));
      if (options.refuseSnapshots && lines.some(line => (line.index || line.create)?._index === 'wazuh-ens-snapshots')) {
        return { body: { errors: true, items: [{ index: { status: 403, error: { type: 'security_exception', reason: 'no permissions for [indices:data/write/bulk[s]]' } } }] } };
      }
      calls.bulk.push(lines.filter((_, i) => i % 2 === 0).map(line => (line.create || line.index)._id));
      const items: any[] = [];
      for (let i = 0; i < lines.length; i += 2) {
        const kind = lines[i].create ? 'create' : 'index';
        const meta = lines[i][kind];
        const existing = store.get(meta._id);
        if ((kind === 'create' && existing) || (meta.if_seq_no !== undefined && (!existing || existing.seqNo !== meta.if_seq_no))) {
          items.push({ [kind]: { status: 409, error: { type: 'version_conflict_engine_exception' } } });
          continue;
        }
        sequence += 1;
        store.set(meta._id, { index: meta._index, source: lines[i + 1], seqNo: sequence });
        items.push({ [kind]: { status: 200, _seq_no: sequence, _primary_term: 1 } });
      }
      return { body: { errors: items.some(item => (item.create || item.index).status === 409), items } };
    },
    deleteByQuery: async (request: any) => {
      calls.deleteByQuery += 1;
      if (purgeFailures > 0) {
        purgeFailures -= 1;
        throw Object.assign(new Error('purge failed'), { statusCode: 500 });
      }
      let deleted = 0;
      [...store.entries()].forEach(([id, doc]) => {
        if (doc.index === request.index && matchesQuery({ _id: id, _index: doc.index, _source: doc.source } as any, request.body?.query)) {
          store.delete(id);
          deleted += 1;
        }
      });
      return { body: { deleted } };
    },
  };
  return client;
};


const ADMIN = { user_name: 'rsis', roles: ['ensfacil_admin', 'readall'] };
const READER = { user_name: 'ana', roles: ['readall'] };
const INTERNAL = { user_name: 'kibanaserver', roles: ['kibana_server', 'manage_wazuh_index'] };
// The current user's client: the same indices, its own identity; `noSnapshots` refuses reading the snapshots index.
const currentFor = (internal: any, user: any, noSnapshots = false) => ({
  ...internal,
  search: async (request: any) => {
    if (noSnapshots && request.index === 'wazuh-ens-snapshots') throw Object.assign(new Error('security_exception: no permissions for [indices:data/read/search]'), { statusCode: 403 });
    return internal.search(request);
  },
  transport: { request: async ({ path }: any) => (path === '/_plugins/_security/authinfo' ? { body: user } : Promise.reject(new Error('no handler found for uri'))) },
});
const context = (internal: any, user: any = ADMIN, noSnapshots = false) => ({ core: { opensearch: { client: { asInternalUser: internal, asCurrentUser: currentFor(internal, user, noSnapshots) } } } });
const responses = { ok: (r: any) => ({ status: 200, body: r.body }), customError: (r: any) => ({ status: r.statusCode, body: r.body }) };
const warnings: string[] = [];
const logger: any = { info() {}, warn(m: string) { warnings.push(m); }, debug() {}, error() {} };
const request = (query: Record<string, string>) => ({ query, events: {} });

const seed = (internal: any, evaluationPeriod?: string, ensLevel?: string) => {
  const configuration = { ...clone(defaultENSConfigurationTemplate), scope: { mode: 'group', agentIds: [], groupIds: ['ens'] }, updatedAt: '2026-10-14T10:00:00.000Z' };
  if (evaluationPeriod) configuration.global.evaluationPeriod = evaluationPeriod;
  if (ensLevel) configuration.global.ensLevel = ensLevel;
  internal.store.set('active', { index: 'wazuh-ens-configuration', source: { documentType: 'ACTIVE_CONFIGURATION', configuration, updatedAt: '2026-10-14T10:00:00.000Z' }, seqNo: 1 });
};

let maturityClock = 0;
const setup = (
  options: { evaluationPeriod?: string; ensLevel?: string; refuseSnapshots?: boolean; failPurges?: number; inputsTtlMs?: number; failOrganisation?: boolean; refreshingOrganisation?: boolean; missingOrganisation?: boolean; failActivity?: boolean; failFirstFacts?: boolean; slow?: number; justificationTimeoutMs?: number } = {}
) => {
  const internal = createStore(options);
  seed(internal, options.evaluationPeriod, options.ensLevel);
  const service = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
  // `failOrganisation`: the organisation pass behind a machine view always fails (the views themselves work).
  // The organisation pass behind a machine view can be made to fail (`failOrganisation`) or to come back refreshing.
  const maturityEvaluation: any = {
    ...service,
    run: async (c: any, q: any, o: any) => {
      const organisationPass = q.include === 'summary' && !q.agentId;
      if (organisationPass && options.failOrganisation) throw new Error('indexer down');
      const run = await service.run(c, q, o);
      // `missingOrganisation`: the organisation rows are still being computed (none fails).
      if (organisationPass && options.missingOrganisation) return { ...run, meta: { ...run.meta, pending: { rows: 40, controls: ['op.exp.3'], total: 100 } } };
      return organisationPass && options.refreshingOrganisation ? { ...run, meta: { ...run.meta, refreshing: true } } : run;
    },
  };
  const maturity = createMaturityService({ logger, evaluation: maturityEvaluation, inputsTtlMs: options.inputsTtlMs, clock: () => Date.now() + maturityClock, justificationTimeoutMs: options.justificationTimeoutMs });
  const evaluation = createEvaluationHandlers({ logger, securityEnabled: true, service, maturity });
  const routes = createMaturityHandlers({ logger, securityEnabled: true, maturity, clock: () => clock });
  // A view as the browser gets it once the maturity inputs are read (the first answer marks them pending).
  const ready = async (query: Record<string, string>, user: any = ADMIN, noSnapshots = false) => {
    let answer: any = await evaluation.evaluate(context(internal, user, noSnapshots), request(query), responses);
    for (let i = 0; i < 5 && answer.body?.data?.meta?.maturityPending; i += 1) {
      await maturity.flush();
      answer = await evaluation.evaluate(context(internal, user, noSnapshots), request(query), responses);
    }
    await maturity.flush();
    return answer;
  };
  return { internal, service, maturity, evaluation, routes, ready, options };
};
const snapshotIds = (internal: any) => [...internal.store.entries()].filter(([, doc]: any) => doc.index === 'wazuh-ens-snapshots').map(([id]: any) => id).sort();
const historyOf = (internal: any, type: string) => [...internal.store.values()].filter((doc: any) => doc.source.documentType === type);
const Z = { timeZone: 'Europe/Madrid' };

(async () => {
  const { internal, maturity, evaluation, routes, ready } = setup();

  console.log('1. In the evaluation response, never delaying it');
  const first: any = await evaluation.evaluate(context(internal), request({ include: 'control', controlId: 'op.exp.3', ...Z }), responses);
  check('the first answer does not wait for the maturity inputs: marked pending, fingerprint «refreshing:»', first.status === 200 && first.body.data.meta.maturityPending === true && first.body.data.maturity === undefined && first.body.data.meta.fingerprint.startsWith('refreshing:') && first.body.data.result, first.body.data.meta);
  const detail = await ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  const m = detail.body?.data?.maturity;
  check('once read, the control view carries its maturity with the nine gates and the document version (null: none yet)', m?.controlId === 'op.exp.3' && m.gates.length === 9 && detail.body.data.maturityVersion === null && !detail.body.data.meta.maturityPending, detail.body?.data?.maturityError || m);
  check('facts every day: L1 and L2 pass', m.gates.find((g: any) => g.id === 'L1.facts').passed && m.gates.find((g: any) => g.id === 'L2.recurrence').passed, m.gates.slice(0, 2));
  check('without procedure the L3 gate says so', /Sin procedimiento/.test(m.gates.find((g: any) => g.id === 'L3.procedure').reason));
  const agentFirst: any = await evaluation.evaluate(context(internal), request({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z }), responses);
  check('a machine view takes the organisation maturity from memory (no extra pass in the request)', agentFirst.body.data.maturity?.accredited === m.accredited && agentFirst.body.data.maturity.gates.length === 9, agentFirst.body.data.meta);
  const overview = await ready({ include: 'overview', ...Z });
  const list = overview.body.data.maturity;
  check('the overview carries every control and the distribution (notMeasured, notAssessed)', list?.controls?.length > 20 && list.distribution && list.distribution.applicable > 0 && 'notAssessed' in list.distribution.assessed, list && { n: list.controls?.length, d: list.distribution });
  const machinePanel = await ready({ include: 'dashboard', agentId: '024', timelineDays: '7', ...Z });
  check('a machine panel carries the organisation distribution', JSON.stringify(machinePanel.body.data.maturity?.distribution) === JSON.stringify(list.distribution), machinePanel.body.data.maturity);
  const results: any = await evaluation.evaluate(context(internal), request({ include: 'results', ...Z }), responses);
  check('the results view (panorama) carries no maturity', results.body.data.maturity === undefined && !results.body.data.meta.maturityPending);
  const ids = Array.from({ length: 44 }, (_, i) => `c${i}`);
  const groups = groupActivityControls(ids, 101, 30);
  check('the activity of a large scope goes in groups below the bucket limit', groups.flat().length === 44 && groups.every(g => g.length * 101 * 32 <= MAX_ACTIVITY_BUCKETS), groups.map(g => g.length));
  const short = setup({ evaluationPeriod: 'Últimas 24 horas' });
  const shortDetail = await short.ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  check('its own 30-day period: with the screen on «Últimas 24 horas», L2 still reads 7 days of facts', shortDetail.body.data.maturity?.gates.find((g: any) => g.id === 'L2.recurrence').passed, shortDetail.body.data.maturity?.gates?.[1]);
  const hooked = setup();
  const seen: any[] = [];
  const plainSearch = hooked.internal.search;
  const firstFactQueries: any[] = [];
  hooked.internal.search = async (req: any) => {
    if (req.body?.aggs?.controls?.aggs?.agents?.aggs?.days) seen.push(req.body.aggs.controls.aggs.agents.aggs.days.date_histogram);
    if (isFirstFactLookup(req)) firstFactQueries.push(req.body);
    return plainSearch(req);
  };
  await hooked.ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  await hooked.ready({ include: 'overview', ...Z });

  console.log('2. Daily snapshots: only the daily job writes them');
  check('no view writes a snapshot, not even an administrator\'s', snapshotIds(internal).length === 0);
  const jobFor = (store: any, timers?: any) => {
    const built: any[] = [];
    const scheduledJob = createDailySnapshotJob({
      logger,
      client: { ...store.internal, transport: { request: async () => ({ body: INTERNAL }) } },
      maturity: store.maturity,
      clock: () => clock,
      timers,
      createEvaluation: () => {
        const created = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, maxConcurrentReads: 2, computeSeries: false });
        built.push(created);
        return created;
      },
    });
    return { job: scheduledJob, built };
  };
  const mainJob = jobFor({ internal, maturity });
  await mainJob.job.runOnce();
  const today = snapshotIds(internal);
  check('the job writes one snapshot per control and day (DRAFT ones too: their assessed level)', today.length === list.controls.length && today.includes('op.exp.3|2026-10-20'), [today.length, list.controls.length]);
  const snap = internal.store.get('op.exp.3|2026-10-20').source;
  check('the snapshot has status, score, coverage and the levels, written by the job', snap.date === '2026-10-20' && typeof snap.status === 'string' && 'score' in snap && snap.accredited === m.accredited && snap.target === m.target && snap.recordedBy === 'ENSFácil (tarea diaria)', snap);
  check('the index template is put once, with the field types', internal.calls.templates.length === 1 && internal.calls.templates[0].body.index_patterns[0] === 'wazuh-ens-snapshots' && internal.calls.templates[0].body.template.mappings.properties.controlId.type === 'keyword');
  await new Promise(resolve => setTimeout(resolve, 400));
  check('the job\'s own evaluation computes no daily series', mainJob.built[0].backgroundWork().series === 0 && mainJob.built[0].idle(), mainJob.built[0].backgroundWork());
  const writesBefore = internal.calls.bulk.length;
  await ready({ include: 'overview', ...Z });
  check('an administrator\'s overview afterwards writes nothing', internal.calls.bulk.length === writesBefore && snapshotIds(internal).length === today.length);
  await writeSnapshots(internal, logger, [{ ...snap, score: 1, recordedAt: clock.toISOString() }]);
  check('writing a day again replaces its document (idempotent per day)', snapshotIds(internal).length === today.length && internal.store.get('op.exp.3|2026-10-20').source.score === 1);
  await writeSnapshots(internal, logger, [{ ...snap, recordedAt: clock.toISOString() }]);
  check('the retention purge ran once that day', internal.calls.deleteByQuery === 1);
  const purging = setup({ failPurges: 1 });
  const purgeTimers: { run: () => void; ms: number }[] = [];
  const purgingJob = jobFor(purging, { set: (run: () => void, ms: number) => purgeTimers.push({ run, ms }), clear: () => undefined });
  await purgingJob.job.runOnce();
  check('a failed purge is logged apart, the snapshots are written anyway', snapshotIds(purging.internal).length > 0 && warnings.some(w => /could not purge the old maturity snapshots/.test(w)) && !warnings.some(w => /could not write the maturity snapshots/.test(w)));
  check('...and retried within the hour, not with tomorrow\'s run', purgeTimers.length === 1 && purgeTimers[0].ms === 3600e3);
  purgeTimers[0].run();
  await new Promise(resolve => setTimeout(resolve, 50));
  check('...the retry purges', purging.internal.calls.deleteByQuery === 2);

  console.log('3. The daily job (internal user)');
  const job = setup();
  let evaluations = 0;
  const daily = createDailySnapshotJob({
    logger,
    client: { ...job.internal, transport: { request: async () => ({ body: INTERNAL }) } },
    maturity: job.maturity,
    clock: () => clock,
    createEvaluation: () => {
      evaluations += 1;
      return createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, maxConcurrentReads: 2, computeSeries: false });
    },
  });
  await daily.runOnce();
  const jobIds = snapshotIds(job.internal);
  check('it writes the day with a complete evaluation of its own, though the user is not an administrator', jobIds.length === today.length && job.internal.store.get('op.exp.3|2026-10-20').source.recordedBy === 'ENSFácil (tarea diaria)', jobIds.length);
  check('a control without facts that day: L0', job.internal.store.get('op.exp.8|2026-10-20').source.accredited === 0);
  const jobWrites = job.internal.calls.bulk.length;
  await daily.runOnce();
  check('the same day: no second evaluation, nothing written', evaluations === 1 && job.internal.calls.bulk.length === jobWrites);
  // Day 2: op.exp.8 starts reporting every hour of the last 31 days; the job must read that, not yesterday's inputs.
  clock = new Date('2026-10-21T12:00:00Z');
  const added: FakeDoc[] = [];
  for (let h = 31 * 24; h >= 1; h -= 1) added.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.8', event: 'collector_run' }, h));
  alerts.docs.push(...added);
  await daily.runOnce();
  check('the next day: a new evaluation and the new day written, yesterday kept', evaluations === 2 && snapshotIds(job.internal).filter((id: string) => id.endsWith('|2026-10-21')).length === today.length && snapshotIds(job.internal).filter((id: string) => id.endsWith('|2026-10-20')).length === today.length);
  check('...with that day\'s facts, never the inputs read the day before (op.exp.8 now has them)', job.internal.store.get('op.exp.8|2026-10-21').source.accredited >= 1, job.internal.store.get('op.exp.8|2026-10-21').source);
  alerts.docs.splice(alerts.docs.length - added.length, added.length);
  clock = new Date('2026-10-20T12:00:00Z');
  const refused = setup({ refuseSnapshots: true });
  const refusedTimers: { run: () => void; ms: number }[] = [];
  const refusedJob = createDailySnapshotJob({
    logger,
    client: { ...refused.internal, transport: { request: async () => ({ body: INTERNAL }) } },
    maturity: refused.maturity,
    clock: () => clock,
    timers: { set: (run: () => void, ms: number) => refusedTimers.push({ run, ms }), clear: () => undefined },
    createEvaluation: () => createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, computeSeries: false }),
  });
  const refusedBefore = warnings.length;
  await refusedJob.runOnce();
  check('refused by the index: nothing written, a warning that says so, and a retry in 30 minutes (the job does not stop)', snapshotIds(refused.internal).length === 0 && /the indexer refused the daily maturity snapshot .*nothing written for 2026-10-20, retried in 30 minutes/.test(warnings.slice(refusedBefore).join(' ')) && refusedTimers.length === 1 && refusedTimers[0].ms === 30 * 60e3, warnings.slice(refusedBefore));
  refused.options.refuseSnapshots = false;
  refusedTimers[0].run();
  await new Promise(resolve => setTimeout(resolve, 0));
  await refusedJob.runOnce();
  check('...once the index accepts it, the retry writes the day', snapshotIds(refused.internal).filter((id: string) => id.endsWith('|2026-10-20')).length === today.length, snapshotIds(refused.internal).length);
  const broken = setup({ failActivity: true });
  const brokenTimers: { run: () => void; ms: number }[] = [];
  const brokenJob = createDailySnapshotJob({
    logger,
    client: { ...broken.internal, transport: { request: async () => ({ body: INTERNAL }) } },
    maturity: broken.maturity,
    clock: () => clock,
    timers: { set: (run: () => void, ms: number) => brokenTimers.push({ run, ms }), clear: () => undefined },
    createEvaluation: () => createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, computeSeries: false }),
  });
  const brokenBefore = warnings.length;
  await brokenJob.runOnce();
  check('a failed read writes nothing (no L0 for every control), warns and retries in 30 minutes', snapshotIds(broken.internal).length === 0 && /the daily maturity snapshot failed \(could not read the daily activity\); nothing written for 2026-10-20, retried in 30 minutes/.test(warnings.slice(brokenBefore).join(' ')) && brokenTimers.length === 1 && brokenTimers[0].ms === 30 * 60e3, warnings.slice(brokenBefore));
  brokenTimers[0].run();
  await new Promise(resolve => setTimeout(resolve, 0));
  await brokenJob.runOnce();
  check('...a failure again warns again (every time) and retries again, later (1 hour)', warnings.slice(brokenBefore).filter(w => /daily maturity snapshot failed/.test(w)).length === 2 && brokenTimers.length === 2 && brokenTimers[1].ms === 3600e3 && /retried in 1 hour/.test(warnings.slice(brokenBefore).join(' ')), brokenTimers.map(t => t.ms));
  broken.options.failActivity = false;
  brokenTimers[1].run();
  await new Promise(resolve => setTimeout(resolve, 0));
  await brokenJob.runOnce();
  check('...and once the read works, the day is written', snapshotIds(broken.internal).filter((id: string) => id.endsWith('|2026-10-20')).length === today.length);
  const lateClock = clock;
  clock = new Date('2026-10-20T21:10:00Z');
  const lateTimers: { run: () => void; ms: number }[] = [];
  const late = setup({ failActivity: true });
  const lateJob = createDailySnapshotJob({ logger, client: { ...late.internal, transport: { request: async () => ({ body: INTERNAL }) } }, maturity: late.maturity, clock: () => clock, timers: { set: (run: () => void, ms: number) => lateTimers.push({ run, ms }), clear: () => undefined }, createEvaluation: () => createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, computeSeries: false }) });
  const lateBefore = warnings.length;
  await lateJob.runOnce();
  check('after 23:00 local time (23:10 Madrid) no more retries that day: tomorrow at 02:30', lateTimers.length === 0 && /retried tomorrow at 02:30/.test(warnings.slice(lateBefore).join(' ')), warnings.slice(lateBefore));
  clock = lateClock;
  // A persistent failure backs off (30 min, 1 h, 2 h, 4 h, 8 h) and stops at 23:00; the next day starts at 30 min again.
  const jobWith = (s: any, timers: { run: () => void; ms: number }[]) =>
    createDailySnapshotJob({ logger, client: { ...s.internal, transport: { request: async () => ({ body: INTERNAL }) } }, maturity: s.maturity, clock: () => clock, timers: { set: (run: () => void, ms: number) => timers.push({ run, ms }), clear: () => undefined }, createEvaluation: () => createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, computeSeries: false }) });
  clock = new Date('2026-10-20T00:30:00Z');
  const steady = setup({ failActivity: true });
  const steadyTimers: { run: () => void; ms: number }[] = [];
  const steadyJob = jobWith(steady, steadyTimers);
  const steadyBefore = warnings.length;
  await steadyJob.runOnce();
  let steadyRuns = 1;
  while (steadyTimers.length === steadyRuns && steadyRuns < 10) {
    clock = new Date(clock.getTime() + steadyTimers[steadyRuns - 1].ms);
    steadyTimers[steadyRuns - 1].run();
    await new Promise(resolve => setTimeout(resolve, 0));
    await steadyJob.runOnce();
    steadyRuns += 1;
  }
  const steadyLog = warnings.slice(steadyBefore).filter(w => /daily maturity snapshot failed/.test(w));
  check('a persistent failure from 02:30 backs off: retries after 30 min, 1 h, 2 h, 4 h and 8 h, 6 runs, then tomorrow', steadyRuns === 6 && JSON.stringify(steadyTimers.map(t => t.ms / 60e3)) === '[30,60,120,240,480]' && ['30 minutes', '1 hour', '2 hours', '4 hours', '8 hours'].every((w, i) => steadyLog[i]?.includes(`retried in ${w}`)) && /retried tomorrow at 02:30/.test(steadyLog[5] || ''), { runs: steadyRuns, timers: steadyTimers.map(t => t.ms / 60e3), log: steadyLog });
  clock = new Date('2026-10-21T00:30:00Z');
  await steadyJob.runOnce();
  check('...a new day starts again at 30 minutes', steadyTimers.length === 6 && steadyTimers[5].ms === 30 * 60e3, steadyTimers.map(t => t.ms / 60e3));
  clock = lateClock;
  // A failed first-fact lookup is not repeated before its backoff, also across job runs.
  const noLookup = setup({ failFirstFacts: true });
  let lookups = 0;
  const lookupSearch = noLookup.internal.search;
  noLookup.internal.search = async (req: any) => {
    if (isFirstFactLookup(req)) lookups += 1;
    return lookupSearch(req);
  };
  const noLookupJob = jobWith(noLookup, []);
  const noLookupBefore = warnings.length;
  await noLookupJob.runOnce();
  await noLookupJob.runOnce();
  const lookupsBefore = lookups;
  maturityClock += 30 * 60e3;
  await noLookupJob.runOnce();
  const lookupsAfter = lookups;
  maturityClock += 30 * 60e3;
  await noLookupJob.runOnce();
  maturityClock = 0;
  check('a failed first-fact lookup: the run fails, and a run right after does not repeat the lookup (cached for 30 min)', lookupsBefore === 1 && /could not read each machine's first fact\); nothing written/.test(warnings.slice(noLookupBefore).join(' ')), { lookupsBefore, log: warnings.slice(noLookupBefore) });
  check('...after 30 min it is tried again; failing again, it waits 1 h', lookupsAfter === 2 && lookups === 2, { lookupsAfter, lookups });
  // A new local day resets the lookup's failures: tried at once, and its next wait is 30 min again (not 2 h).
  clock = new Date('2026-10-21T12:00:00Z');
  await noLookupJob.runOnce();
  const lookupsNextDay = lookups;
  maturityClock += 30 * 60e3;
  await noLookupJob.runOnce();
  maturityClock = 0;
  clock = lateClock;
  check('...a new local day tries the lookup at once and its backoff starts again at 30 min', lookupsNextDay === 3 && lookups === 4, { lookupsNextDay, lookups });
  // stop() during a failing run: no retry, and the log does not promise one.
  const stopping = setup({ failActivity: true });
  const stoppingTimers: { run: () => void; ms: number }[] = [];
  const stoppingJob = jobWith(stopping, stoppingTimers);
  const stoppingBefore = warnings.length;
  const inFlight = stoppingJob.runOnce();
  stoppingJob.stop();
  await inFlight;
  check('stop() during a failing run: no retry, and the log says «not retried: stopping»', stoppingTimers.length === 0 && /nothing written for 2026-10-20, not retried: stopping/.test(warnings.slice(stoppingBefore).join(' ')), warnings.slice(stoppingBefore));
  // stop() with a retry pending, then start() in the same process: a failure schedules a retry again.
  const relaunched = setup({ failActivity: true });
  const relaunchedTimers: { run: () => void; ms: number }[] = [];
  const relaunchedJob = jobWith(relaunched, relaunchedTimers);
  await relaunchedJob.runOnce();
  relaunchedJob.stop();
  await relaunchedJob.start();
  const relaunchedBefore = warnings.length;
  const timersBefore = relaunchedTimers.length;
  await relaunchedJob.runOnce();
  relaunchedJob.stop();
  check('stop() cancels the pending retry: after start(), a failure schedules a new one', relaunchedTimers.length === timersBefore + 1 && relaunchedTimers[relaunchedTimers.length - 1].ms === 3600e3 && /retried in 1 hour/.test(warnings.slice(relaunchedBefore).join(' ')), { timers: relaunchedTimers.map(t => t.ms / 60e3), log: warnings.slice(relaunchedBefore) });

  console.log('3b. The daily job runs at 02:30 local time, and catches up after start only if today is missing');
  check('next run: today at 02:30 Madrid when it is still before, else tomorrow', nextDailyRun(new Date('2026-10-20T00:00:00Z'), 'Europe/Madrid').toISOString() === '2026-10-20T00:30:00.000Z' && nextDailyRun(new Date('2026-10-20T10:00:00Z'), 'Europe/Madrid').toISOString() === '2026-10-21T00:30:00.000Z');
  check('...in the configured zone (UTC) and across the October clock change (02:30 CEST)', nextDailyRun(new Date('2026-10-20T10:00:00Z'), 'UTC').toISOString() === '2026-10-21T02:30:00.000Z' && nextDailyRun(new Date('2026-10-24T12:00:00Z'), 'Europe/Madrid').toISOString() === '2026-10-25T00:30:00.000Z');
  const scheduled = (store: any) => {
    const timers: { run: () => void; ms: number }[] = [];
    let built = 0;
    const scheduledJob = createDailySnapshotJob({
      logger,
      client: { ...store.internal, transport: { request: async () => ({ body: INTERNAL }) } },
      maturity: store.maturity,
      clock: () => clock,
      createEvaluation: () => {
        built += 1;
        return createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, maxConcurrentReads: 2 });
      },
      timers: { set: (run: () => void, ms: number) => timers.push({ run, ms }), clear: () => undefined },
    });
    return { scheduledJob, timers, built: () => built };
  };
  const fresh = setup();
  const freshJob = scheduled(fresh);
  await freshJob.scheduledJob.start();
  check('start: a catch-up in 10 minutes and the daily run at the next 02:30 Madrid (14:00 Madrid → 12 h 30 min)', freshJob.timers.length === 2 && freshJob.timers[0].ms === 10 * 60e3 && freshJob.timers[1].ms === 12.5 * 3600e3, freshJob.timers.map(t => t.ms));
  await freshJob.scheduledJob.catchUp();
  check('catch-up with today missing: it evaluates and writes the day', freshJob.built() === 1 && snapshotIds(fresh.internal).some((id: string) => id.endsWith('|2026-10-20')));
  const restarted = scheduled(fresh);
  await restarted.scheduledJob.catchUp();
  check('catch-up after a restart with today already written: nothing evaluated', restarted.built() === 0);
  freshJob.timers[1].run();
  await new Promise(resolve => setTimeout(resolve, 50));
  await fresh.maturity.flush();
  check('the 02:30 run reschedules itself for the next day', freshJob.timers.length === 3 && freshJob.timers[2].ms === 12.5 * 3600e3, freshJob.timers.map(t => t.ms));

  console.log('4. The save route: own document, version, history');
  const save = (body: any, user: any = ADMIN) => routes.save(context(internal, user), { body }, responses) as Promise<any>;
  const maturityDoc = () => internal.store.get('maturity');
  const record = () => maturityDoc()?.source.configuration?.controls?.['op.exp.3'] || {};
  const assessment = { level: 5, reviewer: 'Luis', date: '2026-10-19' };
  const activeSeq = internal.store.get('active').seqNo;

  const refusedSave: any = await save({ controlId: 'op.exp.3', kind: 'assessment', entry: assessment, expectedVersion: null }, READER);
  check('without the role: 403 and nothing written', refusedSave.status === 403 && /ensfacil_admin o all_access/.test(refusedSave.body.message) && !maturityDoc());
  check('a control outside the catalog: 400', (await save({ controlId: 'xx.1', kind: 'review', entry: {}, expectedVersion: null })).status === 400);
  check('an unknown record: 400', (await save({ controlId: 'op.exp.3', kind: 'nota', entry: {}, expectedVersion: null })).status === 400);
  const noVersion: any = await save({ controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-10-01', reviewer: 'Ana', result: 'CONFORME' } });
  check('without expectedVersion: 400 (it is required)', noVersion.status === 400 && /expectedVersion/.test(noVersion.body.message), noVersion.body);
  const bad: any = await save({ controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-13-01', reviewer: '' }, expectedVersion: null });
  check('an invalid entry: 400 with the reasons', bad.status === 400 && /Fecha/.test(bad.body.message) && /Revisor/.test(bad.body.message), bad.body);
  const unjustified: any = await save({ controlId: 'op.exp.3', kind: 'assessment', entry: assessment, expectedVersion: null });
  check('assessed above accredited without justification: 400', unjustified.status === 400 && new RegExp(`supera al acreditado \\(L${m.accredited}\\)`).test(unjustified.body.message), unjustified.body);
  const justified: any = await save({ controlId: 'op.exp.3', kind: 'assessment', entry: { ...assessment, justification: 'Auditoría externa de 2026' }, expectedVersion: null });
  const stored = record().assessments?.[0];
  check('null creates the maturity document: saved with the accredited level and its gates, who and when', justified.status === 200 && maturityDoc()?.source.documentType === 'MATURITY_RECORDS' && stored?.level === 5 && stored.accredited === m.accredited && stored.accreditedGates?.length === 9 && stored.recordedBy === 'rsis', justified.body);
  check('the configuration document is untouched (whoever edits it gets no 409)', internal.store.get('active').seqNo === activeSeq && !('maturity' in internal.store.get('active').source.configuration));
  check('its own history: one entry with what was added', historyOf(internal, 'MATURITY_HISTORY').length === 1 && /Madurez de op\.exp\.3: nivel valorado L5/.test(historyOf(internal, 'MATURITY_HISTORY')[0].source.configuration.summary) && historyOf(internal, 'CONFIGURATION_HISTORY').length === 0);
  const version = justified.body.data.version;
  const againNull: any = await save({ controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-10-01', reviewer: 'Ana', result: 'CONFORME' }, expectedVersion: null });
  check('null when the document exists: 409', againNull.status === 409 && /La madurez ha cambiado/.test(againNull.body.message));
  const atOrBelow: any = await save({ controlId: 'op.exp.3', kind: 'assessment', entry: { level: m.accredited, reviewer: 'Luis', date: '2026-10-20' }, expectedVersion: version });
  check('assessed at the accredited level needs no justification; the earlier one is untouched', atOrBelow.status === 200 && record().assessments.length === 2 && JSON.stringify(record().assessments[0]) === JSON.stringify(stored));
  const stale: any = await save({ controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-10-01', reviewer: 'Ana', result: 'CONFORME' }, expectedVersion: version });
  check('over a newer document: 409 and nothing written', stale.status === 409 && !record().reviews);
  const configuration = createConfigurationHandlers({ logger, securityEnabled: true });
  const active = clone(internal.store.get('active').source.configuration);
  const configSave: any = await configuration.save(context(internal), { body: { configuration: active, expectedVersion: { seqNo: activeSeq, primaryTerm: 1 } } }, responses);
  check('the configuration saves over the version it read before the records (no 409)', configSave.status === 200 && record().assessments.length === 2, configSave.body);
  const badTargets: any = await configuration.save(context(internal), { body: { configuration: { ...active, global: { ...active.global, maturityTargets: { MEDIO: 9 } } } } }, responses);
  check('targets out of range are refused by the configuration save', badTargets.status === 400 && /maturityTargets/.test(badTargets.body.message));

  // Declared entries of the measures without engine (art. 32) go through the same route, role, version and history.
  const versionNow = () => ({ seqNo: maturityDoc().seqNo, primaryTerm: 1 });
  const declaration = { applies: 'si', level: 2, reference: 'POL-SEG-01', owner: 'RSEG', date: '2026-10-01' };
  check('a declared entry without the role: 403', (await save({ controlId: 'org.1', kind: 'declaration', entry: declaration, expectedVersion: versionNow() }, READER)).status === 403);
  const measured: any = await save({ controlId: 'op.exp.3', kind: 'declaration', entry: declaration, expectedVersion: versionNow() });
  check('a declared entry for a control the engine measures: 400', measured.status === 400 && /lo mide ENSFácil/.test(measured.body.message));
  check('a declared entry over a newer document: 409', (await save({ controlId: 'org.1', kind: 'declaration', entry: declaration, expectedVersion: null })).status === 409);
  const declared: any = await save({ controlId: 'org.1', kind: 'declaration', entry: declaration, expectedVersion: versionNow() });
  const declaredEntry = maturityDoc().source.configuration.controls['org.1']?.declarations?.[0];
  check('org.1 (no engine): saved in the maturity document, applies as a boolean, with who and when', declared.status === 200 && declaredEntry?.applies === true && declaredEntry.level === 2 && declaredEntry.recordedBy === 'rsis', declared.body);
  check('...with its history entry', historyOf(internal, 'MATURITY_HISTORY').some((h: any) => /Medida sin motor org\.1: aplica, nivel valorado L2/.test(h.source.configuration.summary)));
  const draftDeclared: any = await save({ controlId: 'mp.eq.2', kind: 'declaration', entry: { ...declaration, level: 1 }, expectedVersion: versionNow() });
  check('a DRAFT control also takes a declared entry', draftDeclared.status === 200);
  const totals: any = await save({ controlId: 'op.mon.2', kind: 'resources', entry: { period: '2027', ictBudget: 100000, reference: 'Presupuesto 2027', owner: 'Intervención' }, expectedVersion: versionNow() });
  check('the ICT totals of a period are recorded in op.mon.2', totals.status === 200 && maturityDoc().source.configuration.controls['op.mon.2'].resources[0].ictBudget === 100000);
  check('...and nowhere else', (await save({ controlId: 'op.exp.3', kind: 'resources', entry: { period: '2027', ictBudget: 1, reference: 'x', owner: 'y' }, expectedVersion: versionNow() })).status === 400);

  console.log('5. After recording: the view changes, the rows are not recomputed');
  const before = await ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  const reviewed: any = await save({ controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-10-15', reviewer: 'Ana', result: 'CONFORME' }, expectedVersion: before.body.data.maturityVersion });
  const probe: any = await evaluation.probe(context(internal), request({ include: 'control', controlId: 'op.exp.3', ...Z }), responses);
  check('the record succeeds with the version the view carried, and the probe changes so open screens refresh', reviewed.status === 200 && probe.body.data.fingerprint !== before.body.data.meta.fingerprint, reviewed.body);
  const after = await ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  check('the new review shows in the maturity, with the new version', after.body.data.maturity.reviews === 1 && after.body.data.maturity.lastReview.reviewer === 'Ana' && after.body.data.maturityVersion?.seqNo === reviewed.body.data.version.seqNo);
  check('no row was recomputed for it', after.body.data.meta.stats.computed === 0, after.body.data.meta.stats);
  check('the assessed level travels with it, judged against the level stored then', after.body.data.maturity.assessed.level === m.accredited && after.body.data.maturity.aboveAccredited === false);
  const machineBefore = await ready({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z });
  const machineReviewed: any = await save({ controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-10-16', reviewer: 'Rosa', result: 'CONFORME' }, expectedVersion: after.body.data.maturityVersion });
  const machineStale: any = await evaluation.evaluate(context(internal), request({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z }), responses);
  check('a machine view right after a record: maturity pending (the old one still shown), no version to record over it', machineReviewed.status === 200 && machineStale.body.data.meta.maturityPending === true && machineStale.body.data.meta.fingerprint.startsWith('refreshing:') && machineStale.body.data.maturity?.reviews === 1 && machineStale.body.data.maturityVersion === undefined, { meta: machineStale.body.data.meta, reviews: machineStale.body.data.maturity?.reviews });
  const machineAfter = await ready({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z });
  check('...then the new record, with the new version, and pending ends', machineAfter.body.data.maturity?.reviews === 2 && machineAfter.body.data.maturityVersion?.seqNo === machineReviewed.body.data.version.seqNo && !machineAfter.body.data.meta.maturityPending && machineBefore.body.data.maturity?.reviews === 1);
  const failing = setup({ failOrganisation: true });
  const machineView = () => failing.evaluation.evaluate(context(failing.internal), request({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z }), responses) as Promise<any>;
  const attempts: any[] = [];
  for (const wait of [0, 5e3, 30e3]) {
    maturityClock += wait;
    attempts.push((await machineView()).body.data);
    await failing.maturity.flush();
  }
  const givenUp = (await machineView()).body.data;
  check('an organisation pass that keeps failing: pending for 3 attempts (5 s and 30 s apart)', attempts.every(a => a.meta.maturityPending === true), attempts.map(a => a.meta.maturityPending));
  check('...then «No se ha podido calcular la madurez», no longer pending (the polling stops)', givenUp.maturityError === 'No se ha podido calcular la madurez.' && !givenUp.meta.maturityPending, givenUp.meta);
  const retried: any = await failing.evaluation.evaluate(context(failing.internal), request({ include: 'control', controlId: 'op.exp.3', agentId: '024', retryRefresh: '1', ...Z }), responses);
  check('«Reintentar» starts again', retried.body.data.meta.maturityPending === true && !retried.body.data.maturityError);
  await failing.maturity.flush();
  for (let i = 0; i < 3; i += 1) {
    maturityClock += 60e3;
    await machineView();
    await failing.maturity.flush();
  }
  const stillFailing = (await machineView()).body.data;
  maturityClock += 5 * 60e3;
  failing.options.failOrganisation = false;
  await machineView();
  await failing.maturity.flush();
  const recovered = await failing.ready({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z });
  check('the error does not stick: tried again behind every 5 minutes, it clears with the first successful pass', stillFailing.maturityError === 'No se ha podido calcular la madurez.' && !recovered.body.data.maturityError && recovered.body.data.maturity?.controlId === 'op.exp.3' && !recovered.body.data.meta.maturityPending, recovered.body.data.meta);
  maturityClock = 0;

  const busy = setup();
  await busy.ready({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z });
  const busyPolls: any[] = [];
  const extra: FakeDoc[] = [];
  for (let i = 0; i < 4; i += 1) {
    const doc = fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_run' }, 0.001 * (i + 1));
    extra.push(doc);
    alerts.docs.push(doc);
    busyPolls.push((await busy.evaluation.evaluate(context(busy.internal), request({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z }), responses)).body.data);
    await busy.maturity.flush();
  }
  alerts.docs.splice(alerts.docs.length - extra.length, extra.length);
  check('new facts between polls do not make a machine view pending: served from memory, with its version', busyPolls.every(d => !d.meta.maturityPending && d.maturity?.controlId === 'op.exp.3' && d.maturityVersion !== undefined), busyPolls.map(d => [d.meta.maturityPending, d.maturityVersion]));
  const staleOrg = setup({ refreshingOrganisation: true });
  const stalePolls: any[] = [];
  for (let i = 0; i < 3; i += 1) {
    stalePolls.push((await staleOrg.evaluation.evaluate(context(staleOrg.internal), request({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z }), responses)).body.data);
    await staleOrg.maturity.flush();
  }
  check('an organisation row that keeps refreshing does not either: the first answer waits once, then it is served', stalePolls.slice(1).every(d => !d.meta.maturityPending && d.maturity?.controlId === 'op.exp.3'), stalePolls.map(d => d.meta.maturityPending));
  // Organisation rows still being computed for 2 minutes (none fails): pending all along, never the error.
  const slowOrg = setup({ missingOrganisation: true });
  const slowView = async () => ((await slowOrg.evaluation.evaluate(context(slowOrg.internal), request({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z }), responses)) as any).body.data;
  const slowPolls: any[] = [];
  for (let t = 0; t <= 120; t += 10) {
    slowPolls.push(await slowView());
    await slowOrg.maturity.flush();
    maturityClock += 10e3;
  }
  slowOrg.options.missingOrganisation = false;
  await slowView();
  await slowOrg.maturity.flush();
  const slowDone = await slowView();
  maturityClock = 0;
  check('organisation rows still being computed for 2 minutes: the machine view stays pending, never «No se ha podido calcular»', slowPolls.every(d => d.meta.maturityPending === true && !d.maturityError), slowPolls.map(d => d.maturityError || d.meta.maturityPending));
  check('...and carries the maturity once the rows are there', !slowDone.meta.maturityPending && !slowDone.maturityError && slowDone.maturity?.controlId === 'op.exp.3', slowDone.meta);
  // Missing rows whose number never goes down: pending for 10 minutes, then failed attempts, the error and «Reintentar».
  const stuckOrg = setup({ missingOrganisation: true });
  const stuckView = async (extra: Record<string, string> = {}) => ((await stuckOrg.evaluation.evaluate(context(stuckOrg.internal), request({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z, ...extra }), responses)) as any).body.data;
  const stuckBefore = warnings.length;
  const stuckPolls: { t: number; data: any }[] = [];
  for (let t = 0; t <= 720; t += 30) {
    stuckPolls.push({ t, data: await stuckView() });
    await stuckOrg.maturity.flush();
    maturityClock += 30e3;
  }
  const stuckRetried = await stuckView({ retryRefresh: '1' });
  await stuckOrg.maturity.flush();
  maturityClock = 0;
  const stuckState = (d: any) => (d.maturityError ? 'ERR' : d.meta.maturityPending ? 'pend' : 'ok');
  check('missing rows that make no progress: pending for 10 minutes, then the error (3 failed attempts)', stuckPolls.filter(p => p.t < 600).every(p => stuckState(p.data) === 'pend') && stuckState(stuckPolls[stuckPolls.length - 1].data) === 'ERR' && warnings.slice(stuckBefore).some(w => /organisation rows made no progress for 10 minutes/.test(w)), stuckPolls.map(p => `${p.t}:${stuckState(p.data)}`));
  check('...«Reintentar» clears the stall and the view is pending again', stuckState(stuckRetried) === 'pend', stuckRetried.meta);
  // A current cached view while every refresh behind fails and new facts keep coming: served, never the error.
  const flakyOrg = setup();
  await flakyOrg.ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  await flakyOrg.ready({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z });
  flakyOrg.options.failOrganisation = true;
  const flakyBefore = warnings.length;
  const flakyPolls: any[] = [];
  const flakyFacts: FakeDoc[] = [];
  for (let t = 0; t <= 120; t += 10) {
    const doc = fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_run' }, 0.0001 * (t / 10 + 1));
    flakyFacts.push(doc);
    alerts.docs.push(doc);
    flakyPolls.push(((await flakyOrg.evaluation.evaluate(context(flakyOrg.internal), request({ include: 'control', controlId: 'op.exp.3', agentId: '024', ...Z }), responses)) as any).body.data);
    await flakyOrg.maturity.flush();
    maturityClock += 10e3;
  }
  alerts.docs.splice(alerts.docs.length - flakyFacts.length, flakyFacts.length);
  maturityClock = 0;
  check('a current cached view whose refreshes behind fail 3 times and more: served with its version, never the error', warnings.slice(flakyBefore).some(w => /organisation maturity \(attempt 3\)/.test(w)) && flakyPolls.every(d => !d.meta.maturityPending && !d.maturityError && d.maturity?.controlId === 'op.exp.3' && d.maturityVersion !== undefined), { polls: flakyPolls.map(d => d.maturityError || d.meta.maturityPending), log: warnings.slice(flakyBefore) });

  console.log('6. Reading snapshots: as the user');
  const read = (query: any, user: any = ADMIN, noSnapshots = false) => routes.snapshots(context(internal, user, noSnapshots), { query }, responses) as Promise<any>;
  const readerRead: any = await read({ from: '2026-10-01', to: '2026-10-20', controlId: 'op.exp.3' }, READER);
  check('any user who can read the index reads them (no administrator role needed)', readerRead.status === 200 && readerRead.body.data.snapshots.length === 1);
  const noPermission: any = await read({ from: '2026-10-01', to: '2026-10-20' }, READER, true);
  check('without read permission on wazuh-ens-snapshots: 403 with the reason', noPermission.status === 403 && /wazuh-ens-snapshots/.test(noPermission.body.message), noPermission.body);
  check('a bad range: 400', (await read({ from: '2026-10-21', to: '2026-10-20' })).status === 400);
  check('more than 400 days: 400', (await read({ from: '2025-01-01', to: '2026-10-20' })).status === 400);
  check('every control', (await read({ from: '2026-10-01', to: '2026-10-20' })).body.data.snapshots.length === today.length);
  const blind = setup();
  const blindDetail = await blind.ready({ include: 'control', controlId: 'op.exp.3', ...Z }, READER, true);
  check('the L5 trend says the snapshots could not be read, instead of «hacen falta 90 días»', /sin permiso de lectura de wazuh-ens-snapshots/.test(blindDetail.body.data.maturity?.gates.find((g: any) => g.id === 'L5.trend').reason || ''), blindDetail.body.data.maturity?.gates?.[7]);
  check('...and the L4 threshold gate does not pass on them', !blindDetail.body.data.maturity?.gates.find((g: any) => g.id === 'L4.threshold').passed);
  const repeated = setup({ inputsTtlMs: 0 });
  const warnedBefore = warnings.length;
  for (let i = 0; i < 3; i += 1) await repeated.ready({ include: 'control', controlId: 'op.exp.3', ...Z }, READER, true);
  check('the missing permission is logged once per user (in one process), not on every read', warnings.slice(warnedBefore).filter(w => /could not read the maturity snapshots for ana/.test(w)).length === 1, warnings.slice(warnedBefore));
  // The justification rule reads the snapshots as the internal user: a viewer without permission does not lower the bar.
  const viewerSave: any = await blind.routes.save(context(blind.internal, { user_name: 'luis', roles: ['ensfacil_admin'] }, true), { body: { controlId: 'op.exp.3', kind: 'assessment', entry: { level: 1, reviewer: 'Luis', date: '2026-10-20' }, expectedVersion: null } }, responses);
  const storedGates = blind.internal.store.get('maturity')?.source.configuration?.controls?.['op.exp.3']?.assessments?.[0]?.accreditedGates || [];
  check('an assessment by an administrator without read on the snapshots is judged with the snapshots read by the server', viewerSave.status === 200 && storedGates.length === 9 && !/sin permiso/.test(storedGates.find((g: any) => g.id === 'L5.trend')?.reason || ''), storedGates.find((g: any) => g.id === 'L5.trend'));

  console.log('7. The days come from the indexer, formatted');
  check('the activity histogram asks the indexer for yyyy-MM-dd days in the configured zone', seen.length > 0 && seen.every(h => h.format === 'yyyy-MM-dd' && h.time_zone === 'Europe/Madrid'), seen[0]);
  const firstRange = firstFactQueries[0]?.query.bool.filter[0].range['@timestamp'];
  check('each machine\'s first fact: one bounded aggregation (400 days, one bucket per machine), once', firstFactQueries.length === 1 && firstRange.gte === '2025-09-15T12:00:00.000Z' && firstFactQueries[0].aggs.agents.terms.size === 3 && firstFactQueries[0].aggs.agents.aggs.first.min.field === '@timestamp', firstFactQueries.map(q => q.query));

  console.log('7b. Assessment check and first facts');
  const judging = setup();
  await judging.ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  const judgeQueries: any[] = [];
  const judgeSearch = judging.internal.search;
  judging.internal.search = async (req: any) => {
    if (req.body?.aggs?.controls?.aggs?.agents?.aggs?.days) judgeQueries.push(Object.keys(req.body.aggs.controls.filters.filters));
    return judgeSearch(req);
  };
  const reused: any = await judging.routes.save(context(judging.internal), { body: { controlId: 'op.exp.3', kind: 'assessment', entry: { level: 1, reviewer: 'Luis', date: '2026-10-20' }, expectedVersion: null } }, responses);
  check('with the screen\'s inputs 15 minutes old or less, the assessment reads no activity again', reused.status === 200 && judgeQueries.length === 0, judgeQueries);
  maturityClock += 16 * 60e3;
  const fresh2: any = await judging.routes.save(context(judging.internal), { body: { controlId: 'op.exp.3', kind: 'assessment', entry: { level: 1, reviewer: 'Luis', date: '2026-10-20' }, expectedVersion: reused.body.data.version } }, responses);
  check('...older ones: only this control\'s activity is read', fresh2.status === 200 && judgeQueries.length === 1 && JSON.stringify(judgeQueries[0]) === '["op.exp.3"]', judgeQueries);
  maturityClock = 0;
  const slowJudge = setup({ justificationTimeoutMs: 50, slow: 30 });
  const timedOut: any = await slowJudge.routes.save(context(slowJudge.internal), { body: { controlId: 'op.exp.3', kind: 'assessment', entry: { level: 1, reviewer: 'Luis', date: '2026-10-20' }, expectedVersion: null } }, responses);
  check('an accredited level that takes too long: 503 with a clear message, nothing saved', timedOut.status === 503 && /No se ha podido calcular a tiempo el nivel acreditado/.test(timedOut.body.message) && !slowJudge.internal.store.get('maturity'), timedOut.body);
  slowJudge.options.slow = 0;
  await slowJudge.maturity.flush();
  const noFirst = setup({ failFirstFacts: true });
  const noFirstDetail = await noFirst.ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  const noFirstGates = noFirstDetail.body.data.maturity?.gates || [];
  check('first facts unreadable: the activity is still read (L1 and L2 pass) and the reason says machines count from the period start', noFirstGates.find((g: any) => g.id === 'L1.facts')?.passed && noFirstGates.find((g: any) => g.id === 'L2.recurrence')?.passed && /no se pudo leer el primer hecho de cada máquina/.test(noFirstGates.find((g: any) => g.id === 'L2.recurrence')?.reason || ''), noFirstGates.slice(0, 2));
  // «Reintentar» clears the remembered lookup failure and reads the inputs again, so the lookup is actually retried.
  let noFirstLookups = 0;
  const noFirstSearch = noFirst.internal.search;
  noFirst.internal.search = async (req: any) => {
    if (isFirstFactLookup(req)) noFirstLookups += 1;
    return noFirstSearch(req);
  };
  noFirst.options.failFirstFacts = false;
  maturityClock += 6 * 60e3;
  await noFirst.ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  const remembered = noFirstLookups;
  await noFirst.ready({ include: 'control', controlId: 'op.exp.3', retryRefresh: '1', ...Z });
  const retriedLookup = await noFirst.ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  maturityClock = 0;
  const retriedL2 = retriedLookup.body.data.maturity?.gates.find((g: any) => g.id === 'L2.recurrence');
  check('a remembered lookup failure is not repeated on the next input read, but «Reintentar» retries it and the note goes', remembered === 0 && noFirstLookups === 1 && retriedL2?.passed && !/no se pudo leer el primer hecho/.test(retriedL2?.reason || ''), { remembered, noFirstLookups, retriedL2 });
  // Any other failure of the accredited level: its own message, not the timeout one.
  const assessmentBody = { controlId: 'op.exp.3', kind: 'assessment', entry: { level: 1, reviewer: 'Luis', date: '2026-10-20' }, expectedVersion: null };
  const failingRoutes = (error: Error) => createMaturityHandlers({ logger, securityEnabled: true, maturity: { ...judging.maturity, accreditedFor: async () => Promise.reject(error) } as any, clock: () => clock });
  const refusedAssessment: any = await failingRoutes(Object.assign(new Error('security_exception: no permissions for [indices:data/read/search]'), { statusCode: 403 })).save(context(judging.internal), { body: assessmentBody }, responses);
  const brokenAssessment: any = await failingRoutes(new Error('unexpected')).save(context(judging.internal), { body: assessmentBody }, responses);
  check('an accredited level that fails for another reason: its own message (403 refused read, 500 otherwise), never «a tiempo»', refusedAssessment.status === 403 && /^No se ha podido calcular el nivel acreditado del control: sin permiso/.test(refusedAssessment.body.message) && brokenAssessment.status === 500 && /el detalle está en el log del dashboard/.test(brokenAssessment.body.message) && !/a tiempo/.test(refusedAssessment.body.message + brokenAssessment.body.message), [refusedAssessment, brokenAssessment]);
  // The scope shrinks to a machine with 10 days of facts: the removed machine's 31 days must not count for L2.
  const newcomer: FakeDoc[] = [];
  for (let h = 10 * 24; h >= 1; h -= 1) {
    newcomer.push(fact('025', 'nuevo', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
    newcomer.push(fact('025', 'nuevo', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', servicio: 'sshd', estado: 'CUMPLE' }, h - 0.01));
  }
  newcomer.push({ _id: 'm025', _index: 'wazuh-monitoring-2026.10.20', _source: { id: '025', name: 'nuevo', group: ['ens', 'new'], status: 'active', timestamp: new Date(clock.getTime() - 360e3).toISOString(), manager: 'manager' } } as any);
  alerts.docs.push(...newcomer);
  const shrink = setup();
  const shrinkLookups: any[] = [];
  const shrinkSearch = shrink.internal.search;
  shrink.internal.search = async (req: any) => {
    if (isFirstFactLookup(req)) shrinkLookups.push(req);
    return shrinkSearch(req);
  };
  const l2Of = (answer: any) => answer.body.data.maturity?.gates.find((g: any) => g.id === 'L2.recurrence');
  const wide = await shrink.ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  const shrinkActive = shrink.internal.store.get('active');
  const narrowed = { ...shrinkActive.source.configuration, scope: { mode: 'group', agentIds: [], groupIds: ['new'] }, updatedAt: '2026-10-20T11:00:00.000Z' };
  shrink.internal.store.set('active', { ...shrinkActive, source: { ...shrinkActive.source, configuration: narrowed, updatedAt: '2026-10-20T11:00:00.000Z' }, seqNo: shrinkActive.seqNo + 100 });
  const narrow = await shrink.ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  alerts.docs.splice(alerts.docs.length - newcomer.length, newcomer.length);
  check('scope {024, 025}: L2 passes on 024\'s 31 days', l2Of(wide)?.passed === true, l2Of(wide));
  check('...shrunk to {025} (10 days): L2 fails for the history, from the same first-fact read (no second lookup)', l2Of(narrow)?.passed === false && /Faltan 19 días de historial/.test(l2Of(narrow)?.reason || '') && shrinkLookups.length === 1, { gate: l2Of(narrow), lookups: shrinkLookups.length });

  console.log('8. DRAFT controls (no collector yet): maturity reaches the response and the detail');
  const drafts = list.controls.filter((c: any) => !c.measured).map((c: any) => c.controlId).sort();
  check('the 11 DRAFT controls are in the overview maturity, not measured, without accredited level', drafts.length === 11 && list.controls.filter((c: any) => !c.measured).every((c: any) => c.accredited === undefined), drafts);
  check('...and they count as «sin medición» in the distribution', list.distribution.accredited.notMeasured === 11, list.distribution.accredited);
  const draftDetail = await ready({ include: 'control', controlId: 'mp.eq.3', ...Z });
  const dm = draftDetail.body.data.maturity;
  check('a DRAFT control\'s detail: maturity present (not stuck on pending), not measured, no gates, with the document version', dm && !draftDetail.body.data.meta.maturityPending && dm.measured === false && dm.applicable === true && dm.gates.length === 0 && dm.accredited === undefined && 'maturityVersion' in draftDetail.body.data, draftDetail.body.data.meta);
  const draftMachine: any = await evaluation.evaluate(context(internal), request({ include: 'control', controlId: 'mp.eq.3', agentId: '024', ...Z }), responses);
  await maturity.flush();
  const draftMachineReady = draftMachine.body.data.maturity ? draftMachine : await ready({ include: 'control', controlId: 'mp.eq.3', agentId: '024', ...Z });
  check('...also with a machine selected', draftMachineReady.body.data.maturity?.measured === false);
  const draftUnjustified: any = await save({ controlId: 'mp.eq.3', kind: 'assessment', entry: { level: 2, reviewer: 'Luis', date: '2026-10-20' }, expectedVersion: draftDetail.body.data.maturityVersion });
  check('assessing a DRAFT control above L0 needs a justification (accredited L0)', draftUnjustified.status === 400 && /supera al acreditado \(L0\)/.test(draftUnjustified.body.message), draftUnjustified.body);
  const draftAssessed: any = await save({ controlId: 'mp.eq.3', kind: 'assessment', entry: { level: 2, reviewer: 'Luis', date: '2026-10-20', justification: 'Procedimiento de portátiles aprobado; sin recolector todavía' }, expectedVersion: draftDetail.body.data.maturityVersion });
  const draftAfter = await ready({ include: 'control', controlId: 'mp.eq.3', ...Z });
  check('...with it, the assessed level is declared while accredited stays «sin medición»', draftAssessed.status === 200 && draftAfter.body.data.maturity.assessed?.level === 2 && draftAfter.body.data.maturity.accredited === undefined && draftAfter.body.data.maturity.aboveAccredited, draftAssessed.body);
  const low = setup({ ensLevel: 'BAJO' });
  const lowOverview = await low.ready({ include: 'overview', ...Z });
  const lowOf = (id: string) => lowOverview.body.data.maturity.controls.find((c: any) => c.controlId === id);
  check('at BAJO, a DRAFT control that only applies from MEDIO is not applicable; one for every level is', lowOf('mp.eq.2')?.applicable === false && lowOf('mp.s.4')?.applicable === false && lowOf('mp.eq.3')?.applicable === true, [lowOf('mp.eq.2'), lowOf('mp.eq.3')]);

  // The detail as the browser draws it, from that same server answer.
  const { installReactHarness } = require('./fixtures/react-harness');
  let shown: any;
  const h = installReactHarness({
    overrides: { [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({ useEnsEvaluation: () => ({ ...shown, retry: () => undefined }) }) },
  });
  const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
  const { hydrateENSScope } = require('../common/ens/core/scope/runtime');
  const { ENSControls } = require('../public/ens/data');
  const { ControlDetailENS } = require('../public/ens/controls/control-detail');
  ensConfigurationRepository.completeHydration(clone(internal.store.get('active').source.configuration));
  await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => [{ id: '024', name: 'wazuh-real', groups: ['ens'], status: 'active' }] as any, true);
  shown = { data: draftDetail.body.data, isLoading: false, isRefreshing: false };
  let page = await h.render(ControlDetailENS, { control: ENSControls.find((c: any) => c.id === 'mp.eq.3'), onBack: () => undefined });
  const valorar = h.find('EuiButton', /^Valorar$/);
  check('the detail shows «Madurez: sin valorar (sin medición todavía, objetivo …)», never «calculando…»', /Madurez: sin valorar \(sin medición todavía, objetivo L\d\)/.test(page) && !/Madurez: calculando/.test(page), page.slice(0, 900));
  check('...«Sin medición todavía» in the panel and «Valorar» enabled', /Sin medición todavía/.test(page) && Boolean(valorar) && !valorar!.props.isDisabled, valorar?.props);
  shown = { data: draftAfter.body.data, isLoading: false, isRefreshing: false };
  h.reset();
  page = await h.render(ControlDetailENS, { control: ENSControls.find((c: any) => c.id === 'mp.eq.3'), onBack: () => undefined });
  check('after assessing: «Madurez: L2 (sin medición todavía, …)» with who and when', /Madurez: L2 \(sin medición todavía, objetivo L\d\)/.test(page) && /Valorado L2 por Luis el 2026-10-20/.test(page), page.slice(0, 900));
  check('...marked as resting on the justification alone, not «frente a L0»', /Valorado L2 sin medición todavía: se apoya solo en la justificación/.test(page) && !/frente a L0/.test(page));

  await Promise.all([maturity.flush(), short.maturity.flush(), job.maturity.flush(), hooked.maturity.flush(), low.maturity.flush(), fresh.maturity.flush(), repeated.maturity.flush(), blind.maturity.flush(), busy.maturity.flush(), staleOrg.maturity.flush(), judging.maturity.flush(), noFirst.maturity.flush()]);
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
