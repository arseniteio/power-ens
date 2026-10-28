/** Configuration by control templates (1.3.0): parameter classes, built-in templates, document shape. */
import { readFileSync, readdirSync } from 'fs';
import {
  ENS_PARAMETER_CLASSES,
  ENS_SYSTEM_KEY_COLUMNS,
} from '../common/ens/configuration/agents/parameter-classes';
import {
  describeTemplate,
  getBuiltinTemplates,
  getControlTemplates,
  getTypeDefaultTemplate,
  hasTemplateParameters,
  isReservedTemplateId,
} from '../common/ens/configuration/templates';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import {
  ENS_NO_TEMPLATE,
  checkAgentsConfigurationKeys,
  validateAgentsConfigurationShape,
  validateCustomTemplatesShape,
} from '../common/agent-configuration';
import {
  summarizeAgentsConfiguration,
  validateAgentsConfiguration,
  validateCustomTemplates,
} from '../common/ens/configuration/agents/agent-configuration-validator';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { validateENSConfigurationStructure as validate120 } from './fixtures/configuration-structure-validator-1.2.0';
import { ENS_CONFIGURATION_TEMPLATES as FROZEN_120_TEMPLATES } from './fixtures/resolver-1.2.0/templates';

declare const process: { exit(code: number): void };
declare const __dirname: string;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  if (!ok) failures.push(name);
};

const CONFIG = `${__dirname}/../config`;
const blocks: Record<string, any> = {};
readdirSync(CONFIG)
  .filter(file => file.endsWith('-control-block.json'))
  .forEach(file => {
    const block = JSON.parse(readFileSync(`${CONFIG}/${file}`, 'utf8'));
    blocks[block.controlId] = block;
  });

console.log('1. Parameter classes');
{
  check('34 seed blocks', Object.keys(blocks).length === 34, Object.keys(blocks));
  const unclassified: string[] = [];
  const extra: string[] = [];
  const totals: Record<string, number> = { organisation: 0, system: 0, platform: 0 };
  Object.values(blocks).forEach(block =>
    block.parameters.forEach((parameter: any) => {
      const parameterClass = ENS_PARAMETER_CLASSES[block.controlId]?.[parameter.id];
      if (!parameterClass) unclassified.push(`${block.controlId} ${parameter.id}`);
      else totals[parameterClass] += 1;
    })
  );
  Object.entries(ENS_PARAMETER_CLASSES).forEach(([controlId, parameters]) =>
    Object.keys(parameters).forEach(parameterId => {
      if (!blocks[controlId]?.parameters.some((item: any) => item.id === parameterId)) extra.push(`${controlId} ${parameterId}`);
    })
  );
  check('every parameter has a class', unclassified.length === 0, unclassified);
  check('no class is left over', extra.length === 0, extra);
  // The 91 of the eleven documentary mp.* (1.4.0) are common until their collector exists.
  check('332 parameters: 256 common, 41 per system, 35 per platform', totals.organisation === 256 && totals.system === 41 && totals.platform === 35, totals);

  const bad: string[] = [];
  Object.entries(ENS_SYSTEM_KEY_COLUMNS).forEach(([controlId, parameters]) =>
    Object.entries(parameters).forEach(([parameterId, column]) => {
      const parameter = blocks[controlId]?.parameters.find((item: any) => item.id === parameterId);
      const ok = parameter && parameter.type === 'table' && ENS_PARAMETER_CLASSES[controlId][parameterId] === 'system' &&
        (parameter.columns || []).some((item: any) => item.name === column);
      if (!ok) bad.push(`${controlId} ${parameterId} ${column}`);
    })
  );
  check('system key columns exist on per-system tables', bad.length === 0, bad);

  const source = readFileSync(`${__dirname}/../common/ens/configuration/agents/parameter-classes.ts`, 'utf8');
  const start = source.indexOf('{', source.indexOf('HAND_PARAMETER_CLASSES:'));
  const end = source.indexOf('\n};', start);
  let json: any;
  try { json = JSON.parse(source.slice(start, end + 2)); } catch (error) { json = undefined; }
  check('the classes are JSON between braces (set-parameters.py reads them), the engine-judged ones in its catalog', json && Object.keys(json).length === 28 && Object.keys(ENS_PARAMETER_CLASSES).length === 34);
}

