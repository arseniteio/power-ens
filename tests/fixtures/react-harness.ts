/** Fake React for rendering screens in tests without the dashboard. */
declare const require: (id: string) => any;

const ELEMENT = Symbol('elemento');

export interface HarnessNode {
  type: string;
  props: any;
  ruta: string;
  texto: string;
}

export interface ReactHarness {
  render: (root: any, props?: any, laps?: number) => Promise<string>;
  rerender: (laps?: number) => Promise<string>;
  text: () => string;
  nodes: () => HarnessNode[];
  find: (type: string, text?: RegExp) => HarnessNode | undefined;
  findAll: (type: string, text?: RegExp) => HarnessNode[];
  click: (text: RegExp, type?: string) => Promise<string>;
  search: () => string;
  setSearch: (search: string) => void;
  reset: () => void;
}

export const TEMA_CLARO = {
  euiColorEmptyShade: '#FFF',
  euiColorLightestShade: '#F5F7FA',
  euiColorLightShade: '#D3DAE6',
  euiColorMediumShade: '#98A2B3',
  euiColorDarkShade: '#69707D',
  euiColorDangerText: '#BD271E',
  euiColorPrimary: '#006BB4',
};

export const installReactHarness = (opts: { overrides?: Record<string, (actual: any) => any> } = {}): ReactHarness => {
  const states = new Map<string, any[]>();
  const factEffects = new Map<string, string>();
  const instances = new Map<string, any>();
  let pending: Array<() => void> = [];
  let ruta = '';
  let index = 0;
  let search = '';
  let nodes: HarnessNode[] = [];
  let screen = '';
  let lastRoot: any;
  let latestProps: any;

  const checkbox = (initial: () => any) => {
    const clave = ruta;
    let arr = states.get(clave);
    if (!arr) {
      arr = [];
      states.set(clave, arr);
    }
    const i = index++;
    if (!(i in arr)) arr[i] = initial();
    return { arr, i };
  };

  class Component<P = any, S = any> {
    props: P;
    state: S = {} as S;
    constructor(props: P) {
      this.props = props;
    }
    setState(change: any) {
      const partial = typeof change === 'function' ? change(this.state) : change;
      this.state = { ...(this.state as any), ...partial };
    }
  }

  const reactStub: any = {
    createElement: (type: any, props: any, ...children: any[]) => ({
      [ELEMENT]: true,
      type,
      props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
    }),
    Fragment: 'Fragment',
    Suspense: 'Suspense',
    Component,
    lazy: (loader: any) => {
      let loaded: any;
      let pendingOne: any;
      const Lazy = (props: any) => {
        if (loaded) return reactStub.createElement(loaded, props);
        if (!pendingOne) pendingOne = Promise.resolve(loader()).then((m: any) => { loaded = m.default; });
        return null;
      };
      return Lazy;
    },
    useState: (initial: any) => {
      const { arr, i } = checkbox(() => (typeof initial === 'function' ? initial() : initial));
      return [arr[i], (v: any) => { arr[i] = typeof v === 'function' ? v(arr[i]) : v; }];
    },
    useRef: (initial: any) => checkbox(() => ({ current: initial === undefined ? undefined : initial })).arr[index - 1],
    useMemo: (f: any) => f(),
    useCallback: (f: any) => f,
    useEffect: (f: any, deps?: any[]) => {
      const clave = `${ruta}#${index++}`;
      const signature = deps === undefined ? String(Math.random()) : JSON.stringify(deps);
      if (factEffects.get(clave) !== signature) {
        factEffects.set(clave, signature);
        pending.push(f);
      }
    },
  };
  reactStub.default = reactStub;

  const euiStub = new Proxy({}, {
    get: (_t, name) => {
      if (name === '__esModule') return false;
      const c = (props: any) => ({ [ELEMENT]: true, type: `eui:${String(name)}`, props });
      Object.defineProperty(c, 'name', { value: String(name) });
      (c as any).eui = String(name);
      return c;
    },
  });

  const Module = require('module');
  const path = require('path');
  const load = Module._load;
  const overrides = Object.fromEntries(
    Object.entries(opts.overrides || {}).map(([clave, value]) => [path.resolve(clave), value])
  );
  Module._load = function (request: string, padre: any, ...rest: unknown[]) {
    if (/kibana-services$/.test(request)) return {};
    if (request === 'react') return reactStub;
    if (request === '@elastic/eui') return euiStub;
    if (request === '@osd/ui-shared-deps/theme') return { euiThemeVars: TEMA_CLARO };
    if (request === 'react-router-dom') {
      return {
        useLocation: () => ({ search: search }),
        useHistory: () => ({ push: (l: any) => { search = l.search; } }),
      };
    }
    let resolvedOne = '';
    try {
      resolvedOne = Module._resolveFilename(request, padre);
    } catch (e) {
      resolvedOne = '';
    }
    const change = resolvedOne ? overrides[path.resolve(resolvedOne)] : undefined;
    if (change) return change(load.call(this, request, padre, ...rest));
    return load.call(this, request, padre, ...rest);
  };

  const textOf = (node: any): string => {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (Array.isArray(node)) return node.map(textOf).join(' ');
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (!node[ELEMENT]) return '';
    if (typeof node.type === 'function' && !(node.type as any).eui) return '';
    return textOf(node.props?.children);
  };

  const pinta = (node: any, where: string, output: string[]): void => {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (Array.isArray(node)) {
      node.forEach((n, i) => pinta(n, `${where}.${n?.props?.key ?? i}`, output));
      return;
    }
    if (typeof node === 'string' || typeof node === 'number') {
      output.push(String(node));
      return;
    }
    if (!node[ELEMENT]) return;
    const { type, props } = node;
    if (typeof type === 'function' && type.prototype && typeof type.prototype.render === 'function') {
      const here = `${where}/${type.name || 'K'}${props?.key !== undefined ? `:${props.key}` : ''}`;
      let inst = instances.get(here);
      const fresh = !inst;
      if (!inst) {
        inst = new type(props);
        instances.set(here, inst);
      }
      const previous = inst.props;
      inst.props = props;
      if (!fresh && typeof inst.componentDidUpdate === 'function') pending.push(() => inst.componentDidUpdate(previous));
      const attempt: string[] = [];
      const howManyOnes = nodes.length;
      try {
        pinta(inst.render(), here, attempt);
      } catch (error) {
        if (typeof type.getDerivedStateFromError !== 'function') throw error;
        nodes.length = howManyOnes;
        inst.state = { ...(inst.state || {}), ...type.getDerivedStateFromError(error) };
        if (typeof inst.componentDidCatch === 'function') inst.componentDidCatch(error);
        attempt.length = 0;
        pinta(inst.render(), here, attempt);
      }
      output.push(...attempt);
      return;
    }
    if (typeof type === 'function' && !(type as any).eui) {
      const here = `${where}/${type.name || 'C'}${props?.key !== undefined ? `:${props.key}` : ''}`;
      const antes = [ruta, index] as const;
      ruta = here;
      index = 0;
      let child;
      try {
        child = type(props);
      } finally {
        ruta = antes[0];
        index = antes[1];
      }
      nodes.push({ type: type.name, props, ruta: here, texto: '' });
      pinta(child, here, output);
      return;
    }
    if (typeof type === 'function') {
      pinta(type(props), where, output);
      return;
    }
    const name = String(type).replace(/^eui:/, '');
    nodes.push({ type: name, props, ruta: where, texto: textOf(props?.children).replace(/\s+/g, ' ').trim() });
    if (name === 'EuiBasicTable' || name === 'EuiInMemoryTable') {
      (props.items || []).forEach((item: any, i: number) =>
        (props.columns || []).forEach((col: any) =>
          pinta(col.render ? col.render(col.field ? item[col.field] : item, item) : item[col.field], `${where}.${item.id ?? i}`, output)
        )
      );
    }
    const mark = ['EuiButton', 'EuiButtonEmpty', 'EuiTab', 'EuiLink', 'EuiBadge'].includes(name);
    if (mark) output.push('[');
    Object.entries(props || {}).forEach(([clave, value]: [string, any]) => {
      if (clave === 'children') return;
      if (['title', 'helpText', 'label', 'noItemsMessage', 'buttonContent', 'message', 'content', 'description'].includes(clave) && typeof value === 'string') output.push(value);
      if (value && (value[ELEMENT] || Array.isArray(value))) pinta(value, `${where}.${clave}`, output);
    });
    pinta(props?.children, `${where}.c`, output);
    if (mark) output.push(']');
  };

  const wait = () => new Promise(r => setTimeout(r, 0));

  const rerender = async (laps = 3): Promise<string> => {
    for (let v = 0; v < laps; v += 1) {
      nodes = [];
      const output: string[] = [];
      ruta = '';
      index = 0;
      pinta(reactStub.createElement(lastRoot, latestProps), 'raiz', output);
      screen = output.join(' ').replace(/\s+/g, ' ');
      const effects = pending;
      pending = [];
      effects.forEach(f => f());
      await wait();
      await wait();
    }
    return screen;
  };

  const findAll = (type: string, text?: RegExp) =>
    nodes.filter(n => n.type === type && (!text || text.test(n.texto) || text.test(String(n.props?.title || ''))));

  return {
    render: async (root, props, laps) => {
      lastRoot = root;
      latestProps = props;
      return rerender(laps);
    },
    rerender,
    text: () => screen,
    nodes: () => nodes,
    find: (type, text) => findAll(type, text)[0],
    findAll,
    click: async (text, type) => {
      const b = nodes.find(
        n => ['EuiButton', 'EuiButtonEmpty', 'EuiLink', 'EuiBadge', 'EuiFacetButton', 'EuiTab'].includes(n.type) && (!type || n.type === type) && text.test(n.texto) && (n.props.onClick || n.props.onClickAriaLabel)
      );
      if (!b) throw new Error(`there is nothing to click with ${text}`);
      await b.props.onClick();
      await wait();
      return rerender();
    },
    search: () => search,
    setSearch: s => { search = s; },
    reset: () => {
      states.clear();
      factEffects.clear();
      instances.clear();
      pending = [];
    },
  };
};
