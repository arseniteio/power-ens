/**
 * Configuración: la pantalla de dos niveles, el enlace desde la URL y lo que
 * hacen sus botones.
 *
 *   npx --yes tsx tests/configuration-screen.test.ts
 *
 * La pantalla se pinta con un React de mentira que SÍ guarda el estado de los
 * hooks entre pintadas (useState, useRef, useEffect), con EUI de mentira y con
 * el cliente HTTP y la búsqueda del dashboard de mentira. Así se pulsan los
 * botones de verdad y se comprueba qué documento se manda a guardar:
 *
 *   1. El enlace: `?tabView=configuration&configControl=…&configAgent=…&configParam=…`.
 *   2. Las acciones puras: valor propio (y quitarlo), plantilla que sustituye a
 *      otra, incompatibles, tipo, completitud, vista previa de una plantilla.
 *   3. «Añadir con valores por defecto» = exactamente el bloque semilla.
 *   4. La pantalla y sus botones: migrar (con confirmación tecleada), aplicar
 *      una plantilla (con vista previa), quitar un valor propio, añadir un
 *      control, quitar un valor huérfano, otros nombres; sin agents, sin
 *      agentes y con un agente fuera del alcance; una aportación en un agente.
 */
import { readFileSync, readdirSync } from 'fs';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

// --- React con hooks de verdad (mínimos), EUI y el router de mentira ---------
const ELEMENTO = Symbol('elemento');
const estados = new Map<string, any[]>();
const efectosHechos = new Map<string, string>();
let pendientes: Array<() => void> = [];
let ruta = '';
let indice = 0;
const casilla = (inicial: () => any) => {
  const clave = ruta;
  let arr = estados.get(clave);
  if (!arr) { arr = []; estados.set(clave, arr); }
  const i = indice++;
  if (!(i in arr)) arr[i] = inicial();
  return { arr, i };
};
const reactStub: any = {
  createElement: (type: any, props: any, ...children: any[]) => ({
    [ELEMENTO]: true,
    type,
    props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
  }),
  Fragment: 'Fragment',
  Suspense: 'Suspense',
  lazy: (f: any) => f,
  useState: (inicial: any) => {
    const { arr, i } = casilla(() => (typeof inicial === 'function' ? inicial() : inicial));
    return [arr[i], (v: any) => { arr[i] = typeof v === 'function' ? v(arr[i]) : v; }];
  },
  useRef: (inicial: any) => casilla(() => ({ current: inicial ?? null })).arr[indice - 1],
  useMemo: (f: any) => f(),
  useCallback: (f: any) => f,
  useEffect: (f: any, deps?: any[]) => {
    const clave = `${ruta}#${indice++}`;
    const firma = deps === undefined ? String(Math.random()) : JSON.stringify(deps);
    if (efectosHechos.get(clave) !== firma) {
      efectosHechos.set(clave, firma);
      pendientes.push(f);
    }
  },
};
reactStub.default = reactStub;
const euiStub = new Proxy({}, {
  get: (_t, nombre) => {
    if (nombre === '__esModule') return false;
    const c = (props: any) => ({ [ELEMENTO]: true, type: `eui:${String(nombre)}`, props });
    Object.defineProperty(c, 'name', { value: String(nombre) });
    (c as any).eui = String(nombre);
    return c;
  },
});

