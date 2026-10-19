/** Switching agent resets the whole app (tab bar and tab), not just the screen. */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) failures.push(n);
};

const responses = new Map<string, any>();
const mounts: Record<string, number> = {};
const claves: Record<string, string[]> = {};
const clave = (p: any) => JSON.stringify(Object.keys(p).sort().map(k => [k, p[k]]));
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: (p: any) => {
        const React = require('react');
        const mounted = React.useRef(false);
        const who = `${p.include}${p.controlId ? `:${p.controlId}` : ''}`;
        if (!mounted.current) {
          mounted.current = true;
          mounts[who] = (mounts[who] || 0) + 1;
        }
        const { enabled, ...requested } = p;
        (claves[who] = claves[who] || []).push(clave(requested));
        const r = responses.get(clave(requested));
        return { data: r?.data, error: r?.error, isLoading: !r || r.loading, isRefreshing: false, retry: () => undefined };
      },
    }),
    [`${__dirname}/../public/ens/configuration/index.tsx`]: real => ({ ...real, ENSConfigurationBootstrap: ({ children }: any) => children }),
  },
});

const { readFileSync, readdirSync } = require('fs');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { hydrateENSScope } = require('../common/ens/core/scope/runtime');
const { EnsApp } = require('../public/app/ens-app');
const React = require('react');
const { TabErrorBoundary } = require('../public/app/tab-error-boundary');

const meta = (agentId?: string) => ({ computedAt: '2026-10-17T12:05:00Z', evaluatedAt: '2026-10-17T12:05:00Z', fingerprint: `f${agentId}`, level: 'BAJO', facts: { count: 1 }, scope: [{ id: '101', name: 'srv-web01' }, { id: '102', name: 'ldap01' }, { id: '000', name: 'manager01' }] });
const result = (score: number) => ({ control: { id: 'op.acc.1' }, status: 'PARCIAL', score, requirements: [{ id: 'op.acc.1.1', status: 'CUMPLE', evidenceIds: [] }], evidences: [], nonConformities: [], applicableRequirements: 1, measuredRequirements: 1, traceability: [] });
const detail = (agentId?: string) => clave({ include: 'control', controlId: 'op.acc.1', agentId, timelineDays: 30 });

