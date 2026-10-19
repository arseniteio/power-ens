/**
 * Configuración (1.3.0): tabs «Controles», «Agentes» and «General», the deep links and what their buttons save.
 *
 *   npx --yes tsx tests/configuration-screen.test.ts
 *
 * The screen is rendered with a fake React that keeps hook state between renders, fake EUI and fake HTTP and
 * dashboard search, so real buttons are pressed and the saved document is checked.
 */
import { readFileSync, readdirSync } from 'fs';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

// --- fake React with real hooks, fake EUI and router -------------------------
const ELEMENT = Symbol('element');
const states = new Map<string, any[]>();
const effectsDone = new Map<string, string>();
let pending: Array<() => void> = [];
let path = '';
let index = 0;
const slot = (initial: () => any) => {
  const key = path;
  let list = states.get(key);
  if (!list) { list = []; states.set(key, list); }
  const i = index++;
  if (!(i in list)) list[i] = initial();
  return { list, i };
};
const reactStub: any = {
  createElement: (type: any, props: any, ...children: any[]) => ({
    [ELEMENT]: true,
    type,
    props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
  }),
  Fragment: 'Fragment',
  Suspense: 'Suspense',
  lazy: (factory: any) => factory,
  useState: (initial: any) => {
    const { list, i } = slot(() => (typeof initial === 'function' ? initial() : initial));
    return [list[i], (value: any) => { list[i] = typeof value === 'function' ? value(list[i]) : value; }];
  },
  useRef: (initial: any) => slot(() => ({ current: initial ?? null })).list[index - 1],
  useMemo: (factory: any) => factory(),
  useCallback: (callback: any) => callback,
  useEffect: (effect: any, deps?: any[]) => {
    const key = `${path}#${index++}`;
    const signature = deps === undefined ? String(Math.random()) : JSON.stringify(deps);
    if (effectsDone.get(key) !== signature) {
      effectsDone.set(key, signature);
      pending.push(effect);
    }
  },
};
reactStub.default = reactStub;
const euiStub = new Proxy({}, {
  get: (_target, name) => {
    if (name === '__esModule') return false;
    const component = (props: any) => ({ [ELEMENT]: true, type: `eui:${String(name)}`, props });
    Object.defineProperty(component, 'name', { value: String(name) });
    (component as any).eui = String(name);
    return component;
  },
});

let search = '';
const saved: { configuration: any; changeReason?: string }[] = [];
let fakeInventory: any = { agentes: { buckets: [] } };
let fakeFacts: any = { agentes: { buckets: [] } };
const SERVICES = `${__dirname}/../public/services.ts`;
const RUNTIME = `${__dirname}/../common/ens/core/scope/runtime.ts`;
let emptyScope = false;
const fakeHttp = {
  get: async () => ({ statusCode: 200, error: 0, data: { configuration: null, metadata: null } }),
  put: async (_url: string, options: any) => {
    const body = JSON.parse(options.body);
    saved.push(body);
    return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: null } };
  },
};
{
  const Module = require('module');
  const nodePath = require('path');
  const load = Module._load;
  Module._load = function (request: string, parent: any, ...rest: unknown[]) {
    if (/kibana-services$/.test(request)) return {};
    if (request === 'react') return reactStub;
    if (request === '@elastic/eui') return euiStub;
    if (request === 'react-router-dom') {
      return {
        useLocation: () => ({ search }),
        useHistory: () => ({ push: (location: any) => { search = location.search; } }),
      };
    }
    let resolved = '';
    try { resolved = Module._resolveFilename(request, parent); } catch (error) { resolved = ''; }
    if (resolved && nodePath.resolve(resolved) === nodePath.resolve(RUNTIME)) {
      const real = load.call(this, request, parent, ...rest);
      return { ...real, getActiveENSScopeAgents: () => (emptyScope ? [] : real.getActiveENSScopeAgents()) };
    }
    if (resolved && nodePath.resolve(resolved) === nodePath.resolve(SERVICES)) {
      return {
        getHttp: () => fakeHttp,
        getData: () => ({
          search: {
            search: (request: any) => ({
              toPromise: async () => ({
                rawResponse: { aggregations: /monitoring/.test(request.params.index) ? fakeInventory : fakeFacts },
              }),
            }),
          },
        }),
        getCore: () => ({ notifications: { toasts: { addWarning: () => undefined } } }),
      };
    }
    return load.call(this, request, parent, ...rest);
  };
}

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  if (!ok) failures.push(name);
};

// --- rendering -----------------------------------------------------------------
interface RenderedNode { type: string; props: any; path: string; text: string }
let nodes: RenderedNode[] = [];

const textOf = (node: any): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node[ELEMENT]) return '';
  return textOf(node.props?.children);
};

