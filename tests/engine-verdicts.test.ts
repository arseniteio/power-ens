/** Controls the OSCompliance engine judges: the server reads their verdicts, never their facts. */
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { ENS_VERDICTS_INDEX } from '../common/constants';
import { addVerdictsProbePage, buildVerdictsProbeRequest, VERDICTS_PROBE_PAGE } from '../server/lib/evaluation/verdict-queries';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) failures.push(n);
};

let clock = new Date('2026-10-17T12:00:00Z');
const hoursAgo = (h: number) => new Date(clock.getTime() - h * 3600e3).toISOString().replace('.000Z', 'Z');
let n = 0;
const verdict = (source: Record<string, unknown>): FakeDoc => ({ _id: `v${++n}`, _index: ENS_VERDICTS_INDEX, _source: { oscompliance_verdict: '1', ...source } });

const pass = (agentId: string, name: string, at: string, evidence06: string) => [
  verdict({ '@timestamp': at, scope: 'control', control: 'op.acc.1', agent: { id: agentId, name }, status: evidence06 === 'COMPLIANT' ? 'COMPLIANT' : 'PARTIAL', score: evidence06 === 'COMPLIANT' ? 100 : 75, coverage: 100, applicable_requirements: 4, measured_requirements: 4, reason: 'pass' }),
  verdict({ '@timestamp': at, scope: 'requirement', control: 'op.acc.1', requirement: 'op.acc.1.1', agent: { id: agentId, name }, status: 'COMPLIANT', evidenced: true, reason: 'compliant evidence: EV-03' }),
  verdict({ '@timestamp': at, scope: 'requirement', control: 'op.acc.1', requirement: 'op.acc.1.2', agent: { id: agentId, name }, status: evidence06 === 'COMPLIANT' ? 'COMPLIANT' : 'NON_COMPLIANT', evidenced: true, reason: 'evidence EV-06' }),
  verdict({ '@timestamp': at, scope: 'requirement', control: 'op.acc.1', requirement: 'op.acc.1.r1.3', agent: { id: agentId, name }, status: 'NON_COMPLIANT', evidenced: false, reason: 'not evidenced: EV-07 (CONFIGURATION)' }),
  verdict({ '@timestamp': at, scope: 'evidence', control: 'op.acc.1', evidence: 'EV-06', agent: { id: agentId, name }, status: evidence06, reason: 'no separate admin identity: ubuntu (sudo)' }),
  verdict({ '@timestamp': at, scope: 'evidence', control: 'op.acc.1', evidence: 'EV-07', agent: { id: agentId, name }, status: 'NOT_EVALUABLE', cause: 'CONFIGURATION', reason: 'P-07: not set' }),
];

const monitor = (id: string, name: string): FakeDoc => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17',
  _source: { id, name, group: ['ens'], status: 'active', timestamp: hoursAgo(0.1), manager: 'manager' },
});
const configuration: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
configuration.scope = { mode: 'group', agentIds: [], groupIds: ['ens'] };
configuration.updatedAt = '2026-10-14T10:00:00.000Z';
const index = createFakeIndexer([
  ...pass('001', 'lab-agent-01', hoursAgo(26), 'COMPLIANT'),
  ...pass('001', 'lab-agent-01', hoursAgo(2), 'NON_COMPLIANT'),
  ...pass('000', 'wazuh.manager', hoursAgo(2), 'COMPLIANT'),
  monitor('001', 'lab-agent-01'),
  { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration, updatedAt: configuration.updatedAt } },
], { clock: () => clock.getTime(), user: { user_name: 'ana', roles: ['all_access'] } });
const clients = { asCurrentUser: index, asInternalUser: index };
const logger: any = { info() {}, warn() {}, debug() {}, error() {} };

