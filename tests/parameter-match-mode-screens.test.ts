/**
 * «Texto exacto» / «Expresión regular» and «Probar con un valor» wherever a flat-list parameter is edited: «Ajustes
 * comunes» (saved through the configuration route), the template editor and an agent override.
 *
 *   npx --yes tsx tests/parameter-match-mode-screens.test.ts
 */
import { readFileSync } from 'fs';
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  if (!ok) failures.push(name);
};

const h = installReactHarness();
const saved: any[] = [];
const fakeHttp = {
  get: async () => ({ statusCode: 200, error: 0, data: { configuration: null, metadata: null } }),
  put: async (_url: string, options: any) => {
    const body = JSON.parse(options.body);
    saved.push(body);
    return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: null } };
  },
};
require('../common/ens/configuration/services/configuration-http-client').setENSConfigurationHttp(() => fakeHttp);
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { ConfigurationSession } = require('../public/ens/configuration/sessions/configuration-session');
const { TemplateEditorModal } = require('../public/ens/configuration/components/template-editor-modal');
const { AgentParameterRow } = require('../public/ens/configuration/components/agent-parameter-row');

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const block = JSON.parse(readFileSync(`${__dirname}/../config/op-acc-1-control-block.json`, 'utf8'));

// The field that follows the row with this label.
const fieldAfter = (label: RegExp, type: string) => {
  const nodes = h.nodes();
  const at = nodes.findIndex(node => typeof node.props?.label === 'string' && label.test(node.props.label));
  return at < 0 ? undefined : nodes.slice(at + 1).find(node => node.type === type);
};
const set = async (label: RegExp, type: string, value: string) => {
  const field = fieldAfter(label, type);
  if (!field) throw new Error(`no ${type} after ${label}`);
  field.props.onChange({ target: { value } });
  return h.rerender();
};

