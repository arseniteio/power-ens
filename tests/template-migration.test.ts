/**
 * 1.2.0 -> 1.3.0: cross-control templates become per-control assignments, on load, written with the next save.
 *
 *   npx --yes tsx tests/template-migration.test.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import {
  planTemplateMigration,
  summarizeTemplateMigration,
} from '../common/ens/configuration/agents/template-migration';
import { ENS_NO_TEMPLATE } from '../common/agent-configuration';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import { validateAgentsConfiguration, validateCustomTemplates } from '../common/ens/configuration/agents/agent-configuration-validator';
import { validateENSConfigurationStructure as validate120 } from './fixtures/configuration-structure-validator-1.2.0';
import { checkAgentsConfigurationKeys as checkKeys120 } from './fixtures/agent-configuration-1.2.0';
import { createConfigurationHandlers } from '../server/lib/configuration-handlers';

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

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
  if (!ok) failures.push(name);
};

const CONFIG = `${__dirname}/../config`;
const blocks = readdirSync(CONFIG)
  .filter(file => file.endsWith('-control-block.json'))
  .map(file => JSON.parse(readFileSync(`${CONFIG}/${file}`, 'utf8')));

const legacyDocument = (): any => ({
  ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)),
  templates: undefined,
  controls: JSON.parse(JSON.stringify(blocks)),
  agents: {
    '000': { name: 'mgr', detectedType: 'manager', templates: ['manager-wazuh'] },
    '024': {
      name: 'web01',
      aliases: ['web01.example.com'],
      detectedType: 'linux',
      detectedBy: 'os.platform = ubuntu',
      templates: ['linux-ubuntu', 'pbs-backup'],
      controls: { 'op.acc.1': { parameters: { 'P-07': ['ana | web01 | admin'], 'P-11': ['wheel'] } } },
    },
    '028': { typeOverride: 'zimbra-ldap', detectedType: 'linux', templates: ['zimbra-ldap', 'ghost'] },
    '030': { detectedType: 'linux', controls: { 'op.exp.2': { parameters: { 'P-03': ['x | y'] } } } },
    '031': { detectedType: 'linux', templates: ['windows-server', 'linux-ubuntu'] },
    '040': { name: 'no type, no templates' },
  },
});

console.log('1. Conversion');
const before = legacyDocument();
const snapshot = JSON.stringify(before);
const plan = planTemplateMigration(before);
const after: any = plan.configuration;
{
  check('the input is not modified', JSON.stringify(before) === snapshot);
  check('changed, and the document is marked 1.3.0', plan.changed && Array.isArray(after.templates));
  check('no profile keeps a 1.2.0 template list', Object.values(after.agents).every((profile: any) => !('templates' in profile)));
  check('Linux applied: assigned in every control where it has values',
    ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4', 'op.acc.6', 'op.exp.2', 'op.exp.3', 'op.exp.4', 'op.exp.6', 'op.exp.8', 'op.exp.10']
      .every(controlId => after.agents['024'].controls[controlId]?.templateId === 'linux-ubuntu'), after.agents['024'].controls);
  check('the PBS add-on: assigned in mp.info.6', after.agents['024'].controls['mp.info.6'].templateId === 'pbs-backup');
  check('nothing assigned where 1.2.0 had nothing and the type built-in is empty', !after.agents['024'].controls['op.exp.1']);
  check('overrides kept next to the assignment', JSON.stringify(after.agents['024'].controls['op.acc.1'].parameters) === JSON.stringify(before.agents['024'].controls['op.acc.1'].parameters));
  check('identity kept: name, aliases, detected type and its evidence',
    after.agents['024'].name === 'web01' && after.agents['024'].aliases[0] === 'web01.example.com' && after.agents['024'].detectedBy === 'os.platform = ubuntu');
  check('manager: Manager Wazuh in op.exp.8', after.agents['000'].controls['op.exp.8'].templateId === 'manager-wazuh');
  check('an unknown 1.2.0 template is dropped and reported (it was never applied)', JSON.stringify(plan.dropped) === JSON.stringify([{ agentId: '028', templateId: 'ghost' }]));
  check('a typed agent without templates: «none» where its built-in would now change values',
    after.agents['030'].controls['op.acc.1'].templateId === ENS_NO_TEMPLATE && after.agents['030'].controls['op.exp.2'].templateId === ENS_NO_TEMPLATE &&
      JSON.stringify(after.agents['030'].controls['op.exp.2'].parameters) === '{"P-03":["x | y"]}' && !after.agents['030'].controls['op.exp.1']);
  const merged = after.templates.find((template: any) => template.id === 'migrated-op.acc.1-windows-server-linux-ubuntu');
  check('two templates that both gave values in a control: merged first-wins into a custom template',
    after.agents['031'].controls['op.acc.1'].templateId === merged?.id && JSON.stringify(merged.values['P-11']) === '["Administrators"]' && merged.values['P-10'] === 1000 && /Windows \+ Linux/.test(merged.name), merged);
  check('where only one of them gave values, that one', after.agents['031'].controls['op.exp.2'].templateId === 'linux-ubuntu');
  check('an agent with nothing to convert is left as it was', JSON.stringify(after.agents['040']) === JSON.stringify(before.agents['040']));
  check('the plan reads', /asignaci/.test(summarizeTemplateMigration(plan)) && /plantilla\(s\) propia/.test(summarizeTemplateMigration(plan)) && /desconocida/.test(summarizeTemplateMigration(plan)), summarizeTemplateMigration(plan));
  check('the result is valid: structure, agents and custom templates',
    validateENSConfigurationStructure(after).valid && validateAgentsConfiguration(after).filter(issue => issue.severity === 'error').length === 0 && validateCustomTemplates(after).length === 0,
    [validateAgentsConfiguration(after), validateCustomTemplates(after)]);
}

console.log('2. Idempotent and mixed documents');
{
  const again = planTemplateMigration(after);
  check('a second pass changes nothing and returns the same object', !again.changed && again.configuration === after);
  const noAgents: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
  const plain = planTemplateMigration(noAgents);
  check('a document without agents: nothing to tell, only the 1.3.0 mark', !plain.changed && Array.isArray(plain.configuration.templates) && plain.configuration.controls === noAgents.controls);
  const rolledBack: any = JSON.parse(JSON.stringify(after));
  rolledBack.agents['040'].templates = ['linux-ubuntu'];
  rolledBack.agents['050'] = { detectedType: 'linux' };
  const mixed = planTemplateMigration(rolledBack);
  check('a 1.3.0 document where 1.2.0 applied a template again: only that profile is converted',
    mixed.changed && mixed.configuration.agents!['040'].controls!['op.acc.1'].templateId === 'linux-ubuntu' &&
      JSON.stringify(mixed.configuration.agents!['050']) === '{"detectedType":"linux"}' && JSON.stringify(mixed.configuration.agents!['024']) === JSON.stringify(after.agents['024']));
  const kept: any = JSON.parse(JSON.stringify(before));
  kept.agents['024'].controls['op.acc.2'] = { templateId: 'zimbra-ldap' };
  check('an assignment already present is never overwritten', planTemplateMigration(kept).configuration.agents!['024'].controls!['op.acc.2'].templateId === 'zimbra-ldap');
}

console.log('3. A 1.2.0 plugin reading the 1.3.0 document');
{
  check('the frozen 1.2.0 structure validator accepts it', validate120(after).valid, validate120(after).errors);
  const keys = checkKeys120(after.agents);
  check('the 1.2.0 save checks give no error, only «unknown key» warnings', keys.errors.length === 0 && keys.warnings.every(warning => /templateId/.test(warning)), keys);
  check('and the common values it reads are untouched', JSON.stringify(after.controls) === JSON.stringify(before.controls));
}

console.log('4. On load, written with the next save');
(async () => {
  const saved: any[] = [];
  let stored: any = { configuration: legacyDocument(), metadata: null };
  const http = {
    get: async () => ({ statusCode: 200, error: 0, data: stored }),
    put: async (_url: string, options: any) => {
      const body = JSON.parse(options.body);
      saved.push(body);
      stored = { configuration: body.configuration, metadata: null };
      return { statusCode: 200, error: 0, data: stored };
    },
  };
  const client = require('../common/ens/configuration/services/configuration-http-client');
  client.setENSConfigurationHttp(() => http);
  const service = require('../common/ens/configuration/services/configuration-state-service');
  await service.hydrateENSConfiguration(true);
  const active = service.getActiveENSConfiguration();
  check('the hydrated document is the converted one', Array.isArray(active.templates) && active.agents['024'].controls['op.acc.1'].templateId === 'linux-ubuntu' && !active.agents['024'].templates);
  check('nothing written on load', saved.length === 0);
  check('the plan waits to be written', service.getPendingTemplateMigration()?.assignments.length === plan.assignments.length);
  await service.updateActiveGlobalConfiguration({ ...active.global, ensLevel: 'ALTO' });
  check('the first save also records the conversion in its reason', /Configuración global ENS actualizada\. Conversión de la configuración 1\.2\.0: /.test(saved[0]?.changeReason || ''), saved[0]?.changeReason);
  check('any save writes the converted document', saved.length === 1 && Array.isArray(saved[0].configuration.templates) && !saved[0].configuration.agents['024'].templates && saved[0].configuration.global.ensLevel === 'ALTO');
  check('and the plan is no longer pending', service.getPendingTemplateMigration() === undefined);

  // The server keeps the previous (1.2.0) version in the history.
  const docs = new Map<string, any>();
  const index = {
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }) },
    search: async (request: any) => {
      const ids = request.body?.query?.ids?.values;
      const type = request.body?.query?.term?.documentType;
      const hits = [...docs.entries()]
        .filter(([id, doc]) => (ids ? ids.includes(id) : doc.documentType === type))
        .map(([, doc]) => ({ _source: doc }))
        .sort((a, b) => String(b._source.createdAt || '').localeCompare(String(a._source.createdAt || '')))
        .slice(0, request.body?.size || 10);
      return { body: { hits: { hits } } };
    },
    bulk: async (request: any) => {
      const lines = String(request.body).split('\n').filter(Boolean).map(line => JSON.parse(line));
      for (let i = 0; i < lines.length; i += 2) docs.set((lines[i].create || lines[i].index)._id, lines[i + 1]);
      return { body: { errors: false } };
    },
  };
  docs.set('active', { documentType: 'ACTIVE_CONFIGURATION', configuration: legacyDocument(), updatedAt: '2026-10-18T09:00:00.000Z', updatedBy: 'admin' });
  const user = { transport: { request: async () => ({ body: { user_name: 'rsis', roles: ['ensfacil_admin'] } }) } };
  const context = { core: { opensearch: { client: { asInternalUser: index, asCurrentUser: user } } } };
  const responses = { ok: (r: any) => ({ status: 200, body: r.body }), customError: (r: any) => ({ status: r.statusCode, body: r.body }) };
  const logger = { info: () => undefined, error: () => undefined, warn: () => undefined, debug: () => undefined };
  const handlers = createConfigurationHandlers({ logger: logger as any, securityEnabled: true });
  const result: any = await handlers.save(context as any, { body: { configuration: after, changeReason: summarizeTemplateMigration(plan) } } as any, responses as any);
  const history = [...docs.values()].filter(doc => doc.documentType === 'CONFIGURATION_HISTORY');
  check('the server saves the converted document', result.status === 200 && Array.isArray(docs.get('active').configuration.templates), result);
  const badTemplates: any = await handlers.save(context as any, { body: { configuration: { ...after, templates: [{ id: 'x', controlId: 'op.acc.1', name: 'X', values: { 'P-10': null } }] } } } as any, responses as any);
  check('the server refuses a template with a null value, saying where', badTemplates.status === 400 && /templates\[0\]\.values\.P-10/.test(badTemplates.body.message), badTemplates);
  const withTemplate = { ...after, templates: [{ id: 'custom-web', controlId: 'op.acc.1', name: 'Web', values: { 'P-10': 500 } }] };
  await handlers.save(context as any, { body: { configuration: withTemplate } } as any, responses as any);
  const withoutKey: any = { ...withTemplate };
  delete withoutKey.templates;
  await handlers.save(context as any, { body: { configuration: withoutKey } } as any, responses as any);
  check('a body without the templates key keeps the stored ones', JSON.stringify(docs.get('active').configuration.templates) === JSON.stringify(withTemplate.templates), docs.get('active').configuration.templates);
  check('and keeps the 1.2.0 version in the history', history.some(doc => doc.configuration?.agents?.['024']?.templates?.join() === 'linux-ubuntu,pbs-backup'), history.length);

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