(async () => {
  const service = createEvaluationService({ logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });

  const sheet = await service.run(clients, { include: 'control', controlId: 'op.acc.1', agentId: '001', timeZone: 'UTC' });
  const result = sheet.views.get('op.acc.1')!.result!;
  check('the control status and score are the engine\'s latest pass', result.status === 'PARCIAL' && result.score === 75, [result.status, result.score]);
  check('each requirement carries its verdict', result.requirements.find(r => r.id === 'op.acc.1.2')?.status === 'NO_CUMPLE' && result.requirements.find(r => r.id === 'op.acc.1.1')?.status === 'CUMPLE');
  check('each evidence carries its verdict and reason', result.evidences.find(e => e.id === 'EV-06')?.status === 'NO_CUMPLE' && result.evidences.find(e => e.id === 'EV-06')!.observations[0].includes('ubuntu'));
  const measured = result.nonConformities.find(nc => nc.requirementId === 'op.acc.1.2');
  check('a measured failure opens a MEDIDA non-conformity on its evidence', measured?.origin === 'MEDIDA' && measured.evidenceIds.join() === 'EV-06', measured);
  const unproven = result.nonConformities.find(nc => nc.requirementId === 'op.acc.1.r1.3');
  check('an unproven requirement opens a CONFIGURATION gap with its parameter', unproven?.origin === 'NO_EVIDENCIADA' && unproven.cause === 'CONFIGURATION' && unproven.parameterIds.join() === 'P-07', unproven);
  check('no fact of op.acc.1 is read', !index.log.some(l => l.index?.startsWith('wazuh-alerts') && JSON.stringify(l.body).includes('op.acc.1') && (l.body?.size ?? 0) > 0));

  const manager = await service.run(clients, { include: 'control', controlId: 'op.acc.1', agentId: '000', timeZone: 'UTC' });
  check('the manager has its own op.acc.1 row', manager.views.get('op.acc.1')!.result?.status === 'CUMPLE', manager.views.get('op.acc.1')!.result?.status);

  let series = await service.run(clients, { include: 'control', controlId: 'op.acc.1', agentId: '001', timelineDays: 7, timeZone: 'UTC' });
  for (let i = 0; i < 50 && series.meta.seriesPending; i++) {
    await new Promise(ready => setTimeout(ready, 100));
    series = await service.run(clients, { include: 'control', controlId: 'op.acc.1', agentId: '001', timelineDays: 7, timeZone: 'UTC' });
  }
  const points = (series.timeline || []) as any[];
  check('the series comes from the daily control verdicts', points.length > 1 && points.some(p => p.score === 100), points.map(p => [p.date, p.score]));

  const before = index.log.length;
  const again = await service.run(clients, { include: 'control', controlId: 'op.acc.1', agentId: '001', timeZone: 'UTC' });
  check('without a new pass nothing is recomputed', again.meta.stats.computed === 0 && !index.log.slice(before).some(l => l.index === ENS_VERDICTS_INDEX && (l.body?.size ?? 0) > 0));

  clock = new Date(clock.getTime() + 3600e3);
  index.docs.push(...pass('001', 'lab-agent-01', hoursAgo(0.5), 'COMPLIANT'));
  let fresh = await service.run(clients, { include: 'control', controlId: 'op.acc.1', agentId: '001', timeZone: 'UTC' });
  for (let i = 0; i < 50 && fresh.meta.refreshing; i++) {
    await new Promise(ready => setTimeout(ready, 50));
    fresh = await service.run(clients, { include: 'control', controlId: 'op.acc.1', agentId: '001', timeZone: 'UTC' });
  }
  check('a new pass replaces the result', fresh.views.get('op.acc.1')!.result?.status === 'CUMPLE', fresh.views.get('op.acc.1')!.result?.status);

  const empty = createFakeIndexer([monitor('001', 'lab-agent-01'), { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration, updatedAt: configuration.updatedAt } }], { clock: () => clock.getTime() });
  const none = await createEvaluationService({ logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 })
    .run({ asCurrentUser: empty, asInternalUser: empty }, { include: 'control', controlId: 'op.acc.1', agentId: '001', timeZone: 'UTC' });
  const missing = none.views.get('op.acc.1')!.result!;
  check('no verdict yet: not proven, cause COLLECTION', missing.status === 'NO_CUMPLE' && missing.nonConformities.every(nc => nc.cause === 'COLLECTION' || nc.cause === 'CATALOG'), [missing.status, missing.nonConformities.map(nc => nc.cause)]);

  const fleet = createFakeIndexer(
    Array.from({ length: VERDICTS_PROBE_PAGE * 2 + 5 }, (_, i) => verdict({ '@timestamp': hoursAgo(1), scope: 'control', control: 'op.acc.1', agent: { id: String(i).padStart(6, '0') }, status: 'COMPLIANT' })),
    { clock: () => clock.getTime() }
  );
  const probe = {};
  let after: Record<string, string> | undefined;
  let pages = 0;
  do {
    after = addVerdictsProbePage(probe, (await fleet.search(buildVerdictsProbeRequest(['op.acc.1'], hoursAgo(48), after))).body);
    pages += 1;
  } while (after);
  check('the probe pages through every machine of a large fleet', Object.keys((probe as any)['op.acc.1']).length === VERDICTS_PROBE_PAGE * 2 + 5 && pages === 3, pages);

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nAll checks pass.');
  process.exit(failures.length ? 1 : 0);
})();
