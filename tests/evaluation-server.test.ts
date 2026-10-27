/** Server evaluation (`/api/ensfacil/evaluation`) end to end against an in-memory indexer. */
import * as fs from 'fs';
import * as path from 'path';
declare const require: any;
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { buildEvaluationResponse } from '../server/lib/evaluation/responses';
import { createEvaluationHandlers } from '../server/lib/evaluation-handlers';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { getENSComplianceResultByControl, getENSComplianceState } from '../common/ens/core/ens-engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { planENSTimelineCuts } from '../common/ens/core/timeline/timeline-cuts';
import { resolveENSScopeAgents, normalizeInventory } from '../common/ens/core/scope/runtime';
import { inventoryFromMonitoring } from '../common/agents/agent-inventory';
import { FACTS_PAGE_SIZE } from '../server/lib/evaluation/facts-reader';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`); if (!c) failures.push(n); };
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'evaluatedAt').map(k => [k, canon(v[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const withoutTrace = (r: any) => (r ? { ...r, traceability: [] } : r);

let clock = new Date('2026-10-17T12:00:00Z');
const hora = (h: number) => new Date(clock.getTime() - h * 3600 * 1000).toISOString();
let n = 0;
const fact = (agent: string, name: string, data: Record<string, unknown>, hours: number): FakeDoc => ({
  _id: `h${String(++n).padStart(5, '0')}`,
  _index: 'wazuh-alerts-4.x-2026.10.17',
  _source: { '@timestamp': hora(hours), timestamp: hora(hours), id: `${Date.parse(hora(hours)) / 1000}.${n}`, manager: { name: 'wazuh-manager' }, agent: { id: agent, name: name }, rule: { id: '100', groups: ['ENS'] }, data },
});

const docs: FakeDoc[] = [];
for (const line of fs.readFileSync(path.join(__dirname, 'fixtures/mp-info-6-pbs-pass.ndjson'), 'utf8').split('\n').filter(Boolean)) {
  docs.push(fact('024', 'wazuh-real', JSON.parse(line), 3));
}
for (let h = 200; h >= 1; h -= 1) {
  docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
  docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', servicio: h > 100 ? 'telnet' : 'sshd', estado: 'CUMPLE' }, h - 0.01));
}
for (let i = 0; i < FACTS_PAGE_SIZE + 1300; i++) {
  docs.push(fact(i % 6 ? '024' : '028', i % 6 ? 'wazuh-real' : 'zimbraHldap', { ensfacil: 'op.acc.3', event: 'account_action', usuario: `u${i % 7}`, funcion: i % 2 ? 'operacion' : 'desarrollo' }, 2 + (i % 500) / 10));
}
for (const [a, nm] of [['024', 'wazuh-real'], ['028', 'zimbraHldap']]) docs.push(fact(a, nm, { ensfacil: 'op.acc.3', event: 'collector_run' }, 1));
docs.push(fact('000', 'manager', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
docs.push(fact('000', 'manager', { ensfacil: 'op.mon.3', event: 'log_source_observed', fuente: '/var/log/syslog' }, 1));
docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
docs.push(fact('000', 'manager', { ensfacil: 'op.exp.7', event: 'collector_run' }, 2));
docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.8', event: 'audit_log_status', evidence_id: 'EV-01', estado: 'CUMPLE' }, 2));
docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'viejo', funcion: 'operacion' }, 40 * 24));
docs.push(fact('099', 'fuera', { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'x', funcion: 'operacion' }, 2));

const monitor = (id: string, name: string, group: string[]) => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17',
  _source: { id, name, group, status: 'active', timestamp: hora(0.1), manager: 'manager' },
});
const configuration = {
  ...defaultENSConfigurationTemplate,
  scope: { mode: 'group', agentIds: [], groupIds: ['ens'] },
  updatedAt: '2026-10-14T10:00:00.000Z',
};
const index = createFakeIndexer([
  ...docs,
  monitor('024', 'wazuh-real', ['ens']),
  monitor('028', 'zimbraHldap', ['ens']),
  monitor('099', 'fuera', ['default']),
  { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration: configuration, updatedAt: '2026-10-14T10:00:00.000Z' } },
], { clock: () => clock.getTime() });
const clients2 = { asCurrentUser: index, asInternalUser: index };
const logger: any = { info() {}, warn() {}, debug() {}, error() {} };
const service = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });

const reference = () => {
  ensConfigurationRepository.replaceActive(configuration as any);
  const since = clock.getTime() - 30 * 86400e3;
  const all = index.docs
    .filter(d => d._index.startsWith('wazuh-alerts') && ['000', '024', '028'].includes(d._source.agent.id))
    .filter(d => Date.parse(d._source['@timestamp']) >= since && Date.parse(d._source['@timestamp']) <= clock.getTime())
    .sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || (a._source.id < b._source.id ? -1 : a._source.id > b._source.id ? 1 : 0));
  const inventory = inventoryFromMonitoring({ agentes: { buckets: ['024', '028', '099'].map(id => ({ key: id, ultimo: { hits: { hits: [index.docs.find(d => d._id === `m${id}`)] } } })) } }, clock.getTime());
  const scope = resolveENSScopeAgents(normalizeInventory(inventory.agents), configuration.scope as any);
  return { eventos: normalizeWazuhAlerts(all), alcance: scope, nivel: (configuration as any).global.ensLevel, docs: all };
};

(async () => {
  const ref = reference();
  check('the test scope: manager, 024 and 028', JSON.stringify(ref.alcance.map(a => a.id).sort()) === '["000","024","028"]', ref.alcance.map(a => a.id));

  const whole = await service.run(clients2, { include: 'results', timeZone: 'UTC' });
  const expectedValue = getENSComplianceState(ref.nivel, ref.eventos, undefined, ref.alcance, clock);
  check('whole: the results are the engine\'s over all facts', same(whole.state!.results.map(withoutTrace), expectedValue.results.map(withoutTrace)),
    expectedValue.results.filter((r, i) => !same(withoutTrace(r), withoutTrace(whole.state!.results[i]))).map(r => r.control.id));
  check('whole: the summary and the machines, equal', same(whole.state!.controlSummary, expectedValue.controlSummary) &&
    same(whole.state!.agents.map(a => [a.agentId, a.summary, a.results.map(r => [r.control.id, r.status, r.score])]), expectedValue.agents.map(a => [a.agentId, a.summary, a.results.map(r => [r.control.id, r.status, r.score])])));
  const traceTotal = expectedValue.results.find(r => r.control.id === 'op.acc.3')!.traceability.length;
  check('traceability is counted whole even if it does not travel', whole.views.get('op.acc.3')!.traceabilityTotal === traceTotal && traceTotal > 100, [traceTotal, whole.views.get('op.acc.3')!.traceabilityTotal]);

  const readExp3 = whole.meta.stats.rows.find((c: any) => c.controlId === 'op.exp.3' && c.agentId === '024');
  check('op.exp.3: state facts of earlier passes are pruned', Boolean(readExp3?.pruned) && readExp3!.hits < 400 + 200, readExp3);
  check('op.acc.3 on 024: read in several pages (without the cap of a single search)', (whole.meta.stats.rows.find((c: any) => c.controlId === 'op.acc.3' && c.agentId === '024')?.pages || 0) >= 2);
  const withoutRow = whole.meta.stats.rows.filter((r: any) => r.agentId === '*').map((r: any) => r.controlId);
  const wholeReads = index.log.filter(l => l.body?.size > 0 && l.index?.startsWith('wazuh-alerts') && !JSON.stringify(l.body.query).includes('{"term":{"agent.id":'));
  check('each fact read is of ONE machine, except controls without a row (pruning does not grow with machines)',
    wholeReads.every(l => withoutRow.some((id: string) => JSON.stringify(l.body.query).includes(`"data.ensfacil":"${id}"`))), [withoutRow, wholeReads.length]);
  check('nobody asks Wazuh indices for partial results', index.log.filter(l => /^wazuh-(alerts|monitoring)/.test(l.index || '')).every(l => l.params?.allow_partial_search_results === false));
  check('no read sorts by `_id`', index.log.every(l => !JSON.stringify(l.body?.sort || []).includes('"_id"')));
  check('no read asks for more than one page at a time', index.log.every(l => (l.body?.size ?? 0) <= FACTS_PAGE_SIZE));
  check('each fact is read with filtered `_source` (not the whole document)', index.log.filter(l => l.body?.size > 0 && l.index?.startsWith('wazuh-alerts')).every(l => Array.isArray(l.body._source) && !l.body._source.includes('full_log')));

  const reads = index.log.length;
  for (const agent of ['000', '024', '028']) {
    const vista = await service.run(clients2, { include: 'results', agentId: agent, timeZone: 'UTC' });
    const its = getENSComplianceState(ref.nivel, ref.eventos, agent, ref.alcance, clock);
    check(`${agent}: same as the engine over everything`, same(vista.state!.results.map(withoutTrace), its.results.map(withoutTrace)) && same(vista.state!.controlSummary, its.controlSummary));
    check(`${agent}: each control as the sheet`, vista.state!.results.every(r => same(withoutTrace(r), withoutTrace(getENSComplianceResultByControl(r.control.id, ref.nivel, ref.eventos, agent, ref.alcance, clock)))));
    check(`${agent}: without evaluating again`, vista.meta.stats.computed === 0, vista.meta.stats.computed);
  }
  check('machine views only do the probe (no fact reads)', index.log.slice(reads).every(l => l.body?.size === 0 || l.index === 'wazuh-ens-configuration'));

  const other = await service.run(clients2, { include: 'summary', timeZone: 'UTC' });
  check('second time, nothing is recomputed', other.meta.stats.computed === 0);
  check('current result: computedAt is the confirmation time, not the oldest row', !other.meta.refreshing && other.meta.computedAt === other.meta.evaluatedAt, [other.meta.computedAt, other.meta.evaluatedAt]);
  const h = createEvaluationHandlers({ logger, securityEnabled: true, service: service });
  const ctx = { core: { opensearch: { client: clients2 } } };
  const resp = { ok: (r: any) => r.body, customError: (r: any) => ({ error: r }) };
  const probe: any = await h.probe(ctx, { query: { timeZone: 'UTC' } }, resp);
  check('the probe: few bytes', JSON.stringify(probe).length < 400, JSON.stringify(probe).length);
  check('the probe states the same fingerprint as the evaluation', probe.data.fingerprint === other.meta.fingerprint);
  index.docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'nuevo', funcion: 'desarrollo' }, 0.5));
  const probe2: any = await h.probe(ctx, { query: { timeZone: 'UTC' } }, resp);
  check('a new fact changes the fingerprint', probe2.data.fingerprint !== probe.data.fingerprint);
  const after2 = await service.run(clients2, { include: 'summary', timeZone: 'UTC' });
  check('and only its row is recomputed (op.acc.3 on 024)', after2.meta.stats.computed === 1 && after2.meta.stats.rows[0]?.controlId === 'op.acc.3' && after2.meta.stats.rows[0]?.agentId === '024', after2.meta.stats.rows.map((c: any) => `${c.controlId}@${c.agentId}`));
  const ref2 = reference();
  check('with the new fact, it is still the same as the engine over everything', same(after2.state!.results.map(withoutTrace), getENSComplianceState(ref2.nivel, ref2.eventos, undefined, ref2.alcance, clock).results.map(withoutTrace)));

  const otherIndex = { ...index, transport: { request: async () => ({ body: { user_name: 'luis', roles: ['readall'] } }) } };
  const ofLuis = await service.run({ asCurrentUser: otherIndex, asInternalUser: index }, { include: 'summary', timeZone: 'UTC' });
  check('another user: their own evaluation', ofLuis.meta.stats.computed > 0);

  clock = new Date(clock.getTime() + 61 * 60 * 1000);
  const expired = await service.run(clients2, { include: 'summary', timeZone: 'UTC' });
  check('expired (60 min): evaluated again', expired.meta.stats.computed > 0);

  const summary = JSON.stringify(buildEvaluationResponse(expired));
  const sheet = JSON.stringify(buildEvaluationResponse(await service.run(clients2, { include: 'control', controlId: 'op.acc.3', timeZone: 'UTC' })));
  check('no response carries index documents', !/"_source"|"full_log"/.test(summary + sheet));
  check('the sheet brings at most 100 traceability entries', (JSON.parse(sheet).result.traceability || []).length <= 100);

  const ref3 = reference();
  const ofFactsUntil = () => index.log.filter(l => l.body?.size > 0 && l.index?.startsWith('wazuh-alerts')).length;
  let withSeries = await service.run(clients2, { include: 'dashboard', timelineDays: 7, timeZone: 'UTC' });
  check('the panel does not wait for the series: answers without it and marks it pending', withSeries.meta.seriesPending === true && !withSeries.timeline, withSeries.meta.seriesPending);
  for (let i = 0; i < 600 && withSeries.meta.seriesPending; i++) {
    await new Promise(r => setTimeout(r, 500));
    withSeries = await service.run(clients2, { include: 'dashboard', timelineDays: 7, timeZone: 'UTC' });
  }
  const readsBefore = ofFactsUntil();
  const again2 = await service.run(clients2, { include: 'dashboard', timelineDays: 7, timeZone: 'UTC' });
  check('series computed, the panel reads no fact again', !again2.meta.seriesPending && (again2.timeline || []).length > 1 && ofFactsUntil() === readsBefore);
  const sheet30 = await service.run(clients2, { include: 'control', controlId: 'op.exp.3', timelineDays: 30, timeZone: 'UTC' });
  check('and the sheet with 30 days neither (the same series of each row)', !sheet30.meta.seriesPending && (sheet30.timeline || []).length > 1 && ofFactsUntil() === readsBefore);
  const asc = ref3.eventos.map(e => ({ e, t: Date.parse(e.timestamp) })).sort((a, b) => a.t - b.t);
  const plan = planENSTimelineCuts(Math.min(...asc.map(x => x.t)), asc.length, { now: clock, days: 7, timeZone: 'UTC', maxEvaluatedEvents: Infinity });
  const expected = plan.map(c => getENSComplianceState(ref3.nivel, c.isCurrent ? ref3.eventos : asc.filter(x => x.t <= c.cutoff.getTime()).map(x => x.e), undefined, ref3.alcance, c.cutoff).controlSummary.scoreAverage);
  check('the panel series: the same points as the engine day by day', same((withSeries.timeline || []).map(p => p.score), expected), [(withSeries.timeline || []).map(p => p.score), expected]);
  const again = await service.run(clients2, { include: 'dashboard', timelineDays: 7, timeZone: 'UTC' });
  check('past days are stored: the second time nothing is evaluated', again.meta.stats.computed === 0 && same(again.timeline, withSeries.timeline));
  const model = (buildEvaluationResponse(withSeries) as any).dashboard;
  check('the panel receives the finished model (with its series)', model && model.evolution.rows.length === expected.length);

  failures.length ? console.log(`\n${failures.length} FAILURES`) : console.log('\nAll checks pass.');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
