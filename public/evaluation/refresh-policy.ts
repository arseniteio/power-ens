// Cuándo vuelve a pedir el navegador una evaluación, sin React para poder
// probarlo (tests/evaluation-refresh.test.ts).
//
//   - Cada 5 minutos, y solo con la pestaña a la vista: primero la SONDA
//     (unos cientos de bytes) y solo si la huella cambió, la evaluación.
//   - Aunque la huella no cambie, si el resultado tiene más de 60 minutos se
//     vuelve a pedir: el motor mide contra el reloj (un recolector sin latir 24 h
//     deja de demostrar), y eso cambia sin que llegue ningún hecho. Es la misma
//     vida que le da el servidor.
//   - Si el servidor responde con algo guardado mientras recalcula
//     (`meta.refreshing`), se vuelve a pedir a los 10 segundos.
//   - Como mucho 2 peticiones a la vez en toda la aplicación: la lista de
//     controles ya no lanza una por fila, pero dos pestañas del plugin, o el
//     panel y una sonda, no compiten por las conexiones del navegador.
export const EVALUATION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const EVALUATION_MAX_AGE_MS = 60 * 60 * 1000;
export const EVALUATION_REFRESHING_RETRY_MS = 10 * 1000;
// Tras un fallo (de la evaluación o de su refresco en segundo plano), el
// siguiente intento automático espera cada vez el doble, hasta 5 minutos.
export const EVALUATION_BACKOFF_MAX_MS = 5 * 60 * 1000;

export const backoffAfter = (failures: number): number =>
  Math.min(EVALUATION_BACKOFF_MAX_MS, EVALUATION_REFRESHING_RETRY_MS * 2 ** Math.max(0, failures - 1));
export const EVALUATION_MAX_CONCURRENT = 2;

// ¿Toca mirar si hay algo nuevo?
export const shouldProbe = (lastCheckAt: number | undefined, now: number, visible: boolean): boolean =>
  visible && (lastCheckAt === undefined || now - lastCheckAt >= EVALUATION_REFRESH_INTERVAL_MS);

// ¿Hay que volver a pedir la evaluación?
export const shouldReload = (
  probeFingerprint: string | undefined,
  dataFingerprint: string | undefined,
  evaluatedAt: string | undefined,
  now: number
): boolean => {
  if (!dataFingerprint || !evaluatedAt) return true;
  if (dataFingerprint.startsWith('refreshing:')) return true;
  if (probeFingerprint && probeFingerprint !== dataFingerprint) return true;
  const edad = now - Date.parse(evaluatedAt);
  return !Number.isFinite(edad) || edad >= EVALUATION_MAX_AGE_MS;
};

// La clave de lo que se pide: si cambia (otra máquina, otro control), lo que
// había deja de ser de esta pantalla y no se enseña como actual.
export const evaluationKey = (params: Record<string, unknown>): string =>
  JSON.stringify(Object.keys(params).sort().map(key => [key, params[key] ?? null]));

// Una cola: como mucho `limit` tareas a la vez; el resto espera su turno.
export class RequestLimiter {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number = EVALUATION_MAX_CONCURRENT) {}

  get running(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiting.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>(resolve => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await task();
    } finally {
      const siguiente = this.waiting.shift();
      if (siguiente) siguiente();
      else this.active -= 1;
    }
  }
}

// LO QUE VE LA PANTALLA, render a render. Una respuesta solo vale para la
// clave con que se pidió: si la pantalla ya pide otra (otra máquina, otro
// control), lo que había deja de enseñarse y se espera la suya. Un refresco de
// la MISMA clave sigue enseñando lo que había mientras llega lo nuevo.
export interface EvaluationViewState<T> {
  key?: string;
  data?: T;
  error?: unknown;
  loading: boolean;
  refreshing: boolean;
}

export type EvaluationEvent<T> =
  | { type: 'load'; key: string }
  | { type: 'refresh'; key: string }
  | { type: 'success'; key: string; data: T }
  | { type: 'failure'; key: string; error: unknown };

