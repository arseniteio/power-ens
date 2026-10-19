/** Configuración > General > «Datos de la organización»: conflicts, choosing, editing and the read-only view in each control. */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  if (!ok) failures.push(name);
};

const h = installReactHarness();
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const client = require('../common/ens/configuration/services/configuration-http-client');
const service = require('../common/ens/configuration/services/configuration-state-service');
const { OrganizationDataPanel, OrganizationDataNotice } = require('../public/ens/configuration/components/organization-data-panel');
const { ENSControlForm } = require('../public/ens/configuration/form-engine');
const { ConfigurationSession } = require('../public/ens/configuration/sessions');
const { parseRouterSearch } = require('../public/routing/router-search');

const clone = (value: any) => JSON.parse(JSON.stringify(value));
const param = (doc: any, controlId: string, parameterId: string): any =>
  doc.controls.find((control: any) => control.controlId === controlId).parameters.find((parameter: any) => parameter.id === parameterId);
const stored = clone(defaultENSConfigurationTemplate);
delete stored.organizationData;
param(stored, 'op.exp.4', 'P-06').value = ['srv-app01 | pre-app01'];
param(stored, 'op.exp.5', 'P-05').value = ['srv-app01 | pre-app01'];
param(stored, 'op.acc.1', 'P-11').value = ['sudo', 'wheel'];
param(stored, 'op.acc.2', 'P-12').value = ['sudo', 'wheel'];
param(stored, 'op.acc.4', 'P-06').value = ['root'];

const saved: any[] = [];
client.setENSConfigurationHttp(() => ({
  get: async () => ({ statusCode: 200, error: 0, data: { configuration: clone(stored), metadata: null } }),
  put: async (_path: string, options: any) => {
    const body = JSON.parse(options.body);
    saved.push(body);
    return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: null } };
  },
}));

