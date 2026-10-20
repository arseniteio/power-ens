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
const { AgentParameterRow } = require('../public/ens/configuration/components/agent-parameter-row');
const { ENS_ORGANIZATION_DATA_ITEMS: ENS_ITEMS } = require('../common/ens/configuration/organization/organization-data-items');

const clone = (value: any) => JSON.parse(JSON.stringify(value));
const param = (doc: any, controlId: string, parameterId: string): any =>
  doc.controls.find((control: any) => control.controlId === controlId).parameters.find((parameter: any) => parameter.id === parameterId);
const stored = clone(defaultENSConfigurationTemplate);
delete stored.organizationData;
param(stored, 'op.exp.4', 'P-06').value = ['srv-app01 | pre-app01'];
param(stored, 'op.exp.5', 'P-05').value = ['srv-app01 | pre-app01'];
// mp.sw.2 (1.4.0) reads the same pairs: with its value equal, no control changes when moving.
param(stored, 'mp.sw.2', 'P-03').value = ['srv-app01 | pre-app01'];
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
  const beforeChoice = saved.length;
  screen = await h.click(/Elegir este valor/);
  check('choosing first shows what each parameter loses, without saving yet',
    saved.length === beforeChoice && screen.includes('op.acc.4 P-06: se quita «root»; queda «sudo», «wheel».') && /La versión anterior queda en el historial/.test(screen), screen.slice(0, 400));
  await h.find('ConfirmModal')!.props.onConfirm();
  screen = await h.rerender();
  const chosen = saved[saved.length - 1];
  check('«Elegir este valor» saves the value in every mapped parameter', JSON.stringify(param(chosen.configuration, 'op.acc.4', 'P-06').value) === '["sudo","wheel"]' &&
    JSON.stringify(chosen.configuration.organizationData.values.grupos_privilegiados) === '["sudo","wheel"]', chosen?.configuration?.organizationData);
  check('with a reason that names the item and the source', /«Grupos con privilegio administrativo» con el valor de op\.acc\.1 P-11/.test(chosen.changeReason), chosen.changeReason);
  check('the first save also records the migration', /Datos de la organización: 1 dato\(s\) unificado\(s\)/.test(chosen.changeReason), chosen.changeReason);
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

  console.log('6. Completed, refused and warned');
  h.reset();
  const second = clone(defaultENSConfigurationTemplate);
  delete second.organizationData;
  param(second, 'op.exp.4', 'P-07').value = ['* | lvm | snapshot | 24'];
  param(second, 'op.acc.6', 'P-07').value = ['ssh | si | RSEG | si'];
  param(second, 'op.acc.4', 'P-04').value = ['RDP | 3389 | cualquiera'];
  param(second, 'op.exp.9', 'P-01').value = 'Registro ENSFácil (/etc/ensfacil/incident-register.tsv)';
  param(second, 'op.exp.7', 'P-03').value = ['GLPI | https://glpi | RSEG'];
  client.setENSConfigurationHttp(() => ({
    get: async () => ({ statusCode: 200, error: 0, data: { configuration: clone(second), metadata: null } }),
    put: async (_path: string, options: any) => {
      const body = JSON.parse(options.body);
      saved.push(body);
      return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: null } };
    },
  }));
  await service.hydrateENSConfiguration(true);
  screen = await h.render(OrganizationDataPanel, props());
  check('the migration notice lists each parameter completed and where its value came from',
    screen.includes('Se ha completado op.exp.5 P-08 con el valor de op.exp.4 P-07.') && !/Ningún control cambia de valor/.test(screen), screen.slice(0, 600));
  check('a value a control cannot take is not offered as a choice, saying why',
    /No se puede elegir tal cual: .*op\.acc\.6 P-07/.test(screen) && h.findAll('EuiButton', /Elegir este valor/).some(button => button.props.isDisabled), screen.slice(screen.indexOf('Canales'), screen.indexOf('Canales') + 600));
  check('op.exp.9 P-01 disagreeing with the incident tool is warned about in its item', /op\.exp\.9 P-01 dice «Registro ENSFácil/.test(screen));
  const editPeople = h.findAll('EuiButton', /^Editar$/)[0];
  await editPeople.props.onClick();
  await h.rerender();
  const peopleField = h.find('ParameterRendererFactory')!;
  peopleField.props.onChange(peopleField.props.parameter.name, ['ana | mantenimiento, registros | servidores | lectura']);
  screen = await h.rerender();
  check('a row with several uses sharing «Ámbito» or «Detalle» is warned about while editing', /La fila de «ana» tiene varios usos/.test(screen));
  h.reset();
  const retention = service.getActiveENSConfiguration();
  screen = await h.render(OrganizationDataPanel, { configuration: retention, onConfigurationSaved: () => undefined });
  const editButtons = h.findAll('EuiButton', /^Editar$/);
  await editButtons[ENS_ITEMS.filter((item: any) => item.views.length).findIndex((item: any) => item.id === 'retencion')].props.onClick();
  await h.rerender();
  const retentionField = h.find('ParameterRendererFactory')!;
  retentionField.props.onChange(retentionField.props.parameter.name, ['accesos | VPN | 365', 'accesos | web | 90']);
  await h.rerender();
  const beforeTwice = saved.length;
  screen = await h.click(/^Guardar$/);
  check('two rows for a one-value parameter are refused on screen', saved.length === beforeTwice && screen.includes('op.acc.5 P-08: lee un solo valor: dejar una sola fila con uso «accesos» en «Plazos de retención».'), screen.slice(screen.indexOf('Hay valores'), screen.indexOf('Hay valores') + 200));

  console.log('7. Agent page');
  h.reset();
  h.setSearch('?tabView=configuration&configAgent=024');
  const groups = service.getActiveENSConfiguration().controls.find((candidate: any) => candidate.controlId === 'op.acc.1').parameters.find((parameter: any) => parameter.id === 'P-11');
  screen = await h.render(AgentParameterRow, {
    agentId: '024', parameter: groups, parameterClass: 'platform', origin: { source: 'organisation' }, applicable: true, focused: false,
    describeSave: () => 'propio', onSave: async () => undefined,
  });
  check('a per-agent parameter that is organisation data says where its common value is edited',
    screen.includes('El valor común es «Grupos con privilegio administrativo», de Datos de la organización.') &&
    screen.includes('vale solo para op.acc.1 P-11; op.acc.2 P-12 y op.acc.4 P-06 se ajustan aparte'), screen.slice(0, 500));
  await h.click(/Ir a «Grupos con privilegio administrativo»/);
  check('and links to it', parseRouterSearch(h.search()).configItem === 'grupos_privilegiados');

  console.log('8. One control with a value that does not fit');
  h.reset();
  const lone = clone(defaultENSConfigurationTemplate);
  delete lone.organizationData;
  param(lone, 'op.acc.4', 'P-04').value = ['ssh | 22 | 10.0.0.0/8'];
  client.setENSConfigurationHttp(() => ({
    get: async () => ({ statusCode: 200, error: 0, data: { configuration: clone(lone), metadata: null } }),
    put: async (_path: string, options: any) => ({ statusCode: 200, error: 0, data: { configuration: JSON.parse(options.body).configuration, metadata: null } }),
  }));
  await service.hydrateENSConfiguration(true);
  screen = await h.render(OrganizationDataPanel, props());
  const notice = 'Solo op.acc.4 tiene valor y no vale para «Canales de acceso remoto autorizados»: falta «Cifrado» en la fila 1; falta «Autoriza» en la fila 1; falta «Uso constante» en la fila 1.';
  check('it is told as a notice, not as a choice between controls', screen.includes('Datos sin valor común') && screen.includes(notice) &&
    !/Valores distintos entre controles/.test(screen) && !h.findAll('EuiButton', /Elegir este valor/).length, screen.slice(0, 500));
  check('the item says so and op.acc.4 keeps its value', screen.includes('Sin valor común: cada control sigue con el suyo.') &&
    JSON.stringify(param(service.getActiveENSConfiguration(), 'op.acc.4', 'P-04').value) === '["ssh | 22 | 10.0.0.0/8"]');
  screen = await h.render(OrganizationDataNotice, { configuration: service.getActiveENSConfiguration(), onOpen: () => undefined });
  check('outside General too, without «Valores distintos»', screen.includes(notice) && !/Valores distintos/.test(screen), screen);

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
