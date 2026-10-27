/** Controls never disappear from the list. */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) failures.push(n);
};

let evaluation: any = { data: undefined, error: undefined, isLoading: true, isRefreshing: false };
let retries = 0;
const savedItems: any[] = [];
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: () => ({ ...evaluation, retry: () => { retries += 1; } }),
    }),
  },
});
const fakeHttp = {
  get: async () => ({ statusCode: 200, error: 0, data: { configuration: null, metadata: null } }),
  put: async (_url: string, options: any) => {
    const body = JSON.parse(options.body);
    savedItems.push(body);
    return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: null } };
  },
};
(require('../common/ens/configuration/services/configuration-http-client')).setENSConfigurationHttp(() => fakeHttp);

const { ENSCatalog } = require('../common/ens/catalog');
const model = require('../public/ens/controls/controls-list-model') as typeof import('../public/ens/controls/controls-list-model');
const planes = require('../common/ens/core/scope/measurement-planes') as typeof import('../common/ens/core/scope/measurement-planes');
const { ENSControlsInAnnexOrder: ENSControls } = require('../public/ens/controls-in-order');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { hydrateENSScope, getActiveENSScopeAgents } = require('../common/ens/core/scope/runtime');
const { getENSComplianceState } = require('../common/ens/core/ens-engine');
const { ControlsENS } = require('../public/ens/controls');
const { parseRouterSearch } = require('../public/routing/router-search');
const { readFileSync, readdirSync } = require('fs');

const blocks: Record<string, any> = {};
readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
  const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
  blocks[b.controlId] = b;
});
const MISSING = ['op.cont.2', 'op.cont.3', 'op.mon.1', 'op.mon.2', 'op.mon.3', 'op.nub.1'];
const document = () => {
  const doc = { ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: Object.keys(blocks).filter(id => !MISSING.includes(id)).map(id => JSON.parse(JSON.stringify(blocks[id]))) };
  doc.global.ensLevel = 'BAJO';
  doc.controls.find((c: any) => c.controlId === 'mp.info.6').parameters.find((p: any) => p.id === 'P-04').value = ['srv-web01 | MEDIA'];
  return doc;
};
const listOf = (agentId?: string, name?: string, extra: any = {}) =>
  model.buildControlListEntries(
    ENSControls.map((c: any) => ({ id: c.id, title: c.title, activeLevels: c.scope.activeLevels })),
    {
      agentId,
      summaries: new Map(),
      isConfigured: id => !MISSING.includes(id),
      notMeasured: id => (agentId ? planes.describeNotMeasuredOnAgent(ENSCatalog.find((c: any) => c.id === id), agentId, name, { controlId: 'mp.info.6', parameters: [{ id: 'P-04', value: ['srv-web01 | MEDIA'] }] } as any) : undefined),
      levelOf: () => 'BAJO',
      ...extra,
    }
  );

