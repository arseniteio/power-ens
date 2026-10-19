/**
 * The «Expresión regular» mode travels with its value: common value, custom template and agent override. Covers the
 * stored shape, resolution, the screen actions, the validators and documents written without `matchMode`.
 *
 *   npx --yes tsx tests/parameter-match-mode-levels.test.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import * as actions from '../common/ens/configuration/agents/agent-configuration-actions';
import {
  getInheritedSetting,
  resolveControlConfigurationForAgent,
  resolveControlConfigurationWithOrigins,
} from '../common/ens/configuration/agents/configuration-resolver';
import { validateAgentsConfiguration, validateCustomTemplates } from '../common/ens/configuration/agents/agent-configuration-validator';
import {
  checkAgentsConfigurationKeys,
  checkCustomTemplatesKeys,
  validateAgentsConfigurationShape,
  validateCustomTemplatesShape,
} from '../common/agent-configuration';
import { assertENSConfigurationVersion } from '../common/ens/configuration/services/configuration-structure-validator';
import { validateENSConfigurationStructure as validate120 } from './fixtures/configuration-structure-validator-1.2.0';
import { checkAgentsConfigurationKeys as checkKeys120 } from './fixtures/agent-configuration-1.2.0';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
declare const __dirname: string;

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  if (!ok) failures.push(name);
};
const throws = (run: () => unknown, pattern: RegExp): boolean => {
  try { run(); return false; } catch (error) { return pattern.test((error as Error).message); }
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const CONFIG = `${__dirname}/../config`;
const blocks: Record<string, any> = {};
readdirSync(CONFIG).filter(file => file.endsWith('-control-block.json')).forEach(file => {
  const block = JSON.parse(readFileSync(`${CONFIG}/${file}`, 'utf8'));
  blocks[block.controlId] = block;
});

const COMMON = '^(root|daemon)$';
const T_REGEX = { id: 'custom-svc', controlId: 'op.acc.1', name: 'Servicios svc_', values: { 'P-03': '^svc_.*$' }, matchModes: { 'P-03': 'regex' } };
const T_EXACT = { id: 'custom-maria', controlId: 'op.acc.1', name: 'Solo maria', values: { 'P-03': ['maria'] } };
const AGENTS = {
  '101': { controls: { 'op.acc.1': { templateId: 'none' } } },
  '102': { controls: { 'op.acc.1': { templateId: 'custom-svc' } } },
  '103': { controls: { 'op.acc.1': { templateId: 'custom-svc', parameters: { 'P-03': ['svc_backup2'] } } } },
  '104': { controls: { 'op.acc.1': { templateId: 'none', parameters: { 'P-03': '^ma.*$' }, matchModes: { 'P-03': 'regex' } } } },
  '105': { controls: { 'op.acc.1': { templateId: 'custom-maria' } } },
};
const documentWith = (extra: any = {}): any => ({
  ...copy(defaultENSConfigurationTemplate),
  templates: copy([T_REGEX, T_EXACT]),
  agents: copy(AGENTS),
  controls: ['op.acc.1', 'op.acc.4', 'op.acc.6', 'op.exp.7'].map(id => {
    const block = copy(blocks[id]);
    if (id === 'op.acc.1') {
      Object.assign(block.parameters.find((p: any) => p.id === 'P-03'), { value: COMMON, matchMode: 'regex' });
      Object.assign(block.parameters.find((p: any) => p.id === 'P-04'), { value: '^(admin|guest)$', matchMode: 'regex' });
    }
    return block;
  }),
  ...extra,
});
const resolved = (doc: any, agentId: string | undefined, parameterId = 'P-03') => {
  const result = resolveControlConfigurationWithOrigins(doc, 'op.acc.1', agentId)!;
  const parameter = result.configuration.parameters.find(item => item.id === parameterId)!;
  return { value: parameter.value, matchMode: parameter.matchMode, hasKey: 'matchMode' in parameter, source: result.origins[parameterId]?.source };
};

console.log('1. Stored shape');
{
  const doc = documentWith();
  check('a document with modes at every level is a valid 1.3.0 document', (() => { try { assertENSConfigurationVersion(copy(doc)); return true; } catch { return false; } })());
  check('agent modes: object of exact/regex', validateAgentsConfigurationShape(doc.agents).length === 0);
  check('an unknown agent mode stops the save', validateAgentsConfigurationShape({ '101': { controls: { 'op.acc.1': { matchModes: { 'P-03': 'glob' } } } } }).some(e => /matchModes\.P-03 must be "exact" or "regex"/.test(e)));
  check('agent modes that are not an object', validateAgentsConfigurationShape({ '101': { controls: { 'op.acc.1': { matchModes: ['regex'] } } } }).some(e => /matchModes must be an object/.test(e)));
  check('an unknown template mode stops the save', validateCustomTemplatesShape([{ ...T_REGEX, matchModes: { 'P-03': 'javascript' } }]).some(e => /templates\[0\]\.matchModes\.P-03/.test(e)));
  check('the hydration refuses an unknown agent mode', throws(() => assertENSConfigurationVersion({ ...copy(doc), agents: { '101': { controls: { 'op.acc.1': { matchModes: { 'P-03': 'glob' } } } } } }), /matchModes/));
  check('`matchModes` is a known key (no warning)', checkAgentsConfigurationKeys(doc.agents).warnings.length === 0 && checkCustomTemplatesKeys(doc.templates).length === 0, [checkAgentsConfigurationKeys(doc.agents).warnings, checkCustomTemplatesKeys(doc.templates)]);
  check('a 1.2.0 plugin still loads it (structure)', validate120(copy(doc)).valid, validate120(copy(doc)).errors);
  check('and only warns about the 1.3.0 agent keys it does not know', checkKeys120(doc.agents).errors.length === 0 &&
    checkKeys120(doc.agents).warnings.some((w: string) => /matchModes/.test(w)) && checkKeys120(doc.agents).warnings.every((w: string) => /\.(matchModes|templateId):/.test(w)), checkKeys120(doc.agents));
}

console.log('2. Resolution: the mode of the level the value comes from');
{
  const doc = documentWith();
  const r101 = resolved(doc, '101');
  check('no template: the common pattern, regex', r101.value === COMMON && r101.matchMode === 'regex' && r101.source === 'organisation', r101);
  const r102 = resolved(doc, '102');
  check('assigned template: its pattern, regex', r102.value === '^svc_.*$' && r102.matchMode === 'regex' && r102.source === 'template', r102);
  const r103 = resolved(doc, '103');
  check('override without mode over a regex template: exact, no key', JSON.stringify(r103.value) === '["svc_backup2"]' && !r103.hasKey && r103.source === 'agent', r103);
  const r104 = resolved(doc, '104');
  check('override in regex', r104.value === '^ma.*$' && r104.matchMode === 'regex' && r104.source === 'agent', r104);
  const r105 = resolved(doc, '105');
  check('exact template over a regex common value: the common mode does not leak', JSON.stringify(r105.value) === '["maria"]' && !r105.hasKey && r105.source === 'template', r105);
  const general = resolved(doc, undefined);
  check('without an agent: the common value and mode', general.value === COMMON && general.matchMode === 'regex');
  check('a common parameter keeps its mode on every agent', ['101', '102', '103', '104', '105'].every(agent => resolved(doc, agent, 'P-04').matchMode === 'regex'));
  check('the engine entry point gives the same', resolveControlConfigurationForAgent(doc, 'op.acc.1', '102')!.parameters.find(p => p.id === 'P-03')!.matchMode === 'regex' &&
    !('matchMode' in resolveControlConfigurationForAgent(doc, 'op.acc.1', '105')!.parameters.find(p => p.id === 'P-03')!));
  const inherited = getInheritedSetting(doc, '103', 'op.acc.1', 'P-03');
  check('what 103 inherits without its override: the template pattern with its mode', inherited.value === '^svc_.*$' && inherited.matchMode === 'regex', inherited);
}

console.log('3. Documents without matchMode');
{
  const plain = documentWith({ templates: [copy(T_EXACT)], agents: { '101': {}, '105': copy(AGENTS['105']), '106': { controls: { 'op.acc.1': { parameters: { 'P-03': ['svc'] } } } } } });
  plain.controls.forEach((control: any) => control.parameters.forEach((parameter: any) => delete parameter.matchMode));
  const keys = ['101', '105', '106', undefined].flatMap(agent =>
    plain.controls.flatMap((control: any) => resolveControlConfigurationWithOrigins(plain, control.controlId, agent)!.configuration.parameters.filter(p => 'matchMode' in p).map(p => `${agent} ${control.controlId} ${p.id}`)));
  check('nothing resolves with a mode', keys.length === 0, keys);
  check('validators: no issue about modes', validateAgentsConfiguration(plain).every(issue => !/modo|regular/i.test(issue.message)) && validateCustomTemplates(plain).every(issue => !/modo|regular/i.test(issue.message)));
  const lab = process.env.ENSFACIL_LAB_DOC;
  if (lab) {
    const source = JSON.parse(readFileSync(lab, 'utf8'));
    const configuration = source._source?.configuration || source.configuration || source;
    const found = configuration.controls.flatMap((control: any) => resolveControlConfigurationWithOrigins(configuration, control.controlId, '000')!.configuration.parameters.filter(p => 'matchMode' in p));
    check('lab copy: nothing resolves with a mode', found.length === 0, found.length);
  }
}

console.log('4. Actions on an override');
{
  const doc = documentWith();
  const regex = actions.setAgentParameterValue(doc, '106', 'op.acc.1', 'P-03', '^svc_.*$', undefined, 'regex');
  const entry = regex.agents!['106'].controls!['op.acc.1'];
  check('a regex override stores the value and its mode', entry.parameters!['P-03'] === '^svc_.*$' && entry.matchModes!['P-03'] === 'regex', entry);
  const exact = actions.setAgentParameterValue(regex, '106', 'op.acc.1', 'P-03', ['svc_backup'], undefined, 'exact');
  const exactEntry = exact.agents!['106'].controls!['op.acc.1'];
  check('back to exact: the mode is removed, exact is never stored', JSON.stringify(exactEntry.parameters) === '{"P-03":["svc_backup"]}' && !('matchModes' in exactEntry), exactEntry);
  check('the inherited pattern in regex is not stored («igual»)', actions.describeAgentValueSave(doc, '101', 'op.acc.1', 'P-03', COMMON, 'regex') === 'igual');
  check('the same text in exact is its own value («propio»)', actions.describeAgentValueSave(doc, '101', 'op.acc.1', 'P-03', COMMON, 'exact') === 'propio');
  const same = actions.setAgentParameterValue(doc, '101', 'op.acc.1', 'P-03', COMMON, undefined, 'regex');
  check('saving the inherited pattern leaves 101 without override', !same.agents!['101'].controls!['op.acc.1'].parameters);
  const removed = actions.removeAgentEntry(doc, '104', 'op.acc.1', 'P-03');
  check('removing the override removes its mode', JSON.stringify(removed.agents!['104'].controls!['op.acc.1']) === '{"templateId":"none"}', removed.agents!['104']);
  const cleared = actions.clearAgentControlOverrides(doc, '104', 'op.acc.1');
  check('clearing the overrides clears the modes', JSON.stringify(cleared.agents!['104'].controls!['op.acc.1']) === '{"templateId":"none"}', cleared.agents!['104']);
  check('the removal list says it is a pattern', actions.describeAgentEntryRemoval(doc, '104', 'op.acc.1').some(line => /expresión regular \^ma\.\*\$/.test(line)), actions.describeAgentEntryRemoval(doc, '104', 'op.acc.1'));
  const modeOnly = actions.setAgentParameterValue(documentWith(), '104', 'op.acc.1', 'P-03', '^ma.*$', undefined, 'exact');
  const preview = actions.previewConfigurationChange(doc, modeOnly, ['104'], ['op.acc.1']);
  check('a change of mode alone shows in the preview', preview[0].changes.includes('op.acc.1 P-03'), preview);
  const assign = actions.previewControlAssignment(doc, 'op.acc.1', ['102'], 'custom-maria');
  check('assigning the exact template to 102 changes P-03', assign.previews[0].changes.includes('op.acc.1 P-03'), assign.previews);
  check('afterwards 102 compares exactly', !('matchMode' in resolveControlConfigurationForAgent(assign.configuration, 'op.acc.1', '102')!.parameters.find(p => p.id === 'P-03')!));
}

console.log('5. Actions on a custom template');
{
  const doc = documentWith();
  const created = actions.createControlTemplate(doc, { controlId: 'op.acc.1', name: 'Patrón', values: { 'P-03': '^app_.*$', 'P-11': ['sudo'] }, matchModes: { 'P-03': 'regex', 'P-11': 'exact' } });
  check('create: regex stored, exact not', JSON.stringify(created.template.matchModes) === '{"P-03":"regex"}', created.template);
  check('an invalid pattern is refused with its reason', throws(() => actions.createControlTemplate(doc, { controlId: 'op.acc.1', name: 'X', values: { 'P-03': '[' }, matchModes: { 'P-03': 'regex' } }), /Expresión regular inválida/));
  check('a parameter without pattern support is refused', throws(() => actions.createControlTemplate(doc, { controlId: 'op.acc.1', name: 'X', values: { 'P-11': '^s.*$' }, matchModes: { 'P-11': 'regex' } }), /no admite expresiones regulares/));
  check('a mode without a value is dropped', !('matchModes' in actions.createControlTemplate(doc, { controlId: 'op.acc.1', name: 'Vacía', values: { 'P-03': '' }, matchModes: { 'P-03': 'regex' } }).template));
  check('a template list is validated as a list even when the common value is regex', actions.createControlTemplate(doc, { controlId: 'op.acc.1', name: 'Lista', values: { 'P-03': ['svc_a'] } }).template.values['P-03'] !== undefined);
  const copied = actions.duplicateControlTemplate(doc, 'op.acc.1', 'custom-svc');
  check('duplicate keeps the mode', copied.template.matchModes?.['P-03'] === 'regex', copied.template);
  check('editing only the values keeps the stored mode, so a list under regex is refused', throws(() => actions.updateControlTemplate(doc, 'custom-svc', { values: { 'P-03': ['svc_a'] } }), /Expresión regular inválida/));
  const toExact = actions.updateControlTemplate(doc, 'custom-svc', { values: { 'P-03': ['svc_a'] }, matchModes: {} });
  const edited = toExact.templates!.find(t => t.id === 'custom-svc')!;
  check('editing values and modes together switches it to exact', JSON.stringify(edited.values) === '{"P-03":["svc_a"]}' && !('matchModes' in edited), edited);
  check('a rename keeps the pattern and its mode', actions.updateControlTemplate(doc, 'custom-svc', { name: 'svc' }).templates!.find(t => t.id === 'custom-svc')!.matchModes?.['P-03'] === 'regex');
}

console.log('6. Validators');
{
  const doc = documentWith();
  check('a valid document has no issues', validateAgentsConfiguration(doc).length === 0 && validateCustomTemplates(doc).length === 0, [validateAgentsConfiguration(doc), validateCustomTemplates(doc)]);
  const bad = documentWith({
    agents: { ...copy(AGENTS), '106': { controls: { 'op.acc.1': { parameters: { 'P-03': '[' }, matchModes: { 'P-03': 'regex', 'P-01': 'regex' } } } } },
    templates: [copy(T_EXACT), { ...copy(T_REGEX), values: { 'P-11': '^s.*$' }, matchModes: { 'P-11': 'regex', 'P-03': 'regex' } }],
  });
  const agentIssues = validateAgentsConfiguration(bad);
  check('an invalid override pattern is an error of its agent', agentIssues.some(issue => issue.agentId === '106' && issue.severity === 'error' && /Expresión regular inválida/.test(issue.message)), agentIssues);
  check('a mode without its override is a warning', agentIssues.some(issue => issue.agentId === '106' && issue.severity === 'warning' && /modo de comparación, sin ajuste propio/.test(issue.message)), agentIssues);
  const templateIssues = validateCustomTemplates(bad);
  check('a template pattern on an unsupported parameter is an error', templateIssues.some(issue => issue.severity === 'error' && /no admite expresiones regulares/.test(issue.message)), templateIssues);
  check('a template mode without value is a warning', templateIssues.some(issue => issue.severity === 'warning' && /sin valor en la plantilla/.test(issue.message)), templateIssues);
}

if (failures.length) {
  console.log(`\n${failures.length} FAILURES`);
  process.exit(1);
}
console.log('\nAll checks pass.');
