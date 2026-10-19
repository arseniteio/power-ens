/**
 * The value that applies to an agent (1.3.0): override -> assigned template -> built-in of its type -> common value;
 * unions on the manager row; parity of 1.2.0 documents against the frozen 1.2.0 resolver.
 *
 *   npx --yes tsx tests/control-templates-resolution.test.ts
 *   ENSFACIL_LAB_DOC=active.json npx --yes tsx tests/control-templates-resolution.test.ts   (adds the lab copy)
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import {
  getAgentLevelValue,
  getEffectiveTemplate,
  getInheritedValue,
  resolveControlConfigurationForAgent,
  resolveControlConfigurationWithOrigins,
} from '../common/ens/configuration/agents/configuration-resolver';
import { planTemplateMigration } from '../common/ens/configuration/agents/template-migration';
import { ENS_NO_TEMPLATE } from '../common/agent-configuration';
import type { ENSConfigurationVersion } from '../common/ens/configuration/types';
import * as legacy from './fixtures/resolver-1.2.0/configuration-resolver';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
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
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { getActiveControlConfiguration } = require('../common/ens/configuration/services/configuration-state-service');

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
  if (!ok) failures.push(name);
};

const CONFIG = `${__dirname}/../config`;
const blocks = readdirSync(CONFIG)
  .filter(file => file.endsWith('-control-block.json'))
  .map(file => JSON.parse(readFileSync(`${CONFIG}/${file}`, 'utf8')));
const withValues = (controlId: string, values: Record<string, unknown>) => {
  const block = JSON.parse(JSON.stringify(blocks.find(item => item.controlId === controlId)));
  block.parameters.forEach((parameter: any) => { if (parameter.id in values) parameter.value = values[parameter.id]; });
  return block;
};
const base = (): ENSConfigurationVersion => ({
  ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)),
  templates: [],
  controls: blocks.map(block => {
    if (block.controlId === 'op.acc.1') return withValues('op.acc.1', { 'P-01': 'Local', 'P-04': ['admin'], 'P-07': ['ana | srv-a | admin'], 'P-10': 2000, 'P-11': ['sudo'] });
    if (block.controlId === 'op.exp.7') return withValues('op.exp.7', { 'P-04': ['srv-x | R. Info | R. Serv'] });
    if (block.controlId === 'mp.info.6') return withValues('mp.info.6', { 'P-04': ['srv-a | ALTA'], 'P-10': 'rsync' });
    return JSON.parse(JSON.stringify(block));
  }),
});
const value = (doc: any, controlId: string, agentId: string | undefined, parameterId: string) =>
  resolveControlConfigurationWithOrigins(doc, controlId, agentId)!.configuration.parameters.find(item => item.id === parameterId)?.value;
const origin = (doc: any, controlId: string, agentId: string | undefined, parameterId: string) =>
  resolveControlConfigurationWithOrigins(doc, controlId, agentId)!.origins[parameterId];

console.log('1. Levels');
{
  const doc: any = {
    ...base(),
    templates: [
      { id: 'custom-web', controlId: 'op.acc.1', name: 'Web', values: { 'P-10': 500 } },
      { id: 'custom-pbs', controlId: 'mp.info.6', name: 'PBS local', values: { 'P-10': 'pbs', 'P-04': ['srv-t | BAJA'] } },
    ],
    agents: {
      '101': { detectedType: 'linux', controls: { 'op.acc.1': { parameters: { 'P-11': ['wheel'], 'P-04': ['ignored'] } } } },
      '102': { detectedType: 'linux', controls: { 'op.acc.1': { templateId: 'custom-web' } } },
      '103': { detectedType: 'linux', controls: { 'op.acc.1': { templateId: ENS_NO_TEMPLATE } } },
      '104': { name: 'no type' },
      '105': { typeOverride: 'zimbra-ldap', detectedType: 'linux' },
      '106': { detectedType: 'linux', controls: { 'op.acc.1': { templateId: 'deleted-template' } } },
      '107': { detectedType: 'linux', controls: { 'mp.info.6': { templateId: 'custom-pbs' } } },
    },
  };
  check('override wins', JSON.stringify(value(doc, 'op.acc.1', '101', 'P-11')) === '["wheel"]' && origin(doc, 'op.acc.1', '101', 'P-11').source === 'agent');
  check('without assignment: the built-in of its type', value(doc, 'op.acc.1', '101', 'P-10') === 1000 &&
    JSON.stringify(origin(doc, 'op.acc.1', '101', 'P-10')) === JSON.stringify({ source: 'template', templateId: 'linux-ubuntu', templateName: 'Linux', via: 'type' }), origin(doc, 'op.acc.1', '101', 'P-10'));
  check('a common parameter never comes from the agent', JSON.stringify(value(doc, 'op.acc.1', '101', 'P-04')) === '["admin"]' && origin(doc, 'op.acc.1', '101', 'P-04').source === 'organisation');
  check('assigned template wins over the type built-in', value(doc, 'op.acc.1', '102', 'P-10') === 500 && origin(doc, 'op.acc.1', '102', 'P-10').via === 'assigned');
  check('and is an alternative: what it leaves unset takes the common value, not the type built-in',
    JSON.stringify(value(doc, 'op.acc.1', '102', 'P-11')) === '["sudo"]' && origin(doc, 'op.acc.1', '102', 'P-11').source === 'organisation' && value(doc, 'op.acc.1', '102', 'P-01') === 'Local');
  check('«none» pins the common values', value(doc, 'op.acc.1', '103', 'P-10') === 2000 && getEffectiveTemplate(doc, '103', 'op.acc.1').via === 'none');
  check('no stored type: common values', value(doc, 'op.acc.1', '104', 'P-10') === 2000);
  check('manual type decides the built-in', value(doc, 'op.acc.1', '105', 'P-01') === 'LDAP' && origin(doc, 'op.acc.1', '105', 'P-01').templateId === 'zimbra-ldap');
  check('an assignment to a missing template is ignored: the type built-in applies', value(doc, 'op.acc.1', '106', 'P-10') === 1000 && getEffectiveTemplate(doc, '106', 'op.acc.1').assignedId === 'deleted-template');
  check('the template applies per control only', value(doc, 'op.exp.2', '102', 'P-03') !== undefined && origin(doc, 'op.exp.2', '102', 'P-03').via === 'type');
  check('agent-level value without falling back', getAgentLevelValue(doc, '104', 'op.acc.1', 'P-10') === undefined && getAgentLevelValue(doc, '101', 'op.acc.1', 'P-11')?.origin.source === 'agent');
  check('inherited value skips the override', getInheritedValue(doc, '101', 'op.acc.1', 'P-11') !== undefined && JSON.stringify(getInheritedValue(doc, '101', 'op.acc.1', 'P-11')) === JSON.stringify(value(doc, 'op.acc.1', '106', 'P-11')));
  check('the id is normalised: row «24» is agent 024', value({ ...doc, agents: { '024': { controls: { 'op.acc.1': { parameters: { 'P-10': 42 } } } } } }, 'op.acc.1', '24', 'P-10') === 42);
  const plain = base();
  check('without agents: the same control object', resolveControlConfigurationForAgent(plain, 'op.acc.1', '101') === plain.controls.find(c => c.controlId === 'op.acc.1'));
  check('a control that adds nothing for the row: the same object', resolveControlConfigurationWithOrigins(doc, 'op.exp.9', '101')!.configuration === doc.controls.find((c: any) => c.controlId === 'op.exp.9'));

  console.log('2. Unions');
  const union = value(doc, 'mp.info.6', '101', 'P-04');
  check('mp.info.6 P-04 (declared scope): common rows plus each agent\'s template rows, on every row',
    JSON.stringify(union) === JSON.stringify(['srv-a | ALTA', 'srv-t | BAJA']) && JSON.stringify(origin(doc, 'mp.info.6', '101', 'P-04').contributors) === '["107"]', union);
  check('and from the assigned template its other values only for its agent', value(doc, 'mp.info.6', '107', 'P-10') === 'pbs' && value(doc, 'mp.info.6', '101', 'P-10') === 'rsync');
  const managerDoc: any = {
    ...doc,
    templates: [...doc.templates, { id: 'custom-inc', controlId: 'op.exp.7', name: 'Responsables', values: { 'P-04': ['srv-b | B. Info | B. Serv'] } }],
    agents: {
      ...doc.agents,
      '102': { ...doc.agents['102'], controls: { ...doc.agents['102'].controls, 'op.exp.7': { templateId: 'custom-inc' } } },
      '103': { ...doc.agents['103'], controls: { ...doc.agents['103'].controls, 'op.exp.7': { parameters: { 'P-04': ['srv-c | C. Info | C. Serv', 'srv-x | R. Info | R. Serv'] } } } },
    },
  };
  const p04 = value(managerDoc, 'op.exp.7', '000', 'P-04');
  check('manager row: common rows + override rows + template rows, without repeating',
    JSON.stringify(p04) === JSON.stringify(['srv-x | R. Info | R. Serv', 'srv-b | B. Info | B. Serv', 'srv-c | C. Info | C. Serv']) &&
      JSON.stringify(origin(managerDoc, 'op.exp.7', '000', 'P-04').contributors) === '["102","103"]', p04);
  check('the common view makes the same union', JSON.stringify(value(managerDoc, 'op.exp.7', undefined, 'P-04')) === JSON.stringify(p04));
  check('an agent row of a manager control: its own value', JSON.stringify(value(managerDoc, 'op.exp.7', '102', 'P-04')) === '["srv-b | B. Info | B. Serv"]');

  console.log('3. Engine entry point');
  ensConfigurationRepository.replaceActive(managerDoc);
  check('getActiveControlConfiguration resolves the row', getActiveControlConfiguration('op.acc.1', '102')?.parameters.find((p: any) => p.id === 'P-10')?.value === 500);
  check('and memoises per document', getActiveControlConfiguration('op.acc.1', '102') === getActiveControlConfiguration('op.acc.1', '102'));
}

// --- parity -------------------------------------------------------------------

const TEMPLATE_IDS = ['linux-ubuntu', 'zimbra-ldap', 'windows-server', 'manager-wazuh', 'pbs-backup', 'zimbra-ne-backup', 'ghost'];
const TYPES = [undefined, 'linux', 'zimbra-ldap', 'windows', 'manager', 'macos'];

// Every single template and every ordered pair, under every stored type, plus overrides on union parameters.
const syntheticProfiles = (): Record<string, any> => {
  const lists: string[][] = [[], ...TEMPLATE_IDS.map(id => [id])];
  TEMPLATE_IDS.forEach(left => TEMPLATE_IDS.forEach(right => { if (left !== right) lists.push([left, right]); }));
  const profiles: Record<string, any> = {};
  let n = 200;
  lists.forEach(list => TYPES.forEach((type, index) => {
    const profile: any = { templates: list };
    if (type) profile[index % 2 ? 'detectedType' : 'typeOverride'] = type;
    if (n % 7 === 0) profile.controls = { 'op.acc.1': { parameters: { 'P-11': ['wheel'] } }, 'mp.info.6': { parameters: { 'P-04': [`h${n} | MEDIA`] } } };
    if (n % 11 === 0) profile.controls = { 'op.exp.7': { parameters: { 'P-07': [`h${n} | servicio`] } }, 'op.exp.8': { parameters: { 'P-02': [`h${n} | Ubuntu 24.04 | web`] } } };
    profiles[String(n++).padStart(3, '0')] = profile;
  }));
  profiles['000'] = { detectedType: 'manager', templates: ['manager-wazuh'] };
  return profiles;
};

const parity = (name: string, legacyDoc: any) => {
  const migrated = planTemplateMigration(legacyDoc).configuration;
  const rows = Array.from(new Set([undefined, '000', '999', ...Object.keys(legacyDoc.agents || {})]));
  const differences: string[] = [];
  legacyDoc.controls.forEach((control: any) => rows.forEach(agentId => {
    const expected = JSON.stringify(legacy.resolveControlConfigurationForAgent(legacyDoc, control.controlId, agentId)?.parameters.map((p: any) => p.value));
    const onTheFly = JSON.stringify(resolveControlConfigurationForAgent(legacyDoc, control.controlId, agentId)?.parameters.map(p => p.value));
    const afterSave = JSON.stringify(resolveControlConfigurationForAgent(JSON.parse(JSON.stringify(migrated)), control.controlId, agentId)?.parameters.map(p => p.value));
    if (expected !== onTheFly) differences.push(`${control.controlId} ${agentId}: unsaved`);
    if (expected !== afterSave) differences.push(`${control.controlId} ${agentId}: saved`);
  }));
  check(`${name}: ${legacyDoc.controls.length} controls × ${rows.length} rows resolve as in 1.2.0, before and after saving`, differences.length === 0, differences.slice(0, 8));
  return migrated;
};

console.log('4. Parity with 1.2.0 (synthetic profiles)');
{
  const legacyDoc: any = { ...base(), agents: syntheticProfiles() };
  delete legacyDoc.templates;
  const migrated = parity(`${Object.keys(legacyDoc.agents).length} synthetic profiles`, legacyDoc);
  check('no 1.2.0 template list is left', Object.values(migrated.agents || {}).every((profile: any) => !('templates' in profile)));
  check('the migrated document is marked 1.3.0', Array.isArray(migrated.templates));
}

console.log('5. Parity with 1.2.0 (lab copy)');
{
  const path = process.env.ENSFACIL_LAB_DOC;
  if (path && existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const lab = raw._source ? raw._source.configuration : raw.configuration || raw;
    parity('lab document without agents', lab);
    const profiles: any = {
      '000': { detectedType: 'manager', templates: ['manager-wazuh'] },
      '024': { detectedType: 'linux', templates: ['linux-ubuntu', 'pbs-backup'], controls: { 'op.acc.1': { parameters: { 'P-07': ['u | srv | admin'] } } } },
      '028': { detectedType: 'linux', typeOverride: 'zimbra-ldap', templates: ['zimbra-ldap', 'zimbra-ne-backup'] },
      '030': { detectedType: 'linux', controls: { 'op.exp.2': { parameters: { 'P-03': ['x | y'] } } } },
      '031': { detectedType: 'windows', templates: ['windows-server'] },
    };
    parity('lab document with 1.2.0 profiles', { ...lab, agents: profiles });
  } else {
    console.log('    (skipped: ENSFACIL_LAB_DOC not set)');
  }
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
