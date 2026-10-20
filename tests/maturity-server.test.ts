/** Maturity on the server: responses, pending inputs, own document and history, daily snapshots and the daily job. */
import { createFakeIndexer, FakeDoc, matchesQuery, pickSource } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { createEvaluationHandlers } from '../server/lib/evaluation-handlers';
import { createMaturityService } from '../server/lib/maturity/maturity-service';
import { createMaturityHandlers } from '../server/lib/maturity-handlers';
import { createConfigurationHandlers } from '../server/lib/configuration-handlers';
import { writeSnapshots } from '../server/lib/maturity/snapshot-storage';
import { createDailySnapshotJob } from '../server/lib/maturity/daily-snapshot-job';
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

// The plugin's own indices (configuration and snapshots), with `_seq_no`, `if_seq_no`, `create` and delete by query.
const OWN = ['wazuh-ens-configuration', 'wazuh-ens-snapshots'];
const createStore = (options: { refuseSnapshots?: boolean; failPurges?: number } = {}) => {
  const store = new Map<string, { index: string; source: any; seqNo: number }>();
  let sequence = 0;
  let purgeFailures = options.failPurges || 0;
  const calls = { bulk: [] as string[][], deleteByQuery: 0 };
  const value = (source: any, field: string) => String(field.split('.').reduce((v: any, k) => (v == null ? v : v[k]), source) ?? '');
  const client: any = {
    store,
    calls,
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }) },
    search: async (request: any) => {
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

const setup = (options: { evaluationPeriod?: string; ensLevel?: string; refuseSnapshots?: boolean; failPurges?: number } = {}) => {
  const internal = createStore(options);
  seed(internal, options.evaluationPeriod, options.ensLevel);
  const service = createEvaluationService({ logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
  const maturity = createMaturityService({ logger, evaluation: service });
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
  return { internal, service, maturity, evaluation, routes, ready };
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
  hooked.internal.search = async (req: any) => {
    if (req.body?.aggs?.controls?.aggs?.agents?.aggs?.days) seen.push(req.body.aggs.controls.aggs.agents.aggs.days.date_histogram);
    return plainSearch(req);
  };
  await hooked.ready({ include: 'control', controlId: 'op.exp.3', ...Z });

  console.log('2. Daily snapshots from administrators\' views');
  const today = snapshotIds(internal);
  check('an administrator view of the whole scope writes one snapshot per control and day (DRAFT ones too: their assessed level)', today.length === list.controls.length && today.includes('op.exp.3|2026-10-20'), [today.length, list.controls.length]);
  const snap = internal.store.get('op.exp.3|2026-10-20').source;
  check('the snapshot has status, score, coverage and the levels', snap.date === '2026-10-20' && typeof snap.status === 'string' && 'score' in snap && snap.accredited === m.accredited && snap.target === m.target && snap.recordedBy === 'rsis', snap);
  const writesBefore = internal.calls.bulk.length;
  await ready({ include: 'overview', ...Z });
  check('the same day again: nothing new written, still one per control', internal.calls.bulk.length === writesBefore && snapshotIds(internal).length === today.length);
  await writeSnapshots(internal, logger, [{ ...snap, score: 1, recordedAt: clock.toISOString() }]);
  check('writing a day again replaces its document (idempotent per day)', snapshotIds(internal).length === today.length && internal.store.get('op.exp.3|2026-10-20').source.score === 1);
  check('the retention purge ran once that day', internal.calls.deleteByQuery === 1);
  const other = setup();
  await other.ready({ include: 'overview', ...Z }, READER);
  check('a viewer without the administrator role writes no snapshot', snapshotIds(other.internal).length === 0);
  const purging = setup({ failPurges: 1 });
  await purging.ready({ include: 'overview', ...Z });
  check('a failed purge is logged apart, and the snapshots are written anyway', snapshotIds(purging.internal).length > 0 && warnings.some(w => /could not purge the old maturity snapshots/.test(w)) && !warnings.some(w => /could not write the maturity snapshots/.test(w)));
  purging.internal.store.delete('op.exp.3|2026-10-20');
  await purging.ready({ include: 'overview', ...Z });
  check('...and retried with the next write, not a day later', purging.internal.calls.deleteByQuery === 2);

  console.log('3. The daily job (internal user)');
  const job = setup();
  const internalUser = { ...job.internal, transport: { request: async () => ({ body: INTERNAL }) } };
  let evaluations = 0;
  const daily = createDailySnapshotJob({
    logger,
    client: internalUser,
    maturity: job.maturity,
    clock: () => clock,
    createEvaluation: () => {
      evaluations += 1;
      return createEvaluationService({ logger, securityEnabled: true, clock: () => clock, maxConcurrentReads: 2 });
    },
  });
  await daily.runOnce();
  const jobIds = snapshotIds(job.internal);
  check('it writes the day with a complete evaluation of its own, though the user is not an administrator', jobIds.length === today.length && job.internal.store.get('op.exp.3|2026-10-20').source.recordedBy === 'ENSFácil (tarea diaria)', jobIds.length);
  const jobWrites = job.internal.calls.bulk.length;
  await daily.runOnce();
  check('the same day: no second evaluation, nothing written', evaluations === 1 && job.internal.calls.bulk.length === jobWrites);
  clock = new Date('2026-10-21T12:00:00Z');
  await daily.runOnce();
  check('the next day: a new evaluation and the new day written, yesterday kept', evaluations === 2 && snapshotIds(job.internal).filter((id: string) => id.endsWith('|2026-10-21')).length === today.length && snapshotIds(job.internal).filter((id: string) => id.endsWith('|2026-10-20')).length === today.length);
  clock = new Date('2026-10-20T12:00:00Z');
  const refused = setup({ refuseSnapshots: true });
  const refusedJob = createDailySnapshotJob({ logger, client: { ...refused.internal, transport: { request: async () => ({ body: INTERNAL }) } }, maturity: refused.maturity, clock: () => clock, createEvaluation: () => createEvaluationService({ logger, securityEnabled: true, clock: () => clock }) });
  await refusedJob.runOnce();
  check('refused by the index: one warning, the job stops and the administrators\' views remain', refusedJob.disabled && warnings.filter(w => /daily maturity snapshot was refused/.test(w)).length === 1, warnings.slice(-3));
  await refusedJob.runOnce();
  check('...without warning again', warnings.filter(w => /daily maturity snapshot was refused/.test(w)).length === 1);

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

  console.log('5. After recording: the view changes, the rows are not recomputed');
  const before = await ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  const reviewed: any = await save({ controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-10-15', reviewer: 'Ana', result: 'CONFORME' }, expectedVersion: before.body.data.maturityVersion });
  const probe: any = await evaluation.probe(context(internal), request({ include: 'control', controlId: 'op.exp.3', ...Z }), responses);
  check('the record succeeds with the version the view carried, and the probe changes so open screens refresh', reviewed.status === 200 && probe.body.data.fingerprint !== before.body.data.meta.fingerprint, reviewed.body);
  const after = await ready({ include: 'control', controlId: 'op.exp.3', ...Z });
  check('the new review shows in the maturity, with the new version', after.body.data.maturity.reviews === 1 && after.body.data.maturity.lastReview.reviewer === 'Ana' && after.body.data.maturityVersion?.seqNo === reviewed.body.data.version.seqNo);
  check('no row was recomputed for it', after.body.data.meta.stats.computed === 0, after.body.data.meta.stats);
  check('the assessed level travels with it, judged against the level stored then', after.body.data.maturity.assessed.level === m.accredited && after.body.data.maturity.aboveAccredited === false);

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

  console.log('7. The days come from the indexer, formatted');
  check('the activity histogram asks the indexer for yyyy-MM-dd days in the configured zone', seen.length > 0 && seen.every(h => h.format === 'yyyy-MM-dd' && h.time_zone === 'Europe/Madrid'), seen[0]);

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

  await Promise.all([maturity.flush(), short.maturity.flush(), job.maturity.flush(), hooked.maturity.flush(), low.maturity.flush()]);
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
