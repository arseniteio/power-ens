/**
 * «Configurar este control» y la vuelta (diagnóstico de 17/10, §5, y la URL de
 * Configuración de Task 3):
 *
 *   npx --yes tsx tests/configure-links.test.ts
 *
 *   1. El botón de la cabecera del detalle abre Configuración en el control
 *      (en la página de la máquina si el control tiene parámetros por sistema o
 *      plataforma) y deja en la URL el control, la máquina y la vuelta.
 *   2. Un parámetro citado en una no conformidad abre Configuración en ese
 *      parámetro, con el valor que aplica a la máquina y su origen.
 *   3. Configuración pinta «Volver al detalle de …», que vuelve al mismo
 *      control y máquina sin nada de Configuración en la URL.
 *   4. El valor de un parámetro para una máquina y de dónde sale (propio,
 *      plantilla, organización, sin valor), como en Informes.
 *   5. Una evidencia pulsada abre Evidencias filtrada por el control.
 */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) fallos.push(n);
};

let evaluacion: any = { data: undefined, isLoading: true };
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: () => ({ ...evaluacion, isRefreshing: false, retry: () => undefined }),
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

const bloques: Record<string, any> = {};
readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
  const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
  bloques[b.controlId] = b;
});
const doc: any = { ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: ['op.acc.1', 'op.exp.10'].map(id => JSON.parse(JSON.stringify(bloques[id]))) };
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
  const resultado = { control: { id: 'op.exp.10' }, status: 'NO_CUMPLE', score: 0, requirements: [{ id: 'op.exp.10.2', status: 'NO_EVALUABLE', evidenceIds: ['EV-02'] }], evidences: [], nonConformities: [nc], applicableRequirements: 1, measuredRequirements: 0, traceability: [] };

  console.log('1. «Configurar este control»');
  h.setSearch('?tabView=plugins&control=op.acc.1&agentId=101');
  evaluacion = { data: { meta, result: { ...resultado, control: { id: 'op.acc.1' }, nonConformities: [] }, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
  await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '101', onBack: () => undefined });
  comprueba('el botón está en la cabecera', Boolean(h.find('EuiButton', /Configurar este control/)));
  await h.click(/Configurar este control/);
  let s = parseRouterSearch(h.search());
  comprueba('op.acc.1 con máquina (tiene parámetros por sistema): Sistemas → 101 → op.acc.1', s.tabView === 'configuration' && s.configAgent === '101' && s.configControl === 'op.acc.1', s);
  comprueba('…y deja el control, la máquina y la vuelta', s.control === 'op.acc.1' && s.agentId === '101' && s.configBack === 'plugins', s);
  h.reset();
  h.setSearch('?tabView=plugins&control=op.acc.1');
  await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: undefined, onBack: () => undefined });
  await h.click(/Configurar este control/);
  s = parseRouterSearch(h.search());
  comprueba('sin máquina: Organización → op.acc.1', s.configControl === 'op.acc.1' && !s.configAgent && s.configBack === 'plugins', s);

  console.log('2. Un parámetro de una no conformidad');
  h.reset();
  h.setSearch('?tabView=plugins&control=op.exp.10&agentId=101');
  evaluacion = { data: { meta, result: resultado, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
  let pantalla = await h.render(ControlDetailENS, { control: ctl('op.exp.10'), agentId: '101', onBack: () => undefined });
  const insignia = h.findAll('EuiBadge').find(n => /^P-02/.test(n.texto) && n.props.onClick);
  comprueba('P-02 como insignia pulsable en la tarjeta', Boolean(insignia));
  comprueba('…con el valor que aplica a 101 y su origen', /aplica: /.test(pantalla), pantalla.slice(pantalla.indexOf('P-02'), pantalla.indexOf('P-02') + 200));
  insignia!.props.onClick();
  s = parseRouterSearch(h.search());
  comprueba('pulsar P-02 (de plataforma) con máquina: Sistemas → 101 → op.exp.10 / P-02, con la vuelta', s.tabView === 'configuration' && s.configAgent === '101' && s.configControl === 'op.exp.10' && s.configParam === 'P-02' && s.configBack === 'plugins' && s.control === 'op.exp.10', s);
  h.setSearch('?tabView=plugins&control=op.exp.10&agentId=101');
  h.findAll('EuiBadge').find(n => /^P-03/.test(n.texto) && n.props.onClick)!.props.onClick();
  s = parseRouterSearch(h.search());
  comprueba('pulsar P-03 (de organización): Organización → op.exp.10 / P-03, la máquina sigue en la URL', s.configControl === 'op.exp.10' && s.configParam === 'P-03' && !s.configAgent && s.agentId === '101' && s.configBack === 'plugins', s);

  console.log('3. La vuelta');
  h.reset();
  h.setSearch('?tabView=configuration&configAgent=101&configControl=op.acc.1&control=op.acc.1&agentId=101&configBack=plugins');
  pantalla = await h.render(ConfigurationShell);
  const volver = h.find('EuiButtonEmpty', /Volver al detalle de op\.acc\.1 \(101\)/);
  comprueba('Configuración pinta «Volver al detalle de op.acc.1 (101)»', Boolean(volver), pantalla.slice(0, 300));
  await volver!.props.onClick();
  s = parseRouterSearch(h.search());
  comprueba('…que vuelve al detalle de op.acc.1 en 101, sin nada de Configuración', s.tabView === 'plugins' && s.control === 'op.acc.1' && s.agentId === '101' && !Object.keys(s).some(k => k.startsWith('config')), s);
  h.reset();
  h.setSearch('?tabView=configuration&configControl=op.acc.1');
  await h.render(ConfigurationShell);
  comprueba('sin venir del detalle, no hay vuelta', !h.find('EuiButtonEmpty', /Volver al detalle/));

  console.log('4. El valor para la máquina y su origen');
  const propio = describeParameterForMachine(doc, 'op.acc.1', '101', 'P-07');
  comprueba('101, P-07 propio: su valor y «valor propio de esta máquina»', propio?.origin === 'valor propio de esta máquina' && /root \| srv-web01 \| admin/.test(propio.value), propio);
  const plantilla = describeParameterForMachine(doc, 'op.acc.1', '101', 'P-01');
  comprueba('101, P-01 de la plantilla Linux Ubuntu', /^de la plantilla «/.test(plantilla?.origin || '') && plantilla?.value === 'Local', plantilla);
  const heredado = describeParameterForMachine(doc, 'op.acc.1', '102', 'P-07');
  comprueba('102, P-07: heredado de la organización', heredado?.origin === 'heredado de la organización' && /ana \| srv-web01/.test(heredado.value), heredado);
  const org = describeParameterForMachine(doc, 'op.acc.1', undefined, 'P-04');
  comprueba('sin máquina, P-04: de la organización', org?.origin === 'de la organización' && org.value === '90', org);
  const vacio = describeParameterForMachine(doc, 'op.acc.1', '102', 'P-01');
  comprueba('sin valor en ninguna parte: «sin valor»', vacio?.empty && vacio.value === 'sin valor' && /^sin valor: ni propio/.test(vacio.origin), vacio);
  comprueba('un control que no está en la configuración: nada', describeParameterForMachine(doc, 'op.mon.1', '101', 'P-01') === undefined);
  comprueba('listas largas, resumidas con su número de filas', /^3 filas: a; b; c$/.test(summarizeParameterValue(['a', 'b', 'c']).text));
  const informes = readFileSync(`${__dirname}/../public/ens/reports/index.tsx`, 'utf8');
  comprueba('Informes: el origen en la tabla y en el PDF', /describeParameterForMachine\(activeConfiguration, controlId, agentId, parameter\.id\)/.test(informes) && /parameter\.origin \? ` \(\$\{parameter\.origin\}\)`/.test(informes));

  console.log('5. Una evidencia pulsada');
  const evidencias = readFileSync(`${__dirname}/../public/ens/evidences/index.tsx`, 'utf8');
  comprueba('Evidencias empieza filtrada por el control de la URL', /useState<string>\(\(\) => control \|\| ''\)/.test(evidencias));
  const detalle = readFileSync(`${__dirname}/../public/ens/controls/control-detail/index.tsx`, 'utf8');
  comprueba('el detalle manda a Evidencias con su control', /onEvidence: \(\) => cambiaUrl\(\{ tabView: 'evidences', control: control\.id \}\)/.test(detalle));

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