console.log('2. Built-in templates');
{
  const LAB = /qsprueba|zimbraH|wazuh-real|wazuh-fake|WIN-OPACC|dioni|fran\b|22121|Wazuh-4|hetzner|tailscale|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/i;
  const withTemplates = Object.keys(ENS_PARAMETER_CLASSES).filter(hasTemplateParameters);
  check('19 controls have template parameters (the 15 all-common ones have none)', withTemplates.length === 19 &&
    ['op.cont.2', 'op.exp.9', 'op.mon.2', 'op.nub.1'].every(id => !hasTemplateParameters(id) && getBuiltinTemplates(id).length === 0), withTemplates);

  const problems: string[] = [];
  withTemplates.forEach(controlId => {
    const builtins = getBuiltinTemplates(controlId);
    if (!builtins.length) problems.push(`${controlId}: no built-in`);
    if (new Set(builtins.map(template => template.id)).size !== builtins.length) problems.push(`${controlId}: repeated id`);
    builtins.forEach(template => {
      if (!template.builtin) problems.push(`${controlId} ${template.id}: not marked built-in`);
      const frozen = FROZEN_120_TEMPLATES.find(item => item.id === template.id);
      if (!frozen || JSON.stringify(template.values) !== JSON.stringify(frozen.values[controlId] || {})) problems.push(`${controlId} ${template.id}: not the 1.2.0 grounded values`);
      Object.entries(template.values).forEach(([parameterId, value]) => {
        const at = `${controlId} ${template.id} ${parameterId}`;
        const parameter = blocks[controlId].parameters.find((item: any) => item.id === parameterId);
        if (!parameter) { problems.push(`${at}: not in the seed block`); return; }
        const parameterClass = ENS_PARAMETER_CLASSES[controlId][parameterId];
        if (parameterClass !== 'system' && parameterClass !== 'platform') problems.push(`${at}: ${parameterClass}`);
        const verdict = validateParameterValue(parameter, value);
        if (!verdict.valid) problems.push(`${at}: ${verdict.reason}`);
        if (LAB.test(JSON.stringify(value))) problems.push(`${at}: names a lab`);
      });
    });
    (['linux', 'zimbra-ldap', 'windows', 'manager'] as const).forEach(type => {
      if (builtins.filter(template => template.typeDefault && template.systemType === type).length > 1) problems.push(`${controlId}: two defaults for ${type}`);
    });
  });
  check('each control: built-ins with unique ids, the frozen 1.2.0 values, valid, never common parameters nor lab names', problems.length === 0, problems);

  const names = (controlId: string) => getBuiltinTemplates(controlId).map(template => template.name).join(',');
  check('op.acc.1: Linux, Servidor LDAP, Windows and the manager', names('op.acc.1') === 'Linux,Servidor LDAP,Windows,Manager Wazuh', names('op.acc.1'));
  check('op.acc.6: no Windows (no collector there)', names('op.acc.6') === 'Linux,Servidor LDAP,Manager Wazuh', names('op.acc.6'));
  check('op.exp.8 (both planes): Linux, Servidor LDAP and Manager Wazuh', names('op.exp.8') === 'Linux,Servidor LDAP,Manager Wazuh', names('op.exp.8'));
  check('op.exp.7 (manager only): Manager Wazuh', names('op.exp.7') === 'Manager Wazuh', names('op.exp.7'));
  check('mp.info.6: PBS and Zimbra NE as alternatives, not type defaults',
    names('mp.info.6') === 'Linux,Servidor LDAP,Copias con PBS,Copias Zimbra NE' &&
      getBuiltinTemplates('mp.info.6').filter(template => !template.typeDefault).map(template => template.id).join() === 'pbs-backup,zimbra-ne-backup',
    names('mp.info.6'));
  check('a built-in with nothing grounded says so on screen, not in its description', /Sin valores de serie/.test(describeTemplate(getBuiltinTemplates('op.exp.1')[0])) && !/Sin valores de serie/.test(getBuiltinTemplates('op.exp.1')[0].description || ''));
  check('type default: Servidor LDAP for an LDAP agent', getTypeDefaultTemplate('op.acc.1', 'zimbra-ldap')?.values['P-01'] === 'LDAP');
  check('type default: none for Windows in op.exp.2', getTypeDefaultTemplate('op.exp.2', 'windows') === undefined);
  check('LDAP: no «adm» among privileged groups; Linux: with it',
    !(getBuiltinTemplates('op.acc.2')[1].values['P-12'] as string[]).includes('adm') && (getBuiltinTemplates('op.acc.2')[0].values['P-12'] as string[]).includes('adm'));
  check('built-in ids and «none» are reserved', ['linux-ubuntu', 'pbs-backup', ENS_NO_TEMPLATE].every(isReservedTemplateId) && !isReservedTemplateId('custom-x'));
  const script = readFileSync(`${__dirname}/../config/set-parameters.py`, 'utf8');
  const start = script.indexOf('{', script.indexOf('BUILTIN_TEMPLATES = '));
  const end = script.indexOf('\n}', start);
  let fromScript: any;
  try { fromScript = JSON.parse(script.slice(start, end + 2).replace(/,\s*}/, '}')); } catch (error) { fromScript = undefined; }
  const fromPlugin = Object.fromEntries(withTemplates.map(id => [id, getBuiltinTemplates(id).map(template => template.id)]));
  const sorted = (o: any) => o && JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
  check('set-parameters.py knows the same built-in ids per control', sorted(fromScript) === sorted(fromPlugin), fromScript);
  const custom = { templates: [{ id: 'custom-web', controlId: 'op.acc.1', name: 'Web', values: { 'P-10': 500 } }] } as any;
  check('control templates: built-ins first, then custom ones', getControlTemplates(custom, 'op.acc.1').map(template => `${template.id}:${template.builtin}`).join() === 'linux-ubuntu:true,zimbra-ldap:true,windows-server:true,manager-wazuh:true,custom-web:false');
}

