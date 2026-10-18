/**
 * «Al cambiar de agente desaparece» (revisión de Task 2, pantalla C1): la app
 * entera (barra de pestañas + pestaña), no la pantalla suelta.
 *
 *   npx --yes tsx tests/app-machine-switch.test.ts
 *
 *   1. Detalle de op.acc.1 en 101 y cambio a 102: la pestaña NO se desmonta;
 *      mientras llega lo de 102 se ve lo de 101 rotulado «Mientras tanto se
 *      muestra el resultado de 101 · …», y después lo de 102.
 *   2. Si falla 102: el aviso de error encima del último resultado de 101.
 *   3. Vista general: cambiar de máquina no la vuelve a montar, no vuelve a
 *      pedir `include=overview` (su clave no lleva máquina) y conserva la vista
 *      elegida («Frescura»); solo la tendencia cambia de clave.
 *   4. Un fallo de pintado se borra al cambiar de máquina, sin desmontar.
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

// La evaluación «del servidor», por petición; cuenta cuántas veces se MONTA
// cada uso del hook (un montaje nuevo = una petición nueva en el hook real).
const respuestas = new Map<string, any>();
const montajes: Record<string, number> = {};
const claves: Record<string, string[]> = {};
const clave = (p: any) => JSON.stringify(Object.keys(p).sort().map(k => [k, p[k]]));
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: (p: any) => {
        const React = require('react');
        const montado = React.useRef(false);
        const quien = `${p.include}${p.controlId ? `:${p.controlId}` : ''}`;
        if (!montado.current) {
          montado.current = true;
          montajes[quien] = (montajes[quien] || 0) + 1;
        }
        const { enabled, ...pedido } = p;
        (claves[quien] = claves[quien] || []).push(clave(pedido));
        const r = respuestas.get(clave(pedido));
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
const resultado = (score: number) => ({ control: { id: 'op.acc.1' }, status: 'PARCIAL', score, requirements: [{ id: 'op.acc.1.1', status: 'CUMPLE', evidenceIds: [] }], evidences: [], nonConformities: [], applicableRequirements: 1, measuredRequirements: 1, traceability: [] });
const detalle = (agentId?: string) => clave({ include: 'control', controlId: 'op.acc.1', agentId, timelineDays: 30 });

(async () => {
  const bloques: Record<string, any> = {};
  readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
    const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
    bloques[b.controlId] = b;
  });
  ensConfigurationRepository.completeHydration({ ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: ['op.acc.1'].map(id => JSON.parse(JSON.stringify(bloques[id]))) });
  await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => [
    { id: '101', name: 'srv-web01', groups: ['ens'], status: 'active' },
    { id: '102', name: 'ldap01', groups: ['ens'], status: 'active' },
  ] as any, true);

  console.log('1. Detalle: cambiar de máquina');
  respuestas.set(detalle('101'), { data: { meta: meta('101'), result: resultado(80), agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 } });
  h.setSearch('?tabView=plugins&control=op.acc.1&agentId=101');
  let p = await h.render(EnsApp, undefined, 5);
  comprueba('la pestaña con el detalle de op.acc.1 en 101', /Panel ejecutivo/.test(p) && /Activo:\s*srv-web01/.test(p), p.slice(0, 300));
  const montajesAntes = montajes['control:op.acc.1'];
  h.setSearch('?tabView=plugins&control=op.acc.1&agentId=102');
  p = await h.rerender();
  comprueba('al elegir 102 la pestaña no se desmonta (el detalle sigue montado)', montajes['control:op.acc.1'] === montajesAntes, { antes: montajesAntes, despues: montajes['control:op.acc.1'] });
  comprueba('…y pide lo de 102', claves['control:op.acc.1'].slice(-1)[0] === detalle('102'));
  comprueba('mientras llega: lo de 101 rotulado, con la carga', /Cargando 102 · ldap01… Mientras tanto se muestra el resultado de 101 · srv-web01/.test(p) && /Panel ejecutivo/.test(p) && Boolean(h.find('EuiProgress')), p.slice(0, 600));
  comprueba('…con la cabecera de 101, nunca la de 102', /Activo:\s*srv-web01/.test(p) && !/Activo:\s*ldap01/.test(p));
  respuestas.set(detalle('102'), { data: { meta: meta('102'), result: resultado(40), agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 } });
  p = await h.rerender();
  comprueba('llega lo de 102: su resultado, sin aviso', /Activo:\s*ldap01/.test(p) && !/Mientras tanto/.test(p) && /40%/.test(p));

  console.log('2. Falla la máquina nueva');
  h.setSearch('?tabView=plugins&control=op.acc.1&agentId=101');
  respuestas.set(detalle('101'), { error: new Error('tiempo agotado'), loading: false });
  p = await h.rerender();
  comprueba('el aviso de error encima del último resultado (el de 102), rotulado', /tiempo agotado|No se pudo/.test(p) && /último resultado de 102 · ldap01/.test(p) && /Panel ejecutivo/.test(p), p.slice(0, 600));
  comprueba('…y sin desmontar', montajes['control:op.acc.1'] === montajesAntes);

  console.log('3. Vista general');
  const general = { meta: meta(), controls: [], agents: [], freshness: { checkedAt: '2026-10-17T12:05:00Z', agents: [], cells: [] }, nonConformities: [] };
  respuestas.set(clave({ include: 'overview' }), { data: general });
  h.setSearch('?tabView=overview&agentId=101');
  p = await h.render(EnsApp, undefined, 5);
  comprueba('la Vista general pintada', /Controles × máquinas/.test(p), p.slice(0, 200));
  const grupo = h.find('EuiButtonGroup');
  grupo!.props.onChange('frescura');
  await h.rerender();
  const montadaAntes = montajes.overview;
  const pedidasAntes = new Set(claves.overview).size;
  h.setSearch('?tabView=overview&agentId=102');
  p = await h.rerender();
  comprueba('cambiar de máquina no la vuelve a montar', montajes.overview === montadaAntes, montajes);
  comprueba('ni cambia la petición de la vista general (la misma clave: el hook no pide de nuevo)', new Set(claves.overview).size === pedidasAntes && pedidasAntes === 1, claves.overview.slice(-2));
  comprueba('conserva la vista elegida («Frescura»)', h.find('EuiButtonGroup')?.props.idSelected === 'frescura');
  comprueba('solo la tendencia cambia de clave (es de la máquina)', claves.summary.slice(-1)[0].includes('"102"'));

  console.log('4. Cambiar de pestaña');
  h.setSearch('?tabView=configuration&configControl=op.acc.1&configParam=P-07&configBack=plugins&control=op.acc.1&agentId=101');
  await h.rerender();
  await h.click(/^Panel$/, 'EuiTab');
  const tras = require('../public/routing/router-search').parseRouterSearch(h.search());
  comprueba('pulsar otra pestaña limpia todo lo de Configuración (también la vuelta) y conserva máquina y control', tras.tabView === 'dashboard' && !Object.keys(tras).some(k => k.startsWith('config')) && tras.agentId === '101' && tras.control === 'op.acc.1', tras);

  console.log('5. Un fallo de pintado se borra al cambiar de máquina');
  h.reset();
  let rompe = true;
  const Rota = () => { if (rompe) throw new Error('boom'); return 'pintada'; };
  let reset = 'a';
  const Raiz = () => React.createElement(TabErrorBoundary, { tabName: 'Panel', resetKey: reset }, React.createElement(Rota, null));
  p = await h.render(Raiz);
  comprueba('el fallo, como aviso', /No se pudo mostrar «Panel»/.test(p));
  rompe = false;
  reset = 'b';
  p = await h.rerender();
  comprueba('otra máquina: se vuelve a pintar sin pulsar nada', /pintada/.test(p) && !/No se pudo mostrar/.test(p), p);

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
