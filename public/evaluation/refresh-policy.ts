// When the browser requests an evaluation again, without React (tests/evaluation-refresh.test.ts).
// - Every 5 minutes with the tab visible: first the probe (a few hundred bytes), and the evaluation only if the fingerprint changed.
// - Whatever the fingerprint, a result older than 60 minutes is requested again: the engine measures against the clock.
// - A stored result served while the server recalculates (`meta.refreshing`) is requested again after 10 s.
// - First load (`meta.pending`, `meta.seriesPending`): every 2 s for 2 minutes, then every 15 s.
// - At most 2 concurrent requests in the whole app.
export const EVALUATION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const EVALUATION_MAX_AGE_MS = 60 * 60 * 1000;
export const EVALUATION_REFRESHING_RETRY_MS = 10 * 1000;
export const EVALUATION_PENDING_RETRY_MS = 2 * 1000;
export const EVALUATION_PENDING_FAST_FOR_MS = 2 * 60 * 1000;
export const EVALUATION_PENDING_SLOW_RETRY_MS = 15 * 1000;
// After a failure the next automatic attempt waits twice as long each time, up to 5 minutes.
export const EVALUATION_BACKOFF_MAX_MS = 5 * 60 * 1000;

export const backoffAfter = (failures: number): number =>
  Math.min(EVALUATION_BACKOFF_MAX_MS, EVALUATION_REFRESHING_RETRY_MS * 2 ** Math.max(0, failures - 1));
export const EVALUATION_MAX_CONCURRENT = 2;

export const shouldProbe = (lastCheckAt: number | undefined, now: number, visible: boolean): boolean =>
  visible && (lastCheckAt === undefined || now - lastCheckAt >= EVALUATION_REFRESH_INTERVAL_MS);

export const shouldReload = (
  probeFingerprint: string | undefined,
  dataFingerprint: string | undefined,
  evaluatedAt: string | undefined,
  now: number
): boolean => {
  if (!dataFingerprint || !evaluatedAt) return true;
  if (dataFingerprint.startsWith('refreshing:')) return true;
  if (probeFingerprint && probeFingerprint !== dataFingerprint) return true;
  const age = now - Date.parse(evaluatedAt);
  return !Number.isFinite(age) || age >= EVALUATION_MAX_AGE_MS;
};

export const evaluationKey = (params: Record<string, unknown>): string =>
  JSON.stringify(Object.keys(params).sort().map(key => [key, params[key] ?? null]));

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
      const following = this.waiting.shift();
      if (following) following();
      else this.active -= 1;
    }
  }
}

// What the screen sees, render by render. A response is only valid for the key it was requested with; a refresh of the SAME key keeps showing the previous result meanwhile.
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
      return state.key === event.key ? { key: event.key, data: undefined, error: event.error, loading: false, refreshing: false } : state;
    default:
      return state;
  }
};

export const visibleEvaluation = <T>(state: EvaluationViewState<T>, key: string) => {
  const valid = state.key === key;
  return {
    data: valid ? state.data : undefined,
    error: valid ? state.error : undefined,
    isLoading: !valid || state.loading,
    isRefreshing: valid && state.refreshing,
  };
};

// The cycle of one screen, without React (wrapped by `useEnsEvaluation`).
// - A load is identified by its request: responses of a request that is no longer current are dropped.
// - A load cancelled by the screen is not an error; a timeout is, and it is shown with 'Reintentar'.
// - The probe never interrupts a load, and its clock resets when machine or control change.
// - Requesting the same key again does not clear what is shown: it is refreshed on top.
export interface EvaluationControllerDeps<T> {
  fetch: (controller: AbortController, options?: { retryRefresh?: boolean }) => Promise<T>;
  probe: (controller: AbortController) => Promise<{ fingerprint: string }>;
  now: () => number;
  visible: () => boolean;
  onChange: (state: EvaluationViewState<T>) => void;
}

interface RefreshRequest {
  key: string;
  controller: AbortController;
  cancelled: boolean;
  startedAt: number;
  retryRefresh?: boolean;
}

