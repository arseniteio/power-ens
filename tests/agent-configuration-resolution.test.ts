/** How a value is resolved: agent -> agent templates -> organization. */
import { readFileSync, readdirSync } from 'fs';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import {
  isUnionParameter,
  resolveControlConfigurationForAgent,
  resolveControlConfigurationWithOrigins,
} from '../common/ens/configuration/agents/configuration-resolver';
import type { ENSConfigurationVersion } from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import type { ENSAgentScope } from '../common/ens/core/scope/types';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

{
  const Module = require('module');
  const load = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (/kibana-services$/.test(request)) return {};
    return load.call(this, request, ...rest);
  };
}

const { getENSComplianceState, getENSComplianceResultByControl } =
  require('../common/ens/core/ens-engine') as typeof import('../common/ens/core/ens-engine');
const { getActiveControlConfiguration } =
  require('../common/ens/configuration/services/configuration-state-service') as typeof import('../common/ens/configuration/services/configuration-state-service');

const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`);
  if (!c) failures.push(n);
};

const CONFIG = `${__dirname}/../config`;
const blocks = readdirSync(CONFIG)
  .filter(f => f.endsWith('-control-block.json'))
  .map(f => JSON.parse(readFileSync(`${CONFIG}/${f}`, 'utf8')));
const withValues = (controlId: string, values: Record<string, unknown>) => {
  const b = JSON.parse(JSON.stringify(blocks.find(x => x.controlId === controlId)));
  b.parameters.forEach((p: any) => {
    if (p.id in values) p.value = values[p.id];
  });
  return b;
};

const base = (): ENSConfigurationVersion => ({
  ...defaultENSConfigurationTemplate,
  templates: undefined,
  controls: blocks.map(b => {
    if (b.controlId === 'op.acc.1') {
      return withValues('op.acc.1', {
        'P-01': 'Local',
        'P-04': ['admin', 'test'],
        'P-07': ['ana | srv-a | admin', 'luis | srv-b | admin'],
        'P-11': ['sudo'],
      });
    }
    if (b.controlId === 'op.exp.7') {
      return withValues('op.exp.7', { 'P-04': ['srv-x | R. Info | R. Serv'], 'P-07': ['srv-x | nóminas'] });
    }
    if (b.controlId === 'op.exp.8') {
      return withValues('op.exp.8', { 'P-02': ['srv-x | Ubuntu 24.04 | web'], 'P-12': 24 });
    }
    if (b.controlId === 'mp.info.6') {
      return withValues('mp.info.6', { 'P-01': 24, 'P-04': ['srv-a | ALTA'] });
    }
    return JSON.parse(JSON.stringify(b));
  }),
});

console.log('1. Levels');
{
  const doc = {
    ...base(),
    agents: {
      '101': {
        templates: ['linux-ubuntu'],
        controls: {
          'op.acc.1': { parameters: { 'P-07': ['ana | srv-a | admin'], 'P-04': ['solo-para-este'] } },
        },
      },
      '102': { templates: ['zimbra-ldap', 'linux-ubuntu'] },
      '104': { controls: { 'op.acc.1': { parameters: { 'P-07': ['eva | srv-d | admin'] } } } },
      '105': { templates: ['linux-ubuntu'], controls: { 'op.acc.1': { parameters: { 'P-11': ['wheel'] } } } },
    },
  } as ENSConfigurationVersion;

  const r = resolveControlConfigurationWithOrigins(doc, 'op.acc.1', '101')!;
  const v = (id: string) => r.configuration.parameters.find(p => p.id === id)?.value;
  check('agent value', JSON.stringify(v('P-07')) === '["ana | srv-a | admin"]' && r.origins['P-07'].source === 'agent', r.origins['P-07']);
  check('its template value', JSON.stringify(v('P-11')) === '["sudo","wheel","admin"]' && r.origins['P-11'].source === 'template' && r.origins['P-11'].templateId === 'linux-ubuntu', r.origins['P-11']);
  const r4 = resolveControlConfigurationWithOrigins(doc, 'op.acc.1', '104')!;
  check('organization value: the one in the organization reaches the row', JSON.stringify(r4.configuration.parameters.find(p => p.id === 'P-11')?.value) === '["sudo"]' && r4.origins['P-11'].source === 'organisation', r4.origins['P-11']);
  const r5 = resolveControlConfigurationWithOrigins(doc, 'op.acc.1', '105')!;
  check('own value and template on the same parameter: the own one wins', JSON.stringify(r5.configuration.parameters.find(p => p.id === 'P-11')?.value) === '["wheel"]' && r5.origins['P-11'].source === 'agent', r5.origins['P-11']);
  check('and the template still provides the rest', r5.origins['P-10'].source === 'template' && r5.configuration.parameters.find(p => p.id === 'P-10')?.value === 1000);
  check('an organization parameter does not come out of the agent', JSON.stringify(v('P-04')) === '["admin","test"]' && r.origins['P-04'].source === 'organisation');
  const r2 = resolveControlConfigurationWithOrigins(doc, 'op.acc.1', '102')!;
  check('templates in order: the first one that sets the parameter wins', r2.configuration.parameters.find(p => p.id === 'P-01')?.value === 'LDAP' && r2.origins['P-01'].templateId === 'zimbra-ldap');
  const r3 = resolveControlConfigurationWithOrigins(doc, 'op.acc.1', '103')!;
  check('an agent without a profile: the organization, the same object', r3.configuration === doc.controls.find(c => c.controlId === 'op.acc.1'));
  const d24 = { ...doc, agents: { '024': doc.agents!['101'] } } as ENSConfigurationVersion;
  check('the id is normalized: row «24» is agent 024', JSON.stringify(resolveControlConfigurationForAgent(d24, 'op.acc.1', '24')?.parameters.find(p => p.id === 'P-07')?.value) === '["ana | srv-a | admin"]');
  check('the original is not touched', JSON.stringify(doc.controls.find(c => c.controlId === 'op.acc.1')!.parameters.find(p => p.id === 'P-07')!.value) === '["ana | srv-a | admin","luis | srv-b | admin"]');
  check('control not seeded: undefined', resolveControlConfigurationWithOrigins({ ...doc, controls: [] }, 'op.acc.1', '101') === undefined);
}

console.log('2. Union');
{
  const doc = {
    ...base(),
    agents: {
      '101': { controls: { 'op.exp.7': { parameters: { 'P-04': ['srv-a | A. Info | A. Serv'], 'P-07': ['srv-a | clientes', 'srv-x | nóminas'] } }, 'op.exp.8': { parameters: { 'P-02': ['srv-a | Ubuntu 22.04 | directorio'] } }, 'mp.info.6': { parameters: { 'P-04': ['srv-a | ALTA', 'srv-c | MEDIA'] } } } },
      '102': { controls: { 'op.exp.7': { parameters: { 'P-04': ['srv-b | B. Info | B. Serv'] } } } },
      '000': { controls: { 'op.exp.8': { parameters: { 'P-02': ['mgr | Ubuntu 22.04 | SIEM'] } } } },
    },
  } as ENSConfigurationVersion;

  check('op.exp.7 P-04, op.exp.7 P-07, op.cont.3 P-07, op.mon.1 P-01: union on the manager',
    ['op.exp.7|P-04', 'op.exp.7|P-07', 'op.cont.3|P-07', 'op.mon.1|P-01'].every(k => isUnionParameter(k.split('|')[0], k.split('|')[1], '000')));
  check('op.exp.8 P-02: union on the manager row, inheritance on an agent\'s', isUnionParameter('op.exp.8', 'P-02', '000') && !isUnionParameter('op.exp.8', 'P-02', '101'));
  check('mp.info.6 P-04 (declared scope): union on any row', isUnionParameter('mp.info.6', 'P-04', '101') && isUnionParameter('mp.info.6', 'P-04'));
  check('an organization parameter never', !isUnionParameter('op.exp.7', 'P-01', '000'));

  const m = resolveControlConfigurationWithOrigins(doc, 'op.exp.7', '000')!;
  const p04 = m.configuration.parameters.find(p => p.id === 'P-04')!.value;
  check('manager row: organization + each agent', JSON.stringify(p04) === JSON.stringify(['srv-x | R. Info | R. Serv', 'srv-a | A. Info | A. Serv', 'srv-b | B. Info | B. Serv']), p04);
  check('with who contributes', JSON.stringify(m.origins['P-04']) === JSON.stringify({ source: 'union', contributors: ['101', '102'] }), m.origins['P-04']);
  const p07 = m.configuration.parameters.find(p => p.id === 'P-07')!.value;
  check('without repeating rows', JSON.stringify(p07) === JSON.stringify(['srv-x | nóminas', 'srv-a | clientes']), p07);
  const withoutRow = resolveControlConfigurationForAgent(doc, 'op.exp.7');
  check('the organization view makes the same union', JSON.stringify(withoutRow?.parameters.find(p => p.id === 'P-04')?.value) === JSON.stringify(p04));
  const e8m = resolveControlConfigurationForAgent(doc, 'op.exp.8', '000')!.parameters.find(p => p.id === 'P-02')!.value;
  check('op.exp.8 P-02 on the manager: all servers, its own too', JSON.stringify(e8m) === JSON.stringify(['srv-x | Ubuntu 24.04 | web', 'mgr | Ubuntu 22.04 | SIEM', 'srv-a | Ubuntu 22.04 | directorio']), e8m);
  const e8a = resolveControlConfigurationForAgent(doc, 'op.exp.8', '101')!.parameters.find(p => p.id === 'P-02')!.value;
  check('op.exp.8 P-02 on the agent row: its own', JSON.stringify(e8a) === JSON.stringify(['srv-a | Ubuntu 22.04 | directorio']), e8a);
  const mp = resolveControlConfigurationForAgent(doc, 'mp.info.6', '102')!.parameters.find(p => p.id === 'P-04')!.value;
  check('mp.info.6 P-04: the declared scope gathers all', JSON.stringify(mp) === JSON.stringify(['srv-a | ALTA', 'srv-c | MEDIA']), mp);
  const empty = { ...base(), agents: { '101': {} } } as ENSConfigurationVersion;
  const tabla = resolveControlConfigurationWithOrigins(empty, 'op.exp.7', '000')!;
  check('no contributions: the same object', tabla.configuration === empty.controls.find(c => c.controlId === 'op.exp.7') && tabla.origins['P-04'].source === 'organisation');
}

console.log('3. Parity');
{
  const doc = base();
  const rows = [undefined, '000', '101', '102'];
  const distinct: string[] = [];
  const variants: [string, ENSConfigurationVersion][] = [
    ['sin agents', doc],
    ['agents vacío', { ...doc, agents: {} }],
    ['perfiles sin valores ni plantillas', { ...doc, agents: { '101': { name: 'srv-a', detectedType: 'linux', detectedBy: 'os.platform = ubuntu', aliases: ['srv-a.example.com'] }, '000': { typeOverride: 'manager' } } }],
  ];
  variants.forEach(([name, d]) => {
    d.controls.forEach(c => {
      rows.forEach(f => {
        if (resolveControlConfigurationForAgent(d, c.controlId, f) !== c) distinct.push(`${name}: ${c.controlId} ${f}`);
      });
    });
  });
  check('23 controls x 4 rows x 3 variants: the engine receives the SAME object as today', distinct.length === 0, distinct.slice(0, 5));

  const NOW = new Date('2026-10-17T10:00:00Z');
  const agents: ENSAgentScope[] = [
    { id: '000', name: 'mgr', groups: [], isManager: true },
    { id: '101', name: 'srv-a', groups: ['ens'] },
    { id: '102', name: 'srv-b', groups: ['ens'] },
  ];
  const ev = (agentId: string, agentName: string, controlId: string, eventType: string, status: string, extra: any = {}): ENSNormalizedEvent => ({
    id: `${agentId}-${controlId}-${eventType}`, agentId, agentName, controlId, eventType, sourceType: 'WAZUH_ALERT', status,
    timestamp: new Date(NOW.getTime() - 3600_000).toISOString(), tool: 'Power ENS', ruleId: '0', ...extra,
  } as any);
  const facts = [
    ev('101', 'srv-a', 'mp.info.6', 'backup_ok', 'CUMPLE'),
    ev('102', 'srv-b', 'mp.info.6', 'backup_ok', 'CUMPLE'),
    ev('101', 'srv-a', 'op.acc.1', 'identity_inventory', 'CUMPLE'),
    ev('000', 'mgr', 'op.exp.7', 'incident_register_read', 'CUMPLE'),
  ];
  const withoutInstant = (v: unknown) => JSON.stringify(v, (k, x) => (k === 'evaluatedAt' ? undefined : x));
  const results = variants.map(([, d]) => {
    ensConfigurationRepository.replaceActive(d);
    return withoutInstant(getENSComplianceState('MEDIO', facts, undefined, agents, NOW));
  });
  check('getENSComplianceState identical with and without agents', results[0] === results[1] && results[0] === results[2]);
  const byRow = variants.map(([, d]) => {
    ensConfigurationRepository.replaceActive(d);
    return withoutInstant(['mp.info.6', 'op.acc.1', 'op.exp.7', 'op.exp.8'].map(c => getENSComplianceResultByControl(c, 'MEDIO', facts, '101', agents, NOW)));
  });
  check('and the per-control result in a machine\'s view', byRow[0] === byRow[1] && byRow[0] === byRow[2]);
}

console.log('4. The engine uses the row\'s value');
{
  const doc = {
    ...base(),
    agents: {
      '101': { controls: { 'op.acc.1': { parameters: { 'P-07': ['ana | srv-a | admin'] } } } },
      '102': { templates: ['zimbra-ldap'] },
    },
  } as ENSConfigurationVersion;
  ensConfigurationRepository.replaceActive(doc);
  check('getActiveControlConfiguration(control, agent) resolves', JSON.stringify(getActiveControlConfiguration('op.acc.1', '101')?.parameters.find(p => p.id === 'P-07')?.value) === '["ana | srv-a | admin"]');
  check('and without an agent, the organization', getActiveControlConfiguration('op.acc.1') === doc.controls.find(c => c.controlId === 'op.acc.1'));
  const agents: ENSAgentScope[] = [{ id: '101', name: 'srv-a', groups: ['ens'] }, { id: '102', name: 'srv-b', groups: ['ens'] }];
  const applied = (agentId: string, id: string) =>
    getENSComplianceResultByControl('op.acc.1', 'MEDIO', [], agentId, agents, new Date('2026-10-17T10:00:00Z'))
      ?.policyRuntime?.appliedParameters.find(p => p.id === id)?.value;
  check('row 101: the agent\'s P-07', JSON.stringify(applied('101', 'P-07')) === '["ana | srv-a | admin"]', applied('101', 'P-07'));
  check('row 102: the organization\'s P-07', JSON.stringify(applied('102', 'P-07')) === '["ana | srv-a | admin","luis | srv-b | admin"]', applied('102', 'P-07'));
  check('row 102: P-01 from its LDAP template', applied('102', 'P-01') === 'LDAP', applied('102', 'P-01'));
  check('row 101: P-01 from the organization', applied('101', 'P-01') === 'Local', applied('101', 'P-01'));
}

const GF = (process as any).env?.POWER_ENS_GOLDEN_FACTS;
const GD = (process as any).env?.POWER_ENS_GOLDEN_DOC;
const GI = (process as any).env?.POWER_ENS_GOLDEN_INVENTORY;
if (GF && GD && GI) {
  console.log('5. Real facts');
  const { readFileSync: leer } = require('fs');
  const { normalizeWazuhAlert } = require('../common/ens/core/data-source/data-source-engine');
  const { inventoryFromMonitoring } = require('../common/agents/agent-inventory');
  const { resolveENSScopeAgents } = require('../common/ens/core/scope/runtime');
  const actual = JSON.parse(leer(GD, 'utf8'));
  const config = actual._source ? actual._source.configuration : actual.configuration || actual;
  const instant = new Date((process as any).env?.POWER_ENS_GOLDEN_AT || Date.now());
  const inv = inventoryFromMonitoring(JSON.parse(leer(GI, 'utf8')).aggregations, instant.getTime()).agents;
  const scope = resolveENSScopeAgents(inv, config.scope);
  const facts = String(leer(GF, 'utf8')).split('\n').filter(Boolean).map((l: string) => normalizeWazuhAlert(JSON.parse(l)));
  const estado = (d: any) => {
    ensConfigurationRepository.replaceActive(d);
    return JSON.stringify(getENSComplianceState(d.global.ensLevel, facts, undefined, scope, instant), (k, x) => (k === 'evaluatedAt' ? undefined : x));
  };
  const withoutIt = estado(config);
  const withProfiles = estado({ ...config, agents: Object.fromEntries(scope.map((a: any) => [a.id, { name: a.name, detectedType: 'linux', aliases: ['x.example.com'] }])) });
  console.log(`    ${facts.length} facts, ${scope.length} rows, state of ${withoutIt.length} bytes`);
  check('real facts: the whole state is identical without agents and with profiles without values', withoutIt === withProfiles);
}

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
