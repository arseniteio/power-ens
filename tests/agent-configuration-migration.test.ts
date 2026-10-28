/** Migration to systems without data loss. */
import { readFileSync, readdirSync } from 'fs';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import {
  describeMigrationWarning,
  planMigrationToSystems,
  summarizeMigrationPlan,
} from '../common/ens/configuration/agents/migration';
import { resolveControlConfigurationForAgent, rowKey } from '../common/ens/configuration/agents/configuration-resolver';
import { ENS_SYSTEM_KEY_COLUMNS } from '../common/ens/configuration/agents/parameter-classes';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import { validateAgentsConfiguration } from '../common/ens/configuration/agents/agent-configuration-validator';
import { toParameterTableRows } from '../common/ens/configuration/services/parameter-value-validator';
import { inventoryFromMonitoring } from '../common/agents/agent-inventory';
import type { ENSConfigurationVersion } from '../common/ens/configuration/types';
import type { ENSAgentScope } from '../common/ens/core/scope/types';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
declare const __dirname: string;
declare const require: (id: string) => any;

{
  const Module = require('module');
  const load = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (/kibana-services$/.test(request)) return {};
    return load.call(this, request, ...rest);
  };
}
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
  b.parameters.forEach((p: any) => { if (p.id in values) p.value = values[p.id]; });
  return b;
};

const doc: ENSConfigurationVersion = {
  ...defaultENSConfigurationTemplate,
  controls: [
    withValues('op.acc.1', {
      'P-01': 'Local',
      'P-07': ['Ana | web01 | Administrador', 'ana | web01 | Administrador', 'svc | dir01.example.com | Cuenta de servicio', 'root | DIR01.example.com | Cuenta de sistema', 'eva | srv-sin-agente | Administradora'],
    }),
    withValues('op.exp.1', { 'P-06': ['dir01 | alta | directorio'] }),
    withValues('op.exp.4', { 'P-04': ['* | * 06:00-08:00'], 'P-09': ['web01 | 1.0 | anual', 'dir01 | 2.0 | anual'] }),
    withValues('op.exp.7', { 'P-07': ['dirHost | directorio de usuarios'] }),
    withValues('op.exp.8', { 'P-02': ['web01 | Ubuntu 24.04 | servidor', 'mgr-01 | Ubuntu 22.04 | SIEM', 'dirHost | Ubuntu 22.04 | directorio'] }),
    withValues('op.exp.2', { 'P-04': ['ninguno | ninguna | Sin excepciones autorizadas |  | '] }),
    withValues('mp.info.6', { 'P-04': ['web01 | MEDIA'] }),
  ],
};
const inventory: ENSAgentScope[] = [
  { id: '000', name: 'mgr-01', groups: [] },
  { id: '101', name: 'web01', groups: ['ens'], os: { platform: 'ubuntu', uname: 'Linux |web01 |6.8 |x86_64' } },
  { id: '102', name: 'dirHost', groups: ['ens'], os: { platform: 'ubuntu', uname: 'Linux |dir01.example.com |6.8 |x86_64' } },
  { id: '103', name: 'win01', groups: ['ens'], os: { platform: 'windows' } },
];

const original = JSON.stringify(doc);
const plan = planMigrationToSystems(doc, inventory, { scopeAgentIds: ['000', '101', '102', '103'] });
const m = plan.configuration;
const value = (d: ENSConfigurationVersion, c: string, p: string) => d.controls.find(x => x.controlId === c)?.parameters.find(x => x.id === p)?.value;
const own = (d: ENSConfigurationVersion, a: string, c: string, p: string) => d.agents?.[a]?.controls?.[c]?.parameters?.[p];