(async () => {
  await service.hydrateENSConfiguration(true);
  let savedCount = 0;
  const props = () => ({ configuration: service.getActiveENSConfiguration(), onConfigurationSaved: () => { savedCount += 1; } });

  console.log('1. The section');
  let screen = await h.render(OrganizationDataPanel, props());
  check('the section is in General with its intro', /Datos de la organización/.test(screen) && /Se escriben aquí una vez/.test(screen));
  check('each item once, saying who uses it', /Lo usan: op\.acc\.1 P-11, op\.acc\.2 P-12, op\.acc\.4 P-06\./.test(screen) && (screen.match(/Grupos con privilegio administrativo/g) || []).length >= 1);
  check('register views say their use', /op\.exp\.3 P-03 \(configuracion\)/.test(screen));
  check('the migration waits to be saved, saying no control changes', /Valores de los controles pasados a Datos de la organización/.test(screen) && /Ningún control cambia de valor/.test(screen));
  check('conflicts first, with each value and who keeps it', screen.indexOf('Valores distintos entre controles') < screen.indexOf('Entorno de preproducción') &&
    /Lo mantienen: op\.acc\.1 P-11, op\.acc\.2 P-12/.test(screen) && /Lo mantienen: op\.acc\.4 P-06/.test(screen));
  check('the informative item says why it is not here', /Sistemas y activos en alcance/.test(screen) && /No se edita en Configuración/.test(screen));
  check('related parameters that stay in their control are listed', /Parámetros relacionados que siguen en su control/.test(screen));

  console.log('2. Choosing');
  screen = await h.click(/Elegir este valor/);
  const chosen = saved[saved.length - 1];
  check('«Elegir este valor» saves the value in every mapped parameter', JSON.stringify(param(chosen.configuration, 'op.acc.4', 'P-06').value) === '["sudo","wheel"]' &&
    JSON.stringify(chosen.configuration.organizationData.values.grupos_privilegiados) === '["sudo","wheel"]', chosen?.configuration?.organizationData);
  check('with a reason that names the item and the source', /«Grupos con privilegio administrativo» con el valor de op\.acc\.1 P-11/.test(chosen.changeReason), chosen.changeReason);
  check('the first save also records the migration', /Datos de la organización: 1 dato\(s\) pasan/.test(chosen.changeReason), chosen.changeReason);
  check('the screen is told', savedCount === 1);
  screen = await h.render(OrganizationDataPanel, props());
  check('no conflict left', !/Valores distintos entre controles/.test(screen));

  console.log('3. Editing');
  const before = saved.length;
  const edit = h.findAll('EuiButton', /^Editar$/);
  await edit[edit.length - 1].props.onClick();
  screen = await h.rerender();
  // The last editable item is the SoA: write a row that would break op.mon.2 P-01 (aplicable is sí or no).
  let field = h.find('ParameterRendererFactory');
  check('«Editar» opens the field of the item', !!field && field.props.parameter.name === 'declaracion_aplicabilidad');
  field.props.onChange(field.props.parameter.name, ['op.acc.1 | quizá']);
  screen = await h.rerender();
  screen = await h.click(/^Guardar$/);
  check('an invalid value for a control is refused, naming it', /Hay valores que no se pueden guardar/.test(screen) && /op\.mon\.2 P-01/.test(screen) && saved.length === before, screen.slice(screen.indexOf('Hay valores'), screen.indexOf('Hay valores') + 200));
  field = h.find('ParameterRendererFactory');
  field.props.onChange(field.props.parameter.name, ['op.acc.1 | sí | MEDIO', 'op.acc.5 | no | | | Sin usuarios externos | DA | https://intranet/da.pdf']);
  await h.rerender();
  screen = await h.click(/^Guardar$/);
  const edited = saved[saved.length - 1];
  check('a valid value is saved and every view reads its part', saved.length === before + 1 &&
    JSON.stringify(param(edited.configuration, 'op.mon.2', 'P-01').value) === '["op.acc.1 | sí | MEDIO","op.acc.5 | no"]' &&
    JSON.stringify(param(edited.configuration, 'op.acc.5', 'P-DA').value) === '["Sin usuarios externos | DA | https://intranet/da.pdf"]', edited?.configuration && param(edited.configuration, 'op.acc.5', 'P-DA'));
  check('with its reason', /«Declaración de aplicabilidad» actualizado/.test(edited.changeReason));

  console.log('4. In each control');
  h.reset();
  const active = service.getActiveENSConfiguration();
  const control = active.controls.find((candidate: any) => candidate.controlId === 'op.acc.1');
  const values = Object.fromEntries(control.parameters.map((parameter: any) => [parameter.name, parameter.value]));
  screen = await h.render(ENSControlForm, { parameters: control.parameters, values, onChange: () => undefined });
  check('the mapped parameter is read-only with its value', /P-11 · Grupos que otorgan privilegio administrativo/.test(screen) && /Se edita en Datos de la organización/.test(screen) && /sudo/.test(screen));
  check('the others are still fields', h.findAll('ParameterRendererFactory').length === control.parameters.length - 2, h.findAll('ParameterRendererFactory').length);
  h.setSearch('?tabView=configuration&configControl=op.acc.1');
  await h.click(/Ir a «Grupos con privilegio administrativo»/);
  const search = parseRouterSearch(h.search());
  check('the link opens General on the item', search.configView === 'general' && search.configItem === 'grupos_privilegiados' && !search.configControl, search);

  h.reset();
  const stale = clone(control);
  param({ controls: [stale] }, 'op.acc.1', 'P-11').value = ['wheel'];
  await h.render(ConfigurationSession, { control: stale, onConfigurationSaved: () => undefined });
  await h.click(/Guardar configuración/);
  check('a control form opened before a change in General does not bring the old value back', JSON.stringify(param(saved[saved.length - 1].configuration, 'op.acc.1', 'P-11').value) === '["sudo","wheel"]');

  h.reset();
  await service.saveActiveENSConfiguration(
    require('../common/ens/configuration/organization').setOrganizationValue(service.getActiveENSConfiguration(), 'grupos_privilegiados', ['Domain Admins']),
    'prueba'
  );
  const shared = service.getActiveENSConfiguration().controls.find((candidate: any) => candidate.controlId === 'op.acc.1');
  const beforeSession = saved.length;
  await h.render(ConfigurationSession, { control: shared, onConfigurationSaved: () => undefined });
  screen = await h.click(/Guardar configuración/);
  check('a shared value that is wrong for this control does not block saving it', saved.length === beforeSession + 1 && !/Hay valores que no se pueden guardar/.test(screen), screen.slice(0, 300));

  console.log('5. Outside General');
  h.reset();
  const conflict = clone(service.getActiveENSConfiguration());
  param(conflict, 'op.acc.4', 'P-06').value = ['root'];
  let opened = false;
  screen = await h.render(OrganizationDataNotice, { configuration: conflict, onOpen: () => { opened = true; } });
  check('the notice names the item in conflict', /Valores distintos entre controles: «Grupos con privilegio administrativo»/.test(screen), screen);
  await h.click(/Ver Datos de la organización/);
  check('and takes to General', opened);
  screen = await h.render(OrganizationDataNotice, { configuration: service.getActiveENSConfiguration(), onOpen: () => undefined });
  check('nothing to say, no notice', screen.trim() === '', screen);

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