const paint = (node: any, where: string, out: string[]): void => {
  if (node === null || node === undefined || typeof node === 'boolean') return;
  if (Array.isArray(node)) { node.forEach((child, i) => paint(child, `${where}.${child?.props?.key ?? child?.key ?? i}`, out)); return; }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return; }
  if (!node[ELEMENT]) return;
  const { type, props } = node;
  if (typeof type === 'function' && !(type as any).eui) {
    const here = `${where}/${type.name || 'C'}${props?.key !== undefined ? `:${props.key}` : ''}`;
    const before = [path, index] as const;
    path = here; index = 0;
    const child = type(props);
    path = before[0]; index = before[1];
    nodes.push({ type: type.name, props, path: here, text: '' });
    paint(child, here, out);
    return;
  }
  if (typeof type === 'function') { paint(type(props), where, out); return; }
  const name = String(type).replace(/^eui:/, '');
  nodes.push({ type: name, props, path: where, text: textOf(props?.children).replace(/\s+/g, ' ').trim() });
  if (name === 'EuiBasicTable') {
    (props.items || []).forEach((item: any) => (props.columns || []).forEach((column: any) => paint(column.render ? column.render(item[column.field], item) : item[column.field], `${where}.${item.id}`, out)));
  }
  if (name === 'EuiDescriptionList') {
    (props.listItems || []).forEach((item: any) => out.push(`${item.title}: ${item.description}`));
  }
  const mark = ['EuiButton', 'EuiButtonEmpty', 'EuiTab'].includes(name);
  if (mark) out.push('[');
  Object.entries(props || {}).forEach(([key, value]: [string, any]) => {
    if (key === 'children') return;
    if (['title', 'helpText', 'label', 'noItemsMessage', 'buttonContent'].includes(key) && typeof value === 'string') out.push(value);
    if (value && (value[ELEMENT] || Array.isArray(value))) paint(value, `${where}.${key}`, out);
  });
  paint(props?.children, `${where}.c`, out);
  if (mark) out.push(']');
};

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

let screen = '';
const render = async (root: any, rounds = 4): Promise<string> => {
  for (let round = 0; round < rounds; round += 1) {
    nodes = [];
    const out: string[] = [];
    path = ''; index = 0;
    paint(reactStub.createElement(root, null), 'root', out);
    screen = out.join(' ').replace(/\s+/g, ' ');
    const effects = pending;
    pending = [];
    effects.forEach(effect => effect());
    await tick();
    await tick();
  }
  return screen;
};

const button = (text: RegExp) =>
  nodes.find(node => (node.type === 'EuiButton' || node.type === 'EuiButtonEmpty') && text.test(node.text));
const press = async (root: any, text: RegExp) => {
  const found = button(text);
  if (!found) throw new Error(`no button ${text}`);
  await found.props.onClick();
  await tick();
  return render(root);
};
const confirmModal = () => nodes.find(node => node.type === 'EuiConfirmModal');
const typeWord = async (root: any, word: string) => {
  nodes.find(node => node.type === 'EuiFieldText' && new RegExp(word).test(node.props['aria-label'] || ''))!.props.onChange({ target: { value: word } });
  await render(root, 1);
};
const lastSaved = () => saved[saved.length - 1];

const { buildConfigurationSearch, parseConfigurationTarget, configurationSearchChanges, detailConfigurationTarget } =
  require('../public/routing/configuration-link') as typeof import('../public/routing/configuration-link');
const { parseRouterSearch } = require('../public/routing/router-search') as typeof import('../public/routing/router-search');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository') as typeof import('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration') as typeof import('../common/ens/configuration/data/default-configuration');
const { hydrateENSScope } = require('../common/ens/core/scope/runtime') as typeof import('../common/ens/core/scope/runtime');
const httpClient = require('../common/ens/configuration/services/configuration-http-client');
httpClient.setENSConfigurationHttp(() => fakeHttp as any);
const stateService = require('../common/ens/configuration/services/configuration-state-service');
const { ConfigurationShell } = require('../public/ens/configuration/components/configuration-shell') as typeof import('../public/ens/configuration/components/configuration-shell');