console.log('1. Distribution');
{
  check('there are changes', plan.changed);
  check('the same machine by its hostname, upper or lower case: to agent 102', JSON.stringify(own(m, '102', 'op.acc.1', 'P-07')) === JSON.stringify(['svc | dir01.example.com | Cuenta de servicio', 'root | DIR01.example.com | Cuenta de sistema']), own(m, '102', 'op.acc.1', 'P-07'));
  check('by its short hostname', JSON.stringify(own(m, '102', 'op.exp.1', 'P-06')) === JSON.stringify(['dir01 | alta | directorio']));
  check('by its agent name', JSON.stringify(own(m, '102', 'op.exp.7', 'P-07')) === JSON.stringify(['dirHost | directorio de usuarios']));
  check('the manager by its name', JSON.stringify(own(m, '000', 'op.exp.8', 'P-02')) === JSON.stringify(['mgr-01 | Ubuntu 22.04 | SIEM']));
  check('what does not match stays in the organization', JSON.stringify(value(m, 'op.acc.1', 'P-07')) === JSON.stringify(['eva | srv-sin-agente | Administradora']));
  check('and a warning is raised', plan.warnings.some(w => w.key === 'srv-sin-agente' && w.reason === 'sin-agente'), plan.warnings);
  check('el aviso se lee', /srv-sin-agente.*no es ningún agente conocido; se queda en el valor común/.test(describeMigrationWarning(plan.warnings[0])), describeMigrationWarning(plan.warnings[0]));
  check('a table with no own rows is not touched (op.exp.2 P-04)', JSON.stringify(value(m, 'op.exp.2', 'P-04')) === JSON.stringify(value(doc, 'op.exp.2', 'P-04')));
  check('the * row stays in the organization...', JSON.stringify(value(m, 'op.exp.4', 'P-04')) === JSON.stringify(['* | * 06:00-08:00']));
  check('... and scope lists are not touched (mp.info.6 P-04)', JSON.stringify(value(m, 'mp.info.6', 'P-04')) === JSON.stringify(['web01 | MEDIA']));
  check('no rows in the organization: the value key disappears (never null)', !('value' in m.controls.find(x => x.controlId === 'op.exp.1')!.parameters.find(x => x.id === 'P-06')!));
  check('the new profile stores the name and the hostname as aliases', m.agents?.['102']?.name === 'dirHost' && JSON.stringify(m.agents?.['102']?.aliases) === '["dir01.example.com"]', m.agents?.['102']);
  check('an agent with no rows has no profile', !m.agents?.['103']);
  check('summary: how many leave and how many are copied', /a 3 agente/.test(summarizeMigrationPlan(plan)) && /se copian/.test(summarizeMigrationPlan(plan)), summarizeMigrationPlan(plan));
  check('case matters: Ana and ana are two rows and both move to 101', JSON.stringify(own(m, '101', 'op.acc.1', 'P-07')) === JSON.stringify(['Ana | web01 | Administrador', 'ana | web01 | Administrador']), own(m, '101', 'op.acc.1', 'P-07'));
  const mode = (c: string, p: string) => Array.from(new Set(plan.moves.filter(x => x.controlId === c && x.parameterId === p).map(x => x.mode))).join();
  check('op.acc.1 P-07 leaves the organization: the machine with no own rows still has a value', mode('op.acc.1', 'P-07') === 'movida');
  check('op.exp.8 P-02 (mandatory) is COPIED: removing it would leave 103 without a value', mode('op.exp.8', 'P-02') === 'copiada' && JSON.stringify(value(m, 'op.exp.8', 'P-02')) === JSON.stringify(value(doc, 'op.exp.8', 'P-02')), plan.moves.filter(x => x.controlId === 'op.exp.8'));
  check('op.exp.1 P-06 (optional) leaves the organization', mode('op.exp.1', 'P-06') === 'movida');
  check('no machine in scope is left without a mandatory value it had', plan.incomplete.length === 0, plan.incomplete);
}

console.log('2. No loss');
{
  const lost: string[] = [];
  doc.controls.forEach(c => {
    Object.keys(ENS_SYSTEM_KEY_COLUMNS[c.controlId] || {}).forEach(pid => {
      const antes = toParameterTableRows(value(doc, c.controlId, pid) as any).filter(r => r.trim()).map(rowKey).sort();
      const after = [
        ...toParameterTableRows(value(m, c.controlId, pid) as any),
        ...Object.keys(m.agents || {}).flatMap(a => toParameterTableRows(own(m, a, c.controlId, pid) as any)),
      ].filter(r => r.trim()).map(rowKey);
      const withoutRepeating = Array.from(new Set(after)).sort();
      if (JSON.stringify(antes) !== JSON.stringify(withoutRepeating)) lost.push(`${c.controlId} ${pid}`);
    });
  });
  check('organization + agents = what there was, parameter by parameter', lost.length === 0, lost);
}