let busqueda = '';
const guardados: { configuration: any; changeReason?: string }[] = [];
let inventarioFalso: any = { agentes: { buckets: [] } };
let hechosFalsos: any = { agentes: { buckets: [] } };
const SERVICES = `${__dirname}/../public/services.ts`;
// El alcance ENS sin ninguna máquina (ni el manager): solo antes de hidratar o
// sin controles activos en el manager. Se simula para ver la migración
// bloqueada.
const RUNTIME = `${__dirname}/../common/ens/core/scope/runtime.ts`;
let alcanceVacio = false;
// El cliente HTTP de la configuración vive en `common/` y recibe `http` por
// inyección (en el plugin, `public/services.ts` al arrancar).
const httpFalso = {
  get: async () => ({ statusCode: 200, error: 0, data: { configuration: null, metadata: null } }),
  put: async (_url: string, opciones: any) => {
    const cuerpo = JSON.parse(opciones.body);
    guardados.push(cuerpo);
    return { statusCode: 200, error: 0, data: { configuration: cuerpo.configuration, metadata: null } };
  },
};
{
  const Module = require('module');
  const path = require('path');
  const cargar = Module._load;
  Module._load = function (peticion: string, padre: any, ...resto: unknown[]) {
    if (/kibana-services$/.test(peticion)) return {};
    if (peticion === 'react') return reactStub;
    if (peticion === '@elastic/eui') return euiStub;
    if (peticion === 'react-router-dom') {
      return {
        useLocation: () => ({ search: busqueda }),
        useHistory: () => ({ push: (l: any) => { busqueda = l.search; } }),
      };
    }
    let resuelto = '';
    try { resuelto = Module._resolveFilename(peticion, padre); } catch (e) { resuelto = ''; }
    if (resuelto && path.resolve(resuelto) === path.resolve(RUNTIME)) {
      const real = cargar.call(this, peticion, padre, ...resto);
      return { ...real, getActiveENSScopeAgents: () => (alcanceVacio ? [] : real.getActiveENSScopeAgents()) };
    }
    if (resuelto && path.resolve(resuelto) === path.resolve(SERVICES)) {
      return {
        getHttp: () => httpFalso,
        getData: () => ({
          search: {
            search: (p: any) => ({
              toPromise: async () => ({
                rawResponse: { aggregations: /monitoring/.test(p.params.index) ? inventarioFalso : hechosFalsos },
              }),
            }),
          },
        }),
        getCore: () => ({ notifications: { toasts: { addWarning: () => undefined } } }),
      };
    }
    return cargar.call(this, peticion, padre, ...resto);
  };
}

const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) fallos.push(n);
};

// --- pintar -------------------------------------------------------------------
interface Nodo { type: string; props: any; ruta: string; texto: string }
let nodos: Nodo[] = [];

const textoDe = (nodo: any): string => {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return '';
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(' ');
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo);
  if (!nodo[ELEMENTO]) return '';
  return textoDe(nodo.props?.children);
};

const pinta = (nodo: any, donde: string, salida: string[]): void => {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return;
  if (Array.isArray(nodo)) { nodo.forEach((n, i) => pinta(n, `${donde}.${n?.props?.key ?? n?.key ?? i}`, salida)); return; }
  if (typeof nodo === 'string' || typeof nodo === 'number') { salida.push(String(nodo)); return; }
  if (!nodo[ELEMENTO]) return;
  const { type, props } = nodo;
  if (typeof type === 'function' && !(type as any).eui) {
    const aqui = `${donde}/${type.name || 'C'}${props?.key !== undefined ? `:${props.key}` : ''}`;
    const antes = [ruta, indice] as const;
    ruta = aqui; indice = 0;
    const hijo = type(props);
    ruta = antes[0]; indice = antes[1];
    nodos.push({ type: type.name, props, ruta: aqui, texto: '' });
    pinta(hijo, aqui, salida);
    return;
  }
  if (typeof type === 'function') { pinta(type(props), donde, salida); return; }
  const nombre = String(type).replace(/^eui:/, '');
  nodos.push({ type: nombre, props, ruta: donde, texto: textoDe(props?.children).replace(/\s+/g, ' ').trim() });
  if (nombre === 'EuiBasicTable') {
    (props.items || []).forEach((item: any) => (props.columns || []).forEach((col: any) => pinta(col.render ? col.render(item[col.field], item) : item[col.field], `${donde}.${item.id}`, salida)));
  }
  const marca = ['EuiButton', 'EuiButtonEmpty', 'EuiTab'].includes(nombre);
  if (marca) salida.push('[');
  Object.entries(props || {}).forEach(([clave, valor]: [string, any]) => {
    if (clave === 'children') return;
    if (['title', 'helpText', 'label', 'noItemsMessage', 'buttonContent'].includes(clave) && typeof valor === 'string') salida.push(valor);
    if (valor && (valor[ELEMENTO] || Array.isArray(valor))) pinta(valor, `${donde}.${clave}`, salida);
  });
  pinta(props?.children, `${donde}.c`, salida);
  if (marca) salida.push(']');
};

const espera = () => new Promise(r => setTimeout(r, 0));