(async () => {
  const blocks: Record<string, any> = {};
  readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
    const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
    blocks[b.controlId] = b;
  });
  ensConfigurationRepository.completeHydration({ ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: ['op.acc.1'].map(id => JSON.parse(JSON.stringify(blocks[id]))) });
  await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => [
    { id: '101', name: 'srv-web01', groups: ['ens'], status: 'active' },
    { id: '102', name: 'ldap01', groups: ['ens'], status: 'active' },
  ] as any, true);

  console.log('1. Detail: switching machine');
  responses.set(detail('101'), { data: { meta: meta('101'), result: result(80), agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 } });
  h.setSearch('?tabView=plugins&control=op.acc.1&agentId=101');
  let p = await h.render(EnsApp, undefined, 5);
  check('the tab with the op.acc.1 detail on 101', /Panel ejecutivo/.test(p) && /Activo:\s*srv-web01/.test(p), p.slice(0, 300));
  const mountsBefore = mounts['control:op.acc.1'];
  h.setSearch('?tabView=plugins&control=op.acc.1&agentId=102');
  p = await h.rerender();
  check('choosing 102 the tab is not unmounted (the detail stays mounted)', mounts['control:op.acc.1'] === mountsBefore, { antes: mountsBefore, despues: mounts['control:op.acc.1'] });
  check('...and asks for 102\'s data', claves['control:op.acc.1'].slice(-1)[0] === detail('102'));
  check('while it arrives: 101\'s data labelled, with the loading', /Cargando 102 · ldap01… Mientras tanto se muestra el resultado de 101 · srv-web01/.test(p) && /Panel ejecutivo/.test(p) && Boolean(h.find('EuiProgress')), p.slice(0, 600));
  check('...with 101\'s header, never 102\'s', /Activo:\s*srv-web01/.test(p) && !/Activo:\s*ldap01/.test(p));
  responses.set(detail('102'), { data: { meta: meta('102'), result: result(40), agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 } });
  p = await h.rerender();
  check('102\'s arrives: its result, no warning', /Activo:\s*ldap01/.test(p) && !/Mientras tanto/.test(p) && /40%/.test(p));

  console.log('2. The new machine fails');
  h.setSearch('?tabView=plugins&control=op.acc.1&agentId=101');
  responses.set(detail('101'), { error: new Error('timeout'), loading: false });
  p = await h.rerender();
  check('the error notice above the last result (102\'s), labelled', /tiempo agotado|No se pudo/.test(p) && /último resultado de 102 · ldap01/.test(p) && /Panel ejecutivo/.test(p), p.slice(0, 600));
  check('...and without unmounting', mounts['control:op.acc.1'] === mountsBefore);

  console.log('3. Vista general');
  const general = { meta: meta(), controls: [], agents: [], freshness: { checkedAt: '2026-10-17T12:05:00Z', agents: [], cells: [] }, nonConformities: [] };
  responses.set(clave({ include: 'overview' }), { data: general });
  h.setSearch('?tabView=overview&agentId=101');
  p = await h.render(EnsApp, undefined, 5);
  check('the Overview rendered', /Controles × máquinas/.test(p), p.slice(0, 200));
  const group = h.find('EuiButtonGroup');
  group!.props.onChange('frescura');
  await h.rerender();
  const mountedBefore = mounts.overview;
  const requestedBefore = new Set(claves.overview).size;
  h.setSearch('?tabView=overview&agentId=102');
  p = await h.rerender();
  check('switching machine does not mount it again', mounts.overview === mountedBefore, mounts);
  check('nor does it change the overview request (same key: the hook does not ask again)', new Set(claves.overview).size === requestedBefore && requestedBefore === 1, claves.overview.slice(-2));
  check('keeps the chosen view («Frescura»)', h.find('EuiButtonGroup')?.props.idSelected === 'frescura');
  check('only the trend changes key (it is per machine)', claves.summary.slice(-1)[0].includes('"102"'));

  console.log('4. Switching tab');
  h.setSearch('?tabView=configuration&configControl=op.acc.1&configParam=P-07&configBack=plugins&control=op.acc.1&agentId=101');
  await h.rerender();
  await h.click(/^Panel$/, 'EuiTab');
  const tras = require('../public/routing/router-search').parseRouterSearch(h.search());
  check('clicking another tab clears everything from Configuration (also the way back) and keeps machine and control', tras.tabView === 'dashboard' && !Object.keys(tras).some(k => k.startsWith('config')) && tras.agentId === '101' && tras.control === 'op.acc.1', tras);

  console.log('5. A machine outside the scope');
  const requestedBeforeOutside = Object.values(claves).reduce((n, l) => n + l.length, 0);
  h.setSearch('?tabView=plugins&control=op.acc.1&agentId=025');
  p = await h.rerender();
  check('the selector says so and offers to remove it', /025 no está en el alcance ENS/.test(p) && Boolean(h.find('EuiButton', /Quitar la máquina/)));
  check('...and no screen requests that machine\'s evaluation', Object.values(claves).reduce((n, l) => n + l.length, 0) === requestedBeforeOutside && !/Panel ejecutivo/.test(p));
  await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => [{ id: '024', name: 'srv-c', groups: ['ens'], status: 'active' }] as any, true);
  const { MachineSelector } = require('../public/app/machine-selector');
  h.reset();
  h.setSearch('?tabView=plugins&agentId=24');
  p = await h.render(MachineSelector);
  check('«24» is 024: the selector shows it chosen and without warning', h.find('EuiSuperSelect')?.props.valueOfSelected === '024' && !/no está en el alcance/.test(p), h.find('EuiSuperSelect')?.props.valueOfSelected);

  console.log('6. A render failure is cleared when switching machine');
  h.reset();
  let breaks = true;
  const Rota = () => { if (breaks) throw new Error('boom'); return 'pintada'; };
  let reset = 'a';
  const Root = () => React.createElement(TabErrorBoundary, { tabName: 'Panel', resetKey: reset }, React.createElement(Rota, null));
  p = await h.render(Root);
  check('the failure, as a notice', /No se pudo mostrar «Panel»/.test(p));
  breaks = false;
  reset = 'b';
  p = await h.rerender();
  check('another machine: it renders again without clicking anything', /pintada/.test(p) && !/No se pudo mostrar/.test(p), p);

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
