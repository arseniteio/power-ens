/**
 * El Detalle del control no desaparece (diagnóstico de 17/10, §1):
 *
 *   npx --yes tsx tests/control-detail-states.test.ts
 *
 *   1. «No se mide en esta máquina»: los 14 controles de plano `agent` en el
 *      manager (000) y mp.info.6 fuera de su P-04 dan un motivo; los de solo
 *      manager en otra máquina y los que sí se miden, ninguno.
 *   2. Qué se enseña: lo de ahora; mientras llega o si falla, lo último del
 *      MISMO control rotulado con SU máquina; otro control nunca hereda.
 *   3. La máquina de la URL fuera del alcance; ida y vuelta a Configuración.
 *   4. La pantalla pintada: sin resultado → «no se mide» con sus botones y sin
 *      «todo conforme»; cambio de máquina → el resultado anterior rotulado y la
 *      carga; error → aviso encima del último resultado; error sin nada → aviso.
 *   5. Un fallo al pintar una pestaña se queda en ella, con «Reintentar».
 */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) fallos.push(n);
};

// La evaluación que «devuelve el servidor», a mano.
let evaluacion: any = { data: undefined, error: undefined, isLoading: true, isRefreshing: false };
let reintentos = 0;
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: () => ({ ...evaluacion, retry: () => { reintentos += 1; } }),
    }),
  },
});

const { ENSCatalog } = require('../common/ens/catalog');
const planes = require('../common/ens/core/scope/measurement-planes') as typeof import('../common/ens/core/scope/measurement-planes');
const estado = require('../public/ens/controls/control-detail/detail-view-state') as typeof import('../public/ens/controls/control-detail/detail-view-state');
const alcance = require('../public/app/agent-in-scope') as typeof import('../public/app/agent-in-scope');
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
const mpInfo6Config = (valor: string[]) => ({ controlId: 'mp.info.6', parameters: [{ id: 'P-04', value: valor }] }) as any;

