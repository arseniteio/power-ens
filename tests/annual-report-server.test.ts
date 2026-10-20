/** Art. 32 on the server: read live or frozen, roles, the job's freeze (once), explicit regeneration with history. */
import { createAnnualReportService } from '../server/lib/annual-report/annual-report-service';
import { createAnnualReportHandlers, ENS_ANNUAL_FREEZE_ROLE_MESSAGE } from '../server/lib/annual-report-handlers';
import { annualFreezeId, annualFreezeRevisionId } from '../server/lib/annual-report/annual-freeze-storage';
import { purgeSnapshots, readSnapshots, writeSnapshots } from '../server/lib/maturity/snapshot-storage';
import { createDailySnapshotJob, ENS_SNAPSHOT_JOB_USER } from '../server/lib/maturity/daily-snapshot-job';
import { matchesQuery, pickSource } from './fixtures/fake-indexer';
import { configuration, consolidated, mpEq2Maturity, opAcc1Maturity, opExp7Row, opMon2Row, records, result } from './fixtures/annual-report-fixture';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
  if (!ok) failures.push(name);
};
const section = (title: string) => console.log(`\n${title}`);

// The plugin's snapshots index: ids, `create`, `if_seq_no`, `_source` filters and delete by query.
const createStore = () => {
  const store = new Map<string, { index: string; source: any; seqNo: number }>();
  let sequence = 0;
  const client: any = {
    store,
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }), putIndexTemplate: async () => ({ body: {} }) },
    search: async (request: any) => {
      const hits = [...store.entries()]
        .filter(([, doc]) => doc.index === request.index)
        .map(([id, doc]) => ({ _id: id, _index: doc.index, _source: doc.source, seqNo: doc.seqNo }))
        .filter(doc => matchesQuery(doc as any, request.body?.query))
        .sort((a, b) => String(a._source.date || '').localeCompare(String(b._source.date || '')) || a._id.localeCompare(b._id));
      return {
        body: {
          _shards: { total: 1, successful: 1, failed: 0 },
          hits: {
            hits: hits.slice(0, request.body?.size ?? 10).map(doc => ({
              _id: doc._id,
              _source: pickSource(doc._source, request.body?._source),
              sort: [doc._source.date, doc._source.controlId],
              ...(request.body?.seq_no_primary_term ? { _seq_no: doc.seqNo, _primary_term: 1 } : {}),
            })),
          },
        },
      };
    },
    bulk: async (request: any) => {
      const lines = String(request.body).split('\n').filter(Boolean).map(line => JSON.parse(line));
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
        items.push({ [kind]: { status: 201, _seq_no: sequence, _primary_term: 1 } });
      }
      return { body: { errors: items.some(item => (item.create || item.index).status === 409), items } };
    },
    deleteByQuery: async (request: any) => {
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

// An organisation evaluation as the service returns it: results, the manager rows, context and meta.
const state = { now: new Date('2026-10-20T12:00:00Z'), records: records(), pending: false };
const runFor = () => {
  const rows: Record<string, any> = { 'op.mon.2': opMon2Row(), 'op.exp.7': opExp7Row() };
  const results = [result('op.acc.1', 'PARCIAL', 80), consolidated(rows['op.mon.2']), consolidated(rows['op.exp.7'])];
  return {
    ctx: { now: state.now, configuration: configuration(), maturityRecords: state.records, maturityVersion: { seqNo: 7, primaryTerm: 1 } },
    meta: state.pending ? { pending: { rows: 3, controls: ['op.acc.2'], total: 40 } } : {},
    state: { results },
    views: new Map(results.map(entry => [entry.control.id, { result: entry, rows: rows[entry.control.id] ? [{ agentId: '000', result: rows[entry.control.id] }] : [] }])),
  };
};
const maturityMap = () => new Map([['op.acc.1', { ...opAcc1Maturity }], ['mp.eq.2', mpEq2Maturity]]);
const evaluation: any = { run: async () => runFor() };
const maturity: any = { forReport: async () => maturityMap() };
const warnings: string[] = [];
const logger: any = { info() {}, warn(message: string) { warnings.push(message); }, debug() {}, error() {} };

const ADMIN = { user_name: 'rsis', roles: ['ensfacil_admin'] };
const READER = { user_name: 'ana', roles: ['readall'] };
const context = (internal: any, user: any, refuseSnapshots = false) => ({
  core: {
    opensearch: {
      client: {
        asInternalUser: internal,
        asCurrentUser: {
          ...internal,
          search: async (request: any) => {
            if (refuseSnapshots && request.index === 'wazuh-ens-snapshots') throw Object.assign(new Error('security_exception'), { statusCode: 403 });
            return internal.search(request);
          },
          bulk: async () => {
            throw Object.assign(new Error('the viewer never writes'), { statusCode: 403 });
          },
          transport: { request: async () => ({ body: user }) },
        },
      },
    },
  },
});
const responses = { ok: (r: any) => ({ status: 200, body: r.body }), customError: (r: any) => ({ status: r.statusCode, body: r.body }) };
const freezeIds = (internal: any) => [...internal.store.keys()].filter((id: string) => id.startsWith('annual_freeze')).sort();

(async () => {
  const internal = createStore();
  let clock = new Date('2026-10-20T12:00:00Z');
  const service = createAnnualReportService({ logger, evaluation, maturity, clock: () => clock });
  const handlers = createAnnualReportHandlers({ logger, securityEnabled: true, annualReport: service });
  const get = (user: any, query: Record<string, string> = {}, refuse = false) => handlers.read(context(internal, user, refuse), { query }, responses) as Promise<any>;
  const freeze = (user: any, body: any) => handlers.freeze(context(internal, user), { body }, responses) as Promise<any>;

  section('Read: the current period, computed now');
  const live = await get(READER);
  const data = live.body?.data;
  check('any user reads it (no role needed)', live.status === 200 && data.report && data.period === '2027', live);
  check('current period 2027, last closed 2026, closing 03-31', data.currentPeriod === '2027' && data.lastClosedPeriod === '2026' && data.closing === '03-31' && data.periodFrom === '2026-04-01');
  check('not frozen, with the maturity version for «Medidas sin motor»', !data.frozen && data.report.header.find((d: any) => d.id === 'header.frozen').value === false && data.maturityVersion?.seqNo === 7);
  check('a malformed period is refused', (await get(READER, { period: '26' })).status === 400);
  check('a future period is refused', (await get(READER, { period: '2030' })).status === 400);
  state.pending = true;
  const pending = await get(READER);
  check('while the evaluation computes: pending, without data set', pending.status === 200 && pending.body.data.pending === true && !pending.body.data.report);
  state.pending = false;

  section('Explicit freeze: role, closed period, reason');
  const refused = await freeze(READER, { period: '2026', reason: 'Cierre', expectedRevision: null });
  check('a viewer cannot freeze (403) and nothing is written', refused.status === 403 && refused.body.message === ENS_ANNUAL_FREEZE_ROLE_MESSAGE && freezeIds(internal).length === 0);
  check('the open period cannot be frozen', (await freeze(ADMIN, { period: '2027', reason: 'Cierre', expectedRevision: null })).status === 400);
  check('without a reason it is refused', (await freeze(ADMIN, { period: '2026', reason: '  ', expectedRevision: null })).status === 400 && freezeIds(internal).length === 0);

  section('The daily job freezes the period that has just closed, once');
  state.now = new Date('2026-04-01T00:30:00Z');
  const job = await service.freezeIfDue(internal, runFor() as any, maturityMap(), ENS_SNAPSHOT_JOB_USER);
  check('2026-04-01 02:30 Madrid: period 2026 frozen', job.period === '2026' && job.result === 'created' && freezeIds(internal).join() === annualFreezeId('2026'), job);
  const first = internal.store.get(annualFreezeId('2026')).source;
  check('revision 1 by the daily job, no reason, no history', first.revision === 1 && first.frozenBy === ENS_SNAPSHOT_JOB_USER && !first.reason && first.history.length === 0);
  check('its data set is the closed period, marked frozen', first.report.period === '2026' && first.report.header.find((d: any) => d.id === 'header.frozen').value === true && first.report.header.find((d: any) => d.id === 'header.period_open').value === false);
  const seqNo = internal.store.get(annualFreezeId('2026')).seqNo;
  const again = await service.freezeIfDue(internal, runFor() as any, maturityMap(), ENS_SNAPSHOT_JOB_USER);
  check('a second run (or a second dashboard) writes nothing', again.result === 'exists' && internal.store.get(annualFreezeId('2026')).seqNo === seqNo && freezeIds(internal).length === 1);
  check('the frozen document is unchanged', JSON.stringify(internal.store.get(annualFreezeId('2026')).source) === JSON.stringify(first));
  // The closing was 2026-03-31: 31 days later is 2026-05-01, the last day the job freezes it.
  state.now = new Date('2026-05-02T00:30:00Z');
  const lateStore = createStore();
  const late = await service.freezeIfDue(lateStore, runFor() as any, maturityMap(), ENS_SNAPSHOT_JOB_USER);
  check('more than a month after the closing the job does not freeze (only on request)', late.result === 'late' && freezeIds(lateStore).length === 0, late);

  section('Reproducible: the frozen period is read as frozen');
  state.now = new Date('2026-10-20T12:00:00Z');
  state.records = { controls: {} };
  const read2026 = await get(READER, { period: '2026' });
  check('period 2026 comes frozen, revision 1', read2026.status === 200 && read2026.body.data.frozen?.revision === 1);
  check('its data set is exactly the stored one although records changed since', JSON.stringify(read2026.body.data.report) === JSON.stringify(first.report));
  check('the frozen periods are listed', read2026.body.data.periods.map((p: any) => p.period).join() === '2026');
  const noPermission = await get(READER, { period: '2026' }, true);
  check('without read permission on the snapshots: computed now, and it says why', noPermission.status === 200 && !noPermission.body.data.frozen && /wazuh-ens-snapshots/.test(noPermission.body.data.freezeError));

  section('Regeneration on request, with history');
  check('a stale revision is refused (409)', (await freeze(ADMIN, { period: '2026', reason: 'Corrección', expectedRevision: null })).status === 409);
  clock = new Date('2026-10-20T12:05:00Z');
  const regenerated = await freeze(ADMIN, { period: '2026', reason: 'Corrección de la DA', expectedRevision: 1 });
  check('administrator: revision 2 with the reason', regenerated.status === 200 && regenerated.body.data.frozen.revision === 2 && regenerated.body.data.frozen.frozenBy === 'rsis', regenerated);
  const second = internal.store.get(annualFreezeId('2026')).source;
  check('history keeps revision 1', second.history.length === 1 && second.history[0].revision === 1 && second.history[0].frozenBy === ENS_SNAPSHOT_JOB_USER && second.reason === 'Corrección de la DA');
  check('the data set of revision 1 is kept in its own document', JSON.stringify(internal.store.get(annualFreezeRevisionId('2026', 1)).source) === JSON.stringify(first));
  const old = await get(READER, { period: '2026', revision: '1' });
  check('revision 1 can still be read and exported', old.status === 200 && JSON.stringify(old.body.data.report) === JSON.stringify(first.report));
  check('an unknown revision is 404', (await get(READER, { period: '2026', revision: '9' })).status === 404);
  check('the new revision says it was regenerated', second.report.header.find((d: any) => d.id === 'header.freeze_reason').value === 'Corrección de la DA' && second.report.header.find((d: any) => d.id === 'header.revision').value === 2);

  section('The freezes live beside the daily snapshots without mixing');
  await writeSnapshots(internal, logger, [{ date: '2026-10-19', controlId: 'op.acc.1', status: 'PARCIAL', recordedAt: 'x' }]);
  const snapshots = await readSnapshots(internal, { from: '2020-01-01', to: '2030-01-01' });
  check('the snapshot reads never return a freeze', snapshots.length === 1 && snapshots[0].controlId === 'op.acc.1');
  await purgeSnapshots(internal, '2027-01-01');
  check('the purge of old snapshots keeps every freeze', freezeIds(internal).length === 2 && !internal.store.has('op.acc.1|2026-10-19'));

  section('The daily job: the freeze after the snapshot, never failing it');
  let called: any;
  const timers = { set: () => 0, clear: () => {} };
  const jobFor = (freezeIfDue: any) =>
    createDailySnapshotJob({
      logger,
      client: internal,
      maturity: { snapshotDay: async () => ({ date: '2026-04-01', written: 3, purged: true, maturity: maturityMap() }), purgeOld: async () => true } as any,
      annualReport: { freezeIfDue },
      createEvaluation: () => ({ run: async () => ({ ...runFor(), ctx: { ...runFor().ctx, configuration: configuration() } }) } as any),
      clock: () => new Date('2026-04-01T00:30:00Z'),
      timers,
    });
  await jobFor(async (...args: any[]) => {
    called = args;
    return { period: '2026', result: 'exists' };
  }).runOnce();
  check('the job hands the freeze its run and the maturity it wrote', called && called[2] instanceof Map && called[2].has('op.acc.1') && called[3] === ENS_SNAPSHOT_JOB_USER);
  warnings.length = 0;
  const failing = jobFor(async () => {
    throw new Error('indexer refused');
  });
  await failing.runOnce();
  check('a failed freeze is logged and the day counts as done', warnings.some(w => /could not freeze the annual report/.test(w)) && !warnings.some(w => /daily maturity snapshot failed/.test(w)), warnings);

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
