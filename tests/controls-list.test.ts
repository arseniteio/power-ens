/**
 * Los controles no desaparecen de la lista (diagnóstico de 17/10, §2):
 *
 *   npx --yes tsx tests/controls-list.test.ts
 *
 *   1. El modelo: siempre los 23; los que no se miden en la máquina elegida,
 *      al final y con el motivo (14 en el manager; mp.info.6 fuera de P-04);
 *      sin configurar, marcados; «Nivel BAJO: 4 controles no aplican»; la
 *      barra de máquinas por control.
 *   2. La pantalla: 23 filas con el manager, las 14 en gris al final y sin
 *      número; la carga con un spinner, no un veredicto; «Añadir con valores
 *      por defecto» guarda el documento con el control añadido.
 *   3. El motor: un control que no está en la configuración activa da la
 *      acción de darlo de alta, nunca la del productor de la evidencia.
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

let evaluacion: any = { data: undefined, error: undefined, isLoading: true, isRefreshing: false };
let reintentos = 0;
const guardados: any[] = [];
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: () => ({ ...evaluacion, retry: () => { reintentos += 1; } }),
    }),
  },
});
const httpFalso = {
  get: async () => ({ statusCode: 200, error: 0, data: { configuration: null, metadata: null } }),
  put: async (_url: string, opciones: any) => {
    const cuerpo = JSON.parse(opciones.body);
    guardados.push(cuerpo);
    return { statusCode: 200, error: 0, data: { configuration: cuerpo.configuration, metadata: null } };
  },
};
(require('../common/ens/configuration/services/configuration-http-client')).setENSConfigurationHttp(() => httpFalso);

const { ENSCatalog } = require('../common/ens/catalog');
const modelo = require('../public/ens/controls/controls-list-model') as typeof import('../public/ens/controls/controls-list-model');
const planes = require('../common/ens/core/scope/measurement-planes') as typeof import('../common/ens/core/scope/measurement-planes');
const { ENSControls } = require('../public/ens/data');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { hydrateENSScope, getActiveENSScopeAgents } = require('../common/ens/core/scope/runtime');
const { getENSComplianceState } = require('../common/ens/core/ens-engine');
const { ControlsENS } = require('../public/ens/controls');
const { parseRouterSearch } = require('../public/routing/router-search');
const { readFileSync, readdirSync } = require('fs');

const bloques: Record<string, any> = {};
readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
  const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
  bloques[b.controlId] = b;
});
const FALTAN = ['op.cont.2', 'op.cont.3', 'op.mon.1', 'op.mon.2', 'op.mon.3', 'op.nub.1'];
const documento = () => {
  const doc = { ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: Object.keys(bloques).filter(id => !FALTAN.includes(id)).map(id => JSON.parse(JSON.stringify(bloques[id]))) };
  doc.global.ensLevel = 'BAJO';
  doc.controls.find((c: any) => c.controlId === 'mp.info.6').parameters.find((p: any) => p.id === 'P-04').value = ['srv-web01 | MEDIA'];
  return doc;
};
const listaDe = (agentId?: string, nombre?: string, extra: any = {}) =>
  modelo.buildControlListEntries(
    ENSControls.map((c: any) => ({ id: c.id, title: c.title, activeLevels: c.scope.activeLevels })),
    {
      agentId,
      summaries: new Map(),
      isConfigured: id => !FALTAN.includes(id),
      notMeasured: id => (agentId ? planes.describeNotMeasuredOnAgent(ENSCatalog.find((c: any) => c.id === id), agentId, nombre, { controlId: 'mp.info.6', parameters: [{ id: 'P-04', value: ['srv-web01 | MEDIA'] }] } as any) : undefined),
      levelOf: () => 'BAJO',
      ...extra,
    }
  );

(async () => {
  console.log('1. El modelo');
  {
    const manager = listaDe('000', 'Manager');
    comprueba('con el manager: los 23', manager.length === 23 && ENSControls.length === 23);
    const grises = manager.filter(e => !e.measured);
    comprueba('14 sin medir, todos al final y con el motivo PLANE', grises.length === 14 && manager.slice(-14).every(e => !e.measured && e.notMeasured?.cause === 'PLANE'), grises.map(e => e.id));
    comprueba('los medidos, primero y en el orden del catálogo', JSON.stringify(manager.slice(0, 9).map(e => e.id)) === JSON.stringify(ENSControls.map((c: any) => c.id).filter((id: string) => !grises.some(g => g.id === id))));
    const ldap = listaDe('102', 'ldap01');
    comprueba('con una máquina fuera de P-04: los 23 y mp.info.6 el último, con P-04', ldap.length === 23 && ldap[22].id === 'mp.info.6' && ldap[22].notMeasured?.cause === 'DECLARED_SCOPE', ldap[22]);
    comprueba('en una declarada, mp.info.6 se mide', listaDe('101', 'srv-web01').every(e => e.measured));
    comprueba('sin máquina: todos medidos', listaDe().every(e => e.measured));
    comprueba('los 6 sin configurar, marcados', JSON.stringify(listaDe().filter(e => !e.configured).map(e => e.id).sort()) === JSON.stringify(FALTAN));
    const nivel = modelo.describeLevelExclusions(listaDe(), 'BAJO');
    comprueba('«Nivel BAJO: 4 controles no aplican» (op.acc.3, op.exp.5, op.cont.2, op.cont.3)',
      nivel?.count === 4 && JSON.stringify([...nivel.ids].sort()) === JSON.stringify(['op.acc.3', 'op.cont.2', 'op.cont.3', 'op.exp.5']) && /^Nivel BAJO: 4 controles no aplican/.test(nivel.text), nivel);
    comprueba('en ALTO no hay ninguno', modelo.describeLevelExclusions(listaDe(undefined, undefined, { levelOf: () => 'ALTO' }), 'ALTO') === undefined);
    const filas = [
      { agentId: '101', controls: [{ controlId: 'op.acc.1', status: 'CUMPLE' }, { controlId: 'op.acc.2', status: 'NO_CUMPLE' }] },
      { agentId: '102', controls: [{ controlId: 'op.acc.1', status: 'PARCIAL' }] },
      { agentId: '103', controls: [{ controlId: 'op.acc.1', status: 'NO_EVALUABLE' }] },
      { agentId: '000', controls: [{ controlId: 'op.exp.7', status: 'CUMPLE' }] },
    ] as any;
    const t = modelo.tallyMachines('op.acc.1', filas);
    comprueba('la barra: las máquinas que miden el control', t?.total === 3 && t.cumple === 1 && t.parcial === 1 && t.sinDatos === 1, t);
    comprueba('…en palabras', modelo.describeTally(t!) === '1 cumple · 1 parcial · 1 sin datos (de 3 máquinas)', modelo.describeTally(t!));
    comprueba('un control que ninguna mide: sin barra', modelo.tallyMachines('op.nub.1', filas) === undefined);
    comprueba('la barra solo sin máquina elegida', listaDe(undefined, undefined, { agentRows: filas })[1].machines?.total === 3 && !listaDe('101', 'srv-web01', { agentRows: filas })[1].machines);
  }

  console.log('2. La pantalla');
  {
    ensConfigurationRepository.completeHydration(documento());
    await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => [
      { id: '101', name: 'srv-web01', groups: ['ens'], status: 'active' },
      { id: '102', name: 'ldap01', groups: ['ens'], status: 'active' },
    ] as any, true);
    comprueba('el alcance tiene el manager', getActiveENSScopeAgents().some((a: any) => a.id === '000'));
    h.setSearch('?tabView=plugins&agentId=000');
    evaluacion = { data: undefined, isLoading: true };
    let p = await h.render(ControlsENS);
    const filas = h.findAll('EuiFacetButton');
    comprueba('con el manager: 23 filas', filas.length === 23, filas.length);
    comprueba('cargando: spinner en las medidas, ningún veredicto', h.findAll('EuiLoadingSpinner').length === 9 && !/NO_CUMPLE|NO_EVALUABLE|CUMPLE/.test(p.replace(/No se mide/g, '')), h.findAll('EuiLoadingSpinner').length);
    comprueba('14 «No se mide en esta máquina», con el motivo', h.findAll('EuiBadge', /No se mide en esta máquina/).length === 14 && /no en el manager de Wazuh \(000\)/.test(p));
    comprueba('el aviso de cuántos no se miden y «Ver todas las máquinas»', /14 controles no se miden en 000/.test(p) && Boolean(h.find('EuiLink', /Ver todas las máquinas/)), p.slice(p.indexOf('Nivel BAJO') + 100, p.indexOf('Nivel BAJO') + 500));
    comprueba('«Nivel BAJO: 4 controles no aplican» con enlace a Configuración', /Nivel BAJO: 4 controles no aplican/.test(p) && Boolean(h.find('EuiLink', /Cambiar el nivel en Configuración/)));
    evaluacion = { data: { meta: {}, controls: [{ controlId: 'op.exp.7', status: 'NO_CUMPLE', score: 0, evaluated: true, requirementsNotMet: 3, requirementsNotEvidenced: 1 }], agents: [] }, isLoading: false };
    p = await h.render(ControlsENS);
    const exp7 = h.findAll('EuiFacetButton').find(n => /op\.exp\.7/.test(n.texto));
    comprueba('con resultado: op.exp.7 con su número y su estado', exp7?.props.quantity === 3 && /NO_CUMPLE/.test(p));
    const gris = h.findAll('EuiFacetButton').find(n => /op\.acc\.1/.test(n.texto));
    comprueba('las grises sin número', gris && gris.props.quantity === undefined);
    comprueba('los 6 sin configurar: la marca y «Añadir con valores por defecto»', h.findAll('EuiBadge', /No está en la configuración activa/).length === 6 && h.findAll('EuiButton', /Añadir con valores por defecto/).length === 6);
    await h.click(/Añadir con valores por defecto/);
    const ultimo = guardados[guardados.length - 1];
    comprueba('«Añadir» guarda el documento con op.cont.2 añadido (y nada más)', ultimo && ultimo.configuration.controls.some((c: any) => c.controlId === 'op.cont.2') && ultimo.configuration.controls.length === 18, ultimo?.configuration?.controls?.length);
    comprueba('…y vuelve a pedir la evaluación', reintentos === 1, reintentos);
    h.setSearch('?tabView=plugins');
    h.reset();
    evaluacion = { data: { meta: {}, controls: [], agents: [{ agentId: '101', controls: [{ controlId: 'op.acc.1', status: 'CUMPLE' }] }, { agentId: '102', controls: [{ controlId: 'op.acc.1', status: 'NO_CUMPLE' }] }] }, isLoading: false };
    p = await h.render(ControlsENS);
    comprueba('sin máquina: la barra de máquinas del control', /1 cumple · 1 no cumple \(de 2 máquinas\)/.test(p), p.slice(0, 300));
    h.reset();
    await h.render(ControlsENS);
    const fila = h.findAll('EuiFacetButton').find(n => /op\.acc\.2/.test(n.texto));
    await fila!.props.onClick();
    comprueba('pulsar una fila pone el control en la URL', parseRouterSearch(h.search()).control === 'op.acc.2', h.search());
  }

  console.log('3. El motor, sin configuración del control');
  {
    ensConfigurationRepository.completeHydration(documento());
    const estado = getENSComplianceState('BAJO', [], undefined, getActiveENSScopeAgents(), new Date('2026-10-17T12:00:00Z'));
    const mon1 = estado.results.find((r: any) => r.control.id === 'op.mon.1');
    const ncs = mon1?.nonConformities || [];
    comprueba('op.mon.1 (sin configurar): no conformidades no evidenciadas', ncs.length > 0 && ncs.every((n: any) => n.origin === 'NO_EVIDENCIADA'), ncs.length);
    comprueba('…con la acción de darlo de alta, nunca la del productor',
      ncs.filter((n: any) => n.cause === 'CONFIGURATION').every((n: any) => /^Añadir op\.mon\.1 a la configuración activa/.test(n.requiredAction)) &&
      !ncs.some((n: any) => /Corregir lo que el productor/.test(n.requiredAction)), ncs.map((n: any) => [n.cause, n.requiredAction.slice(0, 60)]));
    comprueba('…y el hallazgo lo dice', ncs.filter((n: any) => n.cause === 'CONFIGURATION').every((n: any) => /^op\.mon\.1 no está en la configuración activa/.test(n.finding)));
  }

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
