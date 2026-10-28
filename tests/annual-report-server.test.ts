/** Art. 32 on the server: read live or frozen, roles, the job's freeze (once), explicit regeneration with history. */
import { createAnnualReportService } from '../server/lib/annual-report/annual-report-service';
import { readPeriodIncidents } from '../server/lib/annual-report/incident-source';
import { buildAnnualReport } from '../common/ens/annual-report/annual-report';
import { createAnnualReportHandlers, ENS_ANNUAL_FREEZE_ROLE_MESSAGE } from '../server/lib/annual-report-handlers';
import { annualFreezeId, annualFreezeRevisionId } from '../server/lib/annual-report/annual-freeze-storage';
import { purgeSnapshots, readSnapshots, writeSnapshots } from '../server/lib/maturity/snapshot-storage';
import { createDailySnapshotJob, ENS_SNAPSHOT_JOB_USER } from '../server/lib/maturity/daily-snapshot-job';
import { createFakeIndexer, FakeDoc, matchesQuery, pickSource } from './fixtures/fake-indexer';
import { configuration, consolidated, mpEq2Maturity, opAcc1Maturity, opExp7Row, opMon2Row, records, result } from './fixtures/annual-report-fixture';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
  if (!ok) failures.push(name);
};
const section = (title: string) => console.log(`\n${title}`);

