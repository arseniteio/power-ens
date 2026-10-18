// Cuándo vuelve a pedir el navegador una evaluación, sin React para poder
// probarlo (tests/evaluation-refresh.test.ts).
//
//   - Cada 5 minutos, y solo con la pestaña a la vista: primero la SONDA
//     (unos cientos de bytes) y solo si la huella cambió, la evaluación.
//   - Aunque la huella no cambie, si el resultado tiene más de 10 minutos se
//     vuelve a pedir: el motor mide contra el reloj (un recolector sin latir 24 h
//     deja de demostrar), y eso cambia sin que llegue ningún hecho.
//   - Como mucho 2 peticiones a la vez en toda la aplicación: la lista de
//     controles ya no lanza una por fila, pero dos pestañas del plugin, o el
//     panel y una sonda, no compiten por las conexiones del navegador.
export const EVALUATION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const EVALUATION_MAX_AGE_MS = 10 * 60 * 1000;
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
