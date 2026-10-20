/** Maturity on the server: evaluation responses, daily snapshots, the save route (roles, history, concurrency). */
import { createFakeIndexer, FakeDoc, matchesQuery, pickSource } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { createEvaluationHandlers } from '../server/lib/evaluation-handlers';
import { createMaturityService } from '../server/lib/maturity/maturity-service';
import { createMaturityHandlers } from '../server/lib/maturity-handlers';
import { createConfigurationHandlers } from '../server/lib/configuration-handlers';
import { writeSnapshots } from '../server/lib/maturity/snapshot-storage';
import { groupActivityControls, MAX_ACTIVITY_BUCKETS } from '../server/lib/maturity/activity';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';

declare const process: { exit(code: number): void };
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
const createStore = () => {
  const store = new Map<string, { index: string; source: any; seqNo: number }>();
  let sequence = 0;
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
const currentFor = (user: any) => ({
  ...alerts,
  transport: { request: async ({ path }: any) => (path === '/_plugins/_security/authinfo' ? { body: user } : Promise.reject(new Error('no handler found for uri'))) },
});
const context = (internal: any, user: any = ADMIN) => ({ core: { opensearch: { client: { asInternalUser: internal, asCurrentUser: currentFor(user) } } } });
const responses = { ok: (r: any) => ({ status: 200, body: r.body }), customError: (r: any) => ({ status: r.statusCode, body: r.body }) };
const logger: any = { info() {}, warn() {}, debug() {}, error() {} };
const request = (query: Record<string, string>) => ({ query, events: {} });

const seed = (internal: any) => {
  const configuration = { ...clone(defaultENSConfigurationTemplate), scope: { mode: 'group', agentIds: [], groupIds: ['ens'] }, updatedAt: '2026-10-14T10:00:00.000Z' };
  internal.store.set('active', { index: 'wazuh-ens-configuration', source: { documentType: 'ACTIVE_CONFIGURATION', configuration, updatedAt: '2026-10-14T10:00:00.000Z' }, seqNo: 1 });
};

const setup = () => {
  const internal = createStore();
  seed(internal);
  const service = createEvaluationService({ logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
  const maturity = createMaturityService({ logger, evaluation: service });
  const evaluation = createEvaluationHandlers({ logger, securityEnabled: true, service, maturity });
  const routes = createMaturityHandlers({ logger, securityEnabled: true, maturity, clock: () => clock });
  return { internal, service, maturity, evaluation, routes };
};
const snapshotIds = (internal: any) => [...internal.store.entries()].filter(([, doc]: any) => doc.index === 'wazuh-ens-snapshots').map(([id]: any) => id).sort();

(async () => {
  const { internal, service, maturity, evaluation, routes } = setup();

  console.log('1. In the evaluation response');
  const detail: any = await evaluation.evaluate(context(internal), request({ include: 'control', controlId: 'op.exp.3', timeZone: 'Europe/Madrid' }), responses);
  const m = detail.body?.data?.maturity;
  check('the control view carries its maturity with the nine gates', detail.status === 200 && m?.controlId === 'op.exp.3' && m.gates.length === 9, detail.body?.data?.maturityError || m);
  check('facts every day: L1 and L2 pass', m.gates.find((g: any) => g.id === 'L1.facts').passed && m.gates.find((g: any) => g.id === 'L2.recurrence').passed, m.gates.slice(0, 2));
  check('the accredited level is the highest with all gates passing', m.accredited === Math.max(0, ...[1, 2, 3, 4, 5].filter(l => [1, 2, 3, 4, 5].filter(k => k <= l).every(k => m.gates.filter((g: any) => g.level === k).every((g: any) => g.passed)))), m);
  check('without procedure the L3 gate says so', /Sin procedimiento/.test(m.gates.find((g: any) => g.id === 'L3.procedure').reason));
  check('target by category (default MEDIO? the template level)', [2, 3, 4].includes(m.target) && m.targetSource === 'CATEGORY', m.target);
  const agentView: any = await evaluation.evaluate(context(internal), request({ include: 'control', controlId: 'op.exp.3', agentId: '024', timeZone: 'Europe/Madrid' }), responses);
  check('a machine view shows the organisation maturity', agentView.body.data.maturity?.accredited === m.accredited && agentView.body.data.maturity.gates.length === 9, agentView.body.data.maturityError);
  const overview: any = await evaluation.evaluate(context(internal), request({ include: 'overview', timeZone: 'Europe/Madrid' }), responses);
  const list = overview.body.data.maturity;
  check('the overview carries every control and the distribution', list?.controls?.length > 20 && list.distribution && list.distribution.applicable > 0, list && { n: list.controls?.length, d: list.distribution });
  check('a DRAFT control has no accredited level («sin medición todavía»)', list.controls.filter((c: any) => !c.measured).every((c: any) => c.accredited === undefined));
  const machinePanel: any = await evaluation.evaluate(context(internal), request({ include: 'dashboard', agentId: '024', timeZone: 'Europe/Madrid', timelineDays: '7' }), responses);
  check('a machine panel carries the organisation distribution', JSON.stringify(machinePanel.body.data.maturity?.distribution) === JSON.stringify(list.distribution), machinePanel.body.data.maturity);
  const results: any = await evaluation.evaluate(context(internal), request({ include: 'results', timeZone: 'Europe/Madrid' }), responses);
  check('the results view (panorama) carries no maturity', results.body.data.maturity === undefined);

  const ids = Array.from({ length: 44 }, (_, i) => `c${i}`);
  const groups = groupActivityControls(ids, 101, 30);
  check('the activity of a large scope goes in groups below the bucket limit', groups.flat().length === 44 && groups.every(g => g.length * 101 * 32 <= MAX_ACTIVITY_BUCKETS), groups.map(g => g.length));
  check('a lab scope reads it in one search', groupActivityControls(ids, 7, 30).length === 1);

  console.log('2. Daily snapshots');
  await maturity.flush();
  const today = snapshotIds(internal);
  check('an administrator view of the whole scope writes one snapshot per control and day', today.length === list.controls.filter((c: any) => c.measured).length && today.includes('op.exp.3|2026-10-20'), today.length);
  const snap = internal.store.get('op.exp.3|2026-10-20').source;
  check('the snapshot has status, score, coverage and the levels', snap.date === '2026-10-20' && typeof snap.status === 'string' && 'score' in snap && snap.accredited === m.accredited && snap.target === m.target && snap.recordedBy === 'rsis', snap);
  const writesBefore = internal.calls.bulk.length;
  await evaluation.evaluate(context(internal), request({ include: 'overview', timeZone: 'Europe/Madrid' }), responses);
  await maturity.flush();
  check('the same day again: nothing new written, still one per control', internal.calls.bulk.length === writesBefore && snapshotIds(internal).length === today.length);
  await writeSnapshots(internal, logger, [{ ...snap, score: 1, recordedAt: clock.toISOString() }]);
  check('writing a day again replaces its document (idempotent per day)', snapshotIds(internal).length === today.length && internal.store.get('op.exp.3|2026-10-20').source.score === 1);
  check('the retention purge ran once that day', internal.calls.deleteByQuery === 1);

  const other = setup();
  await other.evaluation.evaluate(context(other.internal, READER), request({ include: 'overview', timeZone: 'Europe/Madrid' }), responses);
  await other.maturity.flush();
  check('a viewer without the administrator role writes no snapshot', snapshotIds(other.internal).length === 0);
  await other.evaluation.evaluate(context(other.internal), request({ include: 'control', controlId: 'op.exp.3', agentId: '024', timeZone: 'Europe/Madrid' }), responses);
  await other.maturity.flush();
  check('a machine view writes the organisation snapshot of its control only', JSON.stringify(snapshotIds(other.internal)) === '["op.exp.3|2026-10-20"]', snapshotIds(other.internal));

  console.log('3. The save route');
  const save = (body: any, user: any = ADMIN) => routes.save(context(internal, user), { body }, responses) as Promise<any>;
  const version = () => ({ seqNo: internal.store.get('active').seqNo, primaryTerm: 1 });
  const historyCount = () => [...internal.store.values()].filter((doc: any) => doc.source.documentType === 'CONFIGURATION_HISTORY').length;
  const record = () => internal.store.get('active').source.configuration.maturity?.controls?.['op.exp.3'] || {};
  const assessment = { level: 5, reviewer: 'Luis', date: '2026-10-19' };

  const refused: any = await save({ controlId: 'op.exp.3', kind: 'assessment', entry: assessment, expectedVersion: version() }, READER);
  check('without the role: 403 and nothing written', refused.status === 403 && /ensfacil_admin o all_access/.test(refused.body.message) && !record().assessments);
  check('a control outside the catalog: 400', (await save({ controlId: 'xx.1', kind: 'review', entry: {} })).status === 400);
  check('an unknown record: 400', (await save({ controlId: 'op.exp.3', kind: 'nota', entry: {} })).status === 400);
  const bad: any = await save({ controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-13-01', reviewer: '' } });
  check('an invalid entry: 400 with the reasons', bad.status === 400 && /Fecha/.test(bad.body.message) && /Revisor/.test(bad.body.message), bad.body);
  const unjustified: any = await save({ controlId: 'op.exp.3', kind: 'assessment', entry: assessment, expectedVersion: version() });
  check('assessed above accredited without justification: 400', unjustified.status === 400 && new RegExp(`supera al acreditado \\(L${m.accredited}\\)`).test(unjustified.body.message), unjustified.body);
  const historyBefore = historyCount();
  const justified: any = await save({ controlId: 'op.exp.3', kind: 'assessment', entry: { ...assessment, justification: 'Auditoría externa de 2026' }, expectedVersion: version() });
  const stored = record().assessments?.[0];
  check('with the justification: saved with the accredited level, who and when', justified.status === 200 && stored?.level === 5 && stored.accredited === m.accredited && stored.recordedBy === 'rsis' && stored.recordedAt === clock.toISOString(), justified.body);
  check('the response carries the record and the new version', justified.body.data.record.assessments.length === 1 && justified.body.data.metadata.seqNo === internal.store.get('active').seqNo);
  check('the previous document went to the history and the audit trail says it', historyCount() > historyBefore && /Madurez de op\.exp\.3: nivel valorado L5/.test(internal.store.get('active').source.configuration.auditTrail.slice(-1)[0].summary));
  const atOrBelow: any = await save({ controlId: 'op.exp.3', kind: 'assessment', entry: { level: m.accredited, reviewer: 'Luis', date: '2026-10-20' }, expectedVersion: version() });
  check('assessed at the accredited level needs no justification', atOrBelow.status === 200 && record().assessments.length === 2);
  check('the earlier assessment is still there, untouched', JSON.stringify(record().assessments[0]) === JSON.stringify(stored));
  const stale: any = await save({ controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-10-01', reviewer: 'Ana', result: 'CONFORME' }, expectedVersion: { seqNo: 1, primaryTerm: 1 } });
  check('over a newer document: 409 and nothing written', stale.status === 409 && /ha cambiado/.test(stale.body.message) && !record().reviews);
  const afterNull: any = await save({ controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-10-01', reviewer: 'Ana', result: 'CONFORME' }, expectedVersion: null });
  check('«there was none» when there is one: 409', afterNull.status === 409);

  const configuration = createConfigurationHandlers({ logger, securityEnabled: true });
  const active = clone(internal.store.get('active').source.configuration);
  const wiped: any = await configuration.save(context(internal), { body: { configuration: { ...active, maturity: { controls: {} } }, expectedVersion: version() } }, responses);
  check('a configuration save cannot rewrite or empty the maturity records', wiped.status === 200 && record().assessments.length === 2);
  const { maturity: _dropped, ...withoutMaturity } = active;
  await configuration.save(context(internal), { body: { configuration: withoutMaturity, expectedVersion: version() } }, responses);
  check('nor drop them by leaving the key out', record().assessments.length === 2);
  const badTargets: any = await configuration.save(context(internal), { body: { configuration: { ...withoutMaturity, global: { ...withoutMaturity.global, maturityTargets: { MEDIO: 9 } } } } }, responses);
  check('targets out of range are refused by the configuration save', badTargets.status === 400 && /maturityTargets/.test(badTargets.body.message), badTargets.body);
  const goodTargets: any = await configuration.save(context(internal), { body: { configuration: { ...withoutMaturity, global: { ...withoutMaturity.global, maturityTargets: { BAJO: 1, MEDIO: 4, ALTO: 5 } } }, expectedVersion: version() } }, responses);
  check('valid targets are saved in General', goodTargets.status === 200 && internal.store.get('active').source.configuration.global.maturityTargets.MEDIO === 4);

  console.log('4. After recording: the view changes, the rows are not recomputed');
  const before: any = await evaluation.evaluate(context(internal), request({ include: 'control', controlId: 'op.exp.3', timeZone: 'Europe/Madrid' }), responses);
  await save({ controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-10-15', reviewer: 'Ana', result: 'CONFORME' }, expectedVersion: version() });
  const after: any = await evaluation.evaluate(context(internal), request({ include: 'control', controlId: 'op.exp.3', timeZone: 'Europe/Madrid' }), responses);
  check('the new review shows in the maturity', after.body.data.maturity.reviews === 1 && after.body.data.maturity.lastReview.reviewer === 'Ana');
  check('no row was recomputed for it', after.body.data.meta.stats.computed === 0, after.body.data.meta.stats);
  check('the view fingerprint changes, so other browsers ask again', after.body.data.meta.fingerprint !== before.body.data.meta.fingerprint);
  check('the assessed level and the target travel with it', after.body.data.maturity.assessed.level === m.accredited && after.body.data.maturity.target === 4);

  console.log('5. The snapshots route');
  const read = (query: any, user: any = ADMIN) => routes.snapshots(context(internal, user), { query }, responses) as Promise<any>;
  check('without the role: 403', (await read({ from: '2026-10-01', to: '2026-10-20' }, READER)).status === 403);
  check('a bad range: 400', (await read({ from: '2026-10-21', to: '2026-10-20' })).status === 400);
  check('more than 400 days: 400', (await read({ from: '2025-01-01', to: '2026-10-20' })).status === 400);
  const one: any = await read({ from: '2026-10-01', to: '2026-10-20', controlId: 'op.exp.3' });
  check('one control: its snapshots', one.status === 200 && one.body.data.snapshots.length === 1 && one.body.data.snapshots[0].controlId === 'op.exp.3', one.body);
  const all: any = await read({ from: '2026-10-01', to: '2026-10-20' });
  check('every control', all.body.data.snapshots.length === today.length);

  console.log('6. Without configuration');
  const empty = setup();
  empty.internal.store.delete('active');
  const none: any = await empty.routes.save(context(empty.internal), { body: { controlId: 'op.exp.3', kind: 'review', entry: { date: '2026-10-01', reviewer: 'Ana', result: 'CONFORME' } } }, responses);
  check('nothing saved yet: 409 asking to save the configuration first', none.status === 409 && /guárdala antes/.test(none.body.message), none.body);

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