// The plugin's snapshots index: ids, `create`, `if_seq_no`, `_source` filters and delete by query.
const createStore = (alerts?: ReturnType<typeof createFakeIndexer>) => {
  const store = new Map<string, { index: string; source: any; seqNo: number }>();
  let sequence = 0;
  const client: any = {
    store,
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }), putIndexTemplate: async () => ({ body: {} }) },
    search: async (request: any) => {
      // The facts index (wazuh-alerts-*): the fake indexer, when the test gives one.
      if (alerts && String(request.index || '').startsWith('wazuh-alerts')) return alerts.search(request);
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
const evaluations = { runs: 0, fail: false, closing: '03-31' };
const evaluation: any = {
  run: async () => {
    evaluations.runs += 1;
    if (evaluations.fail) throw Object.assign(new Error('indexer timeout'), { statusCode: 504 });
    return runFor();
  },
  settings: async () => ({ configuration: configuration({}, evaluations.closing), maturityVersion: { seqNo: 7, primaryTerm: 1 } }),
};
const maturity: any = { forReport: async () => maturityMap() };
const warnings: string[] = [];
const logger: any = { info() {}, warn(message: string) { warnings.push(message); }, debug() {}, error() {} };

const ADMIN = { user_name: 'rsis', roles: ['power_ens_admin'] };
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
// The data set of a run as the service builds it (configuration, results, manager rows), optionally with read incidents.
const buildAnnualReportForTest = (run: any, period: string, periodIncidents?: Record<string, unknown>) =>
  buildAnnualReport({
    configuration: run.ctx.configuration,
    results: run.state.results,
    managerRows: Object.fromEntries(['op.mon.2', 'op.exp.7'].map(id => [id, run.views.get(id)?.rows[0]?.result])),
    maturity: maturityMap(),
    records: run.ctx.maturityRecords,
    now: run.ctx.now,
    timeZone: 'Europe/Madrid',
    period,
    pluginVersion: '1.4.0',
    periodIncidents,
  });
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
  check(
    'period 2026 started more than 400 days ago: «Regenerar» is not available, with the reason',
    read2026.body.data.regeneration?.allowed === false && /reenvía los incidentes de los 400 días anteriores \(desde el 2025-09-15\) y el periodo empieza el 2025-04-01/.test(read2026.body.data.regeneration.reason),
    read2026.body.data.regeneration
  );
  const runsBefore = evaluations.runs;
  evaluations.fail = true;
  const frozenWhileDown = await get(READER, { period: '2026' });
  check('a frozen report is served without any evaluation, even with the indexer failing it', frozenWhileDown.status === 200 && frozenWhileDown.body.data.frozen?.revision === 1 && evaluations.runs === runsBefore && frozenWhileDown.body.data.maturityVersion?.seqNo === 7, frozenWhileDown);
  check('the open period still needs the evaluation (and says why it failed)', (await get(READER)).status === 500 && evaluations.runs === runsBefore + 1);
  evaluations.fail = false;
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

  section('A closing moved after a freeze: the freeze keeps its own dates, the open period never shows it');
  evaluations.closing = '06-30';
  const moved = await get(READER, { period: '2026' });
  check(
    'closing 03-31 → 06-30: period 2026 is served frozen with the dates of its header and a notice',
    moved.body.data.frozen?.revision === 2 && moved.body.data.periodFrom === '2025-04-01' && moved.body.data.periodTo === '2026-03-31' && moved.body.data.closing === '03-31' && /Congelado con otro cierre \(03-31\): con el cierre actual \(06-30\) el periodo 2026 iría del 2025-07-01 al 2026-06-30/.test(moved.body.data.notice),
    moved.body.data
  );
  check('the list of frozen periods carries the dates of each freeze', JSON.stringify(moved.body.data.periods.map((p: any) => [p.period, p.periodStart, p.periodEnd])) === '[["2026","2025-04-01","2026-03-31"]]', moved.body.data.periods);
  evaluations.closing = '12-31';
  const collision = await get(READER);
  check(
    'closing 03-31 → 12-31: the open period 2026 is computed now, the old freeze 2026 is set aside with a notice',
    collision.body.data.period === '2026' && !collision.body.data.frozen && Boolean(collision.body.data.report) && /Hay un congelado «2026» de otro cierre \(del 2025-04-01 al 2026-03-31\)/.test(collision.body.data.notice),
    collision.body.data.notice
  );
  const current = await get(READER, { period: '2026', revision: '2' });
  check('...and the old freeze is still readable by its revision', current.status === 200 && current.body.data.frozen?.revision === 2);
  evaluations.closing = '03-31';

  section('The freezes live beside the daily snapshots without mixing');
  await writeSnapshots(internal, logger, [{ date: '2026-10-19', controlId: 'op.acc.1', status: 'PARCIAL', recordedAt: 'x' }]);
  const snapshots = await readSnapshots(internal, { from: '2020-01-01', to: '2030-01-01' });
  check('the snapshot reads never return a freeze', snapshots.length === 1 && snapshots[0].controlId === 'op.acc.1');
  await purgeSnapshots(internal, '2027-01-01');
  check('the purge of old snapshots keeps every freeze', freezeIds(internal).length === 2 && !internal.store.has('op.acc.1|2026-10-19'));

  section('600 incidents in the period that has just closed: the freeze counts them all (the live variable keeps 500)');
  {
    // op.mon.2's last read on 2026-01-10: 600 incidents opened in 2025, one in 2024, and 5 rows dated in 2027 (a typo).
    const readAt = '2026-01-10T00:05:00Z';
    let n = 0;
    const factDoc = (data: Record<string, unknown>): FakeDoc => ({
      _id: `f${(n += 1)}`,
      _index: 'wazuh-alerts-4.x-2026.01.10',
      _source: { '@timestamp': readAt, timestamp: readAt, id: `1768003500.${n}`, agent: { id: '000', name: 'Wazuh-4' }, rule: { id: '111304', groups: ['ENS'] }, data: Object.fromEntries(Object.entries({ power_ens: 'op.mon.2', evidence_id: 'EV-03', ...data }).map(([k, v]) => [k, String(v)])) },
    });
    const day = (i: number) => new Date(Date.parse('2025-01-01T08:00:00Z') + Math.floor((i * 364) / 600) * 86400e3).toISOString();
    const rows: FakeDoc[] = [];
    for (let i = 0; i < 600; i += 1) rows.push(factDoc({ event: 'incident_registered', incidente_id: `INC-${i}`, fase: 'inicial', fecha: day(i), severidad: 'media', clasificacion: 'phishing', datos_personales: 'no', notificacion_ccn_cert: '-', notificado_a: '-', linea: i + 2 }));
    rows.push(factDoc({ event: 'incident_registered', incidente_id: 'INC-2024', fase: 'inicial', fecha: '2024-12-20T08:00:00Z', severidad: 'media', clasificacion: 'phishing', datos_personales: 'no', linea: 700 }));
    for (let i = 0; i < 5; i += 1) rows.push(factDoc({ event: 'incident_registered', incidente_id: `INC-FUT-${i}`, fase: 'inicial', fecha: '2027-03-01T08:00:00Z', severidad: 'alta', clasificacion: 'phishing', datos_personales: 'no', linea: 800 + i }));
    const read = factDoc({ event: 'incident_register_read', fichero: '/etc/power-ens/incident-register.tsv', presente: 'si', legible: 'si', formato: 'ok', filas_validas: rows.length, filas_descartadas: 0, filas_emitidas: rows.length });
    const facts = createFakeIndexer([read, ...rows], { clock: () => Date.parse('2026-01-10T01:30:00Z') });
    const freezeStore = createStore(facts);
    const now = new Date('2026-01-10T01:30:00Z');
    // The live variable as op.mon.2 publishes it: the 500 newest (the oldest 100 of 2025 cut).
    const live = { leido: readAt, desde: '2024-12-31T00:00:00Z', cubreDesde: '2024-12-06T00:05:00Z', descartadas: 0, recortados: 100, incidentes: Array.from({ length: 500 }, (_, k) => ({ id: `INC-${k + 100}`, severidad: 'media', clasificacion: 'phishing', apertura: day(k + 100) })) };
    const run12 = () => {
      const rowsOf: Record<string, any> = { 'op.mon.2': opMon2Row('12-31', { incidents: live }), 'op.exp.7': opExp7Row() };
      const results = [result('op.acc.1', 'PARCIAL', 80), consolidated(rowsOf['op.mon.2']), consolidated(rowsOf['op.exp.7'])];
      return {
        ctx: { now, configuration: configuration({}, '12-31'), maturityRecords: records(), maturityVersion: { seqNo: 3, primaryTerm: 1 } },
        meta: {},
        state: { results },
        views: new Map(results.map(entry => [entry.control.id, { result: entry, rows: rowsOf[entry.control.id] ? [{ agentId: '000', result: rowsOf[entry.control.id] }] : [] }])),
      };
    };
    const service12 = createAnnualReportService({ logger, evaluation: { run: async () => run12(), settings: async () => ({ configuration: configuration({}, '12-31'), maturityVersion: null }) } as any, maturity, clock: () => now });
    // The indexer times out on the incident read: the job freezes nothing (it tries again), an administrator gets 503.
    const timingOut = createStore({ search: async () => Promise.reject(Object.assign(new Error('Request timed out'), { statusCode: 504 })) } as any);
    let jobFailure: any;
    try {
      await service12.freezeIfDue(timingOut, run12() as any, maturityMap(), ENS_SNAPSHOT_JOB_USER);
    } catch (error) {
      jobFailure = error;
    }
    check('a failed incident read: the daily freeze throws (the job retries) and nothing is frozen', Boolean(jobFailure) && freezeIds(timingOut).length === 0, jobFailure?.message);
    let firstFreeze: any;
    try {
      await service12.freezeOnRequest({ asCurrentUser: timingOut, asInternalUser: timingOut }, { period: '2025', reason: 'Cierre', by: 'rsis', expectedRevision: null });
    } catch (error) {
      firstFreeze = error;
    }
    check(
      '...an administrator\'s first freeze answers 503 «volver a intentarlo» and saves nothing',
      firstFreeze?.statusCode === 503 && firstFreeze.message === 'No se han podido leer los incidentes del periodo; volver a intentarlo.' && freezeIds(timingOut).length === 0,
      firstFreeze?.message
    );
    const frozen = await service12.freezeIfDue(freezeStore, run12() as any, maturityMap(), ENS_SNAPSHOT_JOB_USER);
    const report = freezeStore.store.get(annualFreezeId('2025'))?.source.report;
    const total = report?.incidents.find((d: any) => d.id === 'incidents.total');
    check('the job freezes 2025 with its 600 incidents read on the server (not the 500 of the live variable)', frozen.result === 'created' && total?.value === 600 && /todas las filas del periodo/.test(total.trace), total);
    check('the 2024 incident and the 5 dated in 2027 do not count, and the trace says so', report?.incidents.find((d: any) => d.id === 'incidents.by_severity' && d.key === 'alta')?.value === 0 && /5 incidente\(s\) con fecha posterior a la lectura no cuentan/.test(total?.trace || ''), total?.trace);
    const liveOnly = buildAnnualReportForTest(run12(), '2025');
    check('built from the capped live variable alone, the period is «incompleto», never 500', liveOnly.incidents.find((d: any) => d.id === 'incidents.total').value === null && /incompleto: op\.mon\.2 publica en vivo como mucho 500/.test(liveOnly.incidents.find((d: any) => d.id === 'incidents.total').trace));
    const limited = await readPeriodIncidents(facts, configuration({}, '12-31'), now, { fromMs: Date.parse('2024-12-31T23:00:00Z'), toMs: Date.parse('2025-12-31T23:00:00Z') }, 599);
    check('over the limit: no list, the count and the limit', limited.excedido === 600 && limited.limite === 599 && Array.isArray(limited.incidentes) && (limited.incidentes as any[]).length === 0, limited);
    // «Regenerar» when the source no longer has the incidents: refused, the freeze with its 600 stays.
    const before = JSON.stringify(freezeStore.store.get(annualFreezeId('2025')).source);
    const blind = {
      ...freezeStore,
      search: async (request: any) =>
        String(request.index || '').startsWith('wazuh-alerts') ? { body: { _shards: { total: 1, successful: 1, failed: 0 }, hits: { hits: [] } } } : freezeStore.search(request),
    };
    let refusal: any;
    try {
      await service12.freezeOnRequest({ asCurrentUser: blind, asInternalUser: freezeStore }, { period: '2025', reason: 'Corrección', by: 'rsis', expectedRevision: 1 });
    } catch (error) {
      refusal = error;
    }
    check(
      'a regeneration that would lose the incident figures is refused and says why; the freeze stays',
      refusal?.statusCode === 400 && /No se regenera el periodo 2025: los incidentes ya no se pueden recalcular/.test(refusal.message) && /revisión 1\) se conserva/.test(refusal.message) && JSON.stringify(freezeStore.store.get(annualFreezeId('2025')).source) === before,
      refusal?.message
    );
    const regenerated = await service12.freezeOnRequest({ asCurrentUser: freezeStore, asInternalUser: freezeStore }, { period: '2025', reason: 'Corrección', by: 'rsis', expectedRevision: 1 });
    check('with the source present the regeneration goes through, with the 600', regenerated.frozen.revision === 2 && regenerated.report.incidents.find((d: any) => d.id === 'incidents.total').value === 600);
    const overLimit = buildAnnualReportForTest(run12(), '2025', limited);
    check('...and the report says «el periodo tiene más de N incidentes», with no figure', overLimit.incidents.find((d: any) => d.id === 'incidents.total').value === null && /el periodo tiene más de 599 incidentes \(600\)/.test(overLimit.incidents.find((d: any) => d.id === 'incidents.total').trace));
  }

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