const CONFIG = `${__dirname}/../config`;
const blocks: Record<string, any> = {};
readdirSync(CONFIG).filter(file => file.endsWith('-control-block.json')).forEach(file => {
  const block = JSON.parse(readFileSync(`${CONFIG}/${file}`, 'utf8'));
  blocks[block.controlId] = block;
});
const SEEDED = ['mp.info.6', 'op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4', 'op.acc.5', 'op.acc.6', 'op.exp.1', 'op.exp.2', 'op.exp.3', 'op.exp.4', 'op.exp.5', 'op.exp.6', 'op.exp.7', 'op.exp.8', 'op.exp.9', 'op.exp.10'];
const documentWith = (extra: any = {}): any => ({
  ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)),
  templates: [],
  controls: SEEDED.map(id => {
    const block = JSON.parse(JSON.stringify(blocks[id]));
    if (id === 'op.acc.1') {
      block.parameters.find((p: any) => p.id === 'P-07').value = ['ana | web01 | admin', 'svc | dir01.example.com | servicio'];
      block.parameters.find((p: any) => p.id === 'P-01').value = 'Local';
      block.parameters.find((p: any) => p.id === 'P-10').value = 2000;
    }
    if (id === 'op.exp.7') block.parameters.find((p: any) => p.id === 'P-07').value = ['srv-x | nóminas'];
    return block;
  }),
  ...extra,
});
const AGENTS = [
  { id: '101', name: 'web01', groups: ['ens'], status: 'active', os: { platform: 'ubuntu', uname: 'Linux |web01 |6.8 |x86_64' } },
  { id: '102', name: 'dirHost', groups: ['ens'], status: 'active', os: { platform: 'ubuntu', uname: 'Linux |dir01.example.com |6.8 |x86_64' } },
  { id: '103', name: 'win01', groups: ['ens'], status: 'active', os: { platform: 'windows' } },
];
const bucket = (agent: any) => ({ key: agent.id, ultimo: { hits: { hits: [{ _source: { ...agent, group: agent.groups, timestamp: new Date().toISOString(), manager: 'mgr-01' } }] } } });
const prepare = async (doc: any, agents = AGENTS) => {
  ensConfigurationRepository.completeHydration(doc);
  states.clear(); effectsDone.clear(); pending = []; saved.length = 0;
  fakeInventory = { agentes: { buckets: agents.map(bucket) } };
  fakeFacts = { agentes: { buckets: [{ key: '102', planos: { buckets: [{ key: 'directorio', doc_count: 50 }] }, copias: { origenes: { buckets: [{ key: 'pbs', doc_count: 3 }] } } }] } };
  await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => agents as any, true);
};

