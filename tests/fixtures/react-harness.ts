/**
 * Un React de mentira para pintar pantallas en las pruebas, sin dashboard:
 * guarda el estado de los hooks entre pintadas (useState, useRef, useEffect),
 * pinta los componentes de clase (con su `getDerivedStateFromError`), y EUI y
 * el router son de mentira. Es el de `configuration-screen.test.ts`, en un
 * fichero para que lo usen otras pruebas.
 *
 *   const h = installReactHarness({ overrides: { [rutaAbsoluta]: real => ({ ...real, algo }) } });
 *   const { Pantalla } = require('../public/…');      // DESPUÉS de instalar
 *   await h.render(Pantalla, { prop: 1 });
 *   h.text();  h.find('EuiCallOut');  await h.click(/Reintentar/);
 */
declare const require: (id: string) => any;

const ELEMENTO = Symbol('elemento');

export interface HarnessNode {
  type: string;
  props: any;
  ruta: string;
  texto: string;
}

export interface ReactHarness {
  render: (root: any, props?: any, vueltas?: number) => Promise<string>;
  rerender: (vueltas?: number) => Promise<string>;
  text: () => string;
  nodes: () => HarnessNode[];
  find: (type: string, texto?: RegExp) => HarnessNode | undefined;
  findAll: (type: string, texto?: RegExp) => HarnessNode[];
  click: (texto: RegExp, tipo?: string) => Promise<string>;
  search: () => string;
  setSearch: (search: string) => void;
  reset: () => void;
}

