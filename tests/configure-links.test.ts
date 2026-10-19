/** "Configure this control" links and the way back. */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) failures.push(n);
};

let evaluation: any = { data: undefined, isLoading: true };
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: () => ({ ...evaluation, isRefreshing: false, retry: () => undefined }),
    }),
  },
});

const { readFileSync, readdirSync } = require('fs');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { hydrateENSScope } = require('../common/ens/core/scope/runtime');
const { ENSControls } = require('../public/ens/data');
const { ControlDetailENS } = require('../public/ens/controls/control-detail');
const { ConfigurationShell } = require('../public/ens/configuration/components/configuration-shell');
const { describeParameterForMachine, summarizeParameterValue } = require('../public/ens/controls/parameter-origins');
const { parseRouterSearch } = require('../public/routing/router-search');

const blocks: Record<string, any> = {};
readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
  const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
  blocks[b.controlId] = b;
});
const doc: any = { ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: ['op.acc.1', 'op.exp.10'].map(id => JSON.parse(JSON.stringify(blocks[id]))) };
const p = (control: string, id: string) => doc.controls.find((c: any) => c.controlId === control).parameters.find((x: any) => x.id === id);
p('op.acc.1', 'P-07').value = ['ana | srv-web01 | admin'];
p('op.acc.1', 'P-04').value = 90;
delete p('op.acc.1', 'P-01').value;
doc.agents = {
  '101': { name: 'srv-web01', templates: ['linux-ubuntu'], controls: { 'op.acc.1': { parameters: { 'P-07': ['root | srv-web01 | admin'] } } } },
};

