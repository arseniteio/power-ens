/** Control Detail never disappears. */
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
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: () => ({ ...evaluation, retry: () => { retries += 1; } }),
    }),
  },
});

const { ENSCatalog } = require('../common/ens/catalog');
const planes = require('../common/ens/core/scope/measurement-planes') as typeof import('../common/ens/core/scope/measurement-planes');
const estado = require('../public/ens/controls/control-detail/detail-view-state') as typeof import('../public/ens/controls/control-detail/detail-view-state');
const scopeModule = require('../public/app/agent-in-scope') as typeof import('../public/app/agent-in-scope');
const enlace = require('../public/routing/configuration-link') as typeof import('../public/routing/configuration-link');
const { parseRouterSearch, withRouterSearch } = require('../public/routing/router-search');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { hydrateENSScope } = require('../common/ens/core/scope/runtime');
const { ENSControls } = require('../public/ens/data');
const { ControlDetailENS } = require('../public/ens/controls/control-detail');
const { TabErrorBoundary, describeRenderError } = require('../public/app/tab-error-boundary');
const { readFileSync, readdirSync } = require('fs');

const control = (id: string) => ENSCatalog.find((c: any) => c.id === id);
const mpInfo6Config = (value: string[]) => ({ controlId: 'mp.info.6', parameters: [{ id: 'P-04', value: value }] }) as any;