export const initialEvaluationState = <T>(): EvaluationViewState<T> => ({ loading: true, refreshing: false });

export const evaluationReducer = <T>(state: EvaluationViewState<T>, event: EvaluationEvent<T>): EvaluationViewState<T> => {
  switch (event.type) {
    case 'load':
      return { key: event.key, data: undefined, error: undefined, loading: true, refreshing: false };
    case 'refresh':
      return state.key === event.key
        ? { ...state, refreshing: true }
        : { key: event.key, data: undefined, error: undefined, loading: true, refreshing: false };
    case 'success':
      return state.key === event.key ? { key: event.key, data: event.data, error: undefined, loading: false, refreshing: false } : state;
    case 'failure':
      // Un fallo no deja a la vista lo de antes como si fuera de ahora.
      return state.key === event.key ? { key: event.key, data: undefined, error: event.error, loading: false, refreshing: false } : state;
    default:
      return state;
  }
};

// Lo que se enseña para la clave que pide ahora la pantalla.
export const visibleEvaluation = <T>(state: EvaluationViewState<T>, key: string) => {
  const vigente = state.key === key;
  return {
    data: vigente ? state.data : undefined,
    error: vigente ? state.error : undefined,
    isLoading: !vigente || state.loading,
    isRefreshing: vigente && state.refreshing,
  };
};

// EL CICLO DE UNA PANTALLA, sin React (lo envuelve `useEnsEvaluation` y lo
// prueba `tests/evaluation-refresh.test.ts`). Las reglas:
//
//   - Una carga se identifica por su petición: lo que llega de una petición que
//     ya no es la actual (otra máquina, otro control) se tira.
//   - Una carga cancelada por la propia pantalla no es un error; un tiempo
//     agotado SÍ lo es, y se dice (con «Reintentar»).
//   - La sonda no interrumpe nunca una carga en curso, y su reloj vuelve a
//     cero al cambiar de máquina o de control.
//   - Volver a pedir la misma clave (otra vez visible la lista, por ejemplo)
//     no borra lo que se ve: se refresca encima.
export interface EvaluationControllerDeps<T> {
  fetch: (controller: AbortController, options?: { retryRefresh?: boolean }) => Promise<T>;
  probe: (controller: AbortController) => Promise<{ fingerprint: string }>;
  now: () => number;
  visible: () => boolean;
  onChange: (state: EvaluationViewState<T>) => void;
}

interface Peticion {
  key: string;
  controller: AbortController;
  cancelled: boolean;
  startedAt: number;
}

