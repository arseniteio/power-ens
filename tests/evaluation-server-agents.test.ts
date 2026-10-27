/** Server evaluation with per-system configuration: each row uses the configuration resolved for its machine. */
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { createEvaluationHandlers } from '../server/lib/evaluation-handlers';
import { createConfigurationHandlers } from '../server/lib/configuration-handlers';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { getENSComplianceState } from '../common/ens/core/ens-engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveENSScopeAgents, normalizeInventory } from '../common/ens/core/scope/runtime';
import { inventoryFromMonitoring } from '../common/agents/agent-inventory';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`);
  if (!c) failures.push(n);
};
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'evaluatedAt').map(k => [k, canon(v[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const withoutTrace = (r: any) => (r ? { ...r, traceability: [] } : r);

const clock = new Date('2026-10-17T12:00:00Z');
const hora = (h: number) => new Date(clock.getTime() - h * 3600 * 1000).toISOString();
let n = 0;
const fact = (agent: string, name: string, data: Record<string, unknown>, hours: number): FakeDoc => ({
  _id: `h${String(++n).padStart(5, '0')}`,
  _index: 'wazuh-alerts-4.x-2026.10.17',
  _source: { '@timestamp': hora(hours), timestamp: hora(hours), id: `${Date.parse(hora(hours)) / 1000}.${n}`, manager: { name: 'wazuh-manager' }, agent: { id: agent, name: name }, rule: { id: '100', groups: ['ENS'] }, data },
});

const docs: FakeDoc[] = [];
const services: [string, string, string[]][] = [
  ['024', 'wazuh-real', ['ssh.service', 'telnet.service']],
  ['028', 'zimbraHldap', ['ssh.service', 'slapd.service']],
];
for (const [agent, name, list] of services) {
  for (const h of [5, 1]) {
    docs.push(fact(agent, name, { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
    list.forEach(service =>
      docs.push(fact(agent, name, { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', perfil: name, servicio: service, estado: 'CUMPLE' }, h - 0.01)));
  }
}
for (let i = 0; i < 60; i++) {
  docs.push(fact(i % 3 ? '024' : '028', i % 3 ? 'wazuh-real' : 'zimbraHldap', { ensfacil: 'op.acc.3', event: 'account_action', usuario: `u${i % 7}`, funcion: i % 2 ? 'operacion' : 'desarrollo' }, 2 + i / 10));
}
for (const [a, nm] of [['024', 'wazuh-real'], ['028', 'zimbraHldap']]) docs.push(fact(a, nm, { ensfacil: 'op.acc.3', event: 'collector_run' }, 1));
docs.push(fact('000', 'manager', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
docs.push(fact('000', 'manager', { ensfacil: 'op.mon.3', event: 'log_source_observed', fuente: '/var/log/syslog' }, 1));
docs.push(fact('000', 'manager', { ensfacil: 'op.exp.7', event: 'collector_run' }, 2));
docs.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.8', event: 'audit_log_status', evidence_id: 'EV-01', estado: 'CUMPLE' }, 2));

const monitor = (id: string, name: string, group: string[]): FakeDoc => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17',
  _source: { id, name, group, status: 'active', timestamp: hora(0.1), manager: 'manager' },
});

const P02_ORGANIZATION = ['wazuh-real | ssh.service', 'zimbraHldap | ssh.service,slapd.service'];
const P02_OF_024 = ['wazuh-real | ssh.service,telnet.service'];
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const withoutKey: any = (() => {
  const c: any = copy(defaultENSConfigurationTemplate);
  c.scope = { mode: 'group', agentIds: [], groupIds: ['ens'] };
  c.updatedAt = '2026-10-14T10:00:00.000Z';
  c.controls.find((x: any) => x.controlId === 'op.exp.3').parameters.find((p: any) => p.id === 'P-02').value = P02_ORGANIZATION;
  return c;
})();
const withAgents = (agents: unknown, stamp: string) => ({ ...copy(withoutKey), agents: copy(agents), updatedAt: stamp });
const WITH_024 = { '024': { name: 'wazuh-real', controls: { 'op.exp.3': { parameters: { 'P-02': P02_OF_024 } } } } };

const active = (configuration: any, updatedAt: string): FakeDoc => ({
  _id: 'active', _index: 'wazuh-ens-configuration',
  _source: { documentType: 'ACTIVE_CONFIGURATION', configuration, updatedAt },
});
const index = createFakeIndexer([
  ...docs,
  monitor('024', 'wazuh-real', ['ens']),
  monitor('028', 'zimbraHldap', ['ens']),
  active(withoutKey, withoutKey.updatedAt),
], { clock: () => clock.getTime(), user: { user_name: 'ana', roles: ['all_access'] } });
(index as any).bulk = async ({ body }: any) => {
  const lines = String(body).split('\n').filter(Boolean).map(l => JSON.parse(l));
  for (let i = 0; i < lines.length; i += 2) {
    const [op, meta] = Object.entries<any>(lines[i])[0];
    const doc: FakeDoc = { _id: meta._id, _index: meta._index, _source: lines[i + 1] };
    const j = index.docs.findIndex(d => d._id === meta._id && d._index === meta._index);
    if (op === 'index' && j >= 0) index.docs[j] = doc;
    else index.docs.push(doc);
  }
  return { body: { errors: false, items: [] } };
};
const clients2 = { asCurrentUser: index, asInternalUser: index };
const logger: any = { info() {}, warn() {}, debug() {}, error() {} };
const setActive = (configuration: any) => {
  const j = index.docs.findIndex(d => d._id === 'active');
  index.docs[j] = active(configuration, configuration.updatedAt);
};
const activeNow = () => index.docs.find(d => d._id === 'active')!._source.configuration;

const AGENTS = ['000', '024', '028'];
const reference = (configuration: any) => {
  ensConfigurationRepository.replaceActive(configuration);
  const all = index.docs
    .filter(d => d._index.startsWith('wazuh-alerts'))
    .sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || (a._source.id < b._source.id ? -1 : a._source.id > b._source.id ? 1 : 0));
  const inventory = inventoryFromMonitoring({ agentes: { buckets: ['024', '028'].map(id => ({ key: id, ultimo: { hits: { hits: [index.docs.find(d => d._id === `m${id}`)] } } })) } }, clock.getTime());
  const scope = resolveENSScopeAgents(normalizeInventory(inventory.agents), configuration.scope);
  const events = normalizeWazuhAlerts(all);
  const level = configuration.global.ensLevel;
  return {
    conjunto: getENSComplianceState(level, events, undefined, scope, clock),
    vistas: Object.fromEntries(AGENTS.map(a => [a, getENSComplianceState(level, events, a, scope, clock)])),
  };
};

type Toma = { conjunto: any; filas: Record<string, Record<string, any>>; vistas: Record<string, any[]> };
const rowsOf = (state: any) => Object.fromEntries(state.agents.map((a: any) =>
  [a.agentId, Object.fromEntries(a.results.map((r: any) => [r.control.id, withoutTrace(r)]))]));
const toma = async (service: ReturnType<typeof createEvaluationService>): Promise<Toma> => {
  const whole = (await service.run(clients2, { include: 'results', timeZone: 'UTC' })).state!;
  const views: Record<string, any[]> = {};
  for (const agent of AGENTS) {
    views[agent] = (await service.run(clients2, { include: 'results', agentId: agent, timeZone: 'UTC' })).state!.results.map(withoutTrace);
  }
  return { conjunto: whole, filas: rowsOf(whole), vistas: views };
};
const evaluate = async (configuration: any): Promise<Toma> => {
  setActive(configuration);
  return toma(createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 }));
};
const identical = (a: Toma, b: Toma) =>
  same(a.conjunto.results.map(withoutTrace), b.conjunto.results.map(withoutTrace)) &&
  same(a.conjunto.controlSummary, b.conjunto.controlSummary) &&
  same(a.filas, b.filas) &&
  same(a.vistas, b.vistas);
const ev04 = (r: any) => r?.evidences?.find((e: any) => e.id === 'EV-04')?.status;
const applied = (r: any) => r?.policyRuntime?.appliedParameters?.find((p: any) => p.id === 'P-02')?.value;

(async () => {
  console.log('1. Without per-system values, the same as without the key');
  const base = await evaluate(withoutKey);
  check('the test scope: 000, 024 and 028', same(Object.keys(base.filas).sort(), AGENTS), Object.keys(base.filas));
  check('without the key: same as the engine over all facts',
    same(base.conjunto.results.map(withoutTrace), reference(withoutKey).conjunto.results.map(withoutTrace)));
  check('without the key: 024 does not comply with EV-04 (unauthorized telnet)', ev04(base.filas['024']['op.exp.3']) === 'NO_CUMPLE', ev04(base.filas['024']['op.exp.3']));
  check('without the key: 028 complies with EV-04', ev04(base.filas['028']['op.exp.3']) === 'CUMPLE', ev04(base.filas['028']['op.exp.3']));
  const empty = await evaluate(withAgents({}, '2026-10-15T10:00:00.000Z'));
  check('`agents: {}`: identical to without the key (whole, rows and views)', identical(empty, base));
  const profiles = await evaluate(withAgents({ '024': { name: 'wazuh-real', aliases: ['wazuh-real.lab'], templates: [], controls: {} }, '028': { name: 'zimbraHldap', controls: {} } }, '2026-10-15T11:00:00.000Z'));
  check('profiles without values: identical to without the key (whole, rows and views)', identical(profiles, base));

  console.log('2. 024 with its own op.exp.3 P-02');
  const configuration024 = withAgents(WITH_024, '2026-10-15T12:00:00.000Z');
  const own = await evaluate(configuration024);
  check('024\'s row is evaluated with its value', same(applied(own.filas['024']['op.exp.3']), P02_OF_024), applied(own.filas['024']['op.exp.3']));
  check('028\'s, with the organization\'s', same(applied(own.filas['028']['op.exp.3']), P02_ORGANIZATION), applied(own.filas['028']['op.exp.3']));
  check('024 now complies with EV-04', ev04(own.filas['024']['op.exp.3']) === 'CUMPLE', ev04(own.filas['024']['op.exp.3']));
  const changed = AGENTS.flatMap(a => Object.keys({ ...base.filas[a], ...own.filas[a] })
    .filter(c => !same(base.filas[a][c], own.filas[a][c])).map(c => `${a}:${c}`));
  check('only 024\'s row in op.exp.3 changes', same(changed, ['024:op.exp.3']), changed);
  const consolidated = own.conjunto.results.filter((r: any, i: number) => !same(withoutTrace(r), withoutTrace(base.conjunto.results[i]))).map((r: any) => r.control.id);
  check('in the whole only op.exp.3\'s consolidation changes', consolidated.every((c: string) => c === 'op.exp.3'), consolidated);
  check('the views of 000 and 028, identical', same(own.vistas['000'], base.vistas['000']) && same(own.vistas['028'], base.vistas['028']));
  const vista024 = own.vistas['024'].filter((r: any, i: number) => !same(r, base.vistas['024'][i])).map((r: any) => r.control.id);
  check('in 024\'s view only op.exp.3 changes', same(vista024, ['op.exp.3']), vista024);
  const ref = reference(configuration024);
  check('the whole, same as the browser engine with that configuration',
    same(own.conjunto.results.map(withoutTrace), ref.conjunto.results.map(withoutTrace)) && same(own.filas, rowsOf(ref.conjunto)));
  check('each view, same as the browser engine', AGENTS.every(a => same(own.vistas[a], ref.vistas[a].results.map(withoutTrace))));

  console.log('2b. The manager row evaluates with the UNIONS');
  const withUnion = withAgents({ '024': { controls: { 'op.exp.7': { parameters: { 'P-07': ['wazuh-real | nóminas'] } } } } }, '2026-10-15T13:00:00.000Z');
  withUnion.controls.find((x: any) => x.controlId === 'op.exp.7').parameters.find((p: any) => p.id === 'P-07').value = ['srv-x | proveedores'];
  const union = await evaluate(withUnion);
  const p07 = (r: any) => r?.policyRuntime?.appliedParameters?.find((p: any) => p.id === 'P-07')?.value;
  check('manager: op.exp.7 P-07 = organization + 024\'s contribution', same(p07(union.filas['000']['op.exp.7']), ['srv-x | proveedores', 'wazuh-real | nóminas']), p07(union.filas['000']['op.exp.7']));
  const refUnion = reference(withUnion);
  check('same as the browser engine with that configuration', same(union.filas, rowsOf(refUnion.conjunto)) &&
    AGENTS.every(a => same(union.vistas[a], refUnion.vistas[a].results.map(withoutTrace))));

  console.log('3. A save changes the fingerprint');
  setActive(withoutKey);
  const service = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
  const antes = await toma(service);
  check('before saving: the without-the-key data', identical(antes, base));
  check('repeating recomputes nothing', (await service.run(clients2, { include: 'summary', timeZone: 'UTC' })).meta.stats.computed === 0);
  const h = createEvaluationHandlers({ logger, securityEnabled: true, service: service });
  const ctx = { core: { opensearch: { client: clients2 } } };
  const resp = { ok: (r: any) => r.body, customError: (r: any) => ({ error: r }) };
  const probe1: any = await h.probe(ctx, { query: { timeZone: 'UTC' } }, resp);
  const saved: any = await createConfigurationHandlers({ logger, securityEnabled: true })
    .save(ctx, { body: { configuration: { ...copy(activeNow()), agents: copy(WITH_024) }, changeReason: 'Valor propio de 024' } }, resp);
  check('the save answers with the configuration', saved?.statusCode === 200 && Boolean(saved?.data?.configuration?.agents?.['024']), saved);
  check('and changes the active document\'s date', activeNow().updatedAt !== withoutKey.updatedAt);
  const probe2: any = await h.probe(ctx, { query: { timeZone: 'UTC' } }, resp);
  check('the probe sees the change (another fingerprint)', Boolean(probe1?.data?.fingerprint) && probe2?.data?.fingerprint !== probe1.data.fingerprint);
  const after2 = await service.run(clients2, { include: 'summary', timeZone: 'UTC' });
  check('the next evaluation recomputes', after2.meta.stats.computed > 0, after2.meta.stats.computed);
  const after = await toma(service);
  const savedRef = reference(activeNow());
  check('and uses the saved document: 024 complies with EV-04', ev04(after.filas['024']['op.exp.3']) === 'CUMPLE');
  check('same as the engine with the saved document', same(after.filas, rowsOf(savedRef.conjunto)) &&
    same(after.conjunto.results.map(withoutTrace), savedRef.conjunto.results.map(withoutTrace)));

  failures.length ? console.log(`\n${failures.length} FAILURES`) : console.log('\nAll checks pass.');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