export const createEvaluationController = <T extends { meta?: { fingerprint?: string; evaluatedAt?: string; refreshing?: boolean; refreshError?: unknown; pending?: unknown; seriesPending?: boolean } }>(
  initialDeps: EvaluationControllerDeps<T>
) => {
  let deps = initialDeps;
  let key: string | undefined;
  let state: EvaluationViewState<T> = initialEvaluationState<T>();
  let current: RefreshRequest | undefined;
  let probing: AbortController | undefined;
  let lastCheck: number | undefined;
  let lastLoad: number | undefined;
  let failureCount = 0;
  let aMediasDesde: number | undefined;
  let ultimoErrorDeRefresco: string | undefined;
  let released = false;
  let releasedWithRetry = false;

  const emits = (event: EvaluationEvent<T>) => {
    state = evaluationReducer(state, event);
    deps.onChange(state);
  };

  const cancela = () => {
    if (current) {
      current.cancelled = true;
      current.controller.abort();
      current = undefined;
    }
    if (probing) {
      probing.abort();
      probing = undefined;
    }
  };

  const load = (mode: 'load' | 'refresh', options: { retryRefresh?: boolean } = {}) => {
    if (!key) return;
    cancela();
    const request: RefreshRequest = { key, controller: new AbortController(), cancelled: false, startedAt: deps.now(), retryRefresh: options.retryRefresh };
    current = request;
    lastLoad = request.startedAt;
    emits({ type: mode, key });
    deps
      .fetch(request.controller, options)
      .then(data => {
        if (current !== request) return;
        current = undefined;
        lastCheck = deps.now();
        // A stored result the server cannot refresh counts as a failure, but only a NEW error does: the same error repeated does not lengthen the wait.
        const error = (data as any)?.meta?.refreshError;
        const pending = Boolean((data as any)?.meta?.pending?.rows > 0 || (data as any)?.meta?.seriesPending);
        aMediasDesde = pending ? aMediasDesde ?? deps.now() : undefined;
        if (!error) {
          failureCount = 0;
          ultimoErrorDeRefresco = undefined;
        } else if (`${error.at}|${error.message}` !== ultimoErrorDeRefresco) {
          ultimoErrorDeRefresco = `${error.at}|${error.message}`;
          if (!options.retryRefresh) failureCount += 1;
        }
        emits({ type: 'success', key: request.key, data });
      })
      .catch(error => {
        if (request.cancelled || current !== request) return;
        current = undefined;
        failureCount += 1;
        emits({ type: 'failure', key: request.key, error });
      });
  };

  return {
    get state() {
      return state;
    },
    get loading() {
      return Boolean(current);
    },
    setDeps(next: EvaluationControllerDeps<T>) {
      deps = next;
    },
    setKey(next: string) {
      if (next === key) {
        if (released && !current) {
          released = false;
          load(state.key === key && state.data !== undefined ? 'refresh' : 'load', { retryRefresh: releasedWithRetry });
          releasedWithRetry = false;
        }
        return;
      }
      released = false;
      key = next;
      lastCheck = undefined;
      failureCount = 0;
      aMediasDesde = undefined;
      load('load');
    },
    retry() {
      failureCount = 0;
      load(state.key === key && state.data !== undefined ? 'refresh' : 'load', { retryRefresh: true });
    },
    get failures() {
      return failureCount;
    },
    async tick(): Promise<'busy' | 'skip' | 'reload' | 'unchanged' | 'probe-failed'> {
      if (!key || current) return 'busy';
      const now = deps.now();
      const data: any = state.key === key ? state.data : undefined;
      if (failureCount > 0 && now - (lastLoad ?? 0) < backoffAfter(failureCount)) return 'skip';
      // First partial load: every 2 s for 2 minutes, then every 15 s; nothing while the tab is hidden.
      const aMedias = Boolean(data?.meta?.pending?.rows > 0 || data?.meta?.seriesPending);
      const each =
        aMediasDesde !== undefined && now - aMediasDesde >= EVALUATION_PENDING_FAST_FOR_MS ? EVALUATION_PENDING_SLOW_RETRY_MS : EVALUATION_PENDING_RETRY_MS;
      if (aMedias) {
        if (!deps.visible() || now - (lastLoad ?? 0) < each) return 'skip';
        load('refresh');
        return 'reload';
      }
      if (data?.meta?.refreshing && deps.visible() && now - (lastLoad ?? 0) >= EVALUATION_REFRESHING_RETRY_MS) {
        load('refresh');
        return 'reload';
      }
      if (!shouldProbe(lastCheck, now, deps.visible())) return 'skip';
      lastCheck = now;
      const probeKey = key;
      const controller = new AbortController();
      probing = controller;
      try {
        const probe = await deps.probe(controller);
        if (key !== probeKey || current || probing !== controller) return 'busy';
        const present: any = state.key === key ? state.data : undefined;
        if (shouldReload(probe.fingerprint, present?.meta?.fingerprint, present?.meta?.evaluatedAt, deps.now())) {
          const withError = state.key === key && state.error !== undefined;
          load(present || withError ? 'refresh' : 'load');
          return 'reload';
        }
        return 'unchanged';
      } catch {
        // Cancelled by the screen: not a failure. A timeout also aborts, and that one is a failure.
        if (key !== probeKey || probing !== controller) return 'busy';
        // The probe fails silently: what is shown still belongs to this key and the next round tries again.
        return 'probe-failed';
      } finally {
        if (probing === controller) probing = undefined;
      }
    },
    // Hidden screen: releases the load in progress without clearing what is shown; it is repeated on return.
    suspend() {
      if (current) {
        releasedWithRetry = Boolean(current.retryRefresh);
        cancela();
        released = true;
      } else if (probing) {
        cancela();
        lastCheck = undefined;
      }
    },
    dispose() {
      cancela();
      key = undefined;
    },
  };
};