console.log('3. Idempotent and valid');
{
  check('the original is not touched', JSON.stringify(doc) === original);
  const other = planMigrationToSystems(m, inventory, { scopeAgentIds: ['000', '101', '102', '103'] });
  check('a second pass changes nothing', !other.changed && other.configuration === m);
  check('and it still warns about the same', other.warnings.length === plan.warnings.length);
  check('the migrated document is valid', validateENSConfigurationStructure(m).valid, validateENSConfigurationStructure(m).errors);
  check('and its per-agent values too', validateAgentsConfiguration(m).length === 0, validateAgentsConfiguration(m));
  const nothing = planMigrationToSystems({ ...defaultENSConfigurationTemplate, controls: [withValues('op.acc.1', { 'P-07': ['x | nadie | y'] })] }, inventory);
  check('nothing to move: the same document', !nothing.changed && nothing.warnings.length === 1);
  const empty = planMigrationToSystems(doc, inventory, { scopeAgentIds: [] });
  check('empty scope: nothing to migrate', empty.emptyScope === true && !empty.changed && empty.moves.length === 0 && empty.configuration === doc);
  check('no scope or inventory: neither', planMigrationToSystems(doc, []).emptyScope === true);
  const plus = JSON.parse(JSON.stringify(m));
  plus.controls.find((c: any) => c.controlId === 'op.exp.4').parameters.find((p: any) => p.id === 'P-09').value = ['dir01 | 2.1 | trimestral', '* | - | anual'];
  const third = planMigrationToSystems(plus, inventory);
  check('a new row is added to what the agent already had (with the *)', JSON.stringify(own(third.configuration, '102', 'op.exp.4', 'P-09')) === JSON.stringify(['dir01 | 2.0 | anual', 'dir01 | 2.1 | trimestral', '* | - | anual']), own(third.configuration, '102', 'op.exp.4', 'P-09'));
}

console.log('4. What each row sees');
{
  const rows = (d: ENSConfigurationVersion, c: string, p: string, a?: string) =>
    toParameterTableRows(resolveControlConfigurationForAgent(d, c, a)?.parameters.find(x => x.id === p)?.value as any).filter(r => r.trim()).map(rowKey).sort();
  check('row 102: its op.acc.1 P-07 accounts, as is', JSON.stringify(rows(m, 'op.acc.1', 'P-07', '102')) === JSON.stringify(['root|DIR01.example.com|Cuenta de sistema', 'svc|dir01.example.com|Cuenta de servicio']), rows(m, 'op.acc.1', 'P-07', '102'));
  check('row 103 (no profile): what stays in the organization', JSON.stringify(rows(m, 'op.acc.1', 'P-07', '103')) === JSON.stringify(['eva|srv-sin-agente|Administradora']));
  check('row 103, op.exp.8 P-02 copied: still sees today\'s table', JSON.stringify(rows(m, 'op.exp.8', 'P-02', '103')) === JSON.stringify(rows(doc, 'op.exp.8', 'P-02', '103')));
  check('manager row, op.exp.8 P-02: all servers, as before', JSON.stringify(rows(m, 'op.exp.8', 'P-02', '000')) === JSON.stringify(rows(doc, 'op.exp.8', 'P-02', '000')));
  check('manager row, op.exp.7 P-07: as before', JSON.stringify(rows(m, 'op.exp.7', 'P-07', '000')) === JSON.stringify(rows(doc, 'op.exp.7', 'P-07', '000')));
  check('row 101, op.exp.4 P-09: its own', JSON.stringify(rows(m, 'op.exp.4', 'P-09', '101')) === JSON.stringify(['web01|1.0|anual']));
  const rowsAll = (d: ENSConfigurationVersion) => [
    ...toParameterTableRows(value(d, 'op.acc.1', 'P-07') as any),
    ...Object.keys(d.agents || {}).flatMap(a => toParameterTableRows(own(d, a, 'op.acc.1', 'P-07') as any)),
  ];
  check('no loss, exact row: «Ana» and «ana» remain in the document', rowsAll(m).includes('Ana | web01 | Administrador') && rowsAll(m).includes('ana | web01 | Administrador'));
}