(async () => {
  ensConfigurationRepository.completeHydration(doc);
  await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => [
    { id: '101', name: 'srv-web01', groups: ['ens'], status: 'active' },
    { id: '102', name: 'ldap01', groups: ['ens'], status: 'active' },
  ] as any, true);
  const ctl = (id: string) => ENSControls.find((c: any) => c.id === id);
  const meta = { computedAt: '2026-10-17T12:05:00Z', evaluatedAt: '2026-10-17T12:05:00Z', fingerprint: 'f', level: 'BAJO', facts: { count: 1 } };
  const nc = { id: 'NC-1', evidenceId: 'EV-02', evidenceIds: ['EV-02'], requirementId: 'op.exp.10.2', origin: 'NO_EVIDENCIADA', cause: 'CONFIGURATION', parameterIds: ['P-02', 'P-03'], finding: 'Falta P-02.', impact: 'Cuenta.', requiredAction: 'Configurar P-02 (rutas) en la pestaña Configuración.', agents: [] };
  const result = { control: { id: 'op.exp.10' }, status: 'NO_CUMPLE', score: 0, requirements: [{ id: 'op.exp.10.2', status: 'NO_EVALUABLE', evidenceIds: ['EV-02'] }], evidences: [], nonConformities: [nc], applicableRequirements: 1, measuredRequirements: 0, traceability: [] };

  console.log('1. «Configurar este control»');
  h.setSearch('?tabView=plugins&control=op.acc.1&agentId=101');
  evaluation = { data: { meta, result: { ...result, control: { id: 'op.acc.1' }, nonConformities: [] }, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
  await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '101', onBack: () => undefined });
  check('the button is in the header', Boolean(h.find('EuiButton', /Configurar este control/)));
  await h.click(/Configurar este control/);
  let s = parseRouterSearch(h.search());
  check('op.acc.1 with a machine (has per-system parameters): Sistemas → 101 → op.acc.1', s.tabView === 'configuration' && s.configAgent === '101' && s.configControl === 'op.acc.1', s);
  check('...and leaves the control, the machine and the way back', s.control === 'op.acc.1' && s.agentId === '101' && s.configBack === 'plugins', s);
  h.reset();
  h.setSearch('?tabView=plugins&control=op.acc.1');
  await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: undefined, onBack: () => undefined });
  await h.click(/Configurar este control/);
  s = parseRouterSearch(h.search());
  check('no machine: Organización → op.acc.1', s.configControl === 'op.acc.1' && !s.configAgent && s.configBack === 'plugins', s);

  console.log('2. A parameter of a nonconformity');
  h.reset();
  h.setSearch('?tabView=plugins&control=op.exp.10&agentId=101');
  evaluation = { data: { meta, result: result, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
  let screen = await h.render(ControlDetailENS, { control: ctl('op.exp.10'), agentId: '101', onBack: () => undefined });
  const insignia = h.findAll('EuiBadge').find(n => /^P-02/.test(n.texto) && n.props.onClick);
  check('P-02 as a clickable badge on the card', Boolean(insignia));
  check('...with the value that applies to 101 and its origin', /aplica: /.test(screen), screen.slice(screen.indexOf('P-02'), screen.indexOf('P-02') + 200));
  insignia!.props.onClick();
  s = parseRouterSearch(h.search());
  check('clicking P-02 (platform) with a machine: Sistemas → 101 → op.exp.10 / P-02, with the way back', s.tabView === 'configuration' && s.configAgent === '101' && s.configControl === 'op.exp.10' && s.configParam === 'P-02' && s.configBack === 'plugins' && s.control === 'op.exp.10', s);
  h.setSearch('?tabView=plugins&control=op.exp.10&agentId=101');
  h.findAll('EuiBadge').find(n => /^P-03/.test(n.texto) && n.props.onClick)!.props.onClick();
  s = parseRouterSearch(h.search());
  check('clicking P-03 (organization): Organización → op.exp.10 / P-03, the machine stays in the URL', s.configControl === 'op.exp.10' && s.configParam === 'P-03' && !s.configAgent && s.agentId === '101' && s.configBack === 'plugins', s);

  console.log('3. The way back');
  h.reset();
  h.setSearch('?tabView=configuration&configAgent=101&configControl=op.acc.1&control=op.acc.1&agentId=101&configBack=plugins');
  screen = await h.render(ConfigurationShell);
  const goBack = h.find('EuiButtonEmpty', /Volver al detalle de op\.acc\.1 \(101\)/);
  check('Configuration renders «Volver al detalle de op.acc.1 (101)»', Boolean(goBack), screen.slice(0, 300));
  await goBack!.props.onClick();
  s = parseRouterSearch(h.search());
  check('...which goes back to the op.acc.1 detail on 101, with nothing from Configuration', s.tabView === 'plugins' && s.control === 'op.acc.1' && s.agentId === '101' && !Object.keys(s).some(k => k.startsWith('config')), s);
  h.reset();
  h.setSearch('?tabView=configuration&configControl=op.acc.1&control=op.acc.1&configBack=plugins');
  await h.render(ConfigurationShell);
  const goBacks = h.nodes().filter(n => ['EuiButton', 'EuiButtonEmpty'].includes(n.type) && /^Volver/.test(n.texto)).map(n => n.texto);
  check('from the detail, a single «Volver» (to the detail), not also «Volver a controles»', JSON.stringify(goBacks) === JSON.stringify(['Volver al detalle de op.acc.1']), goBacks);
  h.reset();
  h.setSearch('?tabView=configuration&configControl=op.acc.1');
  await h.render(ConfigurationShell);
  check('without coming from the detail, «Volver a controles» stays', Boolean(h.find('EuiButton', /Volver a controles/)));
  h.reset();
  h.setSearch('?tabView=configuration&configControl=op.acc.1');
  await h.render(ConfigurationShell);
  check('without coming from the detail, there is no way back', !h.find('EuiButtonEmpty', /Volver al detalle/));

  console.log('4. The value for the machine and its origin');
  const own = describeParameterForMachine(doc, 'op.acc.1', '101', 'P-07');
  check('101, own P-07: its value and «valor propio de esta máquina»', own?.origin === 'ajuste propio de esta máquina' && /root \| srv-web01 \| admin/.test(own.value), own);
  const template = describeParameterForMachine(doc, 'op.acc.1', '101', 'P-01');
  check('101, P-01 from the Linux Ubuntu template', /^de la plantilla «/.test(template?.origin || '') && template?.value === 'Local', template);
  const inherited = describeParameterForMachine(doc, 'op.acc.1', '102', 'P-07');
  check('102, P-07: inherited from the organization', inherited?.origin === 'valor común del control' && /ana \| srv-web01/.test(inherited.value), inherited);
  const org = describeParameterForMachine(doc, 'op.acc.1', undefined, 'P-04');
  check('no machine, P-04: from the organization', org?.origin === 'valor común del control' && org.value === '90', org);
  const empty = describeParameterForMachine(doc, 'op.acc.1', '102', 'P-01');
  check('no value anywhere: «sin valor»', empty?.empty && empty.value === 'sin valor' && /^sin valor: ni ajuste propio/.test(empty.origin), empty);
  check('a control that is not in the configuration: nothing', describeParameterForMachine(doc, 'op.mon.1', '101', 'P-01') === undefined);
  check('long lists, summarized with their row count', /^3 filas: a; b; c$/.test(summarizeParameterValue(['a', 'b', 'c']).text));
  const informes = readFileSync(`${__dirname}/../public/ens/reports/index.tsx`, 'utf8');
  check('Reports: the origin in the table and in the PDF', /describeParameterForMachine\(activeConfiguration, controlId, agentId, parameter\.id\)/.test(informes) && /parameter\.origin \? ` \(\$\{parameter\.origin\}\)`/.test(informes));

  console.log('5. A clicked evidence');
  h.reset();
  h.setSearch('?tabView=plugins&control=op.exp.10&agentId=101');
  evaluation = { data: { meta, result: { ...result, nonConformities: [{ ...nc, finding: 'EV-02 NO_EVALUABLE: Falta P-02 (rutas).' }] }, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
  await h.render(ControlDetailENS, { control: ctl('op.exp.10'), agentId: '101', onBack: () => undefined });
  const ev = h.findAll('EuiBadge').find(n => /EV-02/.test(n.texto) && n.props.onClick);
  ev!.props.onClick();
  s = parseRouterSearch(h.search());
  check('the card\'s evidence leads to Evidences with its own parameter (evidenceControl)', s.tabView === 'evidences' && s.evidenceControl === 'op.exp.10', s);
  const { EvidencesENS } = require('../public/ens/evidences');
  h.reset();
  evaluation = { data: { meta, results: [] }, isLoading: false };
  h.setSearch('?tabView=evidences&control=op.acc.1&agentId=101');
  await h.render(EvidencesENS);
  check('the `control=` left by the detail does NOT filter Evidences', h.find('EuiFieldSearch')?.props.value === '');
  h.reset();
  h.setSearch('?tabView=evidences&evidenceControl=op.exp.10&agentId=101');
  let ev2 = await h.render(EvidencesENS);
  check('arriving from an evidence: filtered by op.exp.10, and the reason is visible', h.find('EuiFieldSearch')?.props.value === 'op.exp.10' && /Filtro: op\.exp\.10 \(desde el Detalle del control\)/.test(ev2), ev2.slice(0, 300));
  ev2 = await h.click(/Quitar filtro/);
  check('«Quitar filtro» removes it and it stops coming from the URL', h.find('EuiFieldSearch')?.props.value === '' && !parseRouterSearch(h.search()).evidenceControl, h.search());

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