console.log('3. Document shape');
{
  const profile = { '024': { name: 'srv-a', detectedType: 'linux', controls: { 'op.acc.1': { templateId: 'custom-web', parameters: { 'P-07': ['u | srv-a | admin'] } }, 'op.exp.2': { templateId: ENS_NO_TEMPLATE } } } };
  check('a profile with assignments is valid', validateAgentsConfigurationShape(profile).length === 0, validateAgentsConfigurationShape(profile));
  check('an empty templateId is not (remove the key instead)', validateAgentsConfigurationShape({ '024': { controls: { 'op.acc.1': { templateId: '' } } } }).length === 1);
  check('a null value is not', validateAgentsConfigurationShape({ '024': { controls: { 'op.acc.1': { parameters: { 'P-07': null } } } } }).length === 1);
  check('templateId is a known key: no warning', checkAgentsConfigurationKeys(profile).warnings.length === 0, checkAgentsConfigurationKeys(profile));

  const templates = [{ id: 'custom-web', controlId: 'op.acc.1', name: 'Web', systemType: 'linux', values: { 'P-10': 500, 'P-11': ['sudo'] } }];
  check('custom templates: valid shape', validateCustomTemplatesShape(templates).length === 0);
  check('absent: valid', validateCustomTemplatesShape(undefined).length === 0);
  check('not an array: invalid', validateCustomTemplatesShape({}).length === 1);
  check('no id, no name, a null value: three errors, with the path',
    validateCustomTemplatesShape([{ controlId: 'op.acc.1', values: { 'P-10': null } }]).length === 3 &&
      validateCustomTemplatesShape([{ controlId: 'op.acc.1', values: { 'P-10': null } }]).some(error => /templates\[0\]\.values\.P-10/.test(error)));

  const doc: any = { ...defaultENSConfigurationTemplate, agents: profile, templates };
  check('the structure validator accepts a 1.3.0 document', validateENSConfigurationStructure(doc).valid, validateENSConfigurationStructure(doc).errors);
  const broken = validateENSConfigurationStructure({ ...doc, templates: [{ id: 'x', controlId: 'op.acc.1', name: 'X', values: { 'P-10': { a: 1 } } }] });
  check('and rejects a template value that is an object, saying where', !broken.valid && broken.errors.some(error => /templates\[0\]\.values\.P-10/.test(error)), broken.errors);
  check('the frozen 1.2.0 validator loads a 1.3.0 document (unknown keys ignored)', validate120(doc).valid, validate120(doc).errors);
}