(async () => {
  console.log('1. Links');
  {
    const built = buildConfigurationSearch({ controlId: 'op.acc.1', agentId: '024', parameterId: 'P-07' }, '?tabView=plugins&control=op.acc.1&agentId=024');
    const params = parseRouterSearch(built);
    check('opens Configuración on the agent, control and parameter', params.tabView === 'configuration' && params.configAgent === '024' && params.configControl === 'op.acc.1' && params.configParam === 'P-07', built);
    check('keeps the chosen machine and drops the detail control', params.agentId === '024' && params.control === undefined, built);
    check('with an agent: Agentes', parseConfigurationTarget(params).view === 'agents');
    check('without one: Controles', parseConfigurationTarget({ configControl: 'op.acc.1' }).view === 'controls');
    check('the Agentes list and General by configView; a 1.2.0 «sistemas» link still opens Agentes',
      parseConfigurationTarget({ configView: 'agentes' }).view === 'agents' && parseConfigurationTarget({ configView: 'general' }).view === 'general' && parseConfigurationTarget({ configView: 'sistemas' }).view === 'agents');
    check('back to the Agentes list clears agent, control and parameter', JSON.stringify(configurationSearchChanges({ view: 'agents' })) === JSON.stringify({ tabView: 'configuration', configView: 'agentes' }));
    check('from the detail: agent page when the control has agent-level parameters', detailConfigurationTarget({ controlId: 'op.acc.1', agentId: '101', hasAgentLevelParameters: true }).view === 'agents' &&
      detailConfigurationTarget({ controlId: 'op.exp.9', agentId: '101', hasAgentLevelParameters: false }).view === 'controls');
  }

  console.log('2. Controles');
  {
    await prepare(documentWith());
    search = '?tabView=configuration';
    let page = await render(ConfigurationShell);
    check('three tabs', /\[ Controles \]/.test(page) && /\[ Agentes \]/.test(page) && /\[ General \]/.test(page), page.slice(0, 300));
    const table = nodes.find(node => node.type === 'EuiBasicTable');
    check('the 23 controls, with state; the 6 not added offer «Añadir con valores por defecto»', table?.props.items.length === 23 &&
      nodes.filter(node => node.type === 'EuiButton' && /^Añadir con valores por defecto$/.test(node.text)).length === 6 && /Sin añadir/.test(page) && /Incompleto|Sin configurar|Configurado/.test(page));
    check('control row: built-in and custom templates', /3 de serie · 0 propia\(s\)/.test(page) && /Solo ajustes comunes/.test(page), page.slice(0, 2000));
    check('a control is not green while agents miss a required value: names and counts them', /mp\.info\.6 · Copias de seguridad \] Incompleto Falta «Frecuencia máxima entre copias» en 2 agentes\./.test(page), page.slice(0, 900));
    check('no internal codes in the header', /Estado de la configuración: Borrador/.test(page) && !/DRAFT/.test(page));
    page = await press(ConfigurationShell, /^Añadir con valores por defecto$/);
    check('«Añadir con valores por defecto» saves the control with its reason', saved.length === 1 && lastSaved().configuration.controls.some((control: any) => control.controlId === 'mp.info.6' || control.controlId === 'op.cont.2') && /Alta de/.test(lastSaved().changeReason || ''), saved.map(item => item.changeReason));

    search = '?tabView=configuration&configControl=op.zzz.9';
    page = await render(ConfigurationShell);
    check('a control unknown to the catalog: says so', /no es ningún control del catálogo/.test(page));

    // The control page: common settings, templates and assignment.
    await prepare(documentWith({
      templates: [{ id: 'custom-web', controlId: 'op.acc.1', name: 'Web', values: { 'P-10': 500 } }],
      agents: { '101': { detectedType: 'linux', controls: { 'op.acc.1': { templateId: 'custom-web' } } }, '102': { detectedType: 'zimbra-ldap' } },
    }));
    search = '?tabView=configuration&configControl=op.acc.1&configParam=P-07';
    page = await render(ConfigurationShell);
    check('control page from the URL: «Ajustes comunes», «Plantillas», «Asignación»', /Ajustes comunes/.test(page) && /Plantillas/.test(page) && /Asignación/.test(page) && /Valor común de los parámetros que cambian por agente/.test(page), page.slice(0, 600));
    check('templates with «De serie» and «Propia» badges', /Linux De serie/.test(page) && /Web Propia/.test(page), page.slice(page.indexOf('Plantillas'), page.indexOf('Plantillas') + 800));
    check('assignment table: agent | type | template | own settings', /101 · web01/.test(page) && /Web/.test(page) && /Servidor LDAP \(de serie, por su tipo\)/.test(page) && /Windows \(detectado, sin guardar\)/.test(page) && /Ninguna hasta guardar su tipo: valores comunes/.test(page), page.slice(page.indexOf('Asignación'), page.indexOf('Asignación') + 1500));

    // Duplicate a built-in.
    nodes.filter(node => node.type === 'EuiButtonEmpty' && node.text === 'Duplicar')[0].props.onClick();
    await tick(); await tick();
    page = await render(ConfigurationShell);
    check('«Duplicar» a built-in saves a custom copy with all its values', saved.length === 1 &&
      lastSaved().configuration.templates.some((template: any) => template.name === 'Linux (copia)' && template.values['P-10'] === 1000 && template.controlId === 'op.acc.1'), lastSaved()?.configuration?.templates);

    // Edit the custom template through its editor.
    await prepare(documentWith({
      templates: [{ id: 'custom-web', controlId: 'op.acc.1', name: 'Web', values: { 'P-10': 500 } }],
      agents: { '101': { detectedType: 'linux', controls: { 'op.acc.1': { templateId: 'custom-web' } } } },
    }));
    page = await render(ConfigurationShell);
    page = await press(ConfigurationShell, /^Editar$/);
    const editor = nodes.find(node => node.type === 'TemplateEditorModal');
    check('the editor says who uses the template', !!editor && /Asignada a 1 agente\(s\): 101/.test(page));
    const failure = await editor!.props.onSave({ name: 'Web', values: { 'P-10': 'mil' } });
    check('an invalid value is refused with its reason and nothing is saved', /P-10/.test(failure || '') && saved.length === 0, failure);
    await editor!.props.onSave({ name: 'Web servers', values: { 'P-10': 600, 'P-11': ['wheel'] } });
    page = await render(ConfigurationShell);
    check('editing a template in use previews the agents it changes and saves nothing yet', saved.length === 0 && /Agente 101 · web01/.test(page) && /op\.acc\.1 «UID mínimo de cuenta de persona»/.test(page), page.slice(page.indexOf('Guardar «'), page.indexOf('Guardar «') + 500));
    await confirmModal()!.props.onConfirm();
    page = await render(ConfigurationShell);
    check('«Guardar plantilla» saves the edited values', saved.length === 1 && JSON.stringify(lastSaved().configuration.templates[0]) === JSON.stringify({ id: 'custom-web', controlId: 'op.acc.1', name: 'Web servers', values: { 'P-10': 600, 'P-11': ['wheel'] } }), lastSaved()?.configuration?.templates);

    // Delete a template in use: reassign first, typed confirmation.
    page = await press(ConfigurationShell, /^Borrar$/);
    check('deleting a template in use asks where its agents go', /Borrar la plantilla «Web servers»/.test(page) && /Está asignada a 1 agente ?: 101 · web01/.test(page) && /Reasignar sus agentes a/.test(page), page.slice(page.indexOf('Borrar la plantilla'), page.indexOf('Borrar la plantilla') + 400));
    await confirmModal()!.props.onConfirm();
    check('without typing «borrar» nothing is saved', saved.length === 1);
    nodes.find(node => node.type === 'EuiSelect' && node.props.options?.some((option: any) => option.text === 'La de serie de su tipo') && node.props.options?.some((option: any) => option.value === 'none') && !node.props['aria-label'])!.props.onChange({ target: { value: 'zimbra-ldap' } });
    await render(ConfigurationShell, 1);
    await typeWord(ConfigurationShell, 'borrar');
    await confirmModal()!.props.onConfirm();
    page = await render(ConfigurationShell);
    check('typed: the template is gone and 101 moves to the chosen one', saved.length === 2 && lastSaved().configuration.templates.length === 0 &&
      lastSaved().configuration.agents['101'].controls['op.acc.1'].templateId === 'zimbra-ldap', lastSaved()?.configuration?.agents);

    // Bulk assignment with a preview; a template for another type asks to type «aplicar».
    await prepare(documentWith({ agents: { '101': { detectedType: 'linux' }, '103': { detectedType: 'windows' } } }));
    search = '?tabView=configuration&configControl=op.acc.1';
    page = await render(ConfigurationShell);
    const picker = nodes.find(node => node.type === 'EuiSelect' && node.props['aria-label'] === 'Plantilla que se asigna');
    check('nothing chosen beforehand', picker?.props.value === '' && button(/^Asignar a 0 agente/)?.props.isDisabled === true);
    nodes.filter(node => node.type === 'EuiBasicTable').pop()!.props.selection.onSelectionChange([{ id: '101' }, { id: '103' }]);
    picker!.props.onChange({ target: { value: 'linux-ubuntu' } });
    await render(ConfigurationShell, 1);
    page = await press(ConfigurationShell, /^Asignar a 2 agente/);
    check('preview per agent: from, to, what changes and the type warning', /Agente 101/.test(page) && /Agente 103/.test(page) && /«Windows» \(de serie, por su tipo\) → «Linux»/.test(page) && /Tipo distinto: «Linux» es para Linux y el agente es Windows/.test(page),
      page.slice(page.indexOf('Asignar «'), page.indexOf('Asignar «') + 900));
    await confirmModal()!.props.onConfirm();
    check('with the warning, nothing saved before typing «aplicar»', saved.length === 0);
    await typeWord(ConfigurationShell, 'aplicar');
    await confirmModal()!.props.onConfirm();
    page = await render(ConfigurationShell);
    check('typed: both agents get the assignment in op.acc.1 only', saved.length === 1 &&
      ['101', '103'].every(id => lastSaved().configuration.agents[id].controls['op.acc.1'].templateId === 'linux-ubuntu') && !lastSaved().configuration.agents['101'].controls['op.acc.2'], lastSaved()?.configuration?.agents);
    check('the selection is cleared', /Asignar a 0 agente/.test(page));
  }

  console.log('3. Agentes');
  {
    await prepare(documentWith());
    search = '?tabView=configuration&configView=agentes';
    let page = await render(ConfigurationShell);
    check('detected type with its evidence, also from facts', /101 · web01/.test(page) && /detectado por el inventario de agentes \(Ubuntu\)/.test(page) && /Servidor LDAP/.test(page), page.slice(0, 800));
    check('detected types not stored yet are announced (the manager too)', /4 agente\(s\) con el tipo detectado sin guardar/.test(page), page.slice(0, 800));
    page = await press(ConfigurationShell, /^Guardar los tipos detectados…$/);
    check('saving them shows what changes first', saved.length === 0 && /Guardar el tipo detectado de 4 agente\(s\)/.test(page) && /Agente 101 · web01/.test(page) && /op\.acc\.1 «/.test(page) && !/P-10/.test(page.slice(page.indexOf('Guardar el tipo'))), page.slice(page.indexOf('Guardar el tipo'), page.indexOf('Guardar el tipo') + 600));
    await confirmModal()!.props.onConfirm();
    page = await render(ConfigurationShell);
    check('confirmed: detected types stored', saved.length === 1 && lastSaved().configuration.agents['101'].detectedType === 'linux' && lastSaved().configuration.agents['102'].detectedType === 'zimbra-ldap' && lastSaved().configuration.agents['103'].detectedType === 'windows', lastSaved()?.configuration?.agents);

    // Rows of the common value that name an agent: «Repartir por agentes» with typed confirmation.
    await prepare(documentWith());
    page = await render(ConfigurationShell);
    page = await press(ConfigurationShell, /^Repartir por agentes$/);
    check('the confirmation lists what moves, verdicts, 1.1.0 and history', !!confirmModal() && /Agente 101/.test(page) && /veredictos de estos agentes pueden cambiar/.test(page) && /1\.1\.0/.test(page) && /historial/.test(page));
    await confirmModal()!.props.onConfirm();
    check('without typing «repartir» nothing is saved', saved.length === 0);
    await typeWord(ConfigurationShell, 'repartir');
    await confirmModal()!.props.onConfirm();
    await render(ConfigurationShell);
    check('typed: rows saved as each agent\'s own settings', saved.length === 1 && /Reparto por agentes/.test(lastSaved().changeReason || '') && !!lastSaved().configuration.agents?.['101'], saved.map(item => item.changeReason));

    // Agent page: template per control, overrides with their level, clear, orphan, aliases.
    const withScopeList = (doc: any) => {
      doc.controls.find((control: any) => control.controlId === 'op.acc.1').parameters.find((p: any) => p.id === 'P-02').value = ['web01', 'dirHost'];
      return doc;
    };
    await prepare(withScopeList(documentWith({
      templates: [{ id: 'custom-web', controlId: 'op.acc.1', name: 'Web', values: { 'P-10': 500 } }],
      agents: {
        '102': {
          name: 'dirHost',
          detectedType: 'zimbra-ldap',
          controls: {
            'op.acc.1': { parameters: { 'P-07': ['svc | dir01.example.com | servicio'], 'P-99': 'orphan' } },
            'op.exp.7': { parameters: { 'P-07': ['dirHost | directorio'] } },
          },
        },
      },
    })));
    search = '?tabView=configuration&configAgent=102&configControl=op.acc.1&configParam=P-01';
    page = await render(ConfigurationShell);
    check('agent page: each value says its level', /102 · dirHost/.test(page) && /heredado de la plantilla de serie «Servidor LDAP» de su tipo/.test(page) && /ajuste propio de este agente/.test(page) && /heredado del valor común del control/.test(page), page.slice(0, 1500));
    const rowP01 = nodes.find(node => node.type === 'AgentParameterRow' && node.props.parameter.id === 'P-01' && node.props.parameter.controlId === 'op.acc.1');
    check('the requested parameter (and only it) opens for editing', !!rowP01 && nodes.filter(node => node.type === 'EuiButton' && /Guardar para este agente/.test(node.text)).length === 1);
    check('the orphan is listed with «Quitar»', /P-99: el valor no se aplica/.test(page) && !!button(/^Quitar$/));
    await press(ConfigurationShell, /^Quitar$/);
    check('«Quitar» removes the orphan and keeps the rest', saved.length === 1 && !('P-99' in lastSaved().configuration.agents['102'].controls['op.acc.1'].parameters) && JSON.stringify(lastSaved().configuration.agents['102'].controls['op.acc.1'].parameters['P-07']) === '["svc | dir01.example.com | servicio"]');

    const templateSelect = nodes.find(node => node.type === 'EuiSelect' && node.props.options?.some((option: any) => option.value === 'custom-web'));
    check('per control, the template select starts on «la de serie de su tipo»', templateSelect?.props.value === '__type' && templateSelect.props.options[0].text === 'La de serie de su tipo («Servidor LDAP»)', templateSelect?.props.options);
    templateSelect!.props.onChange({ target: { value: 'custom-web' } });
    await render(ConfigurationShell, 1);
    await nodes.find(node => node.type === 'EuiButton' && node.text === 'Asignar…' && !node.props.isDisabled)!.props.onClick();
    page = await render(ConfigurationShell);
    check('only the changed control can be assigned', nodes.filter(node => node.type === 'EuiButton' && node.text === 'Asignar…' && !node.props.isDisabled).length <= 1);
    check('assigning shows the change first', saved.length === 1 && /op\.acc\.1: plantilla «Web» para 102 · dirHost/.test(page) && /«Servidor LDAP» \(de serie, por su tipo\) → «Web»/.test(page), page.slice(page.indexOf('op.acc.1: plantilla'), page.indexOf('op.acc.1: plantilla') + 600));
    check('a required value left empty is shown and asks to type «aplicar»', /Se quedan sin valor parámetros obligatorios: op\.acc\.1 «/.test(page));
    await typeWord(ConfigurationShell, 'aplicar');
    await confirmModal()!.props.onConfirm();
    page = await render(ConfigurationShell);
    check('confirmed: the assignment is saved and overrides are kept', saved.length === 2 && lastSaved().configuration.agents['102'].controls['op.acc.1'].templateId === 'custom-web' &&
      JSON.stringify(lastSaved().configuration.agents['102'].controls['op.acc.1'].parameters) === '{"P-07":["svc | dir01.example.com | servicio"]}');

    page = await press(ConfigurationShell, /^Quitar ajuste propio/);
    check('«Quitar ajuste propio»: back to inheriting, the assignment stays', saved.length === 3 && !lastSaved().configuration.agents['102'].controls['op.acc.1'].parameters && lastSaved().configuration.agents['102'].controls['op.acc.1'].templateId === 'custom-web', lastSaved()?.configuration?.agents?.['102']);

    search = '?tabView=configuration&configAgent=102&configControl=op.exp.7';
    page = await render(ConfigurationShell);
    page = await press(ConfigurationShell, /^Quitar ajustes propios$/);
    check('«Quitar ajustes propios» of a control lists them first', /Quitar los ajustes propios de 102 · dirHost en op\.exp\.7/.test(page) && /op\.exp\.7 «[^»]+»: dirHost \| directorio/.test(page));
    await confirmModal()!.props.onConfirm();
    await render(ConfigurationShell);
    check('confirmed: the control has no own settings left', saved.length === 4 && !lastSaved().configuration.agents['102'].controls['op.exp.7']);

    const alias = nodes.find(node => node.type === 'EuiFieldText' && /dir01\.example\.com/.test(String(node.props.value || '')));
    check('other names start with the hostname', !!alias);

    // A contribution on a non-manager agent: its rows, and the common ones apart.
    await prepare(documentWith({ agents: { '102': { name: 'dirHost', controls: { 'op.exp.7': { parameters: { 'P-07': ['dirHost | directorio'] } } } } } }));
    search = '?tabView=configuration&configAgent=102&configControl=op.exp.7';
    page = await render(ConfigurationShell);
    const rowE7 = nodes.find(node => node.type === 'AgentParameterRow' && node.props.parameter.controlId === 'op.exp.7' && node.props.parameter.id === 'P-07');
    check('contribution: the editor starts from this agent\'s rows', !!rowE7 && JSON.stringify(rowE7.props.parameter.value) === '["dirHost | directorio"]' && rowE7.props.contributionOnly === true);
    check('and the common rows are shown apart, read-only', JSON.stringify(rowE7?.props.organisationRows) === '["srv-x | nóminas"]' && /Del valor común/.test(page));

    // An unsaved detected type is never shown as if it applied.
    await prepare(documentWith());
    search = '?tabView=configuration&configAgent=101&configControl=op.acc.1';
    page = await render(ConfigurationShell);
    const unsavedSelect = nodes.find(node => node.type === 'EuiSelect' && node.props.options?.some((option: any) => option.value === 'linux-ubuntu'));
    check('unsaved type: says so on the type, the template select and the control badge, with the button to save it',
      /Linux \(detectado, sin guardar\): la plantilla de serie de su tipo se aplica al guardar el tipo/.test(page) && unsavedSelect?.props.options[0].text === 'La de serie de su tipo (tipo sin guardar)' &&
        /tipo sin guardar: valores comunes/.test(page) && !!button(/^Guardar el tipo detectado \( ?Linux ?\)…$/), page.slice(0, 1200));
    search = '?tabView=configuration&configView=agentes';
    page = await render(ConfigurationShell);
    check('and the Agentes list shows the same label', /101 · web01 \] Linux \(detectado, sin guardar\)/.test(page), page.slice(0, 1200));

    // Counts leave out «Sin plantilla».
    await prepare(documentWith({ agents: { '101': { detectedType: 'linux', controls: { 'op.acc.1': { templateId: 'none' } } }, '102': { detectedType: 'zimbra-ldap', controls: { 'op.acc.1': { templateId: 'linux-ubuntu' } } } } }));
    search = '?tabView=configuration';
    page = await render(ConfigurationShell);
    check('«con plantilla asignada» does not count «Sin plantilla»', /op\.acc\.1 · [^\]]+\][^\[]*3 de serie · 0 propia\(s\) · 1 agente con plantilla asignada/.test(page), page.slice(page.indexOf('op.acc.1 ·'), page.indexOf('op.acc.1 ·') + 400));

    // Manual type: previewed when it changes values.
    await prepare(documentWith({ agents: { '101': { name: 'web01', detectedType: 'linux' } } }));
    search = '?tabView=configuration&configAgent=101';
    page = await render(ConfigurationShell);
    nodes.find(node => node.type === 'EuiSelect' && node.props.options?.some((option: any) => option.value === 'windows') && node.props.options?.[0].value === '')!.props.onChange({ target: { value: 'zimbra-ldap' } });
    page = await render(ConfigurationShell);
    check('a manual type that changes values is previewed, not saved', saved.length === 0 && /Cambiar el tipo de 101 · web01/.test(page) && /op\.acc\.1 «Fuente de identidad/.test(page));
    await confirmModal()!.props.onConfirm();
    await render(ConfigurationShell);
    check('confirmed: the manual type is stored, the detected one kept', saved.length === 1 && lastSaved().configuration.agents['101'].typeOverride === 'zimbra-ldap' && lastSaved().configuration.agents['101'].detectedType === 'linux');

    // A whole profile saved under a name: what is lost, and typed «quitar».
    await prepare(documentWith({ agents: { srvWeb: { aliases: ['web'], controls: { 'op.acc.1': { templateId: 'linux-ubuntu', parameters: { 'P-07': ['ana | srvWeb | admin'] } } } } } }));
    search = '?tabView=configuration&configView=agentes';
    page = await render(ConfigurationShell);
    page = await press(ConfigurationShell, /^Quitar$/);
    check('removing a whole profile shows what is lost', saved.length === 0 && /Quitar el perfil «srvWeb»/.test(page) && /op\.acc\.1 «[^»]+»: ana \| srvWeb \| admin/.test(page) && /op\.acc\.1: plantilla «Linux»/.test(page) && /Otros nombres: web/.test(page), page.slice(page.indexOf('Quitar el perfil'), page.indexOf('Quitar el perfil') + 400));
    await typeWord(ConfigurationShell, 'quitar');
    await confirmModal()!.props.onConfirm();
    await render(ConfigurationShell);
    check('typed: the profile leaves the document', saved.length === 1 && !lastSaved().configuration.agents?.srvWeb);

    // No agents, empty scope, out of scope, unknown id.
    await prepare(documentWith(), []);
    page = await render(ConfigurationShell);
    check('without agents: the empty table says so', /No hay agentes en el alcance\./.test(page));
    search = '?tabView=configuration&configControl=op.acc.1';
    page = await render(ConfigurationShell);
    check('and on a control page there is nothing to assign', /No hay agentes en el alcance\./.test(page) && button(/^Asignar a 0 agente/)?.props.isDisabled === true);
    search = '?tabView=configuration&configView=agentes';
    emptyScope = true;
    states.clear(); effectsDone.clear();
    page = await render(ConfigurationShell);
    emptyScope = false;
    check('empty scope: «Repartir por agentes» is not available', /no está disponible: el alcance ENS no tiene ningún agente/.test(page) && button(/^Repartir por agentes$/)?.props.isDisabled === true);
    await prepare(documentWith({ agents: { '777': { name: 'retired', controls: { 'op.acc.1': { parameters: { 'P-07': ['x | retired | y'] } } } } } }));
    page = await render(ConfigurationShell);
    check('a profile out of the scope is listed as such', /777 · retired/.test(page) && /fuera del alcance/.test(page));
    search = '?tabView=configuration&configAgent=999';
    page = await render(ConfigurationShell);
    check('an unknown id: says so', /No hay ningún agente 999/.test(page));
  }

  console.log('4. General');
  {
    await prepare(documentWith());
    search = '?tabView=configuration&configView=general';
    const page = await render(ConfigurationShell);
    check('ENS, T and D levels editable; the scope read-only', /Nivel ENS/.test(page) && /Nivel de Trazabilidad \(T\)/.test(page) && /Nivel de Disponibilidad \(D\)/.test(page) &&
      /Alcance ENS/.test(page) && /Solo lectura: se define en la configuración inicial/.test(page) && /Agentes evaluados: Todos los agentes del inventario/.test(page) && /Descripción del alcance \(informes\)/.test(page) && (page.match(/Alcance/g) || []).length === 1, page.slice(0, 2500));
  }

  console.log('5. A 1.2.0 document');
  {
    const legacy = documentWith({ agents: { '101': { name: 'web01', detectedType: 'linux', templates: ['linux-ubuntu', 'pbs-backup'] } } });
    delete legacy.templates;
    let stored: any = { configuration: legacy, metadata: null };
    fakeHttp.get = async () => ({ statusCode: 200, error: 0, data: stored });
    await stateService.hydrateENSConfiguration(true);
    states.clear(); effectsDone.clear(); pending = []; saved.length = 0;
    search = '?tabView=configuration';
    let page = await render(ConfigurationShell);
    check('the conversion is announced and not written yet', /Configuración de la 1\.2\.0 convertida a plantillas por control/.test(page) && /asignación\(es\) de plantilla por control en 1 agente/.test(page) && saved.length === 0, page.slice(0, 900));
    page = await press(ConfigurationShell, /^Guardar la conversión$/);
    check('«Guardar la conversión» writes it and the notice goes', saved.length === 1 && lastSaved().configuration.agents['101'].controls['mp.info.6'].templateId === 'pbs-backup' && !lastSaved().configuration.agents['101'].templates && !/convertida a plantillas/.test(page));
    stored = { configuration: lastSaved().configuration, metadata: null };
  }

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