let pantalla = '';
const renderiza = async (raiz: any, vueltas = 4): Promise<string> => {
  for (let v = 0; v < vueltas; v += 1) {
    nodos = [];
    const salida: string[] = [];
    ruta = ''; indice = 0;
    pinta(reactStub.createElement(raiz, null), 'raiz', salida);
    pantalla = salida.join(' ').replace(/\s+/g, ' ');
    const efectos = pendientes;
    pendientes = [];
    efectos.forEach(f => f());
    await espera();
    await espera();
  }
  return pantalla;
};

const boton = (texto: RegExp, tipo?: string) =>
  nodos.find(n => (n.type === 'EuiButton' || n.type === 'EuiButtonEmpty') && (!tipo || n.type === tipo) && texto.test(n.texto));
const pulsa = async (raiz: any, texto: RegExp) => {
  const b = boton(texto);
  if (!b) throw new Error(`no hay botón ${texto}`);
  await b.props.onClick();
  await espera();
  return renderiza(raiz);
};

const { buildConfigurationSearch, parseConfigurationTarget, configurationSearchChanges } =
  require('../public/routing/configuration-link') as typeof import('../public/routing/configuration-link');
const { parseRouterSearch } = require('../public/routing/router-search') as typeof import('../public/routing/router-search');
const acciones = require('../common/ens/configuration/agents/agent-configuration-actions') as typeof import('../common/ens/configuration/agents/agent-configuration-actions');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository') as typeof import('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration') as typeof import('../common/ens/configuration/data/default-configuration');
const { hydrateENSScope } = require('../common/ens/core/scope/runtime') as typeof import('../common/ens/core/scope/runtime');
(require('../common/ens/configuration/services/configuration-http-client') as typeof import('../common/ens/configuration/services/configuration-http-client'))
  .setENSConfigurationHttp(() => httpFalso as any);
const { ConfigurationShell } = require('../public/ens/configuration/components/configuration-shell') as typeof import('../public/ens/configuration/components/configuration-shell');
const { resolveControlConfigurationWithOrigins } = require('../common/ens/configuration/agents/configuration-resolver') as typeof import('../common/ens/configuration/agents/configuration-resolver');

const CONFIG = `${__dirname}/../config`;
const bloques: Record<string, any> = {};
readdirSync(CONFIG).filter(f => f.endsWith('-control-block.json')).forEach(f => {
  const b = JSON.parse(readFileSync(`${CONFIG}/${f}`, 'utf8'));
  bloques[b.controlId] = b;
});
const SEMBRADOS = ['mp.info.6', 'op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4', 'op.acc.5', 'op.acc.6', 'op.exp.1', 'op.exp.2', 'op.exp.3', 'op.exp.4', 'op.exp.5', 'op.exp.6', 'op.exp.7', 'op.exp.8', 'op.exp.9', 'op.exp.10'];
const FALTAN = ['op.cont.2', 'op.cont.3', 'op.mon.1', 'op.mon.2', 'op.mon.3', 'op.nub.1'];
const documento = (): any => ({
  ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)),
  controls: SEMBRADOS.map(id => {
    const b = JSON.parse(JSON.stringify(bloques[id]));
    if (id === 'op.acc.1') {
      b.parameters.find((p: any) => p.id === 'P-07').value = ['ana | web01 | admin', 'svc | dir01.example.com | servicio'];
      b.parameters.find((p: any) => p.id === 'P-01').value = 'Local';
    }
    if (id === 'op.exp.7') b.parameters.find((p: any) => p.id === 'P-07').value = ['srv-x | nóminas'];
    return b;
  }),
});
const AGENTES = [
  { id: '101', name: 'web01', groups: ['ens'], status: 'active', os: { platform: 'ubuntu', uname: 'Linux |web01 |6.8 |x86_64' } },
  { id: '102', name: 'dirHost', groups: ['ens'], status: 'active', os: { platform: 'ubuntu', uname: 'Linux |dir01.example.com |6.8 |x86_64' } },
  { id: '103', name: 'win01', groups: ['ens'], status: 'active', os: { platform: 'windows' } },
];
const cubo = (a: any) => ({ key: a.id, ultimo: { hits: { hits: [{ _source: { ...a, group: a.groups, timestamp: new Date().toISOString(), manager: 'mgr-01' } }] } } });
const prepara = async (doc: any, agentes = AGENTES) => {
  ensConfigurationRepository.completeHydration(doc);
  estados.clear(); efectosHechos.clear(); pendientes = []; guardados.length = 0;
  inventarioFalso = { agentes: { buckets: agentes.map(cubo) } };
  hechosFalsos = { agentes: { buckets: [{ key: '102', planos: { buckets: [{ key: 'directorio', doc_count: 50 }] }, copias: { origenes: { buckets: [] } } }] } };
  await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => agentes as any, true);
};
const ultimo = () => guardados[guardados.length - 1];

