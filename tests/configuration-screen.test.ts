/**
 * Configuración: la pantalla de dos niveles, el enlace desde la URL y las
 * acciones que hace sobre el documento.
 *
 *   npx --yes tsx tests/configuration-screen.test.ts
 *
 *   1. El enlace: `?tabView=configuration&configControl=…&configAgent=…&configParam=…`.
 *   2. Las acciones (puras): valor propio de un agente (y quitarlo), plantilla
 *      que sustituye a otra de plataforma, añadidos incompatibles, tipo
 *      corregido a mano, completitud.
 *   3. «Añadir con valores por defecto»: añade exactamente el bloque semilla
 *      de `config/` (lo mismo que `inject-control.py` con un control que no
 *      estaba) y no toca nada más.
 *   4. La pantalla, pintada con React y EUI de mentira: Organización con los
 *      controles sin añadir; un control abierto desde la URL; Sistemas con la
 *      migración; un agente abierto desde la URL con el parámetro pedido y el
 *      origen de cada valor.
 */
import { readFileSync, readdirSync } from 'fs';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

// --- React, EUI y el router de mentira, ANTES de cargar nada ----------------
let busqueda = '';
const empujadas: string[] = [];
const ELEMENTO = Symbol('elemento');
const reactStub: any = {
  createElement: (type: any, props: any, ...children: any[]) => ({
    [ELEMENTO]: true,
    type,
    props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
  }),
  Fragment: 'Fragment',
  Suspense: 'Suspense',
  lazy: (f: any) => f,
  useState: (inicial: any) => [typeof inicial === 'function' ? inicial() : inicial, () => undefined],
  useMemo: (f: any) => f(),
  useCallback: (f: any) => f,
  useEffect: () => undefined,
  useRef: () => ({ current: null }),
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
{
  const Module = require('module');
  const cargar = Module._load;
  Module._load = function (peticion: string, ...resto: unknown[]) {
    if (/kibana-services$/.test(peticion)) return {};
    if (peticion === 'react') return reactStub;
    if (peticion === '@elastic/eui') return euiStub;
    if (peticion === 'react-router-dom') {
      return {
        useLocation: () => ({ search: busqueda }),
        useHistory: () => ({ push: (l: any) => empujadas.push(l.search) }),
      };
    }
    return cargar.call(this, peticion, ...resto);
  };
}

const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) fallos.push(n);
};

// Pinta el árbol entero a texto: ejecuta los componentes propios, abre los de
// EUI por sus hijos y por las props que son elementos, y en una tabla pinta
// cada celda con su `render`.
const pinta = (nodo: any, salida: string[] = []): string[] => {
  if (nodo === null || nodo === undefined || nodo === false || nodo === true) return salida;
  if (Array.isArray(nodo)) { nodo.forEach(n => pinta(n, salida)); return salida; }
  if (typeof nodo === 'string' || typeof nodo === 'number') { salida.push(String(nodo)); return salida; }
  if (!nodo[ELEMENTO]) return salida;
  const { type, props } = nodo;
  if (typeof type === 'function' && !(type as any).eui) return pinta(type(props), salida);
  if (typeof type === 'function') return pinta(type(props), salida);
  if (type === 'eui:EuiBasicTable') {
    (props.items || []).forEach((item: any) => (props.columns || []).forEach((col: any) => pinta(col.render ? col.render(item[col.field], item) : item[col.field], salida)));
  }
  if (type === 'eui:EuiButton' || type === 'eui:EuiButtonEmpty' || type === 'eui:EuiTab') salida.push('[');
  Object.entries(props || {}).forEach(([clave, valor]: [string, any]) => {
    if (clave === 'children') return;
    if (['title', 'helpText', 'label', 'noItemsMessage', 'buttonContent'].includes(clave)) { if (typeof valor === 'string') salida.push(valor); }
    if (valor && (valor[ELEMENTO] || Array.isArray(valor))) pinta(valor, salida);
  });
  pinta(props?.children, salida);
  if (type === 'eui:EuiButton' || type === 'eui:EuiButtonEmpty' || type === 'eui:EuiTab') salida.push(']');
  return salida;
};
const texto = (nodo: any) => pinta(nodo).join(' ').replace(/\s+/g, ' ');

const { buildConfigurationSearch, parseConfigurationTarget, configurationSearchChanges } =
  require('../public/routing/configuration-link') as typeof import('../public/routing/configuration-link');
