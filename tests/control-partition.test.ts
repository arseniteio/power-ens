/** The server evaluates control by control and must match the engine run over all facts at once. */
import * as fs from 'fs';
import * as path from 'path';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { ENSCatalog } from '../common/ens/catalog';
import {
  getENSComplianceResultByControl,
  getENSComplianceState,
} from '../common/ens/core/ens-engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import {
  assembleENSComplianceState,
  buildENSPresenceEvents,
  evaluateENSControlPartition,
} from '../common/ens/core/control-partition';
import type { ENSAgentScope } from '../common/ens/core/scope/types';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`); if (!c) failures.push(n); };

const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'evaluatedAt').map(k => [k, canon(v[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

ensConfigurationRepository.replaceActive(defaultENSConfigurationTemplate as any);
const level = (defaultENSConfigurationTemplate as any).global.ensLevel;
const NOW = new Date('2026-10-17T12:00:00Z');
const scope: ENSAgentScope[] = [
  { id: '000', name: 'manager', groups: [] },
  { id: '024', name: 'wazuh-real', groups: ['ens'] },
  { id: '028', name: 'zimbraHldap', groups: ['ens'] },
];
const hora = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000).toISOString();
let n = 0;
const fact = (agent: string, name: string, data: Record<string, unknown>, hours: number) => ({
  _id: `h${++n}`,
  _source: { '@timestamp': hora(hours), timestamp: hora(hours), agent: { id: agent, name: name }, rule: { id: '100', groups: ['ENS'] }, data },
});

const hits: any[] = [];
for (const line of fs.readFileSync(path.join(__dirname, 'fixtures/mp-info-6-pbs-pass.ndjson'), 'utf8').split('\n').filter(Boolean)) {
  const data = JSON.parse(line);
  hits.push(fact('024', 'wazuh-real', data, 3));
}
for (const h of [30, 20, 10, 2]) {
  hits.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03' }, h));
  hits.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-02', servicio: h > 10 ? 'telnet' : 'sshd', estado: 'CUMPLE' }, h - 0.01));
}
for (const [agent, name] of [['024', 'wazuh-real'], ['028', 'zimbraHldap']]) {
  hits.push(fact(agent, name, { ensfacil: 'op.acc.3', event: 'collector_run' }, 1));
  hits.push(fact(agent, name, { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'ana', funcion: 'operacion' }, 5));
}
hits.push(fact('000', 'manager', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
hits.push(fact('000', 'manager', { ensfacil: 'op.mon.3', event: 'log_source_observed', fuente: '/var/log/syslog' }, 1));
hits.push(fact('024', 'wazuh-real', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
hits.push(fact('000', 'manager', { ensfacil: 'op.exp.7', event: 'collector_run' }, 2));
hits.push(fact('000', 'manager', { ensfacil: 'op.exp.8', event: 'collector_run' }, 2));
hits.push(fact('024', 'wazuh-real', { ensfacil: 'op.exp.8', event: 'audit_log_status', evidence_id: 'EV-01', estado: 'CUMPLE' }, 2));

hits.sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || a._id.localeCompare(b._id));
const all = normalizeWazuhAlerts(hits);
const controls = ENSCatalog.map(c => c.id);
const ofControl = (c: string) => normalizeWazuhAlerts(hits.filter(h => h._source.data.ensfacil === c));

const primero = new Map<string, any>();
for (const h of hits) primero.set(h._source.agent.id, h);
const presence = buildENSPresenceEvents([...primero.values()].map(h => ({ agentId: h._source.agent.id, agentName: h._source.agent.name, earliest: h._source['@timestamp'] })));

for (const vista of [undefined, '000', '024', '028']) {
  const label = vista || 'conjunto';
  const reference = getENSComplianceState(level, all, vista, scope, NOW);
  const partitions = controls.map(c => evaluateENSControlPartition(c, level, [...ofControl(c), ...presence], vista, scope, NOW));
  const armado = assembleENSComplianceState(partitions, vista, scope, []);
  check(`${label}: the state built control by control is the engine's over everything`, same(armado, reference),
    reference.results.filter((r, i) => !same(r, armado.results[i])).map(r => r.control.id));
  check(`${label}: same machines and same rows`, same(armado.agents, reference.agents));
  const distinct = controls.filter(c => !same(
    partitions.find(p => p.controlId === c)!.result,
    getENSComplianceResultByControl(c, level, all, vista, scope, NOW)
  ));
  check(`${label}: each control, same as the sheet over all facts`, distinct.length === 0, distinct);
}

const withoutPresence = evaluateENSControlPartition('op.mon.3', level, ofControl('op.mon.3'), '028', scope, NOW).result;
const withEverything = getENSComplianceResultByControl('op.mon.3', level, all, '028', scope, NOW);
check('without presence op.mon.3 on 028 changes (that is why it exists)', !same(withoutPresence, withEverything));

const ref024 = getENSComplianceState(level, all, '024', scope, NOW);
check('presence does not enter traceability (nor any result)', JSON.stringify(ref024).length > 0 &&
  !JSON.stringify(assembleENSComplianceState(controls.map(c => evaluateENSControlPartition(c, level, [...ofControl(c), ...presence], '024', scope, NOW)), '024', scope)).includes('agent_presence'));

failures.length ? console.log(`\n${failures.length} FAILURES`) : console.log('\nAll checks pass.');
process.exit(failures.length ? 1 : 0);