(async () => {
  console.log('1. Enlace');
  {
    const s = buildConfigurationSearch({ controlId: 'op.acc.1', agentId: '024', parameterId: 'P-07' }, '?tabView=plugins&control=op.acc.1&agentId=024');
    const p = parseRouterSearch(s);
    comprueba('abre Configuración, el agente, el control y el parámetro', p.tabView === 'configuration' && p.configAgent === '024' && p.configControl === 'op.acc.1' && p.configParam === 'P-07', s);
    comprueba('conserva la máquina elegida y quita el control del detalle', p.agentId === '024' && p.control === undefined, s);
    const t = parseConfigurationTarget(p);
    comprueba('con agente: nivel Sistemas', t.view === 'systems' && t.agentId === '024' && t.parameterId === 'P-07');
    comprueba('solo control: nivel Organización', parseConfigurationTarget({ configControl: 'op.acc.1' }).view === 'organisation');
    comprueba('lista de sistemas', parseConfigurationTarget({ configView: 'sistemas' }).view === 'systems');
    comprueba('volver a la lista de sistemas limpia agente, control y parámetro', JSON.stringify(configurationSearchChanges({ view: 'systems' })) === JSON.stringify({ tabView: 'configuration', configView: 'sistemas' }));
    const app = readFileSync(`${__dirname}/../public/app/ens-app.tsx`, 'utf8');
    comprueba('cambiar de pestaña limpia los config*', /configAgent: undefined/.test(app) && /configParam: undefined/.test(app));
  }

  console.log('2. Acciones');
  {
    const d = documento();
    const agente = AGENTES[1];
    const deteccion = { type: 'linux' as const, source: 'inventario' as const, evidence: 'os.platform = ubuntu en el inventario de agentes', addons: [] };
    const conValor = acciones.setAgentParameterValue(d, '102', 'op.acc.1', 'P-07', ['svc | dir01.example.com | servicio'], agente, deteccion);
    comprueba('valor propio guardado, con la identidad de la máquina', JSON.stringify(conValor.agents?.['102']?.controls?.['op.acc.1']?.parameters?.['P-07']) === '["svc | dir01.example.com | servicio"]' && conValor.agents?.['102']?.aliases?.[0] === 'dir01.example.com');
    comprueba('quitarlo borra la clave', !acciones.setAgentParameterValue(conValor, '102', 'op.acc.1', 'P-07', undefined).agents?.['102']?.controls);
    comprueba('vacío = quitar; igual al heredado = no se guarda; distinto = propio',
      acciones.describeAgentValueSave(d, '102', 'op.acc.1', 'P-07', []) === 'quitar' &&
      acciones.describeAgentValueSave(d, '102', 'op.acc.1', 'P-01', 'Local') === 'igual' &&
      acciones.describeAgentValueSave(d, '102', 'op.acc.1', 'P-01', 'LDAP') === 'propio');
    const linux = acciones.applyTemplateToAgent(d, '102', 'linux-ubuntu', agente, deteccion).configuration;
    const pbs = acciones.applyTemplateToAgent(linux, '102', 'pbs-backup').configuration;
    const ldap = acciones.applyTemplateToAgent(pbs, '102', 'zimbra-ldap').configuration;
    comprueba('una plataforma sustituye a la otra y el añadido se queda', JSON.stringify(ldap.agents?.['102']?.templates) === '["zimbra-ldap","pbs-backup"]');
    comprueba('PBS y Zimbra NE: no', !!acciones.applyTemplateToAgent(pbs, '102', 'zimbra-ne-backup').error);
    const vista = acciones.previewTemplateApplication(pbs, '102', 'zimbra-ldap', 'linux');
    comprueba('vista previa: sustituye a Linux Ubuntu, avisa del tipo y dice qué cambia', vista.replaces === 'Linux Ubuntu' && /es para LDAP/.test(vista.mismatch || '') && vista.changes.includes('op.acc.1 P-01'), vista);
    const conPropio = acciones.setAgentParameterValue(pbs, '102', 'op.acc.1', 'P-01', 'Active Directory');
    const vista2 = acciones.previewTemplateApplication(conPropio, '102', 'zimbra-ldap', 'zimbra-ldap');
    comprueba('vista previa: el valor propio sigue ganando y no cuenta como cambio', vista2.ownWins.includes('op.acc.1 P-01') && !vista2.changes.includes('op.acc.1 P-01') && !vista2.mismatch, vista2);
    const r = resolveControlConfigurationWithOrigins(ldap, 'op.acc.1', '102')!;
    comprueba('tras aplicar, el valor se hereda de la plantilla', r.origins['P-01'].source === 'template');
    const c = acciones.getAgentCompleteness(ldap, '102', [{ controlId: 'op.acc.1', level: 'MEDIO' }]);
    comprueba('completitud', c.total === 6 && c.withValue === 5 && c.missingRequired.join() === 'op.acc.1 P-02', c);
    const huerfano = { ...d, agents: { '102': { controls: { 'op.acc.1': { parameters: { 'P-99': 'x', 'P-07': ['a | b | c'] } }, 'op.nub.1': { parameters: { 'P-01': 'x' } } } }, srvWeb: { templates: [] } } };
    const sinP99 = acciones.removeAgentEntry(huerfano, '102', 'op.acc.1', 'P-99');
    comprueba('quitar un valor huérfano deja lo demás', JSON.stringify(sinP99.agents?.['102']?.controls?.['op.acc.1']?.parameters) === '{"P-07":["a | b | c"]}');
    comprueba('quitar un control huérfano', !acciones.removeAgentEntry(huerfano, '102', 'op.nub.1').agents?.['102']?.controls?.['op.nub.1']);
    comprueba('quitar un perfil guardado por nombre', !acciones.removeAgentEntry(huerfano, 'srvWeb').agents?.srvWeb);
  }

  console.log('3. Añadir con valores por defecto');
  {
    const d = documento();
    const r = acciones.addMissingControls(d, FALTAN);
    comprueba('los 6 que faltan, cada uno EXACTAMENTE su bloque semilla', JSON.stringify(r.added.sort()) === JSON.stringify([...FALTAN].sort()) && FALTAN.every(id => JSON.stringify(r.configuration.controls.find(c => c.controlId === id)) === JSON.stringify(bloques[id])));
    comprueba('sin tocar los que ya estaban ni la capa por sistema', JSON.stringify(r.configuration.controls.slice(0, SEMBRADOS.length)) === JSON.stringify(d.controls) && r.configuration.agents === undefined);
  }

  console.log('4. Pantalla y botones');
  {
    // Organización: añadir un control que falta.
    await prepara(documento());
    busqueda = '?tabView=configuration';
    let p = await renderiza(ConfigurationShell);
    comprueba('dos niveles y los controles sin añadir', /\[ Organización \]/.test(p) && /\[ Sistemas \]/.test(p) && /Controles del catálogo sin añadir \(6\)/.test(p.replace(/\( 6 \)/, '(6)')), p.slice(0, 200));
    p = await pulsa(ConfigurationShell, /^Añadir con valores por defecto$/);
    comprueba('«Añadir con valores por defecto» guarda el control con su motivo', guardados.length === 1 && ultimo().configuration.controls.some((c: any) => c.controlId === 'op.cont.2') && /Alta de op\.cont\.2/.test(ultimo().changeReason || ''), guardados.map(g => g.changeReason));
    comprueba('y deja de estar en la lista', /sin añadir \(5\)|sin añadir \( 5 \)/.test(p));

    busqueda = '?tabView=configuration&configControl=op.acc.1&configParam=P-07';
    p = await renderiza(ConfigurationShell);
    comprueba('un control desde la URL: su página, organización arriba', /op\.acc\.1 · /.test(p) && /Valores que heredan los sistemas/.test(p));
    busqueda = '?tabView=configuration&configControl=op.zzz.9';
    p = await renderiza(ConfigurationShell);
    comprueba('un control que no existe en el catálogo: lo dice', /no es ningún control del catálogo/.test(p));

    // Sistemas: migrar, con confirmación tecleada.
    await prepara(documento());
    busqueda = '?tabView=configuration&configView=sistemas';
    p = await renderiza(ConfigurationShell);
    comprueba('Sistemas: tipo detectado con su evidencia, también por hechos', /101 · web01/.test(p) && /detectado por os\.platform = ubuntu/.test(p) && /LDAP \(Zimbra\)/.test(p), p.slice(0, 600));
    p = await pulsa(ConfigurationShell, /^Migrar a sistemas$/);
    const modal = nodos.find(n => n.type === 'EuiConfirmModal');
    comprueba('«Migrar a sistemas» abre la confirmación con lo que mueve, veredictos, 1.1.0 e historial', !!modal && /Sistema 101/.test(p) && /veredictos de estas máquinas pueden cambiar/.test(p) && /1\.1\.0/.test(p) && /historial/.test(p), p.slice(p.indexOf('Migrar a sistemas'), p.indexOf('Migrar a sistemas') + 600));
    await modal!.props.onConfirm();
    comprueba('sin teclear «migrar» no guarda nada', guardados.length === 0);
    const campo = nodos.find(n => n.type === 'EuiFieldText' && /migrar/.test(n.props['aria-label'] || ''));
    campo!.props.onChange({ target: { value: 'migrar' } });
    await renderiza(ConfigurationShell, 1);
    await nodos.find(n => n.type === 'EuiConfirmModal')!.props.onConfirm();
    await renderiza(ConfigurationShell);
    comprueba('tecleado: guarda la migración', guardados.length === 1 && /Migración a sistemas/.test(ultimo().changeReason || '') && !!ultimo().configuration.agents?.['101'], guardados.map(g => g.changeReason));

    // Aplicar una plantilla desde la lista: vista previa y, con aviso, «aplicar».
    await prepara(documento());
    busqueda = '?tabView=configuration&configView=sistemas';
    p = await renderiza(ConfigurationShell);
    const selector = nodos.find(n => n.type === 'EuiSelect' && n.props['aria-label'] === 'Plantilla');
    comprueba('el selector de la lista no trae ninguna plantilla elegida', selector?.props.value === '' && boton(/^Aplicar a 0 sistema/)?.props.isDisabled === true);
    nodos.find(n => n.type === 'EuiBasicTable')!.props.selection.onSelectionChange([{ id: '103' }]);
    selector!.props.onChange({ target: { value: 'linux-ubuntu' } });
    p = await renderiza(ConfigurationShell, 1);
    p = await pulsa(ConfigurationShell, /^Aplicar a 1 sistema/);
    comprueba('vista previa por sistema con el aviso de tipo', /Sistema 103/.test(p) && /Tipo distinto/.test(p) && /es para Linux y este sistema es Windows/.test(p), p.slice(p.indexOf('Aplicar «'), p.indexOf('Aplicar «') + 500));
    const modalPlantilla = nodos.find(n => n.type === 'EuiConfirmModal');
    await modalPlantilla!.props.onConfirm();
    comprueba('con aviso, sin teclear «aplicar» no guarda', guardados.length === 0);
    nodos.find(n => n.type === 'EuiFieldText' && /aplicar/.test(n.props['aria-label'] || ''))!.props.onChange({ target: { value: 'aplicar' } });
    await renderiza(ConfigurationShell, 1);
    await nodos.find(n => n.type === 'EuiConfirmModal')!.props.onConfirm();
    p = await renderiza(ConfigurationShell);
    comprueba('tecleado: guarda la plantilla en 103', guardados.length === 1 && JSON.stringify(ultimo().configuration.agents?.['103']?.templates) === '["linux-ubuntu"]', guardados.map(g => g.changeReason));
    comprueba('las casillas se vacían tras aplicar', /Aplicar a 0 sistema/.test(p));

    // Página de un agente: quitar un valor propio, quitar un huérfano, otros nombres.
    const conPropio = documento();
    conPropio.agents = {
      '102': {
        name: 'dirHost',
        templates: ['zimbra-ldap'],
        controls: {
          'op.acc.1': { parameters: { 'P-07': ['svc | dir01.example.com | servicio'], 'P-99': 'huérfano' } },
          'op.exp.7': { parameters: { 'P-07': ['dirHost | directorio'] } },
        },
      },
    };
    await prepara(conPropio);
    busqueda = '?tabView=configuration&configAgent=102&configControl=op.acc.1&configParam=P-01';
    p = await renderiza(ConfigurationShell);
    comprueba('un agente desde la URL: su página, orígenes explícitos', /102 · dirHost/.test(p) && /heredado de la plantilla «Servidor LDAP Zimbra»/.test(p) && /valor propio de este sistema/.test(p) && /heredado de la organización/.test(p));
    const filaP01 = nodos.find(n => n.type === 'AgentParameterRow' && n.props.parameter.id === 'P-01' && n.props.parameter.controlId === 'op.acc.1');
    comprueba('el parámetro pedido (y solo ese) se abre para editar', !!filaP01 && nodos.some(n => n.type === 'EuiButton' && /Guardar para este sistema/.test(n.texto) && n.ruta.startsWith(filaP01.ruta)) && nodos.filter(n => n.type === 'EuiButton' && /Guardar para este sistema/.test(n.texto)).length === 1);
    comprueba('el huérfano se lista con «Quitar»', /P-99: el valor no se aplica/.test(p) && !!boton(/^Quitar$/));
    await pulsa(ConfigurationShell, /^Quitar$/);
    comprueba('«Quitar» borra el valor huérfano', guardados.length === 1 && !('P-99' in (ultimo().configuration.agents['102'].controls['op.acc.1'].parameters || {})) && JSON.stringify(ultimo().configuration.agents['102'].controls['op.acc.1'].parameters['P-07']) === '["svc | dir01.example.com | servicio"]');
    p = await pulsa(ConfigurationShell, /^Quitar valor propio/);
    comprueba('«Quitar valor propio» guarda sin el valor y vuelve a heredar', guardados.length === 2 && !ultimo().configuration.agents['102'].controls?.['op.acc.1'], ultimo().configuration.agents['102']);
    const alias = nodos.find(n => n.type === 'EuiFieldText' && n.props.value !== undefined && /dir01\.example\.com/.test(String(n.props.value)));
    alias!.props.onChange({ target: { value: 'dir01.example.com, directorio-principal' } });
    p = await renderiza(ConfigurationShell, 1);
    await pulsa(ConfigurationShell, /^Guardar otros nombres$/);
    comprueba('«Otros nombres de esta máquina» se guardan', JSON.stringify(ultimo().configuration.agents['102'].aliases) === '["dir01.example.com","directorio-principal"]', ultimo().configuration.agents['102']);

    // Una aportación en un agente que no es el manager: lo suyo y, aparte, lo de la organización.
    busqueda = '?tabView=configuration&configAgent=102&configControl=op.exp.7';
    p = await renderiza(ConfigurationShell);
    const filaE7 = nodos.find(n => n.type === 'AgentParameterRow' && n.props.parameter.controlId === 'op.exp.7' && n.props.parameter.id === 'P-07');
    comprueba('aportación: el editor parte de lo de este sistema, no de la organización', !!filaE7 && JSON.stringify(filaE7.props.parameter.value) === '["dirHost | directorio"]' && filaE7.props.contributionOnly === true, filaE7?.props.parameter.value);
    comprueba('y las filas de la organización se enseñan aparte, de solo lectura', JSON.stringify(filaE7?.props.organisationRows) === '["srv-x | nóminas"]' && /De la organización/.test(p));

    // Quitar una plantilla desde su etiqueta: la misma vista previa que al aplicarla.
    const conPlantilla = documento();
    conPlantilla.agents = { '102': { name: 'dirHost', templates: ['zimbra-ldap'] } };
    await prepara(conPlantilla);
    busqueda = '?tabView=configuration&configAgent=102';
    p = await renderiza(ConfigurationShell);
    nodos.find(n => n.type === 'EuiBadge' && typeof n.props.iconOnClick === 'function')!.props.iconOnClick();
    p = await renderiza(ConfigurationShell);
    comprueba('quitar una plantilla abre su vista previa y no guarda', guardados.length === 0 && /Quitar «Servidor LDAP Zimbra» de 1 sistema/.test(p) && /Cambia el valor efectivo de [1-9]\d* parámetro/.test(p) && /La plantilla fijaba ?: /.test(p), p.slice(p.indexOf('Quitar «'), p.indexOf('Quitar «') + 1400));
    const campoQuitar = nodos.find(n => n.type === 'EuiFieldText' && /quitar/.test(n.props['aria-label'] || ''));
    comprueba('con obligatorios que se quedan sin valor, lo dice y pide teclear «quitar»', !!campoQuitar === /Se quedan sin valor parámetros obligatorios/.test(p));
    if (campoQuitar) {
      await nodos.find(n => n.type === 'EuiConfirmModal')!.props.onConfirm();
      comprueba('sin teclear «quitar» no guarda', guardados.length === 0);
      campoQuitar.props.onChange({ target: { value: 'quitar' } });
      await renderiza(ConfigurationShell, 1);
    }
    await nodos.find(n => n.type === 'EuiConfirmModal')!.props.onConfirm();
    p = await renderiza(ConfigurationShell);
    comprueba('confirmado: guarda sin la plantilla', guardados.length === 1 && !ultimo().configuration.agents['102'].templates && /plantilla «Servidor LDAP Zimbra» quitada/i.test(ultimo().changeReason || ''), guardados.map(g => g.changeReason));

    // Quitar un perfil entero (guardado con un nombre): lo que se pierde y «quitar» tecleado.
    const conNombre = documento();
    conNombre.agents = { srvWeb: { aliases: ['web'], templates: ['linux-ubuntu'], controls: { 'op.acc.1': { parameters: { 'P-07': ['ana | srvWeb | admin'] } } } } };
    await prepara(conNombre);
    busqueda = '?tabView=configuration&configView=sistemas';
    p = await renderiza(ConfigurationShell);
    p = await pulsa(ConfigurationShell, /^Quitar$/);
    comprueba('quitar un perfil entero enseña antes lo que se pierde', guardados.length === 0 && /Quitar el perfil «srvWeb»/.test(p) && /op\.acc\.1 P-07: ana \| srvWeb \| admin/.test(p) && /Plantillas: /.test(p) && /Otros nombres: web/.test(p), p.slice(p.indexOf('Quitar el perfil'), p.indexOf('Quitar el perfil') + 400));
    await nodos.find(n => n.type === 'EuiConfirmModal')!.props.onConfirm();
    comprueba('sin teclear «quitar» no se borra', guardados.length === 0);
    nodos.find(n => n.type === 'EuiFieldText' && /quitar/.test(n.props['aria-label'] || ''))!.props.onChange({ target: { value: 'quitar' } });
    await renderiza(ConfigurationShell, 1);
    await nodos.find(n => n.type === 'EuiConfirmModal')!.props.onConfirm();
    p = await renderiza(ConfigurationShell);
    comprueba('tecleado: el perfil sale del documento', guardados.length === 1 && !ultimo().configuration.agents?.srvWeb, guardados.map(g => g.changeReason));

    // Sin agents, sin agentes y con un agente fuera del alcance.
    await prepara(documento(), []);
    busqueda = '?tabView=configuration&configView=sistemas';
    p = await renderiza(ConfigurationShell);
    comprueba('sin agentes ni agents: se pinta', /No hay agentes en el alcance|Sistemas del alcance/.test(p));
    alcanceVacio = true;
    estados.clear(); efectosHechos.clear();
    p = await renderiza(ConfigurationShell);
    alcanceVacio = false;
    comprueba("alcance vacío: «Migrar a sistemas» no está disponible", /no está disponible: el alcance ENS no tiene ninguna máquina/.test(p) && boton(/^Migrar a sistemas$/)?.props.isDisabled === true && !/Hay valores de organización que son de un sistema concreto/.test(p), p.slice(0, 1500));
    const fuera = documento();
    fuera.agents = { '777': { name: 'retirado', controls: { 'op.acc.1': { parameters: { 'P-07': ['x | retirado | y'] } } } } };
    await prepara(fuera);
    p = await renderiza(ConfigurationShell);
    comprueba('un perfil fuera del alcance se lista como tal', /777 · retirado/.test(p) && /fuera del alcance/.test(p));
    busqueda = '?tabView=configuration&configAgent=999';
    p = await renderiza(ConfigurationShell);
    comprueba('un id que no existe: lo avisa', /No hay ningún agente 999/.test(p));
  }

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