const LAB = process.env.POWER_ENS_LAB_DOC;
const MON = process.env.POWER_ENS_LAB_MONITORING;
if (LAB && MON) {
  console.log('5. Real copy');
  const actual = JSON.parse(readFileSync(LAB, 'utf8'));
  const config: ENSConfigurationVersion = actual._source ? actual._source.configuration : actual.configuration || actual;
  const mon = JSON.parse(readFileSync(MON, 'utf8'));
  const buckets = (mon.aggregations?.agentes || mon.aggregations?.a)?.buckets || [];
  const inv = inventoryFromMonitoring({ agentes: { buckets: buckets.map((b: any) => ({ key: b.key, ultimo: b.ultimo || b.u })) } }).agents;
  const { resolveENSScopeAgents } = require('../common/ens/core/scope/runtime');
  const scope: string[] = resolveENSScopeAgents(inv, config.scope).map((a: any) => a.id);
  const p = planMigrationToSystems(config, inv, { scopeAgentIds: scope });
  console.log(`    ${summarizeMigrationPlan(p)}`);
  p.warnings.forEach(w => console.log(`    aviso: ${describeMigrationWarning(w)}`));
  check('real: valid', validateENSConfigurationStructure(p.configuration).valid && validateAgentsConfiguration(p.configuration).length === 0);
  check('real: idempotent', !planMigrationToSystems(p.configuration, inv, { scopeAgentIds: scope }).changed);
  check('real: no mandatory parameter is left without a value in scope', p.incomplete.length === 0, p.incomplete);
  const { getENSComplianceResultByControl } = require('../common/ens/core/ens-engine');
  const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
  const scopeAgents = resolveENSScopeAgents(inv, config.scope);
  const ncCfg = (d: ENSConfigurationVersion) => {
    ensConfigurationRepository.replaceActive(d);
    const output: string[] = [];
    scope.forEach(a => d.controls.forEach(c => {
      const r = getENSComplianceResultByControl(c.controlId, d.global.ensLevel, [], a, scopeAgents, new Date('2026-10-17T10:00:00Z'));
      (r?.nonConformities || []).filter((n: any) => n.id === 'NC-CFG').forEach((n: any) => output.push(`${a} ${c.controlId} ${n.finding}`));
    }));
    return output;
  };
  const antes = new Set(ncCfg(config));
  const added = ncCfg(p.configuration).filter(x => !antes.has(x));
  console.log(`    NC-CFG without facts: ${antes.size} before; new afterwards: ${added.length}`);
  check('real: the engine yields no new NC-CFG on any machine in scope', added.length === 0, added.slice(0, 5));
  const lost: string[] = [];
  config.controls.forEach(c => {
    Object.keys(ENS_SYSTEM_KEY_COLUMNS[c.controlId] || {}).forEach(pid => {
      const antes = toParameterTableRows(value(config, c.controlId, pid) as any).filter(r => r.trim()).map(rowKey).sort();
      const after = Array.from(new Set([
        ...toParameterTableRows(value(p.configuration, c.controlId, pid) as any),
        ...Object.keys(p.configuration.agents || {}).flatMap(a => toParameterTableRows(own(p.configuration, a, c.controlId, pid) as any)),
      ].filter(r => r.trim()).map(rowKey))).sort();
      if (JSON.stringify(antes) !== JSON.stringify(after)) lost.push(`${c.controlId} ${pid}`);
    });
  });
  check('real: no row is lost', lost.length === 0, lost);
}

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
