/**
 * What the configuration screen does to the document (pure actions): custom template CRUD, bulk assignment,
 * overrides, stored types, previews and removals.
 *
 *   npx --yes tsx tests/control-templates-actions.test.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import * as actions from '../common/ens/configuration/agents/agent-configuration-actions';
import { resolveControlConfigurationWithOrigins } from '../common/ens/configuration/agents/configuration-resolver';
import { detectAgentSystem } from '../common/ens/configuration/agents/system-detection';
import { ENS_NO_TEMPLATE } from '../common/agent-configuration';
import * as legacy from './fixtures/resolver-1.2.0/configuration-resolver';

declare const process: { exit(code: number): void };
declare const __dirname: string;

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  if (!ok) failures.push(name);
};
const throws = (run: () => unknown, pattern: RegExp): boolean => {
  try { run(); return false; } catch (error) { return pattern.test((error as Error).message); }
};

const CONFIG = `${__dirname}/../config`;
const blocks: Record<string, any> = {};
readdirSync(CONFIG).filter(file => file.endsWith('-control-block.json')).forEach(file => {
  const block = JSON.parse(readFileSync(`${CONFIG}/${file}`, 'utf8'));
  blocks[block.controlId] = block;
});
const base = (extra: any = {}): any => ({
  ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)),
  templates: [],
  controls: ['op.acc.1', 'op.acc.2', 'op.exp.7', 'mp.info.6'].map(id => {
    const block = JSON.parse(JSON.stringify(blocks[id]));
    if (id === 'op.acc.1') {
      block.parameters.find((p: any) => p.id === 'P-01').value = 'Local';
      block.parameters.find((p: any) => p.id === 'P-10').value = 2000;
      block.parameters.find((p: any) => p.id === 'P-03').value = ['root'];
    }
    return block;
  }),
  ...extra,
});
const value = (doc: any, controlId: string, agentId: string, parameterId: string) =>
  resolveControlConfigurationWithOrigins(doc, controlId, agentId)!.configuration.parameters.find(item => item.id === parameterId)?.value;

console.log('1. Custom templates');
{
  const doc = base({ agents: { '101': { detectedType: 'linux' } } });
  const snapshot = JSON.stringify(doc);
  const created = actions.createControlTemplate(doc, { controlId: 'op.acc.1', name: 'Servidores web', systemType: 'linux', values: { 'P-10': 500, 'P-11': [], 'P-07': '' as any } });
  check('create: id from the name, empty values dropped, input untouched', created.template.id === 'custom-servidores-web' && JSON.stringify(created.template.values) === '{"P-10":500}' && JSON.stringify(doc) === snapshot, created.template);
  check('a name is required', throws(() => actions.createControlTemplate(doc, { controlId: 'op.acc.1', name: '  ', values: {} }), /necesita un nombre/));
  check('names are unique within a control', throws(() => actions.createControlTemplate(created.configuration, { controlId: 'op.acc.1', name: 'servidores WEB', values: {} }), /Ya hay una plantilla/));
  check('the same name in another control is fine, with its own id', actions.createControlTemplate(created.configuration, { controlId: 'op.acc.2', name: 'Servidores web', values: {} }).template.id === 'custom-servidores-web-2');
  check('an invalid value is refused with its reason', throws(() => actions.createControlTemplate(doc, { controlId: 'op.acc.1', name: 'X', values: { 'P-10': 'mil' } }), /P-10/));
  check('a common parameter is refused', throws(() => actions.createControlTemplate(doc, { controlId: 'op.acc.1', name: 'X', values: { 'P-04': ['admin'] } }), /ajuste común/));
  check('a control with only common settings has no templates', throws(() => actions.createControlTemplate(doc, { controlId: 'op.exp.9', name: 'X', values: {} }), /solo tiene ajustes comunes/));

  const duplicated = actions.duplicateControlTemplate(created.configuration, 'op.acc.1', 'linux-ubuntu');
  check('duplicate a built-in: all its values under «… (copia)»', duplicated.template.name === 'Linux (copia)' && duplicated.template.values['P-10'] === 1000 && (duplicated.template.values['P-03'] as string[]).includes('root'));
  const again = actions.duplicateControlTemplate(duplicated.configuration, 'op.acc.1', 'linux-ubuntu');
  check('a second copy gets another name', again.template.name === 'Linux (copia 2)', again.template.name);

  const updated = actions.updateControlTemplate(created.configuration, 'custom-servidores-web', { name: 'Web', values: { 'P-10': 600 }, description: 'Front' });
  check('edit: name, description and values', JSON.stringify(updated.templates![0]) === JSON.stringify({ id: 'custom-servidores-web', controlId: 'op.acc.1', name: 'Web', description: 'Front', systemType: 'linux', values: { 'P-10': 600 } }), updated.templates);
  check('built-ins are not edited: they are duplicated', throws(() => actions.updateControlTemplate(updated, 'linux-ubuntu', { name: 'x' }), /se duplican/));

  check('a custom template cannot take a built-in name of its control', throws(() => actions.createControlTemplate(doc, { controlId: 'op.acc.1', name: 'linux', values: {} }), /Ya hay una plantilla/));
  const future: any = JSON.parse(JSON.stringify(created.configuration));
  future.templates[0].futureKey = { kept: true };
  check('editing keeps keys a later version stored in the template', JSON.stringify((actions.updateControlTemplate(future, 'custom-servidores-web', { name: 'Otra' }).templates![0] as any).futureKey) === '{"kept":true}');
  const emptyCopy = actions.duplicateControlTemplate(doc, 'op.acc.2', 'windows-server');
  check('duplicating an empty built-in does not copy «Sin valores de serie…»', emptyCopy.template.name === 'Windows (copia)' && !/Sin valores de serie/.test(emptyCopy.template.description || ''), emptyCopy.template);
  const assigned = actions.setControlTemplateAssignment(updated, 'op.acc.1', ['101'], 'custom-servidores-web');
  check('edits reach the agents that use it', value(assigned, 'op.acc.1', '101', 'P-10') === 600 && value(actions.updateControlTemplate(assigned, 'custom-servidores-web', { values: { 'P-10': 700 } }), 'op.acc.1', '101', 'P-10') === 700);
  check('usage lists the agents', JSON.stringify(actions.getTemplateUsage(assigned, 'op.acc.1', 'custom-servidores-web')) === '["101"]');
  check('delete in use without reassignment: refused, with who', throws(() => actions.deleteControlTemplate(assigned, 'custom-servidores-web'), /asignada a 1 agente\(s\) \(101\)/));
  const toType = actions.deleteControlTemplate(assigned, 'custom-servidores-web', {});
  check('delete reassigning to the type built-in', toType.templates!.length === 0 && toType.agents!['101'].controls?.['op.acc.1'] === undefined && value(toType, 'op.acc.1', '101', 'P-10') === 1000);
  const toNone = actions.deleteControlTemplate(assigned, 'custom-servidores-web', { templateId: ENS_NO_TEMPLATE });
  check('or to «no template»', toNone.agents!['101'].controls!['op.acc.1'].templateId === ENS_NO_TEMPLATE && value(toNone, 'op.acc.1', '101', 'P-10') === 2000);
  check('never to itself', throws(() => actions.deleteControlTemplate(assigned, 'custom-servidores-web', { templateId: 'custom-servidores-web' }), /que se borra/));
  check('an unused one goes directly; built-ins never', actions.deleteControlTemplate(updated, 'custom-servidores-web').templates!.length === 0 && throws(() => actions.deleteControlTemplate(updated, 'zimbra-ldap'), /no se borran/));
}

console.log('2. Assignment and overrides');
{
  const doc = base({ agents: { '101': { detectedType: 'linux', controls: { 'op.acc.1': { parameters: { 'P-11': ['wheel'] } } } }, '103': { detectedType: 'windows' } } });
  const bulk = actions.setControlTemplateAssignment(doc, 'op.acc.1', ['101', '103', '104'], 'zimbra-ldap', { '104': { id: '104', name: 'new01' } });
  check('bulk: every agent, in one control, overrides kept, new profiles named', ['101', '103', '104'].every(id => bulk.agents![id].controls!['op.acc.1'].templateId === 'zimbra-ldap') &&
    JSON.stringify(bulk.agents!['101'].controls!['op.acc.1'].parameters) === '{"P-11":["wheel"]}' && bulk.agents!['104'].name === 'new01' && !bulk.agents!['101'].controls!['op.acc.2']);
  check('the type is never refreshed implicitly', bulk.agents!['104'].detectedType === undefined);
  const back = actions.setControlTemplateAssignment(bulk, 'op.acc.1', ['101'], undefined);
  check('undefined removes the assignment (the type built-in applies again)', back.agents!['101'].controls!['op.acc.1'].templateId === undefined && value(back, 'op.acc.1', '101', 'P-01') === 'Local');
  check('an unknown template is refused', throws(() => actions.setControlTemplateAssignment(doc, 'op.acc.1', ['101'], 'nope'), /no existe/));
  check('a template of another control is refused', throws(() => actions.setControlTemplateAssignment(doc, 'op.acc.2', ['101'], 'manager-wazuh'), /no existe/));

  const preview = actions.previewControlAssignment(doc, 'op.acc.1', ['101', '103'], 'linux-ubuntu');
  const p101 = preview.previews.find(item => item.agentId === '101')!;
  const p103 = preview.previews.find(item => item.agentId === '103')!;
  check('preview: from and to', p101.from === '«Linux» (de serie, por su tipo)' && p101.to === '«Linux»' && p103.from === '«Windows» (de serie, por su tipo)', preview.previews);
  check('preview: nothing changes for 101, several for 103', p101.changes.length === 0 && p103.changes.includes('op.acc.1 P-10'), p103.changes);
  check('preview: own settings that keep winning, and the type warning', JSON.stringify(p101.ownWins) === '["op.acc.1 P-11"]' && /es para Linux y el agente es Windows/.test(p103.mismatch || ''));
  const emptied = actions.previewControlAssignment(doc, 'op.acc.1', ['101'], ENS_NO_TEMPLATE).previews[0];
  check('preview: a required value left empty', emptied.changes.includes('op.acc.1 P-10') && emptied.leftEmpty.length === 0 &&
    actions.previewControlAssignment(base({ agents: { '101': { detectedType: 'linux' } } }), 'op.acc.2', ['101'], ENS_NO_TEMPLATE).previews[0].leftEmpty.length > 0);

  const own = actions.setAgentParameterValue(doc, '101', 'op.acc.1', 'P-10', 4242);
  check('override stored', own.agents!['101'].controls!['op.acc.1'].parameters!['P-10'] === 4242);
  check('equal to what it inherits: not stored', !('P-10' in (actions.setAgentParameterValue(doc, '101', 'op.acc.1', 'P-10', 1000).agents!['101'].controls!['op.acc.1'].parameters || {})));
  check('empty: removed (never null)', !('P-11' in (actions.setAgentParameterValue(doc, '101', 'op.acc.1', 'P-11', []).agents!['101'].controls?.['op.acc.1']?.parameters || {})));
  check('a common parameter is refused', throws(() => actions.setAgentParameterValue(doc, '101', 'op.acc.1', 'P-04', ['x']), /ajuste común/));
  check('what saving would do', actions.describeAgentValueSave(doc, '101', 'op.acc.1', 'P-10', 1000) === 'igual' && actions.describeAgentValueSave(doc, '101', 'op.acc.1', 'P-10', 5) === 'propio' && actions.describeAgentValueSave(doc, '101', 'op.acc.1', 'P-10', undefined) === 'quitar');
  const withBoth = actions.setControlTemplateAssignment(own, 'op.acc.1', ['101'], 'zimbra-ldap');
  const cleared = actions.clearAgentControlOverrides(withBoth, '101', 'op.acc.1');
  check('clear overrides of a control: the assignment stays', JSON.stringify(cleared.agents!['101'].controls!['op.acc.1']) === '{"templateId":"zimbra-ldap"}', cleared.agents!['101']);
  check('and the whole entry goes when nothing is left', actions.clearAgentControlOverrides(own, '101', 'op.acc.1').agents!['101'].controls === undefined);
  check('every write marks the document 1.3.0', Array.isArray(own.templates));
}

console.log('3. Stored type');
{
  const linux = detectAgentSystem({ id: '101', os: { platform: 'ubuntu' } as any });
  const windows = detectAgentSystem({ id: '103', os: { platform: 'windows' } as any });
  const doc = base({ agents: { '101': { detectedType: 'linux' } } });
  const entries = [{ agentId: '101', detection: linux }, { agentId: '103', detection: windows }];
  check('pending: only types not stored yet', JSON.stringify(actions.pendingDetectedTypes(doc, entries).map(entry => entry.agentId)) === '["103"]');
  const manualDoc = base({ agents: { '103': { typeOverride: 'linux' } } });
  check('pending: an agent with a manual type is not asked to store the detected one', actions.pendingDetectedTypes(manualDoc, entries).map(entry => entry.agentId).join() === '101');
  const stored = actions.saveDetectedTypes(doc, actions.pendingDetectedTypes(doc, entries));
  check('saving stores the type and its evidence', stored.agents!['103'].detectedType === 'windows' && /windows/.test(stored.agents!['103'].detectedBy || ''));
  check('and with it the built-in of the type applies', value(doc, 'op.acc.1', '103', 'P-11') === undefined && JSON.stringify(value(stored, 'op.acc.1', '103', 'P-11')) === '["Administrators"]');
  const manual = actions.setAgentTypeOverride(stored, '101', 'zimbra-ldap');
  check('a manual type keeps the detected one and switches the built-in', manual.agents!['101'].typeOverride === 'zimbra-ldap' && manual.agents!['101'].detectedType === 'linux' && value(manual, 'op.acc.1', '101', 'P-01') === 'LDAP');
  const preview = actions.previewConfigurationChange(stored, manual, ['101']);
  check('the change is previewable', preview[0].changes.includes('op.acc.1 P-01'));
}

console.log('4. Actions on a 1.2.0 document keep its values');
{
  const doc = base({ agents: { '101': { detectedType: 'linux' }, '102': { detectedType: 'linux', templates: ['zimbra-ldap'] } } });
  delete doc.templates;
  const next = actions.setAgentAliases(doc, '101', ['web01']);
  const same = ['op.acc.1', 'op.acc.2', 'op.exp.7', 'mp.info.6'].every(controlId => ['101', '102'].every(agentId =>
    JSON.stringify(legacy.resolveControlConfigurationForAgent(doc, controlId, agentId)?.parameters.map((p: any) => p.value)) ===
    JSON.stringify(resolveControlConfigurationWithOrigins(next, controlId, agentId)?.configuration.parameters.map(p => p.value))));
  check('the document is converted first: no value changes for any agent', same && Array.isArray(next.templates) && next.agents!['102'].controls!['op.acc.1'].templateId === 'zimbra-ldap');
}

console.log('4b. Actions on an unconverted 1.2.0 document find its merged templates');
{
  const doc = base({ agents: { '101': { detectedType: 'linux', templates: ['windows-server', 'linux-ubuntu'] }, '102': { detectedType: 'linux' } } });
  delete doc.templates;
  const merged = 'migrated-op.acc.1-windows-server-linux-ubuntu';
  check('assign it to another agent', actions.setControlTemplateAssignment(doc, 'op.acc.1', ['102'], merged).agents!['102'].controls!['op.acc.1'].templateId === merged);
  check('duplicate it', actions.duplicateControlTemplate(doc, 'op.acc.1', merged).template.values['P-11'] !== undefined);
  check('delete it, reassigning its agent', actions.deleteControlTemplate(doc, merged, {}).agents!['101'].controls?.['op.acc.1']?.templateId === undefined);
  const twin: any = base({ templates: [{ id: 'custom-x', controlId: 'op.acc.1', name: 'X', values: {} }, { id: 'custom-x', controlId: 'op.acc.2', name: 'X', values: {} }] });
  check('a repeated id in another control survives a delete', JSON.stringify(actions.deleteControlTemplate(twin, 'custom-x').templates!.map((t: any) => t.controlId)) === '["op.acc.2"]');
}

console.log('5. Removals and missing controls');
{
  const doc = base({ agents: { '102': { controls: { 'op.acc.1': { templateId: 'linux-ubuntu', parameters: { 'P-99': 'x', 'P-07': ['a | b | c'] } }, 'op.nub.1': { parameters: { 'P-01': 'x' } } } }, srvWeb: { aliases: ['web'] } } });
  check('remove one orphan value, keep the rest', JSON.stringify(actions.removeAgentEntry(doc, '102', 'op.acc.1', 'P-99').agents!['102'].controls!['op.acc.1']) === '{"templateId":"linux-ubuntu","parameters":{"P-07":["a | b | c"]}}');
  check('remove an orphan control', !actions.removeAgentEntry(doc, '102', 'op.nub.1').agents!['102'].controls!['op.nub.1']);
  check('remove a profile saved by name', !actions.removeAgentEntry(doc, 'srvWeb').agents!.srvWeb);
  const lines = actions.describeAgentEntryRemoval(doc, '102');
  check('what is lost, line by line, with the assignment', lines.includes('op.acc.1: plantilla «Linux»') && lines.includes('op.acc.1 P-07: a | b | c') && lines.includes('op.nub.1 P-01: x'), lines);
  const added = actions.addMissingControls(doc, ['op.cont.2', 'op.acc.1']);
  check('add missing: exactly the seed block, nothing else touched', JSON.stringify(added.added) === '["op.cont.2"]' && JSON.stringify(added.configuration.controls.find((control: any) => control.controlId === 'op.cont.2')) === JSON.stringify(blocks['op.cont.2']) &&
    JSON.stringify(added.configuration.agents) === JSON.stringify(doc.agents));
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