(async () => {
  console.log('1. No se mide en esta máquina');
  {
    const deAgente = ENSCatalog.filter((c: any) => !planes.isControlMeasuredOnPlane(c, 'manager')).map((c: any) => c.id).sort();
    comprueba('14 controles de plano agent', deAgente.length === 14, deAgente);
    const enManager = deAgente.map((id: string) => planes.describeNotMeasuredOnAgent(control(id), '000', 'Manager', undefined));
    comprueba('los 14, en el manager: PLANE con su texto', enManager.every((m: any) => m?.cause === 'PLANE' && /no en el manager de Wazuh \(000\)/.test(m.text)), enManager.map((m: any) => m?.cause));
    const soloManager = ENSCatalog.filter((c: any) => planes.isManagerOnlyControl(c));
    comprueba('los de solo manager, en otra máquina: sin motivo (se ven con la fila del manager)',
      soloManager.length === 7 && soloManager.every((c: any) => planes.describeNotMeasuredOnAgent(c, '101', 'srv-web01', undefined) === undefined), soloManager.map((c: any) => c.id));
    comprueba('los de solo manager, en el manager: sin motivo', soloManager.every((c: any) => planes.describeNotMeasuredOnAgent(c, '000', 'Manager', undefined) === undefined));
    comprueba('op.exp.8 y op.mon.3 (los dos planos), en el manager y en otra: sin motivo',
      ['op.exp.8', 'op.mon.3'].every(id => !planes.describeNotMeasuredOnAgent(control(id), '000', 'M', undefined) && !planes.describeNotMeasuredOnAgent(control(id), '101', 'x', undefined)));
    const p04 = mpInfo6Config(['srv-copias | MEDIA', 'srv-web01 | MEDIA']);
    const fuera = planes.describeNotMeasuredOnAgent(control('mp.info.6'), '102', 'ldap01', p04);
    comprueba('mp.info.6 en una máquina que P-04 no declara: DECLARED_SCOPE, con P-04 y las declaradas',
      fuera?.cause === 'DECLARED_SCOPE' && fuera.parameterId === 'P-04' && /P-04 \(srv-copias, srv-web01\)/.test(fuera.text) && /102 · ldap01 no está entre ellas/.test(fuera.text), fuera);
    comprueba('mp.info.6 en una declarada (sin distinguir mayúsculas): sin motivo', planes.describeNotMeasuredOnAgent(control('mp.info.6'), '101', 'SRV-WEB01', p04) === undefined);
    const vacio = planes.describeNotMeasuredOnAgent(control('mp.info.6'), '101', 'srv-web01', mpInfo6Config([]));
    comprueba('mp.info.6 con P-04 vacío: lo dice', vacio?.cause === 'DECLARED_SCOPE' && /no declara ninguna/.test(vacio.text), vacio);
    comprueba('mp.info.6 en el manager: PLANE (es de plano agent)', planes.describeNotMeasuredOnAgent(control('mp.info.6'), '000', 'M', p04)?.cause === 'PLANE');
  }

  console.log('2. Qué se enseña');
  {
    const r = (agentId?: string) => ({ controlId: 'op.acc.1', agentId });
    const dato = (n: string) => ({ n, meta: { computedAt: '2026-10-17T12:05:00Z' } });
    const at = (d: any) => d.meta.computedAt;
    const actual = estado.decideDetailView(r('101'), { data: dato('a'), isLoading: false }, undefined, at);
    comprueba('lo de ahora: shown, current, su máquina', actual.kind === 'shown' && actual.current && actual.agentId === '101' && (actual as any).data.n === 'a');
    const ret = estado.nextRetained(r('101'), { data: dato('a'), isLoading: false }, undefined, at);
    comprueba('se guarda lo de ahora con su máquina y su hora', ret?.agentId === '101' && ret?.computedAt === '2026-10-17T12:05:00Z');
    const cargando = estado.decideDetailView(r('102'), { data: undefined, isLoading: true }, ret, at);
    comprueba('otra máquina cargando: lo anterior, NO current, rotulado con 101, cargando',
      cargando.kind === 'shown' && !cargando.current && cargando.agentId === '101' && cargando.loading && (cargando as any).data.n === 'a', cargando);
    comprueba('…y se sabe que es de otra máquina', estado.isFromAnotherMachine(r('102'), cargando));
    comprueba('lo retenido no cambia mientras carga', estado.nextRetained(r('102'), { data: undefined, isLoading: true }, ret, at) === ret);
    const fallo = estado.decideDetailView(r('102'), { data: undefined, error: new Error('x'), isLoading: false }, ret, at);
    comprueba('falla la otra máquina: lo anterior rotulado y el error', fallo.kind === 'shown' && !fallo.current && (fallo as any).error && fallo.agentId === '101' && !fallo.loading);
    const otroControl = estado.decideDetailView({ controlId: 'op.acc.2', agentId: '101' }, { data: undefined, isLoading: true }, ret, at);
    comprueba('otro control nunca hereda: carga', otroControl.kind === 'loading');
    const otroControlError = estado.decideDetailView({ controlId: 'op.acc.2' }, { data: undefined, error: new Error('x'), isLoading: false }, ret, at);
    comprueba('otro control con error: error, sin nada que enseñar', otroControlError.kind === 'error');
    comprueba('nada aún: carga', estado.decideDetailView(r(), { data: undefined, isLoading: true }, undefined).kind === 'loading');
    const mismaFallo = estado.decideDetailView(r('101'), { data: undefined, error: new Error('x'), isLoading: false }, ret, at);
    comprueba('misma máquina, falla el refresco: lo último, sin «otra máquina»', mismaFallo.kind === 'shown' && !estado.isFromAnotherMachine(r('101'), mismaFallo));
    const hoy = new Date('2026-10-17T18:00:00Z');
    comprueba('la hora de hoy: «las HH:MM»', /^las \d\d:\d\d$/.test(estado.describeComputedAt('2026-10-17T12:05:00Z', hoy) || ''));
    comprueba('la de otro día: «el dd/mm a las HH:MM»', /^el \d\d\/\d\d a las \d\d:\d\d$/.test(estado.describeComputedAt('2026-10-15T12:05:00Z', hoy) || ''));
  }

  console.log('3. Máquina fuera del alcance; ida y vuelta a Configuración');
  {
    const scope = [{ id: '000' }, { id: '024' }];
    comprueba('sin máquina: en el alcance', alcance.isAgentInScope(undefined, scope));
    comprueba('024 y 24: en el alcance', alcance.isAgentInScope('024', scope) && alcance.isAgentInScope('24', scope));
    comprueba('025: fuera', !alcance.isAgentInScope('025', scope));
    const ida = enlace.detailConfigurationChanges({ controlId: 'op.acc.1', agentId: '024', hasAgentLevelParameters: true });
    const url = parseRouterSearch(withRouterSearch('?tabView=plugins&control=op.acc.1&agentId=024', ida));
    comprueba('«Configurar este control» con máquina y parámetros por sistema: la página de esa máquina, en el control',
      url.tabView === 'configuration' && url.configAgent === '024' && url.configControl === 'op.acc.1' && !url.configParam, url);
    comprueba('…conserva control y máquina y deja la vuelta', url.control === 'op.acc.1' && url.agentId === '024' && url.configBack === 'plugins', url);
    const org = parseRouterSearch(withRouterSearch('?tabView=plugins&control=op.cont.2&agentId=024', enlace.detailConfigurationChanges({ controlId: 'op.cont.2', agentId: '024', hasAgentLevelParameters: false })));
    comprueba('control sin parámetros por sistema: Organización', org.configControl === 'op.cont.2' && !org.configAgent && !org.configView, org);
    const param = parseRouterSearch(withRouterSearch('', enlace.detailConfigurationChanges({ controlId: 'op.exp.10', agentId: '024', parameterId: 'P-02', parameterIsAgentLevel: false })));
    comprueba('parámetro de organización con máquina elegida: Organización, en el parámetro', param.configControl === 'op.exp.10' && param.configParam === 'P-02' && !param.configAgent, param);
    const vuelta = enlace.parseConfigurationBack(url);
    comprueba('la vuelta se lee de la URL', vuelta?.tabView === 'plugins' && vuelta?.controlId === 'op.acc.1');
    const atras = parseRouterSearch(withRouterSearch(withRouterSearch('?tabView=plugins&control=op.acc.1&agentId=024', ida), enlace.configurationBackChanges(vuelta!)));
    comprueba('volver: Detalle, mismo control y máquina, sin nada de Configuración',
      atras.tabView === 'plugins' && atras.control === 'op.acc.1' && atras.agentId === '024' && !Object.keys(atras).some(k => k.startsWith('config')), atras);
    comprueba('sin configBack no hay vuelta', enlace.parseConfigurationBack({ control: 'op.acc.1' }) === undefined);
    const app = readFileSync(`${__dirname}/../public/app/ens-app.tsx`, 'utf8');
    comprueba('cambiar de pestaña limpia también configBack', /configBack: undefined/.test(app));
  }

  console.log('4. La pantalla');
  {
    const bloques: Record<string, any> = {};
    readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
      const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
      bloques[b.controlId] = b;
    });
    const doc = { ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: ['op.acc.1', 'mp.info.6'].map(id => JSON.parse(JSON.stringify(bloques[id]))) };
    doc.controls[1].parameters.find((p: any) => p.id === 'P-04').value = ['srv-web01 | MEDIA'];
    ensConfigurationRepository.completeHydration(doc);
    const agentes = [
      { id: '101', name: 'srv-web01', groups: ['ens'], status: 'active' },
      { id: '102', name: 'ldap01', groups: ['ens'], status: 'active' },
    ];
    await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => agentes as any, true);
    const ctl = (id: string) => ENSControls.find((c: any) => c.id === id);
    const meta = { computedAt: '2026-10-17T12:05:00Z', evaluatedAt: '2026-10-17T12:05:00Z', fingerprint: 'f', level: 'BAJO', facts: { count: 1 } };
    const resultado = (estado: string) => ({ control: { id: 'op.acc.1' }, status: estado, score: 20, requirements: [{ id: 'op.acc.1.1', status: 'CUMPLE', evidenceIds: [] }], evidences: [], nonConformities: [], applicableRequirements: 1, measuredRequirements: 1, traceability: [] });

    // a) mp.info.6 en 102 (fuera de P-04): el servidor no da resultado.
    h.setSearch('?tabView=plugins&control=mp.info.6&agentId=102');
    evaluacion = { data: { meta, result: undefined, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
    let p = await h.render(ControlDetailENS, { control: ctl('mp.info.6'), agentId: '102', onBack: () => undefined });
    comprueba('sin resultado: «mp.info.6 no se mide en 102 · ldap01» con el motivo de P-04', /mp\.info\.6 no se mide en 102 · ldap01/.test(p) && /P-04 \(srv-web01\)/.test(p), p.slice(0, 600));
    comprueba('…sin «todo conforme» ni cifras', !/Todo lo aplicable/.test(p) && !/Panel ejecutivo/.test(p));
    comprueba('…con «Ver todas las máquinas» y «Configurar P-04»', Boolean(h.find('EuiButton', /Ver todas las máquinas/)) && Boolean(h.find('EuiButtonEmpty', /Configurar P-04/)));
    await h.click(/Ver todas las máquinas/);
    comprueba('«Ver todas las máquinas» quita la máquina de la URL', !parseRouterSearch(h.search()).agentId && parseRouterSearch(h.search()).control === 'mp.info.6', h.search());
    h.setSearch('?tabView=plugins&control=mp.info.6&agentId=102');
    await h.click(/Configurar P-04/);
    const s = parseRouterSearch(h.search());
    comprueba('«Configurar P-04» abre Configuración en mp.info.6 / P-04 con la vuelta', s.tabView === 'configuration' && s.configControl === 'mp.info.6' && s.configParam === 'P-04' && s.configBack === 'plugins' && s.control === 'mp.info.6', s);

    // b) op.acc.1 en el manager: tampoco hay fila.
    h.reset();
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '000', onBack: () => undefined });
    comprueba('op.acc.1 en el manager: «no en el manager de Wazuh»', /no en el manager de Wazuh \(000\)/.test(p), p.slice(0, 400));

    // c) Un resultado en 101 y después se pide 102: lo de 101 rotulado.
    h.reset();
    evaluacion = { data: { meta, result: resultado('PARCIAL'), agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '101', onBack: () => undefined });
    comprueba('101 con resultado: el panel, «Activo: srv-web01»', /Panel ejecutivo/.test(p) && /Activo:\s*srv-web01/.test(p), p.slice(0, 300));
    evaluacion = { data: undefined, isLoading: true };
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '102', onBack: () => undefined });
    comprueba('cambia a 102 y carga: aviso «Cargando 102 · ldap01… se muestra el resultado de 101 · srv-web01»',
      /Cargando 102 · ldap01… Mientras tanto se muestra el resultado de 101 · srv-web01/.test(p), p.slice(0, 500));
    comprueba('…con la barra de progreso y la cabecera de 101 (nunca la de 102)', Boolean(h.find('EuiProgress')) && /Activo:\s*srv-web01/.test(p) && !/Activo:\s*ldap01/.test(p));
    evaluacion = { data: undefined, error: new Error('tiempo agotado'), isLoading: false };
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '102', onBack: () => undefined });
    comprueba('falla 102: el aviso de error ENCIMA del último resultado de 101, rotulado', /tiempo agotado|No se pudo/.test(p) && /último resultado de 101 · srv-web01/.test(p) && /Panel ejecutivo/.test(p), p.slice(0, 600));
    await h.click(/Reintentar/);
    comprueba('«Reintentar» reintenta', reintentos === 1, reintentos);

    // d) Error sin nada anterior: el aviso, no una página en blanco.
    h.reset();
    evaluacion = { data: undefined, error: new Error('503 Datos incompletos'), isLoading: false };
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.2'), agentId: undefined, onBack: () => undefined });
    comprueba('error sin nada: título del control y el aviso con «Reintentar»', /OP\.ACC\.2/.test(p) && /Datos incompletos/.test(p) && Boolean(h.find('EuiButton', /Reintentar/) || h.find('EuiButtonEmpty', /Reintentar/)), p.slice(0, 400));

    // e) NO_APLICA sin no conformidades: no «todo conforme».
    h.reset();
    evaluacion = { data: { meta, result: { ...resultado('NO_APLICA'), score: undefined }, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
    p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), agentId: '101', onBack: () => undefined });
    comprueba('NO_APLICA: «no aplica en el nivel», nunca «todo conforme»', /no aplica en el nivel BAJO/.test(p) && !/Todo lo aplicable/.test(p), p.slice(-400));
  }

  console.log('5. Un fallo al pintar se queda en la pestaña');
  {
    h.reset();
    let rompe = true;
    const Rota = () => { if (rompe) throw new Error('boom al pintar'); return 'pintada'; };
    const React = require('react');
    const Raiz = () => React.createElement(TabErrorBoundary, { tabName: 'Panel' }, React.createElement(Rota, null));
    let p = await h.render(Raiz);
    comprueba('el fallo sale como aviso de esa pestaña con el mensaje', /No se pudo mostrar «Panel»/.test(p) && /boom al pintar/.test(p), p);
    rompe = false;
    p = await h.click(/Reintentar/);
    comprueba('«Reintentar» vuelve a pintarla', /pintada/.test(p) && !/No se pudo mostrar/.test(p), p);
    comprueba('un error sin mensaje se dice igual', /desconocido/.test(describeRenderError(undefined)));
    const app = readFileSync(`${__dirname}/../public/app/ens-app.tsx`, 'utf8');
    comprueba('cada pestaña va dentro de su TabErrorBoundary con key pestaña + máquina', /<TabErrorBoundary key=\{`\$\{pestana\.id\}\|\$\{agentId \|\| ''\}`\}/.test(app));
    const lista = readFileSync(`${__dirname}/../public/ens/controls/index.tsx`, 'utf8');
    comprueba('el control abierto sale de la URL (sin estado local) y elegir uno lo escribe en ella',
      /ENSControls\.find\(item => item\.id === control\)/.test(lista) && /cambiaUrl\(\{ control: (ensControl|entrada)\.id \}\)/.test(lista) && !/setSelectedControl/.test(lista));
  }

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
