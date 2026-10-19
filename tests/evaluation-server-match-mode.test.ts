/**
 * The server evaluation with «Expresión regular» at each level: every agent row of op.acc.1 EV-05 (service accounts
 * with interactive login, judged against P-03) is judged with the value AND the mode resolved for that agent.
 *
 *   npx --yes tsx tests/evaluation-server-match-mode.test.ts
 *
 *   1. Modes at every level: common regex, template regex, exact override over a regex template, regex override,
 *      exact template over a regex common value. Same as the browser engine.
 *   2. A document without matchMode compares literally, as 1.2.0 did.
 *   3. An invalid override pattern leaves only that agent's EV-05 NO_EVALUABLE, with the reason.
 */
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { getENSComplianceState } from '../common/ens/core/ens-engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveENSScopeAgents, normalizeInventory } from '../common/ens/core/scope/runtime';
import { inventoryFromMonitoring } from '../common/agents/agent-inventory';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  if (!ok) failures.push(name);
};
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'evaluatedAt').map(k => [k, canon(v[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const withoutTrace = (r: any) => (r ? { ...r, traceability: [] } : r);
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const clock = new Date('2026-10-17T12:00:00Z');
const at = (hours: number) => new Date(clock.getTime() - hours * 3600 * 1000).toISOString();
let n = 0;
const fact = (agent: string, data: Record<string, unknown>, hours: number): FakeDoc => ({
  _id: `f${String(++n).padStart(5, '0')}`,
  _index: 'wazuh-alerts-4.x-2026.10.17',
  _source: { '@timestamp': at(hours), timestamp: at(hours), id: `${Date.parse(at(hours)) / 1000}.${n}`, manager: { name: 'wazuh-manager' }, agent: { id: agent, name: `host-${agent}` }, rule: { id: '106873', groups: ['ENS'] }, data },
});

const AGENTS = ['101', '102', '103', '104', '105'];
const LOGINS: Record<string, string> = { '101': 'daemon', '102': 'svc_backup', '103': 'svc_backup', '104': 'svc_backup', '105': 'svc_backup' };
const docs: FakeDoc[] = [];
AGENTS.forEach(agent => {
  docs.push(fact(agent, { ensfacil: 'op.acc.1', event: 'collector_run', evidencias_cubiertas: 'EV-03,EV-05' }, 2));
  docs.push(fact(agent, { ensfacil: 'op.acc.1', event: 'account_authenticated', evidence_id: 'EV-03,EV-05', usuario: LOGINS[agent], origen: '10.0.0.9' }, 1));
});
const monitor = (id: string): FakeDoc => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17',
  _source: { id, name: `host-${id}`, group: ['ens'], status: 'active', timestamp: at(0.1), manager: 'manager' },
});

const COMMON = '^(root|daemon)$';
const withModes = (): any => {
  const configuration: any = copy(defaultENSConfigurationTemplate);
  configuration.scope = { mode: 'group', agentIds: [], groupIds: ['ens'] };
  configuration.updatedAt = '2026-10-16T10:00:00.000Z';
  Object.assign(configuration.controls.find((c: any) => c.controlId === 'op.acc.1').parameters.find((p: any) => p.id === 'P-03'), { value: COMMON, matchMode: 'regex' });
  configuration.templates = [
    { id: 'custom-svc', controlId: 'op.acc.1', name: 'Servicios svc_', values: { 'P-03': '^svc_.*$' }, matchModes: { 'P-03': 'regex' } },
    { id: 'custom-maria', controlId: 'op.acc.1', name: 'Solo maria', values: { 'P-03': ['maria'] } },
  ];
  configuration.agents = {
    '101': { controls: { 'op.acc.1': { templateId: 'none' } } },
    '102': { controls: { 'op.acc.1': { templateId: 'custom-svc' } } },
    '103': { controls: { 'op.acc.1': { templateId: 'custom-svc', parameters: { 'P-03': ['svc_backup2'] } } } },
    '104': { controls: { 'op.acc.1': { templateId: 'none', parameters: { 'P-03': '^svc_.*$' }, matchModes: { 'P-03': 'regex' } } } },
    '105': { controls: { 'op.acc.1': { templateId: 'custom-maria' } } },
  };
  return configuration;
};

const active = (configuration: any): FakeDoc => ({
  _id: 'active', _index: 'wazuh-ens-configuration',
  _source: { documentType: 'ACTIVE_CONFIGURATION', configuration, updatedAt: configuration.updatedAt },
});
const index = createFakeIndexer([...docs, ...AGENTS.map(monitor), active(withModes())],
  { clock: () => clock.getTime(), user: { user_name: 'ana', roles: ['all_access'] } });
const clients = { asCurrentUser: index, asInternalUser: index };
const logger: any = { info() {}, warn() {}, debug() {}, error() {} };
const setActive = (configuration: any) => {
  index.docs[index.docs.findIndex(d => d._id === 'active')] = active(configuration);
};

const rowsOf = (state: any) => Object.fromEntries(state.agents.map((a: any) =>
  [a.agentId, Object.fromEntries(a.results.map((r: any) => [r.control.id, withoutTrace(r)]))]));
const evaluate = async (configuration: any) => {
  setActive(configuration);
  const service = createEvaluationService({ logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
  const state = (await service.run(clients, { include: 'results', timeZone: 'UTC' })).state!;
  return rowsOf(state);
};
const browser = (configuration: any) => {
  ensConfigurationRepository.replaceActive(configuration);
  const alerts = index.docs.filter(d => d._index.startsWith('wazuh-alerts'))
    .sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || (a._source.id < b._source.id ? -1 : 1));
  const inventory = inventoryFromMonitoring({ agentes: { buckets: AGENTS.map(id => ({ key: id, ultimo: { hits: { hits: [index.docs.find(d => d._id === `m${id}`)] } } })) } }, clock.getTime());
  const scope = resolveENSScopeAgents(normalizeInventory(inventory.agents), configuration.scope);
  return rowsOf(getENSComplianceState(configuration.global.ensLevel, normalizeWazuhAlerts(alerts), undefined, scope, clock));
};
const ev05 = (rows: any, agent: string) => rows[agent]?.['op.acc.1']?.evidences?.find((e: any) => e.id === 'EV-05');

(async () => {
  console.log('1. Modes at every level');
  const configuration = withModes();
  const rows = await evaluate(configuration);
  check('every agent has its op.acc.1 row', AGENTS.every(agent => rows[agent]?.['op.acc.1']), Object.keys(rows));
  check('101, common regex: daemon is in the list', ev05(rows, '101')?.status === 'NO_CUMPLE', ev05(rows, '101')?.status);
  check('102, template regex: svc_backup matches', ev05(rows, '102')?.status === 'NO_CUMPLE', ev05(rows, '102')?.status);
  check('103, exact override over the regex template: svc_backup is not svc_backup2', ev05(rows, '103')?.status === 'CUMPLE', ev05(rows, '103')?.status);
  check('104, regex override: svc_backup matches', ev05(rows, '104')?.status === 'NO_CUMPLE', ev05(rows, '104')?.status);
  check('105, exact template over the regex common value: compared literally', ev05(rows, '105')?.status === 'CUMPLE', ev05(rows, '105')?.status);
  const reason = JSON.stringify(ev05(rows, '102'));
  check('the reason names the pattern and the full match', /expresión regular '\^svc_\.\*\$'/.test(reason) && /coincidencia completa/.test(reason), reason.slice(0, 300));
  check('same rows as the browser engine', same(rows, browser(configuration)));

  console.log('2. Without matchMode: literal, as 1.2.0');
  const plain = withModes();
  delete plain.controls.find((c: any) => c.controlId === 'op.acc.1').parameters.find((p: any) => p.id === 'P-03').matchMode;
  plain.controls.find((c: any) => c.controlId === 'op.acc.1').parameters.find((p: any) => p.id === 'P-03').value = [COMMON];
  plain.templates = [plain.templates[1]];
  plain.agents = { '101': copy(plain.agents['101']), '105': copy(plain.agents['105']) };
  plain.updatedAt = '2026-10-16T11:00:00.000Z';
  const literal = await evaluate(plain);
  check('101: the pattern text is a name, daemon is not it', ev05(literal, '101')?.status === 'CUMPLE', ev05(literal, '101')?.status);
  check('105: the exact template as before', ev05(literal, '105')?.status === 'CUMPLE', ev05(literal, '105')?.status);
  check('same rows as the browser engine', same(literal, browser(plain)));

  console.log('3. An invalid pattern degrades only its agent');
  const invalid = withModes();
  invalid.agents['104'].controls['op.acc.1'].parameters['P-03'] = '[';
  invalid.updatedAt = '2026-10-16T12:00:00.000Z';
  const broken = await evaluate(invalid);
  const reason104 = JSON.stringify(ev05(broken, '104')?.observations || []);
  check('104: NO_EVALUABLE, saying the pattern is invalid', ev05(broken, '104')?.status === 'NO_EVALUABLE' && /expresión regular utilizable: Expresión regular inválida/.test(reason104), reason104.slice(0, 300));
  check('the other agents keep their verdicts', ['101', '102', '103', '105'].every(agent => ev05(broken, agent)?.status === ev05(rows, agent)?.status));
  check('same rows as the browser engine', same(broken, browser(invalid)));

  if (failures.length) {
    console.log(`\n${failures.length} FAILURES`);
    process.exit(1);
  }
  console.log('\nAll checks pass.');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