export const installReactHarness = (opts: { overrides?: Record<string, (real: any) => any> } = {}): ReactHarness => {
  const estados = new Map<string, any[]>();
  const efectosHechos = new Map<string, string>();
  const instancias = new Map<string, any>();
  let pendientes: Array<() => void> = [];
  let ruta = '';
  let indice = 0;
  let busqueda = '';
  let nodos: HarnessNode[] = [];
  let pantalla = '';
  let ultimaRaiz: any;
  let ultimasProps: any;

  const casilla = (inicial: () => any) => {
    const clave = ruta;
    let arr = estados.get(clave);
    if (!arr) {
      arr = [];
      estados.set(clave, arr);
    }
    const i = indice++;
    if (!(i in arr)) arr[i] = inicial();
    return { arr, i };
  };

  class Component<P = any, S = any> {
    props: P;
    state: S = {} as S;
    constructor(props: P) {
      this.props = props;
    }
    setState(cambio: any) {
      const parcial = typeof cambio === 'function' ? cambio(this.state) : cambio;
      this.state = { ...(this.state as any), ...parcial };
    }
  }

  const reactStub: any = {
    createElement: (type: any, props: any, ...children: any[]) => ({
      [ELEMENTO]: true,
      type,
      props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
    }),
    Fragment: 'Fragment',
    Suspense: 'Suspense',
    Component,
    // Como React.lazy: la primera pintada lanza la carga y no pinta nada; las
    // siguientes (tras `await`), el componente cargado.
    lazy: (cargador: any) => {
      let cargado: any;
      let pendiente: any;
      const Lazy = (props: any) => {
        if (cargado) return reactStub.createElement(cargado, props);
        if (!pendiente) pendiente = Promise.resolve(cargador()).then((m: any) => { cargado = m.default; });
        return null;
      };
      return Lazy;
    },
    useState: (inicial: any) => {
      const { arr, i } = casilla(() => (typeof inicial === 'function' ? inicial() : inicial));
      return [arr[i], (v: any) => { arr[i] = typeof v === 'function' ? v(arr[i]) : v; }];
    },
    useRef: (inicial: any) => casilla(() => ({ current: inicial === undefined ? undefined : inicial })).arr[indice - 1],
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

  const Module = require('module');
  const path = require('path');
  const cargar = Module._load;
  const overrides = Object.fromEntries(
    Object.entries(opts.overrides || {}).map(([clave, valor]) => [path.resolve(clave), valor])
  );
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
    try {
      resuelto = Module._resolveFilename(peticion, padre);
    } catch (e) {
      resuelto = '';
    }
    const cambio = resuelto ? overrides[path.resolve(resuelto)] : undefined;
    if (cambio) return cambio(cargar.call(this, peticion, padre, ...resto));
    return cargar.call(this, peticion, padre, ...resto);
  };

  const textoDe = (nodo: any): string => {
    if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return '';
    if (Array.isArray(nodo)) return nodo.map(textoDe).join(' ');
    if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo);
    if (!nodo[ELEMENTO]) return '';
    if (typeof nodo.type === 'function' && !(nodo.type as any).eui) return '';
    return textoDe(nodo.props?.children);
  };

  const pinta = (nodo: any, donde: string, salida: string[]): void => {
    if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return;
    if (Array.isArray(nodo)) {
      nodo.forEach((n, i) => pinta(n, `${donde}.${n?.props?.key ?? i}`, salida));
      return;
    }
    if (typeof nodo === 'string' || typeof nodo === 'number') {
      salida.push(String(nodo));
      return;
    }
    if (!nodo[ELEMENTO]) return;
    const { type, props } = nodo;
    if (typeof type === 'function' && type.prototype && typeof type.prototype.render === 'function') {
      const aqui = `${donde}/${type.name || 'K'}${props?.key !== undefined ? `:${props.key}` : ''}`;
      let inst = instancias.get(aqui);
      const nueva = !inst;
      if (!inst) {
        inst = new type(props);
        instancias.set(aqui, inst);
      }
      const anteriores = inst.props;
      inst.props = props;
      if (!nueva && typeof inst.componentDidUpdate === 'function') pendientes.push(() => inst.componentDidUpdate(anteriores));
      const intento: string[] = [];
      const cuantos = nodos.length;
      try {
        pinta(inst.render(), aqui, intento);
      } catch (error) {
        if (typeof type.getDerivedStateFromError !== 'function') throw error;
        nodos.length = cuantos;
        inst.state = { ...(inst.state || {}), ...type.getDerivedStateFromError(error) };
        if (typeof inst.componentDidCatch === 'function') inst.componentDidCatch(error);
        intento.length = 0;
        pinta(inst.render(), aqui, intento);
      }
      salida.push(...intento);
      return;
    }
    if (typeof type === 'function' && !(type as any).eui) {
      const aqui = `${donde}/${type.name || 'C'}${props?.key !== undefined ? `:${props.key}` : ''}`;
      const antes = [ruta, indice] as const;
      ruta = aqui;
      indice = 0;
      let hijo;
      try {
        hijo = type(props);
      } finally {
        ruta = antes[0];
        indice = antes[1];
      }
      nodos.push({ type: type.name, props, ruta: aqui, texto: '' });
      pinta(hijo, aqui, salida);
      return;
    }
    if (typeof type === 'function') {
      pinta(type(props), donde, salida);
      return;
    }
    const nombre = String(type).replace(/^eui:/, '');
    nodos.push({ type: nombre, props, ruta: donde, texto: textoDe(props?.children).replace(/\s+/g, ' ').trim() });
    if (nombre === 'EuiBasicTable' || nombre === 'EuiInMemoryTable') {
      (props.items || []).forEach((item: any, i: number) =>
        (props.columns || []).forEach((col: any) =>
          pinta(col.render ? col.render(col.field ? item[col.field] : item, item) : item[col.field], `${donde}.${item.id ?? i}`, salida)
        )
      );
    }
    const marca = ['EuiButton', 'EuiButtonEmpty', 'EuiTab', 'EuiLink', 'EuiBadge'].includes(nombre);
    if (marca) salida.push('[');
    Object.entries(props || {}).forEach(([clave, valor]: [string, any]) => {
      if (clave === 'children') return;
      if (['title', 'helpText', 'label', 'noItemsMessage', 'buttonContent', 'message', 'content', 'description'].includes(clave) && typeof valor === 'string') salida.push(valor);
      if (valor && (valor[ELEMENTO] || Array.isArray(valor))) pinta(valor, `${donde}.${clave}`, salida);
    });
    pinta(props?.children, `${donde}.c`, salida);
    if (marca) salida.push(']');
  };

  const espera = () => new Promise(r => setTimeout(r, 0));

  const rerender = async (vueltas = 3): Promise<string> => {
    for (let v = 0; v < vueltas; v += 1) {
      nodos = [];
      const salida: string[] = [];
      ruta = '';
      indice = 0;
      pinta(reactStub.createElement(ultimaRaiz, ultimasProps), 'raiz', salida);
      pantalla = salida.join(' ').replace(/\s+/g, ' ');
      const efectos = pendientes;
      pendientes = [];
      efectos.forEach(f => f());
      await espera();
      await espera();
    }
    return pantalla;
  };

  const findAll = (type: string, texto?: RegExp) =>
    nodos.filter(n => n.type === type && (!texto || texto.test(n.texto) || texto.test(String(n.props?.title || ''))));

  return {
    render: async (root, props, vueltas) => {
      ultimaRaiz = root;
      ultimasProps = props;
      return rerender(vueltas);
    },
    rerender,
    text: () => pantalla,
    nodes: () => nodos,
    find: (type, texto) => findAll(type, texto)[0],
    findAll,
    click: async (texto, tipo) => {
      const b = nodos.find(
        n => ['EuiButton', 'EuiButtonEmpty', 'EuiLink', 'EuiBadge', 'EuiFacetButton', 'EuiTab'].includes(n.type) && (!tipo || n.type === tipo) && texto.test(n.texto) && (n.props.onClick || n.props.onClickAriaLabel)
      );
      if (!b) throw new Error(`no hay nada que pulsar con ${texto}`);
      await b.props.onClick();
      await espera();
      return rerender();
    },
    search: () => busqueda,
    setSearch: s => { busqueda = s; },
    reset: () => {
      estados.clear();
      efectosHechos.clear();
      instancias.clear();
      pendientes = [];
    },
  };
};
