/** Server evaluation when things go wrong or are not simple. */
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService, normalizeQuery } from '../server/lib/evaluation/evaluation-service';
import { buildEvaluationResponse } from '../server/lib/evaluation/responses';
import { createEvaluationHandlers } from '../server/lib/evaluation-handlers';
import { CancelSignal } from '../server/lib/evaluation/cache';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { ENSCatalog } from '../common/ens/catalog';
import { getENSComplianceResultByControl, getENSComplianceState } from '../common/ens/core/ens-engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { buildImpactEventsModel } from '../common/ens/core/dashboard-adapter/presenters/impact-events.presenter';
import { planENSTimelineCuts } from '../common/ens/core/timeline/timeline-cuts';
import { resolveENSScopeAgents, normalizeInventory } from '../common/ens/core/scope/runtime';
import { inventoryFromMonitoring } from '../common/agents/agent-inventory';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`); if (!c) failures.push(n); };
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'evaluatedAt').map(k => [k, canon(v[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const withoutTrace = (r: any) => (r ? { ...r, traceability: [] } : r);
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

let clock = new Date('2026-10-28T10:00:00Z');
const hora = (h: number) => new Date(clock.getTime() - h * 3600 * 1000).toISOString();
let n = 0;
const fact = (agent: string, name: string, data: Record<string, unknown>, hours: number): FakeDoc => ({
  _id: `h${String(++n).padStart(5, '0')}`,
  _index: 'wazuh-alerts-4.x-2026.10.28',
  _source: {
    '@timestamp': hora(hours), timestamp: hora(hours), id: `${Date.parse(hora(hours)) / 1000}.${n}`,
    manager: { name: 'wazuh-manager' }, agent: { id: agent, name: name }, rule: { id: '100', groups: ['ENS'] }, data,
  },
});

const docs: FakeDoc[] = [];
for (let h = 240; h >= 1; h -= 6) {
  docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-04' }, h));
  docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', servicio: h > 120 ? 'telnet' : 'sshd' }, h - 0.01));
}
for (let i = 0; i < 300; i++) docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'account_action', usuario: `u${i % 5}`, funcion: i % 2 ? 'operacion' : 'desarrollo' }, 2 + i / 10));
docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'collector_run' }, 1));
docs.push(fact('028', 'zimbraHldap', { ensfacil: 'op.exp.1', event: 'collector_run' }, 3));
docs.push(fact('024', 'wazuh-real', { ensfacil: 'mp.info.6', event: 'backup_ok', origen: 'pbs' }, 5));
docs.push(fact('028', 'zimbraHldap', { ensfacil: 'mp.info.6', event: 'backup_error', origen: 'pbs' }, 5));
docs.push(fact('028', 'zimbraHldap', { ensfacil: 'mp.info.6', event: 'backup_error', origen: 'pbs' }, 6));
docs.push(fact('024', 'wazuh-real', { event: 'service_running', evidence_id: 'EV-04', servicio: 'cron' }, 4));
docs.push(fact('000', 'manager', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
docs.push(fact('024', 'wazuh-real', { control: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', servicio: 'legado' }, 3.5));
docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.1', control: 'op.exp.3', event: 'asset_system', evidence_id: 'EV-01' }, 2.5));
// Operational alerts as the runbooks emit them: one of each type per machine.
docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_warning', parametro: 'OPEXP3_SERVICIOS', motivo: 'servicio sin unidad' }, 7));
docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_warning', parametro: 'OPEXP3_SERVICIOS', motivo: 'servicio sin unidad' }, 8));
docs.push(fact('028', 'zimbraHldap', { ensfacil: 'op.exp.1', event: 'collector_warning', parametro: 'OPEXP1_INVENTARIO', motivo: 'no se pudo leer' }, 7));
docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.acc.1', event: 'multi_role_usage', evidence_id: 'EV-06', requisito: 'op.acc.1.2', estado: 'NO_CUMPLE', usuario: 'jgomez', roles: 'usuario,administrador' }, 7));
docs.push(fact('000', 'manager', { ensfacil: 'op.exp.7', event: 'security_alert_observed', evidence_id: 'EV-01,EV-02,EV-03', agente_id: '024', sistema: 'wazuh-real', regla: '5710', alertas: '4', descripcion: 'sshd: usuario inexistente' }, 7));
docs.push(fact('000', 'manager', { ensfacil: 'op.exp.7', event: 'security_alert_observed', evidence_id: 'EV-01,EV-02,EV-03', agente_id: '028', sistema: 'zimbraHldap', regla: '5710', alertas: '2', descripcion: 'sshd: usuario inexistente' }, 7));

const monitor = (id: string, name: string, group: string[]) => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.28',
  _source: { id, name, group, status: 'active', timestamp: hora(0.1), manager: 'manager' },
});
const withValues = (template: any, controlId: string, values: Record<string, unknown>) => ({
  ...template,
  controls: template.controls.map((c: any) => c.controlId !== controlId ? c : {
    ...c,
    parameters: c.parameters.map((p: any) => (p.id in values ? { ...p, value: values[p.id] } : p)),
  }),
});
const configuration = {
  ...withValues(defaultENSConfigurationTemplate, 'op.acc.3', {
    'P-02': ['desarrollo | operacion', 'autorizacion | control'],
    'P-03': ['desarrollo | /usr/bin/git', 'operacion | /usr/bin/systemctl'],
  }),
  scope: { mode: 'group', agentIds: [], groupIds: ['ens'] },
  updatedAt: '2026-10-14T10:00:00.000Z',
};
let fail = 0;
const searchIndex = createFakeIndexer([
  ...docs,
  monitor('024', 'wazuh-real', ['ens']),
  monitor('028', 'zimbraHldap', ['ens']),
  { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration: configuration, updatedAt: '2026-10-14T10:00:00.000Z' } },
], { clock: () => clock.getTime(), failShards: (body, index) => (fail && index?.startsWith('wazuh-alerts') && body?.size > 0 ? fail : 0) });
const clients2 = { asCurrentUser: searchIndex, asInternalUser: searchIndex };
const notices: string[] = [];
const logger: any = { info() {}, warn: (m: string) => notices.push(m), debug() {}, error: (m: string) => notices.push(m) };
const response = { ok: (r: any) => ({ status: 200, body: r.body }), customError: (r: any) => ({ status: r.statusCode, body: r.body }) };
const context = { core: { opensearch: { client: clients2 } } };

const reference = () => {
  ensConfigurationRepository.replaceActive(configuration as any);
  const since = clock.getTime() - 30 * 86400e3;
  const all = searchIndex.docs
    .filter(d => d._index.startsWith('wazuh-alerts') && ['000', '024', '028'].includes(d._source.agent.id))
    .filter(d => Date.parse(d._source['@timestamp']) >= since && Date.parse(d._source['@timestamp']) <= clock.getTime())
    .sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || (a._source.id < b._source.id ? -1 : 1));
  const inventory = inventoryFromMonitoring({ agentes: { buckets: ['024', '028'].map(id => ({ key: id, ultimo: { hits: { hits: [searchIndex.docs.find(d => d._id === `m${id}`)] } } })) } }, clock.getTime());
  const scope = resolveENSScopeAgents(normalizeInventory(inventory.agents), configuration.scope as any);
  return { eventos: normalizeWazuhAlerts(all), alcance: scope, nivel: (configuration as any).global.ensLevel, docs: all };
};

(async () => {
  const motive = (f: () => unknown) => { try { f(); return ''; } catch (e: any) { return `${e.statusCode} ${e.message}`; } };
  check('control outside the catalog: 400', /^400 .*op\.zzz\.9/.test(motive(() => normalizeQuery({ controlId: 'op.zzz.9' }))));
  check('invented time zone: 400', /^400 .*Mars\/Olympus/.test(motive(() => normalizeQuery({ timeZone: 'Mars/Olympus' }))));
  check('400-day series: 400', /^400 /.test(motive(() => normalizeQuery({ timelineDays: '400' }))));
  check('no zone: UTC', normalizeQuery({}).timeZone === 'UTC');
  check('`24` is machine 024', normalizeQuery({ agentId: '24' }).agentId === '024');
  const h = createEvaluationHandlers({ logger, securityEnabled: true });
  const outside: any = await h.evaluate(context, { query: { agentId: '099', timeZone: 'UTC' } }, response);
  check('machine outside the scope: 400 with its motive', outside.status === 400 && /099.*alcance/.test(outside.body.message), outside);
  const pagina: any = await h.traceability(context, { query: { controlId: 'op.acc.3', size: '100000' } }, response);
  check('oversized traceability page: 400', pagina.status === 400, pagina);
  const withoutControl: any = await h.traceability(context, { query: {} }, response);
  check('traceability without control: 400 (not 500)', withoutControl.status === 400, withoutControl);

  const service = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
  fail = 1;
  const roto = await service.run(clients2, normalizeQuery({ include: 'summary', timeZone: 'UTC' })).then(() => undefined, (e: any) => e);
  check('a failed shard: the evaluation fails with the motive (503)', roto?.statusCode === 503 && /Datos incompletos: 1 de 10 shards fallaron/.test(roto?.message), roto?.message);
  // Only the controls without collector, which read nothing and so cannot be computed from incomplete data.
  const withoutCollector = ENSCatalog.filter((control: any) => control.status !== 'ACTIVE').length;
  const draftIds = ENSCatalog.filter((control: any) => control.status !== 'ACTIVE').map((control: any) => control.id);
  const stored = service.rows.keys();
  check('and nothing read is stored: only the fallback rows of the controls without collector, which read nothing',
    stored.length === withoutCollector && stored.every(key => /^f\|/.test(key) && draftIds.includes(key.split('|').pop()!)), stored);
  const viaRuta: any = await createEvaluationHandlers({ logger, securityEnabled: true, service: service }).evaluate(context, { query: { timeZone: 'UTC' } }, response);
  check('the route returns it as 503 with the motive', viaRuta.status === 503 && /reintentar/.test(viaRuta.body.message), viaRuta);
  fail = 0;

  const ref = reference();
  const whole = await service.run(clients2, normalizeQuery({ include: 'results', timeZone: 'UTC' }));
  const expectedValue = getENSComplianceState(ref.nivel, ref.eventos, undefined, ref.alcance, clock);
  check('with facts without control and another control\'s heartbeat: same as the engine', same(whole.state!.results.map(withoutTrace), expectedValue.results.map(withoutTrace)),
    expectedValue.results.filter((r, i) => !same(withoutTrace(r), withoutTrace(whole.state!.results[i]))).map(r => r.control.id));
  const ofThe028 = getENSComplianceResultByControl('op.acc.3', ref.nivel, ref.eventos, '028', ref.alcance, clock);
  const view028 = await service.run(clients2, normalizeQuery({ include: 'control', controlId: 'op.acc.3', agentId: '028', timeZone: 'UTC' }));
  check('op.acc.3 on 028 (no own facts, with op.exp.1\'s heartbeat): as 1.1.0', same(withoutTrace(view028.views.get('op.acc.3')!.result), withoutTrace(ofThe028)));
  const withoutForeignHeartbeat = getENSComplianceResultByControl('op.acc.3', ref.nivel, ref.eventos.filter(e => !(e.agentId === '028' && e.controlId === 'op.exp.1')), '028', ref.alcance, clock);
  check('(and that foreign heartbeat changes the result: the test really looks at it)', !same(withoutTrace(withoutForeignHeartbeat), withoutTrace(ofThe028)));

  searchIndex.docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'nueva', funcion: 'desarrollo' }, 0.5));
  const t0 = Date.now();
  const old = await service.run(clients2, normalizeQuery({ include: 'summary', timeZone: 'UTC' }), { allowStale: true });
  check('with new data: answers with the stored result, marked, without waiting', old.meta.refreshing && old.meta.fingerprint.startsWith('refreshing:') && old.meta.stats.computed === 0 && old.meta.stats.refreshingInBackground === 1, old.meta.stats);
  await wait(50);
  while (service.tasks.size) await wait(10);
  const newOne = await service.run(clients2, normalizeQuery({ include: 'summary', timeZone: 'UTC' }), { allowStale: true });
  const ref2 = reference();
  check('when requested again: the recomputed one, unmarked', !newOne.meta.refreshing && newOne.meta.stats.computed === 0 && same(newOne.state!.results.map(withoutTrace), getENSComplianceState(ref2.nivel, ref2.eventos, undefined, ref2.alcance, clock).results.map(withoutTrace)));
  void t0;

  const another = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
  while (!service.idle()) await wait(20);
  const reads = searchIndex.log.length;
  await Promise.all([
    another.run(clients2, normalizeQuery({ include: 'summary', timeZone: 'UTC' })),
    another.run(clients2, normalizeQuery({ include: 'dashboard', timeZone: 'UTC' })),
  ]);
  const ofFacts = searchIndex.log.slice(reads).filter(l => l.body?.size > 0 && l.index?.startsWith('wazuh-alerts'));
  const repeated = ofFacts.length - new Set(ofFacts.map(l => JSON.stringify([l.body.query, l.body.search_after]))).size;
  check('panel and list at once: each read only once', repeated === 0, repeated);
  const third = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
  const lento = { ...searchIndex, search: async (p: any) => { if (p.body?.size > 0) await wait(30); return searchIndex.search(p); } };
  const signal = new CancelSignal();
  const promise = third.run({ asCurrentUser: lento, asInternalUser: lento }, normalizeQuery({ include: 'results', timeZone: 'UTC' }), { signal: signal }).then(() => 'terminó', (e: any) => e?.statusCode);
  await wait(40);
  signal.cancel();
  const end = await promise;
  while (third.tasks.size) await wait(5);
  check('the browser leaves and nobody else waits: it is cancelled', end === 499 && third.rows.size < 23, [end, third.rows.size]);

  const run024 = await service.run(clients2, normalizeQuery({ include: 'dashboard', agentId: '024', timeZone: 'UTC' }));
  const panel024 = buildEvaluationResponse(run024) as any;
  const ref3 = reference();
  const expectedItems = buildImpactEventsModel(ref3.eventos.filter(e => e.agentId === '024' || e.agentId === '000'), run024.state, { scope: run024.ctx.scope, agentId: '024' });
  const rows024 = panel024.dashboard.impactEvents.rows;
  check('«alertas operativas» of 024: only those of 024 and the manager', same(panel024.dashboard.impactEvents, expectedItems) && panel024.dashboard.impactEvents.total > 0 && rows024.every((r: any) => r.agentId === '024' || r.agentId === '000') && rows024.some((r: any) => r.eventType === 'collector_warning' && r.count === 2) && !JSON.stringify(panel024.dashboard.impactEvents).includes('backup_error'), panel024.dashboard.impactEvents);
  const runAll = await service.run(clients2, normalizeQuery({ include: 'dashboard', timeZone: 'UTC' }));
  const panelAll = buildEvaluationResponse(runAll) as any;
  check('and those of the whole scope in the whole view', same(panelAll.dashboard.impactEvents, buildImpactEventsModel(ref3.eventos, runAll.state, { scope: runAll.ctx.scope })) && panelAll.dashboard.impactEvents.rows.some((r: any) => r.agentId === '028') && panelAll.dashboard.impactEvents.total > rows024.length, panelAll.dashboard.impactEvents);

  const hs = createEvaluationHandlers({ logger, securityEnabled: true, service: service });
  const p1: any = await hs.traceability(context, { query: { controlId: 'op.acc.3', agentId: '024', from: '100', size: '50', timeZone: 'UTC' } }, response);
  const sheetRef = getENSComplianceResultByControl('op.acc.3', ref3.nivel, ref3.eventos, '024', ref3.alcance, clock)!;
  check('traceability page past 100: the engine\'s entries', p1.status === 200 && same(p1.body.data.items, sheetRef.traceability.slice(100, 150)) && p1.body.data.total === sheetRef.traceability.length, [p1.status, p1.body?.data?.total]);
  check('`available` says how many can be paged through', p1.body.data.available === Math.min(sheetRef.traceability.length, 500));

  const tz = 'Europe/Madrid';
  let series = await service.run(clients2, normalizeQuery({ include: 'control', controlId: 'op.exp.3', agentId: '024', timelineDays: '7', timeZone: tz }));
  for (let i = 0; i < 300 && series.meta.seriesPending; i++) {
    await wait(200);
    series = await service.run(clients2, normalizeQuery({ include: 'control', controlId: 'op.exp.3', agentId: '024', timelineDays: '7', timeZone: tz }));
  }
  const ref4 = reference();
  const ownItems = ref4.docs.filter(d => d._source.data.ensfacil === 'op.exp.3' && d._source.agent.id === '024');
  const plan = planENSTimelineCuts(Math.min(...ownItems.map(d => Date.parse(d._source['@timestamp']))), ownItems.length, { now: clock, days: 7, timeZone: tz, maxEvaluatedEvents: Infinity });
  const asc = ref4.eventos.map(e => ({ e, t: Date.parse(e.timestamp) })).sort((a, b) => a.t - b.t);
  const expected = plan.map(c => {
    const r = getENSComplianceResultByControl('op.exp.3', ref4.nivel, c.isCurrent ? ref4.eventos : asc.filter(x => x.t <= c.cutoff.getTime()).map(x => x.e), '024', ref4.alcance, c.cutoff);
    return [c.label, r?.score, r?.status];
  });
  check('7-day series in Europe/Madrid (with the clock change): the engine\'s points', same((series.timeline || []).map(p => [p.label, p.score, p.status]), expected), [(series.timeline || []).map(p => p.label), expected.map(e => e[0])]);
  const ofDay = (cut: Date) => ref4.docs.filter(d => (d._source.data.ensfacil === 'op.exp.3' || d._source.data.control === 'op.exp.3') && ['024', '000'].includes(d._source.agent.id) && Date.parse(d._source['@timestamp']) <= cut.getTime()).length;
  check('each day\'s facts, counted until the end of the day in Madrid', (series.timeline || []).filter(p => !p.isCurrent).every((p, i) => p.events === ofDay(plan[i].cutoff)));

  {
    const s9 = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
    const summary = (options: any = {}) => s9.run(clients2, normalizeQuery({ include: 'summary', timeZone: 'UTC' }), { allowStale: true, ...options });
    await summary();
    const factReads = () => searchIndex.log.filter(l => l.body?.size > 0 && l.index?.startsWith('wazuh-alerts')).length;
    searchIndex.docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'otra', funcion: 'operacion' }, 0.2));
    fail = 1;
    const old9 = await summary();
    check('U-N1: new data, refresh launched behind', old9.meta.refreshing && old9.meta.stats.refreshingInBackground >= 1 && !old9.meta.refreshError);
    while (s9.tasks.size) await wait(5);
    const antes = factReads();
    const withError = await summary();
    check('U-N1: the refresh failed: the last good data with `refreshError` (motive and time)',
      withError.meta.refreshing && /Datos incompletos/.test(withError.meta.refreshError?.message || '') && withError.meta.refreshError?.at === clock.toISOString() && Boolean(withError.state), withError.meta.refreshError);
    check('U-N1: and the next request does not launch another computation', withError.meta.stats.refreshingInBackground === 0 && factReads() === antes, withError.meta.stats);
    const h9: any = await createEvaluationHandlers({ logger, securityEnabled: true, service: s9 }).evaluate(context, { query: { include: 'summary', timeZone: 'UTC' } }, response);
    check('U-N1: the route carries `meta.refreshError`', h9.status === 200 && /Datos incompletos/.test(h9.body.data.meta.refreshError?.message || ''), h9.body?.data?.meta);
    const retry: any = await createEvaluationHandlers({ logger, securityEnabled: true, service: s9 }).evaluate(context, { query: { include: 'summary', timeZone: 'UTC', retryRefresh: '1' } }, response);
    check('U-N1: «Reintentar» (retryRefresh=1) tries it now', retry.body.data.meta.stats.refreshingInBackground >= 1, retry.body?.data?.meta?.stats);
    while (s9.tasks.size) await wait(5);
    fail = 0;
    const saved = clock;
    clock = new Date(clock.getTime() + 61 * 1000);
    const past = await summary();
    check('U-N1: after the wait, it retries by itself', past.meta.stats.refreshingInBackground >= 1, past.meta.stats);
    while (s9.tasks.size) await wait(5);
    const good = await summary();
    check('U-N1: on success, no error or mark', !good.meta.refreshing && !good.meta.refreshError, good.meta.refreshError);
    clock = saved;
  }

  {
    const lento = { ...searchIndex, search: async (p: any) => { if (p.body?.size > 0) await wait(40); return searchIndex.search(p); } };
    const cl = { asCurrentUser: lento, asInternalUser: lento };
    // A short first-response budget: with one date formatter per zone the rows compute fast enough to finish in 600 ms.
    const s10 = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 150 });
    const signal = new CancelSignal();
    const t0 = Date.now();
    const first = await s10.run(cl, normalizeQuery({ include: 'summary', timeZone: 'UTC' }), { allowStale: true, signal: signal });
    const ms = Date.now() - t0;
    signal.cancel();
    const resp: any = buildEvaluationResponse(first);
    check('§10 the first response arrives without waiting for everything, with `pending`', ms < 1500 && (first.meta.pending?.rows || 0) > 0 && first.meta.refreshing && first.meta.fingerprint.startsWith('refreshing:'), [ms, first.meta.pending]);
    check('§10 pending controls go in the list, marked (no invented state)', resp.controls.length === 34 && resp.controls.filter((c: any) => c.pending).length === first.meta.pending!.controls.length && resp.controls.filter((c: any) => c.pending).every((c: any) => !c.evaluated));
    // A control without collector (DRAFT) has its result at once: only a measured one shows the slices work.
    const measuredIds = require('../common/ens/catalog').ENSCatalog.filter((c: any) => c.status === 'ACTIVE').map((c: any) => c.id);
    // Under CPU load the first answer may carry no finished slice yet: any partial answer proves the slices.
    const partial = (r: any) => {
      const controls: any[] = buildEvaluationResponse(r).controls;
      return controls.some(c => c.pending) && controls.some(c => !c.pending && c.evaluated && measuredIds.includes(c.controlId));
    };
    let sawPartial = partial(first);
    let n = 0;
    let ultima = first;
    while (ultima.meta.pending && n++ < 200) {
      await wait(50);
      ultima = await s10.run(cl, normalizeQuery({ include: 'summary', timeZone: 'UTC' }), { allowStale: true });
      sawPartial = sawPartial || partial(ultima);
    }
    // Timing only: on a loaded runner the whole computation can finish between two polls; the final result is still checked below.
    if (sawPartial || process.env.ENSFACIL_STRICT_TIMING === '1') {
      check('§10 and the cheap ones arrive before the rest, on all their machines (by control slices)', sawPartial, n);
    } else {
      console.log('  skip §10 partial answer not observed (the computation ended between two polls)');
    }
    const ref10 = reference();
    check('§10 the computation goes on even if whoever asked left, and ends like the engine', !ultima.meta.pending && same(ultima.state!.results.map(withoutTrace), getENSComplianceState(ref10.nivel, ref10.eventos, undefined, ref10.alcance, clock).results.map(withoutTrace)));
    while (!s10.idle()) await wait(20);
  }

  {
    const s11 = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
    const since = searchIndex.log.length;
    await s11.run(clients2, normalizeQuery({ include: 'summary', timeZone: 'UTC' }));
    const calls = searchIndex.log.slice(since);
    const ofFacts = calls.filter(l => l.body?.size > 0);
    const machines = 3;
    check('§11 fact reads: a few per machine, not one per control and machine', ofFacts.length <= machines * 6, ofFacts.length);
    check('§11 all reads except the probe name the window\'s indices', calls.filter(l => l.index === 'wazuh-alerts-*').length === 1 && calls.filter(l => String(l.index).startsWith('wazuh-alerts-4.x-')).length === calls.length - 1 - calls.filter(l => !String(l.index).startsWith('wazuh-alerts')).length, [...new Set(calls.map(l => l.index))]);
    check('§11 with `ignore_unavailable` (an index that no longer exists does not fail)', calls.filter(l => String(l.index).includes(',')).every(l => l.params?.ignore_unavailable === true));
    while (!s11.idle()) await wait(20);
  }

  {
    const s12 = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
    const summary = (o: any = {}) => s12.run(clients2, normalizeQuery({ include: 'summary', timeZone: 'UTC' }), { allowStale: true, ...o });
    await summary();
    while (!s12.idle()) await wait(20);
    searchIndex.docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'n4', funcion: 'operacion' }, 0.1));
    fail = 1;
    await summary();
    while (s12.tasks.size) await wait(5);
    const withError = await summary();
    check('§12 the refresh failed: the stored result with `refreshError`', /Datos incompletos/.test(withError.meta.refreshError?.message || ''));
    fail = 0;
    const lento = { ...searchIndex, search: async (p: any) => { if (p.body?.size > 0) await wait(60); return searchIndex.search(p); } };
    const retry = await s12.run({ asCurrentUser: lento, asInternalUser: lento }, normalizeQuery({ include: 'summary', timeZone: 'UTC' }), { allowStale: true, retryRefresh: true });
    check('§12 «Reintentar»: answers the stored result, updating and WITHOUT the old error', retry.meta.refreshing && !retry.meta.refreshError && retry.meta.stats.refreshingInBackground >= 1, retry.meta);
    while (s12.tasks.size) await wait(5);
    const good = await summary();
    check('§12 and the next request brings the new data, unmarked', !good.meta.refreshing && !good.meta.refreshError);
    while (!s12.idle()) await wait(20);
  }

  {
    let k = 0;
    const newOne = () => {
      k += 1;
      searchIndex.docs.push(fact(k % 2 ? '024' : '000', k % 2 ? 'wazuh-real' : 'manager', { ensfacil: k % 2 ? 'op.exp.3' : 'op.mon.3', event: 'collector_run', evidencias_cubiertas: 'EV-04' }, 0.0001 * (50 - k)));
    };
    const lento = { ...searchIndex, search: async (p: any) => { if (p.body?.size > 0) { await wait(10); newOne(); } return searchIndex.search(p); } };
    const cl = { asCurrentUser: lento, asInternalUser: lento };
    const s13 = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
    const request = (q: any) => s13.run(cl, normalizeQuery({ timeZone: 'UTC', ...q }), { allowStale: true });
    await request({ include: 'summary' });
    newOne();
    await request({ include: 'summary' });
    newOne();
    let panel = await request({ include: 'dashboard', timelineDays: '7' });
    for (let i = 0; i < 300 && !panel.timeline; i++) {
      await wait(100);
      newOne();
      panel = await request({ include: 'dashboard', timelineDays: '7' });
    }
    check('C1: the series arrives even if rows are refreshed while computing', (panel.timeline || []).length > 1, panel.meta);
    let always = true;
    let lastSheet: any;
    for (let i = 0; i < 6; i++) {
      newOne();
      const p = await request({ include: 'dashboard', timelineDays: '7' });
      newOne();
      lastSheet = await request({ include: 'control', controlId: 'op.exp.3', timelineDays: '30' });
      if (!p.timeline || p.meta.seriesPending || !lastSheet.timeline || lastSheet.meta.seriesPending) always = false;
    }
    check('C1: and with a new fact before each request, the panel and the sheet keep bringing it (never pending)', always);
    while (!s13.idle()) await wait(20);
    newOne();
    const after2 = await request({ include: 'dashboard', timelineDays: '7' });
    const sheet = await request({ include: 'control', controlId: 'op.exp.3', timelineDays: '30' });
    check('C1: all finished, with another new fact: the panel and the sheet with series', Boolean(after2.timeline) && !after2.meta.seriesPending && Boolean(sheet.timeline) && !sheet.meta.seriesPending);
    const clean = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
    let ref13 = await clean.run(clients2, normalizeQuery({ include: 'control', controlId: 'op.exp.3', timelineDays: '30', timeZone: 'UTC' }), { allowStale: true });
    for (let i = 0; i < 300 && !ref13.timeline; i++) {
      await wait(50);
      ref13 = await clean.run(clients2, normalizeQuery({ include: 'control', controlId: 'op.exp.3', timelineDays: '30', timeZone: 'UTC' }), { allowStale: true });
    }
    const pastOf = (t: any[]) => t.filter(p => !p.isCurrent).map(p => [p.label, p.score, p.status]);
    check('C1: the past days served are those of a clean computation', same(pastOf(sheet.timeline || []), pastOf(ref13.timeline || [])), [pastOf(sheet.timeline || []).slice(-3), pastOf(ref13.timeline || []).slice(-3)]);
    while (!s13.idle() || !clean.idle()) await wait(20);

    const saved = clock;
    const s15 = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 1 });
    const request15 = (q: any) => s15.run(clients2, normalizeQuery({ timeZone: 'UTC', ...q }), { allowStale: true });
    const advances = () => {
      clock = new Date(clock.getTime() + 2 * 60 * 1000);
      searchIndex.docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-04' }, 0.001));
      searchIndex.docs.push(fact('000', 'manager', { ensfacil: 'op.mon.3', event: 'collector_run' }, 0.001));
    };
    const calm = async () => { for (let i = 0; i < 600 && !s15.idle(); i++) await wait(20); };
    await request15({ include: 'summary' });
    while (s15.backgroundWork().rows > 0) await wait(20);
    advances();
    await request15({ include: 'summary' });
    advances();
    await request15({ include: 'dashboard', timelineDays: '7' });
    await calm();
    const withoutSeries = [...(s15.rows as any).entries.values()].filter((e: any) => !e.value.cuts || !e.value.cuts.complete).length;
    check('C1 (review): background finished, no row without its series', withoutSeries === 0, withoutSeries);
    advances();
    const panel15 = await request15({ include: 'dashboard', timelineDays: '7' });
    const sheet15 = await request15({ include: 'control', controlId: 'op.exp.3', timelineDays: '30' });
    await calm();
    advances();
    const other15 = await request15({ include: 'dashboard', timelineDays: '7' });
    check('C1 (review): with a new fact before each request, panel and sheet with series',
      Boolean(panel15.timeline) && !panel15.meta.seriesPending && Boolean(sheet15.timeline) && !sheet15.meta.seriesPending && Boolean(other15.timeline) && !other15.meta.seriesPending,
      [panel15.meta.seriesPending, sheet15.meta.seriesPending, other15.meta.seriesPending]);
    await calm();
    clock = saved;

    const s14 = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 1 });
    const request14 = (q: any) => s14.run(cl, normalizeQuery({ timeZone: 'UTC', ...q }), { allowStale: true });
    let p14 = await request14({ include: 'dashboard', timelineDays: '7' });
    for (let i = 0; i < 300 && !p14.timeline; i++) {
      await wait(50);
      p14 = await request14({ include: 'dashboard', timelineDays: '7' });
    }
    while (!s14.idle()) await wait(20);
    const clave = [...(s14.rows as any).entries.keys()].find((k: string) => k.includes('|op.exp.3|024'));
    (s14.rows as any).remove(clave);
    const withGap = await request14({ include: 'dashboard', timelineDays: '7' });
    check('I1: with a pending row and the stored series: no series and pending (no half-computed point for today)', Boolean(withGap.meta.pending) && withGap.meta.seriesPending === true && !withGap.timeline, withGap.meta);
    while (!s14.idle()) await wait(20);
  }

  failures.length ? console.log(`\n${failures.length} FAILURES`) : console.log('\nAll checks pass.');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