export const createEvaluationController = <T extends { meta?: { fingerprint?: string; evaluatedAt?: string; refreshing?: boolean; refreshError?: unknown } }>(
  initialDeps: EvaluationControllerDeps<T>
) => {
  let deps = initialDeps;
  let key: string | undefined;
  let state: EvaluationViewState<T> = initialEvaluationState<T>();
  let actual: Peticion | undefined;
  let sondeando: AbortController | undefined;
  let ultimaComprobacion: number | undefined;
  let ultimaCarga: number | undefined;
  // Fallos seguidos: de la carga, o del refresco que el servidor no consigue.
  let fallos = 0;
  // Una carga que se soltó al ocultarse la pantalla: al volver, se repite.
  let suelta = false;

  const emite = (event: EvaluationEvent<T>) => {
    state = evaluationReducer(state, event);
    deps.onChange(state);
  };

  const cancela = () => {
    if (actual) {
      actual.cancelled = true;
      actual.controller.abort();
      actual = undefined;
    }
    if (sondeando) {
      sondeando.abort();
      sondeando = undefined;
    }
  };

  const carga = (modo: 'load' | 'refresh', opciones: { retryRefresh?: boolean } = {}) => {
    if (!key) return;
    cancela();
    const peticion: Peticion = { key, controller: new AbortController(), cancelled: false, startedAt: deps.now() };
    actual = peticion;
    ultimaCarga = peticion.startedAt;
    emite({ type: modo, key });
    deps
      .fetch(peticion.controller, opciones)
      .then(data => {
        if (actual !== peticion) return;
        actual = undefined;
        ultimaComprobacion = deps.now();
        // Lo guardado que el servidor no consigue refrescar cuenta como fallo:
        // no se vuelve a pedir cada 10 s.
        fallos = (data as any)?.meta?.refreshError ? fallos + 1 : 0;
        emite({ type: 'success', key: peticion.key, data });
      })
      .catch(error => {
        // Solo se calla lo que la pantalla canceló ella misma.
        if (peticion.cancelled || actual !== peticion) return;
        actual = undefined;
        fallos += 1;
        emite({ type: 'failure', key: peticion.key, error });
      });
  };

  return {
    get state() {
      return state;
    },
    get loading() {
      return Boolean(actual);
    },
    setDeps(next: EvaluationControllerDeps<T>) {
      deps = next;
    },
    // La pantalla pide esta clave. Si ya es la que tiene, no hace nada.
    setKey(next: string) {
      if (next === key) {
        if (suelta && !actual) {
          suelta = false;
          carga(state.key === key && state.data !== undefined ? 'refresh' : 'load');
        }
        return;
      }
      suelta = false;
      key = next;
      ultimaComprobacion = undefined;
      fallos = 0;
      carga('load');
    },
    // «Reintentar»: vuelve a pedir lo que ya se ve (o lo que falló), y pide al
    // servidor que intente ya el refresco que no pudo hacer.
    retry() {
      carga(state.key === key && state.data !== undefined ? 'refresh' : 'load', { retryRefresh: true });
    },
    get failures() {
      return fallos;
    },
    // Cada pocos segundos y al volver a la pestaña.
    async tick(): Promise<'busy' | 'skip' | 'reload' | 'unchanged' | 'probe-failed'> {
      if (!key || actual) return 'busy';
      const ahora = deps.now();
      const datos: any = state.key === key ? state.data : undefined;
      // Tras un fallo, el siguiente intento automático espera (y el error
      // sigue a la vista mientras tanto).
      if (fallos > 0 && ahora - (ultimaCarga ?? 0) < backoffAfter(fallos)) return 'skip';
      // Lo que el servidor está recalculando se vuelve a pedir enseguida.
      if (datos?.meta?.refreshing && deps.visible() && ahora - (ultimaCarga ?? 0) >= EVALUATION_REFRESHING_RETRY_MS) {
        carga('refresh');
        return 'reload';
      }
      if (!shouldProbe(ultimaComprobacion, ahora, deps.visible())) return 'skip';
      ultimaComprobacion = ahora;
      const claveSonda = key;
      const controller = new AbortController();
      sondeando = controller;
      try {
        const sonda = await deps.probe(controller);
        if (key !== claveSonda || actual || sondeando !== controller) return 'busy';
        const presente: any = state.key === key ? state.data : undefined;
        if (shouldReload(sonda.fingerprint, presente?.meta?.fingerprint, presente?.meta?.evaluatedAt, deps.now())) {
          // Un reintento automático tras un fallo deja el error a la vista
          // mientras pide (no lo cambia por una rueda).
          const conError = state.key === key && state.error !== undefined;
          carga(presente || conError ? 'refresh' : 'load');
          return 'reload';
        }
        return 'unchanged';
      } catch {
        // Cancelada por la pantalla (cambio de clave, carga nueva): no cuenta
        // como fallo. Un tiempo agotado también aborta, pero ese sí lo es.
        if (key !== claveSonda || sondeando !== controller) return 'busy';
        // La sonda falla en silencio: lo que se ve sigue siendo de esta clave y
        // la siguiente vuelta lo vuelve a intentar.
        return 'probe-failed';
      } finally {
        if (sondeando === controller) sondeando = undefined;
      }
    },
    // La pantalla se oculta: suelta la carga en curso (no ocupa una de las
    // plazas del navegador) sin borrar lo que se ve; al volver, se repite.
    suspend() {
      if (actual) {
        cancela();
        suelta = true;
      } else if (sondeando) {
        cancela();
      }
    },
    dispose() {
      cancela();
      key = undefined;
    },
  };
};