const { parseRouterSearch } = require('../public/routing/router-search') as typeof import('../public/routing/router-search');
const acciones = require('../public/ens/configuration/agents/agent-configuration-actions') as typeof import('../public/ens/configuration/agents/agent-configuration-actions');
const { ensConfigurationRepository } = require('../public/ens/configuration/repository') as typeof import('../public/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../public/ens/configuration/data/default-configuration') as typeof import('../public/ens/configuration/data/default-configuration');
const { hydrateENSScope } = require('../public/ens/core/scope/runtime') as typeof import('../public/ens/core/scope/runtime');
const { ConfigurationShell } = require('../public/ens/configuration/components/configuration-shell') as typeof import('../public/ens/configuration/components/configuration-shell');
const { resolveControlConfigurationWithOrigins } = require('../public/ens/configuration/agents/configuration-resolver') as typeof import('../public/ens/configuration/agents/configuration-resolver');

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
    return b;
  }),
});

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
  }

  console.log('2. Acciones');
  {
    const d = documento();
    const agente = { id: '102', name: 'dirHost', os: { platform: 'ubuntu', uname: 'Linux |dir01.example.com |6.8 |x86_64' } };
    const deteccion = { type: 'linux' as const, source: 'inventario' as const, evidence: 'os.platform = ubuntu en el inventario de agentes', addons: [] };
    const conValor = acciones.setAgentParameterValue(d, '102', 'op.acc.1', 'P-07', ['svc | dir01.example.com | servicio'], agente, deteccion);
    comprueba('valor propio guardado', JSON.stringify(conValor.agents?.['102']?.controls?.['op.acc.1']?.parameters?.['P-07']) === '["svc | dir01.example.com | servicio"]');
    comprueba('con la identidad de la máquina', conValor.agents?.['102']?.name === 'dirHost' && conValor.agents?.['102']?.aliases?.[0] === 'dir01.example.com' && conValor.agents?.['102']?.detectedType === 'linux', conValor.agents?.['102']);
    comprueba('sin tocar el original', !d.agents);
    const quitado = acciones.setAgentParameterValue(conValor, '102', 'op.acc.1', 'P-07', undefined);
    comprueba('quitarlo borra la clave (vuelve a heredar)', !quitado.agents?.['102']?.controls);
    const igual = acciones.setAgentParameterValue(d, '102', 'op.acc.1', 'P-01', 'Local');
    comprueba('un valor igual al heredado no se guarda', !igual.agents?.['102']?.controls);
    let error = '';
    try { acciones.setAgentParameterValue(d, '102', 'op.acc.1', 'P-04', ['x']); } catch (e: any) { error = e.message; }
    comprueba('un parámetro de organización no admite valor de agente', /organización/.test(error), error);

    const linux = acciones.applyTemplateToAgent(d, '102', 'linux-ubuntu', agente, deteccion).configuration;
    const pbs = acciones.applyTemplateToAgent(linux, '102', 'pbs-backup').configuration;
    const ldap = acciones.applyTemplateToAgent(pbs, '102', 'zimbra-ldap').configuration;
    comprueba('una plataforma sustituye a la otra y el añadido se queda', JSON.stringify(ldap.agents?.['102']?.templates) === '["zimbra-ldap","pbs-backup"]', ldap.agents?.['102']?.templates);
    const zne = acciones.applyTemplateToAgent(pbs, '102', 'zimbra-ne-backup');
    comprueba('PBS y Zimbra NE: no, con el motivo, y sin cambios', !!zne.error && /no se combina/.test(zne.error) && zne.configuration === pbs, zne.error);
    comprueba('quitar una plantilla', JSON.stringify(acciones.removeTemplateFromAgent(ldap, '102', 'pbs-backup').agents?.['102']?.templates) === '["zimbra-ldap"]');
    const tipo = acciones.setAgentTypeOverride(d, '102', 'zimbra-ldap', agente, deteccion);
    comprueba('tipo corregido a mano, con lo detectado', tipo.agents?.['102']?.typeOverride === 'zimbra-ldap' && tipo.agents?.['102']?.detectedType === 'linux');
    comprueba('y vuelta al detectado', !acciones.setAgentTypeOverride(tipo, '102', undefined).agents?.['102']?.typeOverride);
    const r = resolveControlConfigurationWithOrigins(ldap, 'op.acc.1', '102')!;
    comprueba('tras aplicar, el valor se hereda de la plantilla', r.origins['P-01'].source === 'template' && r.configuration.parameters.find(p => p.id === 'P-01')!.value === 'LDAP');
    const c = acciones.getAgentCompleteness(ldap, '102', [{ controlId: 'op.acc.1', level: 'MEDIO' }]);
    comprueba('completitud: con valor sobre el total de por sistema y por plataforma del nivel', c.total === 6 && c.withValue === 5 && c.missingRequired.join() === 'op.acc.1 P-02', c);
  }

  console.log('3. Añadir con valores por defecto');
  {
    const d = documento();
    const faltan = acciones.getMissingCatalogControls(d).map(c => c.controlId).sort();
    comprueba('lista los 6 que faltan', JSON.stringify(faltan) === JSON.stringify([...FALTAN].sort()), faltan);
    const r = acciones.addMissingControls(d, FALTAN);
    comprueba('los añade', JSON.stringify(r.added.sort()) === JSON.stringify([...FALTAN].sort()));
    const distintos = FALTAN.filter(id => JSON.stringify(r.configuration.controls.find(c => c.controlId === id)) !== JSON.stringify(bloques[id]));
    comprueba('cada uno es EXACTAMENTE su bloque semilla (lo que siembra inject-control.py)', distintos.length === 0, distintos);
    comprueba('sin tocar los que ya estaban', JSON.stringify(r.configuration.controls.slice(0, SEMBRADOS.length)) === JSON.stringify(d.controls));
    const conAgentes = { ...d, agents: { '101': { templates: ['linux-ubuntu'] } } };
    comprueba('ni la capa por sistema', JSON.stringify(acciones.addMissingControls(conAgentes, ['op.mon.1']).configuration.agents) === JSON.stringify(conAgentes.agents));
    comprueba('uno que ya está no se toca', acciones.addMissingControls(d, ['op.acc.1']).added.length === 0);
  }

  console.log('4. Pantalla');
  {
    const d = documento();
    d.agents = { '102': { name: 'dirHost', templates: ['zimbra-ldap'], controls: { 'op.exp.1': { parameters: { 'P-06': ['dir01 | alta | directorio'] } } } } };
    ensConfigurationRepository.completeHydration(d);
    await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => [
      { id: '101', name: 'web01', groups: ['ens'], status: 'active', os: { platform: 'ubuntu' } },
      { id: '102', name: 'dirHost', groups: ['ens'], status: 'active', os: { platform: 'ubuntu', uname: 'Linux |dir01.example.com |6.8 |x86_64' } },
    ], true);

    busqueda = '?tabView=configuration';
    const org = texto(reactStub.createElement(ConfigurationShell, null));
    comprueba('dos niveles', /\[ Organización \]/.test(org) && /\[ Sistemas \]/.test(org), org.slice(0, 300));
    comprueba('Organización lista los controles sin añadir con su botón', /Controles del catálogo sin añadir \( 6 \)|Controles del catálogo sin añadir \(6\)/.test(org) && /\[ Añadir con valores por defecto \]/.test(org) && /op\.mon\.1/.test(org), org.slice(org.indexOf('sin añadir') - 50, org.indexOf('sin añadir') + 300));

    busqueda = '?tabView=configuration&configControl=op.acc.1&configParam=P-07';
    const control = texto(reactStub.createElement(ConfigurationShell, null));
    comprueba('un control desde la URL: su página, con los de organización arriba', /op\.acc\.1 · /.test(control) && /Valores que heredan los sistemas/.test(control), control.slice(0, 400));

    busqueda = '?tabView=configuration&configControl=op.nub.1';
    const falta = texto(reactStub.createElement(ConfigurationShell, null));
    comprueba('un control sin añadir desde la URL: lo dice y ofrece añadirlo', /op\.nub\.1 no está en la configuración/.test(falta));

    busqueda = '?tabView=configuration&configView=sistemas';
    const sistemas = texto(reactStub.createElement(ConfigurationShell, null));
    comprueba('Sistemas: los agentes con su tipo detectado y su evidencia', /101 · web01/.test(sistemas) && /Linux/.test(sistemas) && /detectado por os\.platform = ubuntu/.test(sistemas), sistemas.slice(0, 500));
    comprueba('Sistemas: la migración propuesta con su botón', /\[ Migrar a sistemas \]/.test(sistemas) && /a 2 agente/.test(sistemas), sistemas.slice(0, 900));
    comprueba('Sistemas: plantillas y completitud', /Servidor LDAP Zimbra/.test(sistemas) && /con valor/.test(sistemas));

    busqueda = '?tabView=configuration&configAgent=102&configControl=op.acc.1&configParam=P-01';
    const agente = texto(reactStub.createElement(ConfigurationShell, null));
    comprueba('un agente desde la URL: su página', /102 · dirHost/.test(agente) && /Tipo de sistema/.test(agente), agente.slice(0, 400));
    comprueba('origen explícito: heredado de la plantilla', /heredado de la plantilla «Servidor LDAP Zimbra»/.test(agente));
    comprueba('origen explícito: valor propio', /valor propio de este sistema/.test(agente) && /\[ Quitar valor propio \(vuelve a heredar\) \]/.test(agente));
    comprueba('origen explícito: heredado de la organización', /heredado de la organización/.test(agente));
    comprueba('solo parámetros por sistema y por plataforma (P-04 es de organización)', !/P-04 · /.test(agente.slice(agente.indexOf('op.acc.1'), agente.indexOf('op.acc.2'))), '');
    comprueba('el parámetro pedido se abre para editar', /\[ Guardar para este sistema \]/.test(agente));
  }

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