(async () => {
  console.log('1. Ajustes comunes');
  {
    const doc = { ...copy(defaultENSConfigurationTemplate), templates: [], controls: [copy(block)] };
    ensConfigurationRepository.completeHydration(doc);
    const control = ensConfigurationRepository.getActive().controls[0];
    h.reset();
    let text = await h.render(ConfigurationSession, { control, onConfigurationSaved: () => undefined });
    check('a mode selector for each pattern parameter', /Modo de Cuentas genéricas prohibidas/.test(text) && /Modo de Cuentas de servicio legítimas/.test(text), text.slice(0, 200));
    check('none for a list the judgment does not compare', /Grupos que otorgan privilegio administrativo/.test(text) && !/Modo de (Grupos que otorgan|Fuente de identidad|Sistemas incluidos)/.test(text));
    await set(/^Modo de Cuentas genéricas prohibidas$/, 'EuiSelect', 'regex');
    await set(/^P-04 · Cuentas genéricas prohibidas$/, 'EuiFieldText', '^(admin|guest)$');
    text = await set(/^Probar con un valor$/, 'EuiFieldText', 'guest');
    check('«Probar con un valor» says it matches', /Coincide con la expresión\./.test(text));
    text = await set(/^Probar con un valor$/, 'EuiFieldText', 'superguest');
    check('full match: a longer name does not', /No coincide con la expresión\./.test(text));
    text = await h.click(/Guardar configuración/);
    const p04 = saved[saved.length - 1]?.configuration?.controls?.[0]?.parameters?.find((p: any) => p.id === 'P-04');
    check('saved with its mode', p04?.value === '^(admin|guest)$' && p04?.matchMode === 'regex', p04);
    check('the summary says it is a pattern', /Expresión regular: \^\(admin\|guest\)\$/.test(text), text.slice(0, 300));
    const p03 = saved[saved.length - 1]?.configuration?.controls?.[0]?.parameters?.find((p: any) => p.id === 'P-03');
    check('an untouched parameter keeps no mode', p03 && !('matchMode' in p03), p03);
  }

  console.log('2. Template editor');
  {
    const control = copy(block);
    Object.assign(control.parameters.find((p: any) => p.id === 'P-03'), { value: '^(root|daemon)$', matchMode: 'regex' });
    let received: any;
    h.reset();
    let text = await h.render(TemplateEditorModal, { mode: 'create', control, usage: [], onCancel: () => undefined, onSave: async (input: any) => { received = input; return undefined; } });
    check('the common regex does not leak into a new template: exact', fieldAfter(/^Modo de Cuentas de servicio legítimas$/, 'EuiSelect')?.props.value === 'exact');
    await set(/^Nombre$/, 'EuiFieldText', 'Servicios');
    await set(/^Modo de Cuentas de servicio legítimas$/, 'EuiSelect', 'regex');
    await set(/^P-03 · Cuentas de servicio legítimas$/, 'EuiFieldText', '^svc_.*$');
    text = await set(/^Probar con un valor$/, 'EuiFieldText', 'svc_backup');
    check('«Probar con un valor» in the template editor', /Coincide con la expresión\./.test(text));
    await h.click(/Guardar plantilla/);
    check('the template is saved with the value and its mode', received?.values?.['P-03'] === '^svc_.*$' && JSON.stringify(received?.matchModes) === '{"P-03":"regex"}', received);
    h.reset();
    text = await h.render(TemplateEditorModal, {
      mode: 'view', control, usage: [], onCancel: () => undefined, onSave: async () => undefined,
      template: { id: 'custom-svc', controlId: 'op.acc.1', name: 'Servicios', values: { 'P-03': '^svc_.*$' }, matchModes: { 'P-03': 'regex' }, builtin: false, typeDefault: false },
    });
    check('viewing a template says the value is a pattern', /Expresión regular: \^svc_\.\*\$/.test(text), text.slice(0, 300));
  }

  console.log('3. Agent override');
  {
    const parameter = { ...copy(block.parameters.find((p: any) => p.id === 'P-03')), value: '^svc_.*$', matchMode: 'regex' };
    const calls: any[] = [];
    const props = {
      agentId: '102', parameter, parameterClass: 'platform', origin: { source: 'template', templateId: 'custom-svc', templateName: 'Servicios', via: 'assigned' },
      applicable: true, focused: false,
      describeSave: (_value: unknown, mode: string) => (mode === 'regex' ? 'igual' : 'propio'),
      onSave: async (value: unknown, mode: string) => { calls.push([value, mode]); },
    };
    h.reset();
    let text = await h.render(AgentParameterRow, props);
    check('the inherited value is shown as a pattern', /Expresión regular: \^svc_\.\*\$/.test(text) && /heredado de la plantilla asignada «Servicios»/.test(text), text.slice(0, 300));
    text = await h.click(/Dar ajuste propio/);
    check('the editor opens in regex with the inherited pattern', fieldAfter(/^Modo de Cuentas de servicio legítimas$/, 'EuiSelect')?.props.value === 'regex' &&
      fieldAfter(/^P-03 · Cuentas de servicio legítimas$/, 'EuiFieldText')?.props.value === '^svc_.*$');
    text = await set(/^Probar con un valor$/, 'EuiFieldText', 'svc_x');
    check('«Probar con un valor» on the agent page', /Coincide con la expresión\./.test(text));
    check('the same pattern is not stored as its own', /Igual al que ya hereda/.test(text));
    await set(/^Modo de Cuentas de servicio legítimas$/, 'EuiSelect', 'exact');
    const combo = h.find('EuiComboBox');
    combo!.props.onCreateOption('svc_backup, svc_web');
    await h.rerender();
    await h.click(/Guardar para este agente/);
    check('saved as an exact list with its mode', JSON.stringify(calls[calls.length - 1]) === '[["svc_backup","svc_web"],"exact"]', calls);
  }

  if (failures.length) {
    console.log(`\n${failures.length} FAILURES`);
    process.exit(1);
  }
  console.log('\nAll checks pass.');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