(async () => {
  console.log('1. The model');
  {
    const manager = listOf('000', 'Manager');
    check('with the manager: the 34', manager.length === 34 && ENSControls.length === 34);
    const pending = manager.filter(e => e.pendingMeasurement);
    check('the 11 without collector: «sin medición», no summary, in their Annex II place (not at the end)', JSON.stringify(pending.map(e => e.id).sort()) === JSON.stringify([...['mp.eq.2', 'mp.eq.3', 'mp.eq.4', 'mp.com.1', 'mp.com.3', 'mp.com.4', 'mp.sw.2', 'mp.s.1', 'mp.s.2', 'mp.s.3', 'mp.s.4']].sort()) &&
      pending.every(e => e.measured && !e.notMeasured && !e.summary && /no se juzga como incumplimiento/.test(e.pendingMeasurement || '')) && manager.findIndex(e => e.id === 'mp.eq.2') < manager.findIndex(e => e.id === 'mp.info.6'), pending.map(e => e.id));
    const greys = manager.filter(e => !e.measured);
    check('8 unmeasured, all at the end and with the PLANE motive', greys.length === 8 && manager.slice(-8).every(e => !e.measured && e.notMeasured?.cause === 'PLANE'), greys.map(e => e.id));
    check('the measured ones (and those without collector), first and in catalog order', JSON.stringify(manager.slice(0, 26).map(e => e.id)) === JSON.stringify(ENSControls.map((c: any) => c.id).filter((id: string) => !greys.some(g => g.id === id))));
    const ldap = listOf('102', 'ldap01');
    check('with a machine outside P-04: the 34 and mp.info.6 last, with P-04', ldap.length === 34 && ldap[33].id === 'mp.info.6' && ldap[33].notMeasured?.cause === 'DECLARED_SCOPE', ldap[33]);
    check('on a declared one, mp.info.6 is measured', listOf('101', 'srv-web01').every(e => e.measured));
    check('no machine: all measured', listOf().every(e => e.measured));
    check('the 6 unconfigured, marked', JSON.stringify(listOf().filter(e => !e.configured).map(e => e.id).sort()) === JSON.stringify(MISSING));
    const level = model.describeLevelExclusions(listOf(), 'BAJO');
    check('«Nivel BAJO: 4 controles no aplican» (op.acc.3, op.exp.5, op.cont.2, op.cont.3)',
      level?.count === 4 && JSON.stringify([...level.ids].sort()) === JSON.stringify(['op.acc.3', 'op.cont.2', 'op.cont.3', 'op.exp.5']) && /^Nivel BAJO: 4 controles no aplican/.test(level.text), level);
    check('in ALTO there are none', model.describeLevelExclusions(listOf(undefined, undefined, { levelOf: () => 'ALTO' }), 'ALTO') === undefined);
    const rows = [
      { agentId: '101', controls: [{ controlId: 'op.acc.1', status: 'CUMPLE' }, { controlId: 'op.acc.2', status: 'NO_CUMPLE' }] },
      { agentId: '102', controls: [{ controlId: 'op.acc.1', status: 'PARCIAL' }] },
      { agentId: '103', controls: [{ controlId: 'op.acc.1', status: 'NO_EVALUABLE' }] },
      { agentId: '000', controls: [{ controlId: 'op.exp.7', status: 'CUMPLE' }] },
    ] as any;
    const t = model.tallyMachines('op.acc.1', rows);
    check('the bar: the machines that measure the control', t?.total === 3 && t.cumple === 1 && t.parcial === 1 && t.sinDatos === 1, t);
    check('...in words', model.describeTally(t!) === '1 cumple · 1 parcial · 1 sin datos (de 3 máquinas)', model.describeTally(t!));
    check('a control no machine measures: no bar', model.tallyMachines('op.nub.1', rows) === undefined);
    const acc1 = (list: any[]) => list.find(entry => entry.id === 'op.acc.1');
    check('the bar only without a chosen machine', acc1(listOf(undefined, undefined, { agentRows: rows }))?.machines?.total === 3 && !acc1(listOf('101', 'srv-web01', { agentRows: rows }))?.machines);
    check('the list follows the Annex II order: op.acc first, mp.info.6 (5.7.6) before mp.s.* (5.8), mp.s.4 last', listOf()[0].id === 'op.acc.1' && listOf()[29].id === 'mp.info.6' && listOf()[33].id === 'mp.s.4', listOf().map(e => e.id).join(','));
  }

  console.log('2. The screen');
  {
    ensConfigurationRepository.completeHydration(document());
    await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => [
      { id: '101', name: 'srv-web01', groups: ['ens'], status: 'active' },
      { id: '102', name: 'ldap01', groups: ['ens'], status: 'active' },
    ] as any, true);
    check('the scope has the manager', getActiveENSScopeAgents().some((a: any) => a.id === '000'));
    h.setSearch('?tabView=plugins&agentId=000');
    evaluation = { data: undefined, isLoading: true };
    let p = await h.render(ControlsENS);
    const rows = h.findAll('EuiFacetButton');
    check('with the manager: 34 rows', rows.length === 34, rows.length);
    check('11 «Sin medición todavía», with the wave on its own line and no verdict', h.findAll('EuiBadge', /Sin medición todavía/).length === 11 && /Medición prevista en la oleada A/.test(p), h.findAll('EuiBadge', /Sin medición todavía/).length);
    check('loading: spinner in the measures, no verdict', h.findAll('EuiLoadingSpinner').length === 15 && !/No cumple|No evaluable|Cumple/.test(p.replace(/No se mide/g, '')), h.findAll('EuiLoadingSpinner').length);
    check('8 «No se mide en esta máquina», with the motive', h.findAll('EuiBadge', /No se mide en esta máquina/).length === 8 && /no en el manager de Wazuh \(000\)/.test(p));
    const greyButton = h.findAll('EuiFacetButton').find(n => /op\.exp\.1 /.test(n.texto))!;
    const motiveOutside = h.findAll('EuiText').find(n => /op\.exp\.1 se mide en cada máquina/.test(n.texto));
    check('the motive, outside the button (its own line)', Boolean(motiveOutside) && !motiveOutside!.ruta.startsWith(greyButton.ruta + '.') && !/se mide en cada máquina/.test(greyButton.texto), motiveOutside?.ruta);
    check('the notice of how many are not measured and «Ver todas las máquinas»', /8 controles no se miden en 000/.test(p) && Boolean(h.find('EuiLink', /Ver todas las máquinas/)), p.slice(p.indexOf('Nivel BAJO') + 100, p.indexOf('Nivel BAJO') + 500));
    check('«Nivel BAJO: 4 controles no aplican» with a link to Configuration', /Nivel BAJO: 4 controles no aplican/.test(p) && Boolean(h.find('EuiLink', /Cambiar el nivel en Configuración/)));
    evaluation = { data: { meta: {}, controls: [{ controlId: 'op.exp.7', status: 'NO_CUMPLE', score: 0, evaluated: true, requirementsNotMet: 3, requirementsNotEvidenced: 1 }], agents: [] }, isLoading: false };
    p = await h.render(ControlsENS);
    const exp7 = h.findAll('EuiFacetButton').find(n => /op\.exp\.7/.test(n.texto));
    check('with a result: op.exp.7 with its number and its state', exp7?.props.quantity === 3 && /No cumple/.test(p));
    const gris = h.findAll('EuiFacetButton').find(n => /op\.exp\.1 /.test(n.texto));
    check('the grey ones without a number', gris && gris.props.quantity === undefined);
    check('the 6 unconfigured: the mark and «Añadir con valores por defecto»', h.findAll('EuiBadge', /No está en la configuración activa/).length === 6 && h.findAll('EuiButton', /Añadir con valores por defecto/).length === 6);
    await h.click(/Añadir con valores por defecto/);
    const ultimo = savedItems[savedItems.length - 1];
    check('«Añadir» saves the document with op.nub.1 added, the first missing one in Annex II order (and nothing else)', ultimo && ultimo.configuration.controls.some((c: any) => c.controlId === 'op.nub.1') && ultimo.configuration.controls.length === 29, ultimo?.configuration?.controls?.length);
    check('...and requests the evaluation again', retries === 1, retries);
    h.setSearch('?tabView=plugins');
    h.reset();
    evaluation = { data: { meta: {}, controls: [], agents: [{ agentId: '101', controls: [{ controlId: 'op.acc.1', status: 'CUMPLE' }] }, { agentId: '102', controls: [{ controlId: 'op.acc.1', status: 'NO_CUMPLE' }] }] }, isLoading: false };
    p = await h.render(ControlsENS);
    check('no machine: the control\'s machine bar', /1 cumple · 1 no cumple \(de 2 máquinas\)/.test(p), p.slice(0, 300));
    const buttonAcc1 = h.findAll('EuiFacetButton').find(n => /op\.acc\.1/.test(n.texto))!;
    check('...outside the button', !/Máquinas:/.test(buttonAcc1.texto) && h.findAll('EuiText').some(n => /^Máquinas: 1 cumple/.test(n.texto) && !n.ruta.startsWith(buttonAcc1.ruta + '.')));
    h.reset();
    await h.render(ControlsENS);
    const row = h.findAll('EuiFacetButton').find(n => /op\.acc\.2/.test(n.texto));
    await row!.props.onClick();
    check('clicking a row puts the control in the URL', parseRouterSearch(h.search()).control === 'op.acc.2', h.search());
  }

  console.log('3. The engine, without the control\'s configuration');
  {
    ensConfigurationRepository.completeHydration(document());
    const estado = getENSComplianceState('BAJO', [], undefined, getActiveENSScopeAgents(), new Date('2026-10-17T12:00:00Z'));
    const mon1 = estado.results.find((r: any) => r.control.id === 'op.mon.1');
    const ncs = mon1?.nonConformities || [];
    check('op.mon.1 (unconfigured): not-evidenced nonconformities', ncs.length > 0 && ncs.every((n: any) => n.origin === 'NO_EVIDENCIADA'), ncs.length);
    const notCatalog = ncs.filter((n: any) => n.cause !== 'CATALOG');
    check('...with the action of registering it (with any cause), never the producer\'s or the collection\'s',
      notCatalog.length > 0 && notCatalog.every((n: any) => /^Añadir con valores por defecto \(Configuración/.test(n.requiredAction)) &&
      !ncs.some((n: any) => /Corregir lo que el productor|Restablecer la RECOGIDA/.test(n.requiredAction)), ncs.map((n: any) => [n.cause, n.requiredAction.slice(0, 60)]));
    check('...and the finding says so', notCatalog.every((n: any) => /^op\.mon\.1 no está en la configuración activa/.test(n.finding)));
  }

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