(async () => {
  console.log('1. Not measured on this machine');
  {
    const ofAgent = ENSCatalog.filter((c: any) => !planes.isControlMeasuredOnPlane(c, 'manager')).map((c: any) => c.id).sort();
    // The 11 without collector (1.4.0) keep the default plane until their wave decides it.
    check('25 controls of plane agent (14 measured and the 11 without collector)', ofAgent.length === 25, ofAgent);
    const onManager = ofAgent.map((id: string) => planes.describeNotMeasuredOnAgent(control(id), '000', 'Manager', undefined));
    check('the 25, on the manager: PLANE with its text', onManager.every((m: any) => m?.cause === 'PLANE' && /no en el manager de Wazuh \(000\)/.test(m.text)), onManager.map((m: any) => m?.cause));
    const managerOnly = ENSCatalog.filter((c: any) => planes.isManagerOnlyControl(c));
    check('manager-only ones, on another machine: no motive (seen with the manager row)',
      managerOnly.length === 7 && managerOnly.every((c: any) => planes.describeNotMeasuredOnAgent(c, '101', 'srv-web01', undefined) === undefined), managerOnly.map((c: any) => c.id));
    check('manager-only ones, on the manager: no motive', managerOnly.every((c: any) => planes.describeNotMeasuredOnAgent(c, '000', 'Manager', undefined) === undefined));
    check('op.exp.8 and op.mon.3 (both planes), on the manager and on another: no motive',
      ['op.exp.8', 'op.mon.3'].every(id => !planes.describeNotMeasuredOnAgent(control(id), '000', 'M', undefined) && !planes.describeNotMeasuredOnAgent(control(id), '101', 'x', undefined)));
    const p04 = mpInfo6Config(['srv-copias | MEDIA', 'srv-web01 | MEDIA']);
    const outside = planes.describeNotMeasuredOnAgent(control('mp.info.6'), '102', 'ldap01', p04);
    check('mp.info.6 on a machine P-04 does not declare: DECLARED_SCOPE, with P-04 and the declared ones',
      outside?.cause === 'DECLARED_SCOPE' && outside.parameterId === 'P-04' && /P-04 \(srv-copias, srv-web01\)/.test(outside.text) && /102 · ldap01 no está entre ellas/.test(outside.text), outside);
    check('mp.info.6 on a declared one (case-insensitive): no motive', planes.describeNotMeasuredOnAgent(control('mp.info.6'), '101', 'SRV-WEB01', p04) === undefined);
    const empty = planes.describeNotMeasuredOnAgent(control('mp.info.6'), '101', 'srv-web01', mpInfo6Config([]));
    check('mp.info.6 with empty P-04: says so', empty?.cause === 'DECLARED_SCOPE' && /no declara ninguna/.test(empty.text), empty);
    check('mp.info.6 on the manager: PLANE (it is plane agent)', planes.describeNotMeasuredOnAgent(control('mp.info.6'), '000', 'M', p04)?.cause === 'PLANE');
  }

  console.log('2. What is shown');
  {
    const r = (agentId?: string) => ({ controlId: 'op.acc.1', agentId });
    const datum = (n: string) => ({ n, meta: { computedAt: '2026-10-17T12:05:00Z' } });
    const at = (d: any) => d.meta.computedAt;
    const actual = estado.decideDetailView(r('101'), { data: datum('a'), isLoading: false }, undefined, at);
    check('the current data: shown, current, its machine', actual.kind === 'shown' && actual.current && actual.agentId === '101' && (actual as any).data.n === 'a');
    const ret = estado.nextRetained(r('101'), { data: datum('a'), isLoading: false }, undefined, at);
    check('the current data is stored with its machine and time', ret?.agentId === '101' && ret?.computedAt === '2026-10-17T12:05:00Z');
    const loading = estado.decideDetailView(r('102'), { data: undefined, isLoading: true }, ret, at);
    check('another machine loading: the previous data, NOT current, labelled 101, loading',
      loading.kind === 'shown' && !loading.current && loading.agentId === '101' && loading.loading && (loading as any).data.n === 'a', loading);
    check('...and it is known to be from another machine', estado.isFromAnotherMachine(r('102'), loading));
    check('what is retained does not change while loading', estado.nextRetained(r('102'), { data: undefined, isLoading: true }, ret, at) === ret);
    const failure = estado.decideDetailView(r('102'), { data: undefined, error: new Error('x'), isLoading: false }, ret, at);
    check('the other machine fails: the previous data labelled and the error', failure.kind === 'shown' && !failure.current && (failure as any).error && failure.agentId === '101' && !failure.loading);
    const otherControl = estado.decideDetailView({ controlId: 'op.acc.2', agentId: '101' }, { data: undefined, isLoading: true }, ret, at);
    check('another control never inherits: loading', otherControl.kind === 'loading');
    const otherControlError = estado.decideDetailView({ controlId: 'op.acc.2' }, { data: undefined, error: new Error('x'), isLoading: false }, ret, at);
    check('another control with an error: error, nothing to show', otherControlError.kind === 'error');
    check('nothing yet: loading', estado.decideDetailView(r(), { data: undefined, isLoading: true }, undefined).kind === 'loading');
    const sameFailure = estado.decideDetailView(r('101'), { data: undefined, error: new Error('x'), isLoading: false }, ret, at);
    check('same machine, refresh fails: the last data, without «otra máquina»', sameFailure.kind === 'shown' && !estado.isFromAnotherMachine(r('101'), sameFailure));
    const hoy = new Date('2026-10-17T18:00:00Z');
    check('la hora de hoy: «las HH:MM»', /^las \d\d:\d\d$/.test(estado.describeComputedAt('2026-10-17T12:05:00Z', hoy) || ''));
    check('one from another day: «el dd/mm a las HH:MM»', /^el \d\d\/\d\d a las \d\d:\d\d$/.test(estado.describeComputedAt('2026-10-15T12:05:00Z', hoy) || ''));
  }

  console.log('3. Machine outside the scope; round trip to Configuration');
  {
    const scope = [{ id: '000' }, { id: '024' }];
    check('no machine: in scope', scopeModule.isAgentInScope(undefined, scope));
    check('024 and 24: in scope', scopeModule.isAgentInScope('024', scope) && scopeModule.isAgentInScope('24', scope));
    check('025: outside', !scopeModule.isAgentInScope('025', scope));
    const ida = enlace.detailConfigurationChanges({ controlId: 'op.acc.1', agentId: '024', hasAgentLevelParameters: true });
    const url = parseRouterSearch(withRouterSearch('?tabView=plugins&control=op.acc.1&agentId=024', ida));
    check('«Configurar este control» with a machine and per-system parameters: that machine\'s page, on the control',
      url.tabView === 'configuration' && url.configAgent === '024' && url.configControl === 'op.acc.1' && !url.configParam, url);
    check('...keeps control and machine and leaves the way back', url.control === 'op.acc.1' && url.agentId === '024' && url.configBack === 'plugins', url);
    const org = parseRouterSearch(withRouterSearch('?tabView=plugins&control=op.cont.2&agentId=024', enlace.detailConfigurationChanges({ controlId: 'op.cont.2', agentId: '024', hasAgentLevelParameters: false })));
    check('control without per-system parameters: Organización', org.configControl === 'op.cont.2' && !org.configAgent && !org.configView, org);
    const param = parseRouterSearch(withRouterSearch('', enlace.detailConfigurationChanges({ controlId: 'op.exp.10', agentId: '024', parameterId: 'P-02', parameterIsAgentLevel: false })));
    check('organization parameter with a machine chosen: Organización, on the parameter', param.configControl === 'op.exp.10' && param.configParam === 'P-02' && !param.configAgent, param);
    const wayBack = enlace.parseConfigurationBack(url);
    check('the way back is read from the URL', wayBack?.tabView === 'plugins' && wayBack?.controlId === 'op.acc.1');
    const back = parseRouterSearch(withRouterSearch(withRouterSearch('?tabView=plugins&control=op.acc.1&agentId=024', ida), enlace.configurationBackChanges(wayBack!)));
    check('go back: Detail, same control and machine, with nothing from Configuration',
      back.tabView === 'plugins' && back.control === 'op.acc.1' && back.agentId === '024' && !Object.keys(back).some(k => k.startsWith('config')), back);
    check('without configBack there is no way back', enlace.parseConfigurationBack({ control: 'op.acc.1' }) === undefined);
  }

  console.log('4. The screen');
  {
    const blocks: Record<string, any> = {};
    readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
      const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
      blocks[b.controlId] = b;
    });
    const doc = { ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: ['op.acc.1', 'mp.info.6'].map(id => JSON.parse(JSON.stringify(blocks[id]))) };
    doc.controls[1].parameters.find((p: any) => p.id === 'P-04').value = ['srv-web01 | MEDIA'];
    ensConfigurationRepository.completeHydration(doc);
    const agents = [
      { id: '101', name: 'srv-web01', groups: ['ens'], status: 'active' },
      { id: '102', name: 'ldap01', groups: ['ens'], status: 'active' },
    ];
    await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => agents as any, true);
    const ctl = (id: string) => ENSControls.find((c: any) => c.id === id);
    const meta = { computedAt: '2026-10-17T12:05:00Z', evaluatedAt: '2026-10-17T12:05:00Z', fingerprint: 'f', level: 'BAJO', facts: { count: 1 } };
    const result = (estado: string) => ({ control: { id: 'op.acc.1' }, status: estado, score: 20, requirements: [{ id: 'op.acc.1.1', status: 'CUMPLE', evidenceIds: [] }], evidences: [], nonConformities: [], applicableRequirements: 1, measuredRequirements: 1, traceability: [] });

    h.setSearch('?tabView=plugins&control=mp.info.6&agentId=102');
    evaluation = { data: { meta, result: undefined, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
    let p = await h.render(ControlDetailENS, { control: ctl('mp.info.6'), agentId: '102', onBack: () => undefined });
    check('no result: «mp.info.6 no se mide en 102 · ldap01» with the P-04 motive', /mp\.info\.6 no se mide en 102 · ldap01/.test(p) && /P-04 \(srv-web01\)/.test(p), p.slice(0, 600));
    check('...without «todo conforme» or figures', !/Todo lo aplicable/.test(p) && !/Panel ejecutivo/.test(p));
    check('...with «Ver todas las máquinas» and «Configurar P-04»', Boolean(h.find('EuiButton', /Ver todas las máquinas/)) && Boolean(h.find('EuiButtonEmpty', /Configurar P-04/)));
    await h.click(/Ver todas las máquinas/);
    check('«Ver todas las máquinas» removes the machine from the URL', !parseRouterSearch(h.search()).agentId && parseRouterSearch(h.search()).control === 'mp.info.6', h.search());
    h.setSearch('?tabView=plugins&control=mp.info.6&agentId=102');
    await h.click(/Configurar P-04/);
    const s = parseRouterSearch(h.search());
    check('«Configurar P-04» opens Configuration on mp.info.6 / P-04 with the way back', s.tabView === 'configuration' && s.configControl === 'mp.info.6' && s.configParam === 'P-04' && s.configBack === 'plugins' && s.control === 'mp.info.6', s);

    h.reset();
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '000', onBack: () => undefined });
    check('op.acc.1 en el manager: «no en el manager de Wazuh»', /no en el manager de Wazuh \(000\)/.test(p), p.slice(0, 400));

    h.reset();
    evaluation = { data: { meta, result: result('PARCIAL'), agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '101', onBack: () => undefined });
    check('101 with a result: the panel, «Activo: srv-web01»', /Panel ejecutivo/.test(p) && /Activo:\s*srv-web01/.test(p), p.slice(0, 300));
    evaluation = { data: undefined, isLoading: true };
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '102', onBack: () => undefined });
    check('switches to 102 and loads: notice «Cargando 102 · ldap01… se muestra el resultado de 101 · srv-web01»',
      /Cargando 102 · ldap01… Mientras tanto se muestra el resultado de 101 · srv-web01/.test(p), p.slice(0, 500));
    check('...with the progress bar and 101\'s header (never 102\'s)', Boolean(h.find('EuiProgress')) && /Activo:\s*srv-web01/.test(p) && !/Activo:\s*ldap01/.test(p));
    evaluation = { data: undefined, error: new Error('timeout'), isLoading: false };
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '102', onBack: () => undefined });
    check('102 fails: the error notice ABOVE the last result of 101, labelled', /tiempo agotado|No se pudo/.test(p) && /último resultado de 101 · srv-web01/.test(p) && /Panel ejecutivo/.test(p), p.slice(0, 600));
    await h.click(/Reintentar/);
    check('«Reintentar» retries', retries === 1, retries);

    h.reset();
    evaluation = { data: undefined, error: new Error('503 Datos incompletos'), isLoading: false };
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.2'), agentId: undefined, onBack: () => undefined });
    check('error with nothing: control title and the notice with «Reintentar»', /op\.acc\.2/.test(p) && /Datos incompletos/.test(p) && Boolean(h.find('EuiButton', /Reintentar/) || h.find('EuiButtonEmpty', /Reintentar/)), p.slice(0, 400));

    h.reset();
    evaluation = { data: { meta, result: { ...result('NO_APLICA'), score: undefined }, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '101', onBack: () => undefined });
    check('NO_APLICA: «no aplica en el nivel», never «todo conforme»', /no aplica en el nivel BAJO/.test(p) && !/Todo lo aplicable/.test(p), p.slice(-400));

    h.reset();
    const draftEvidence = (id: string) => ({ id, description: `Evidencia ${id}`, requirements: ['mp.com.1.1'], levels: ['BAJO'], status: 'NO_EVALUABLE', relatedRules: [], observations: [], observationGroups: [] });
    const draft = { ...result('NO_APLICA'), control: { id: 'mp.com.1' }, score: undefined, requirements: [{ id: 'mp.com.1.1', status: 'NO_APLICA', evidenceIds: ['EV-01'] }], evidences: [draftEvidence('EV-01'), draftEvidence('EV-03')] };
    evaluation = { data: { meta, result: draft, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
    p = await h.render(ControlDetailENS, { control: ctl('mp.com.1'), agentId: '101', onBack: () => undefined });
    check('a control without collector: «Sin medición todavía», the wave and what it needs, never a failure', /Sin medición todavía: mp\.com\.1 es documental de momento/.test(p) && /oleada C/.test(p) && /no se juzga como incumplimiento/.test(p), p.slice(0, 900));
    check('...each evidence with «Fuente necesaria» and no verdict badge', /Fuente necesaria: registro del cortafuegos perimetral \(pfSense/.test(p) && /Fuente necesaria: Syscollector: interfaces de red/.test(p) && !/\[ NO_EVALUABLE \]/.test(p), p.slice(p.indexOf('Evidencias ENS'), p.indexOf('Evidencias ENS') + 900));
    h.reset();
    evaluation = { data: { meta, result: result('PARCIAL'), agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '101', onBack: () => undefined });
    check('...and a measured control shows neither', !/Sin medición todavía/.test(p) && !/Fuente necesaria/.test(p));
  }

  console.log('5. A render failure stays in the tab');
  {
    h.reset();
    let breaks = true;
    const Rota = () => { if (breaks) throw new Error('boom while rendering'); return 'pintada'; };
    const React = require('react');
    const Root = () => React.createElement(TabErrorBoundary, { tabName: 'Panel' }, React.createElement(Rota, null));
    let p = await h.render(Root);
    check('the failure appears as a notice of that tab with the message', /No se pudo mostrar «Panel»/.test(p) && /boom while rendering/.test(p), p);
    breaks = false;
    p = await h.click(/Reintentar/);
    check('«Reintentar» renders it again', /pintada/.test(p) && !/No se pudo mostrar/.test(p), p);
    check('an error without a message is reported all the same', /desconocido/.test(describeRenderError(undefined)));
    h.reset();
    const { ControlsENS } = require('../public/ens/controls');
    h.setSearch('?tabView=plugins&control=op.acc.1&agentId=101');
    let list = await h.render(ControlsENS);
    check('with `control=` in the URL its detail opens', /OP\.ACC\.1/.test(list), list.slice(0, 200));
    h.setSearch('?tabView=plugins&control=mp.info.6&agentId=101');
    list = await h.rerender();
    check('if the URL changes control with the detail open, the detail follows', /MP\.INFO\.6/.test(list) && !/OP\.ACC\.1 -/.test(list), list.slice(0, 200));
    await h.click(/Volver a controles/);
    check('«Volver a controles» removes the control from the URL and returns to the list', !parseRouterSearch(h.search()).control && h.findAll('EuiFacetButton').length === 34, h.search());
  }

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
