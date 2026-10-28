/** What the evaluation route adds for the overview views. */
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService, normalizeQuery } from '../server/lib/evaluation/evaluation-service';
import { buildEvaluationResponse, controlSummaryOf } from '../server/lib/evaluation/responses';
import { nonConformitiesOf } from '../server/lib/evaluation/overview-fields';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) failures.push(n);
};

const clock = new Date('2026-10-17T12:00:00Z');
const hora = (h: number) => new Date(clock.getTime() - h * 3600 * 1000).toISOString();
let n = 0;
const fact = (agent: string, name: string, data: Record<string, unknown>, hours: number): FakeDoc => ({
  _id: `h${String(++n).padStart(5, '0')}`,
  _index: 'wazuh-alerts-4.x-2026.10.17',
  _source: { '@timestamp': hora(hours), timestamp: hora(hours), id: `${Date.parse(hora(hours)) / 1000}.${n}`, manager: { name: 'wazuh-manager' }, agent: { id: agent, name: name }, rule: { id: '100', groups: ['ENS'] }, data },
});
const docs: FakeDoc[] = [];
for (const [agent, name, list] of [['101', 'srv-web01', ['ssh.service', 'telnet.service']], ['102', 'ldap01', ['ssh.service']]] as [string, string, string[]][]) {
  for (const h of [50, 5, 1]) {
    docs.push(fact(agent, name, { power_ens: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
    list.forEach(service => docs.push(fact(agent, name, { power_ens: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', perfil: name, servicio: service, estado: 'CUMPLE' }, h - 0.01)));
  }
}
docs.push(fact('101', 'srv-web01', { power_ens: 'op.acc.3', event: 'collector_run' }, 1));
docs.push(fact('102', 'ldap01', { power_ens: 'op.acc.3', event: 'collector_run' }, 40));
docs.push(fact('000', 'manager', { power_ens: 'op.mon.3', event: 'collector_run' }, 1));
docs.push(fact('000', 'manager', { power_ens: 'op.exp.7', event: 'collector_run' }, 2));
const monitor = (id: string, name: string): FakeDoc => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17',
  _source: { id, name, group: ['ens'], status: 'active', timestamp: hora(0.1), manager: 'manager' },
});
const configuration: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
configuration.scope = { mode: 'group', agentIds: [], groupIds: ['ens'] };
configuration.updatedAt = '2026-10-14T10:00:00.000Z';
configuration.controls.find((x: any) => x.controlId === 'op.exp.3').parameters.find((p: any) => p.id === 'P-02').value = ['srv-web01 | ssh.service', 'ldap01 | ssh.service'];
const index = createFakeIndexer([
  ...docs,
  monitor('101', 'srv-web01'),
  monitor('102', 'ldap01'),
  { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration: configuration, updatedAt: configuration.updatedAt } },
], { clock: () => clock.getTime(), user: { user_name: 'ana', roles: ['all_access'] } });
const clients2 = { asCurrentUser: index, asInternalUser: index };
const logger: any = { info() {}, warn() {}, debug() {}, error() {} };

(async () => {
  const service = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock });
  const request1 = async (q: any) => buildEvaluationResponse(await service.run(clients2, { timeZone: 'UTC', ...q })) as any;
  const request = async (q: any) => {
    let r = await request1(q);
    // Polls slower than the series idle window (SERIES_IDLE_MS, 200 ms; the screen polls every 2 s): at 50 ms a
    // request that takes longer than the gap leaves the background series no turn, and it never completes.
    for (let i = 0; i < 600 && (r.meta?.pending || r.meta?.seriesPending); i++) {
      await new Promise(ready => setTimeout(ready, 300));
      r = await request1(q);
    }
    return r;
  };

  console.log('1. Each machine, each control in its row');
  const summary = await request({ include: 'summary' });
  const machines = (summary.agents || []).map((a: any) => a.agentId).sort();
  check('summary brings the machines of the scope (000, 101, 102)', JSON.stringify(machines) === JSON.stringify(['000', '101', '102']), machines);
  check('each with `controls` (state, number, nonconformities)', summary.agents.every((a: any) => Array.isArray(a.controls) && a.controls.every((c: any) => 'status' in c && 'requirementsNotMet' in c)));
  const from = (id: string) => summary.agents.find((a: any) => a.agentId === id).controls.map((c: any) => c.controlId);
  check('101: those of plane agent (op.acc.1, op.exp.3...), none manager-only', from('101').includes('op.acc.1') && from('101').includes('op.exp.3') && !from('101').includes('op.exp.7'), from('101'));
  check('000: only those measured on the manager', from('000').includes('op.exp.7') && from('000').includes('op.acc.1') && !from('000').includes('op.exp.3'), from('000'));
  for (const agent of ['101', '102', '000']) {
    const vista = await request({ include: 'summary', agentId: agent });
    const ownItems = summary.agents.find((a: any) => a.agentId === agent).controls;
    const equal = ownItems.every((c: any) => {
      const v = vista.controls.find((x: any) => x.controlId === c.controlId);
      return v && v.status === c.status && v.score === c.score && v.requirementsNotMet === c.requirementsNotMet && v.requirementsNotEvidenced === c.requirementsNotEvidenced;
    });
    check(`${agent}: its row's data is what that machine's view gives`, equal);
  }
  const run = await service.run(clients2, { include: 'summary', timeZone: 'UTC' });
  check('it is `controlSummaryOf` of the row\'s result', JSON.stringify(summary.agents.map((a: any) => a.controls)) ===
    JSON.stringify(run.state!.agents.map(a => a.results.map(r => controlSummaryOf(r.control.id, r)))));

  console.log('2. overview');
  const general = await request({ include: 'overview' });
  check('the same as summary in controls and machines', JSON.stringify(general.controls) === JSON.stringify(summary.controls) && JSON.stringify(general.agents) === JSON.stringify(summary.agents));
  const cell = (c: string, a: string) => general.freshness.cells.find((x: any) => x.controlId === c && x.agentId === a);
  const count = (c: string, a: string) => docs.filter(d => d._source.data.power_ens === c && d._source.agent.id === a).length;
  const ultimo = (c: string, a: string) => docs.filter(d => d._source.data.power_ens === c && d._source.agent.id === a).map(d => d._source['@timestamp']).sort().pop();
  check('freshness by control and machine: count and last fact', [['op.exp.3', '101'], ['op.exp.3', '102'], ['op.acc.3', '102'], ['op.mon.3', '000']].every(([c, a]) =>
    cell(c, a)?.count === count(c, a) && Date.parse(cell(c, a)?.newest) === Date.parse(ultimo(c, a)!)), general.freshness.cells);
  check('op.acc.3 on 102: last fact 40 h ago', Date.parse(cell('op.acc.3', '102').newest) === Date.parse(hora(40)));
  check('no facts, no cell (op.acc.1 on 101)', !cell('op.acc.1', '101'));
  const a101 = general.freshness.agents.find((a: any) => a.agentId === '101');
  check('by machine: count, first, last and last heartbeat (without the name: it is in meta.scope)', a101.count === docs.filter(d => d._source.agent.id === '101').length && Date.parse(a101.newest) === Date.parse(hora(1 - 0.01)) && Date.parse(a101.lastHeartbeat) === Date.parse(hora(1)) && a101.agentName === undefined, a101);
  check('the machines of the freshness are those of the scope', general.freshness.agents.map((a: any) => a.agentId).sort().join() === '000,101,102');
  const ncs = run.state!.results.reduce((t, r) => t + (r.nonConformities || []).length, 0);
  check('the queue: all the nonconformities of the overview, with their control, their headline and the machines by id', general.nonConformities.length === ncs && ncs > 0 &&
    general.nonConformities.every((x: any) => x.controlId && x.requirementId && x.title && Array.isArray(x.agentIds) && x.agentIds.every((id: any) => typeof id === 'string')), { ncs, n: general.nonConformities.length });
  check('compact: no evidences, traces, full finding, action or repeated names',
    !/"traceability"|"evidences"|"finding"|"requiredAction"|"agentName"/.test(JSON.stringify({ nonConformities: general.nonConformities, freshness: general.freshness })));
  const BRIDGE = 'Resuelta por la política del control (policy.op.exp.6), que mide esta evidencia junto a op.exp.6.1: ';
  const title = nonConformitiesOf({
    results: [{ control: { id: 'op.exp.6' }, nonConformities: [{ id: 'NC-1', requirementId: 'op.exp.6.1', origin: 'MEDIDA', evidenceIds: ['EV-11'], parameterIds: [], agents: [{ agentId: '101', agentName: 'srv-web01' }], finding: `${BRIDGE}EV-01 NO_EVALUABLE: Falta P-02. Más. | EV-11 NO_CUMPLE: Faltan scripts de respuesta. Detalle largo.`, impact: 'x', requiredAction: 'y' }] }],
  } as any)[0];
  check('the server computes the headline: the first sentence of the guilty evidence, without the bridge', title.title === 'Faltan scripts de respuesta.' && title.titleEvidenceId === 'EV-11' && title.titleStatus === 'NO_CUMPLE' && JSON.stringify(title.agentIds) === '["101"]', title);

  console.log('3. The series in summary, with each control only if requested');
  const withoutFigures = await request({ include: 'summary', timelineDays: 3 });
  check('without `timelineControls`: the points without per-control figures', withoutFigures.timeline.every((p: any) => p.controls === undefined));
  const panel = await request({ include: 'dashboard', timelineDays: 3 });
  check('the Panel does not receive them either', panel.timeline.every((p: any) => p.controls === undefined));
  check('the request accepts the flag', normalizeQuery({ include: 'summary', timelineControls: 'true' }).timelineControls === true && normalizeQuery({ include: 'summary' }).timelineControls === undefined);
  const series = await request({ include: 'summary', timelineDays: 3, timelineControls: true });
  check('brings `timeline`', Array.isArray(series.timeline) && series.timeline.length > 1, series.timeline?.length);
  const hoy = series.timeline[series.timeline.length - 1];
  check('the last point is the current one, with each control as above', hoy.isCurrent &&
    series.controls.every((c: any) => hoy.controls[c.controlId]?.status === c.status && hoy.controls[c.controlId]?.score === c.score), hoy);
  check('past days also bring each control', series.timeline.slice(0, -1).every((p: any) => p.controls && Object.keys(p.controls).length > 0));
  let compared = 0;
  const distinct: unknown[] = [];
  for (const c of series.controls.map((x: any) => x.controlId)) {
    const own = (await request({ include: 'control', controlId: c, timelineDays: 3 })).timeline || [];
    for (const punto of own.filter((p: any) => !p.isCurrent)) {
      const ofSummary = series.timeline.find((p: any) => p.date === punto.date)?.controls?.[c];
      if (!ofSummary) continue;
      compared += 1;
      if (ofSummary.status !== punto.status || ofSummary.score !== punto.score) distinct.push({ c, date: punto.date, resumen: ofSummary, propia: [punto.status, punto.score] });
    }
  }
  check('past days: each control = the series of its detail that day', compared > 0 && distinct.length === 0, { comparados: compared, distintos: distinct.slice(0, 3) });
  check('without `timelineDays`, no series', summary.timeline === undefined);

  console.log('4. The request');
  check('overview is a valid view', normalizeQuery({ include: 'overview' }).include === 'overview');
  let rejects = false;
  try { normalizeQuery({ include: 'nada' }); } catch (e) { rejects = (e as any).statusCode === 400; }
  check('an unknown view, 400', rejects);
  const run2 = await service.run(clients2, { include: 'overview', timeZone: 'UTC' });
  check('the overview, with everything in memory, computes no row', run2.meta.stats.computed === 0, run2.meta.stats);

  console.log('5. The Overview answers in parts, like the list and the panel');
  {
    const wait = (ms: number) => new Promise(ready => setTimeout(ready, ms));
    const lento = { ...index, search: async (p: any) => { if (p.body?.size > 0) await wait(40); return index.search(p); } };
    const cl = { asCurrentUser: lento, asInternalUser: lento };
    // A short first-response budget: with one date formatter per zone the rows compute fast enough to finish in 300 ms.
    const s5 = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 100 });
    const t0 = Date.now();
    const first = buildEvaluationResponse(await s5.run(cl, { include: 'overview', timeZone: 'UTC' })) as any;
    const pending = first.meta.pending?.controls || [];
    check('answers without waiting for everything, with `meta.pending`', Date.now() - t0 < 3000 && (first.meta.pending?.rows || 0) > 0 && first.meta.refreshing, first.meta.pending);
    check('pending controls, in place and marked (no invented state)', first.controls.length === 34 && first.controls.filter((c: any) => c.pending).map((c: any) => c.controlId).join() === pending.join() && first.controls.filter((c: any) => c.pending).every((c: any) => !c.evaluated));
    check('no machine brings a pending control yet', first.agents.every((a: any) => a.controls.every((c: any) => !pending.includes(c.controlId))));
    check('freshness already goes complete (it comes from the probe)', first.freshness.agents.map((a: any) => a.agentId).sort().join() === '000,101,102');
    check('the queue only with already computed controls', first.nonConformities.every((nc: any) => !pending.includes(nc.controlId)));
    let ultima = first;
    for (let i = 0; i < 600 && ultima.meta.pending; i++) {
      await wait(50);
      ultima = buildEvaluationResponse(await s5.run(cl, { include: 'overview', timeZone: 'UTC' })) as any;
    }
    check('polling, it ends complete and equal to the earlier one', !ultima.meta.pending && JSON.stringify(ultima.controls) === JSON.stringify(general.controls) && JSON.stringify(ultima.agents) === JSON.stringify(general.agents) && JSON.stringify(ultima.nonConformities) === JSON.stringify(general.nonConformities));
  }

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