console.log('4. Meaning');
{
  const controls = [blocks['op.acc.1'], blocks['op.acc.2']];
  const issues = validateAgentsConfiguration({
    controls,
    templates: [],
    agents: {
      '024': {
        templates: ['linux-ubuntu'],
        controls: {
          'op.acc.1': { templateId: 'missing', parameters: { 'P-04': ['admin'], 'P-99': 'x', 'P-07': ['u | srv-a | admin'], 'P-10': 'mil' } },
          'op.acc.2': { templateId: ENS_NO_TEMPLATE },
          'op.exp.1': { parameters: { 'P-01': ['a | b | c | d'] } },
        },
      },
    },
  } as any);
  const text = issues.map(issue => issue.message).join(' || ');
  check('common parameter as override: orphan error', issues.find(issue => issue.parameterId === 'P-04')?.kind === 'huerfano' && /ajuste común/.test(text), text);
  check('invalid applied value: value error', issues.find(issue => issue.parameterId === 'P-10')?.kind === 'valor');
  check('undeclared parameter and unseeded control: errors', /no declara el parámetro P-99/.test(text) && /op\.exp\.1 no está en la configuración/.test(text), text);
  check('assigned template that does not exist: template error', issues.some(issue => issue.kind === 'plantilla' && issue.severity === 'error' && /«missing» no existe/.test(issue.message)), text);
  check('«none» is a valid assignment', !issues.some(issue => issue.controlId === 'op.acc.2'));
  check('1.2.0 templates still on a profile: a warning (converted on load)', issues.some(issue => issue.kind === 'plantilla' && issue.severity === 'warning'), text);
  check('a valid override gives no issue', !issues.some(issue => issue.parameterId === 'P-07'));

  const templateIssues = validateCustomTemplates({
    controls,
    templates: [
      { id: 'linux-ubuntu', controlId: 'op.acc.1', name: 'Mine', values: {} },
      { id: 'custom-a', controlId: 'op.acc.1', name: 'A', values: { 'P-04': ['x'], 'P-10': 'mil' } },
      { id: 'custom-a', controlId: 'op.acc.1', name: 'a', values: {} },
      { id: 'custom-b', controlId: 'op.exp.9', name: 'B', values: {} },
    ],
  } as any);
  const templateText = templateIssues.map(issue => issue.message).join(' || ');
  check('custom templates: reserved id, repeated id, common parameter, invalid value, unseeded control',
    /es de una plantilla de serie/.test(templateText) && /está repetido/.test(templateText) && /«Cuentas genéricas prohibidas» es un ajuste común/.test(templateText) &&
      templateIssues.some(issue => issue.parameterId === 'P-10') && /op\.exp\.9 no está en la configuración/.test(templateText),
    templateText);
  check('a repeated name in a control is a warning', templateIssues.some(issue => issue.severity === 'warning' && /otra plantilla llamada/.test(issue.message)), templateText);
  const shadow = validateCustomTemplates({ controls, templates: [{ id: 'custom-linux', controlId: 'op.acc.1', name: 'linux', values: {} }] } as any);
  check('a custom template named like a built-in of its control is a warning', shadow.length === 1 && shadow[0].severity === 'warning', shadow);

  const summary = summarizeAgentsConfiguration({ agents: { '028': { typeOverride: 'zimbra-ldap', detectedType: 'linux', controls: { 'op.acc.1': { templateId: 'custom-a', parameters: { 'P-07': ['x | y | z'] } } } } } } as any);
  check('summary per agent: manual type, assignments and overrides', summary[0].type === 'zimbra-ldap' && summary[0].typeSource === 'manual' && summary[0].assignments['op.acc.1'] === 'custom-a' && summary[0].ownValues === 1, summary);
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
