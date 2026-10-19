// Memoria del servidor para las evaluaciones.
//
// Una entrada vale mientras su huella (configuración, alcance y los hechos de
// esa fila: cuántos hay y el más reciente) sea la misma. La sonda lo comprueba
// en cada petición, así que un dato nuevo caduca solo su control en su
// máquina. Además, una vida máxima de 60 minutos para lo que cambia solo con
// el reloj (un recolector que deja de latir deja de demostrar a las 24 h).
//
// Lo que ya no vale todavía se puede ENSEÑAR mientras se recalcula (`peek`):
// el servidor responde con ello al instante, marcado, y recalcula detrás.
export const EVALUATION_TTL_MS = 60 * 60 * 1000;

export interface CacheEntry<T> {
  value: T;
  fingerprint: string;
  storedAt: number;
  bytes: number;
}

export class EvaluationCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private totalBytes = 0;

  // `maxBytes` y `sizeOf`: además del número de entradas, un tope de tamaño
  // (lo que ocupa cada valor en JSON, medido una vez al guardarlo).
  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number = EVALUATION_TTL_MS,
    private readonly clock: () => number = Date.now,
    private maxBytes: number = Infinity,
    private readonly sizeOf: (value: T) => number = () => 0
  ) {}

  get bytes(): number {
    return this.totalBytes;
  }

  get budget(): number {
    return this.maxBytes;
  }

  // Ajusta el tope de tamaño (el servicio lo deriva del alcance). Lo que ya no
  // cabe se va al guardar lo siguiente.
  setMaxBytes(maxBytes: number): void {
    this.maxBytes = maxBytes;
  }

  private remove(key: string): void {
    const entrada = this.entries.get(key);
    if (!entrada) return;
    this.totalBytes -= entrada.bytes;
    this.entries.delete(key);
  }

  // El valor si la huella coincide y no ha caducado; si no, nada.
  get(key: string, fingerprint: string): T | undefined {
    const entrada = this.peek(key);
    if (!entrada || entrada.fingerprint !== fingerprint || this.clock() - entrada.storedAt > this.ttlMs) {
      return undefined;
    }
    return entrada.value;
  }

  // La entrada tal cual, valga o no (para enseñarla mientras se recalcula).
  peek(key: string): CacheEntry<T> | undefined {
    const entrada = this.entries.get(key);
    if (!entrada) return undefined;
    // Lo usado pasa al final: se descarta primero lo que lleva más sin usarse.
    this.entries.delete(key);
    this.entries.set(key, entrada);
    return entrada;
  }

  isFresh(entry: CacheEntry<T> | undefined, fingerprint: string): boolean {
    return Boolean(entry) && entry!.fingerprint === fingerprint && this.clock() - entry!.storedAt <= this.ttlMs;
  }

  set(key: string, fingerprint: string, value: T): void {
    this.remove(key);
    const bytes = this.sizeOf(value);
    this.entries.set(key, { value, fingerprint, storedAt: this.clock(), bytes });
    this.totalBytes += bytes;
    while (this.entries.size > this.maxEntries || (this.totalBytes > this.maxBytes && this.entries.size > 1)) {
      const primera = this.entries.keys().next().value;
      if (primera === undefined || primera === key) break;
      this.remove(primera);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }
}

export interface Cancellable {
  readonly aborted: boolean;
  onAbort(listener: () => void): void;
}

// Una señal que se cancela a mano.
export class CancelSignal implements Cancellable {
  private cancelled = false;
  private readonly listeners: (() => void)[] = [];

  get aborted(): boolean {
    return this.cancelled;
  }

  onAbort(listener: () => void): void {
    if (this.cancelled) listener();
    else this.listeners.push(listener);
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.listeners.splice(0).forEach(listener => listener());
  }
}

// El mismo cálculo (un control en una máquina, con la misma huella) lo
// comparten todas las peticiones que lo necesitan a la vez: el panel y la
// lista de controles abiertos juntos no leen dos veces lo mismo. Si todas las
// que esperan se van (el navegador cierra la petición), el cálculo se cancela;
// el que se lanza para refrescar en segundo plano no se cancela.
export class SharedTasks<T> {
  private readonly running = new Map<string, { promise: Promise<T>; waiters: number; signal: CancelSignal; pinned: boolean }>();

  get size(): number {
    return this.running.size;
  }

  // En curso y sin cancelar (uno cancelado ya no sirve a nadie).
  has(key: string): boolean {
    const entrada = this.running.get(key);
    return Boolean(entrada && !entrada.signal.aborted);
  }

  run(key: string, task: (signal: Cancellable) => Promise<T>, waiter?: Cancellable): Promise<T> {
    let entrada = this.running.get(key);
    // Un cálculo ya cancelado no se comparte: quien llega ahora empieza otro
    // (el `finally` del cancelado no borra al nuevo).
    if (entrada && entrada.signal.aborted) entrada = undefined;
    if (!entrada) {
      const signal = new CancelSignal();
      const promise = Promise.resolve()
        .then(() => task(signal))
        .finally(() => {
          if (this.running.get(key)?.promise === promise) this.running.delete(key);
        });
      entrada = { promise, waiters: 0, signal, pinned: false };
      this.running.set(key, entrada);
    }
    const actual = entrada;
    if (!waiter) {
      actual.pinned = true;
      return actual.promise;
    }
    actual.waiters += 1;
    let suelto = false;
    const suelta = () => {
      if (suelto) return;
      suelto = true;
      actual.waiters -= 1;
      if (actual.waiters <= 0 && !actual.pinned) actual.signal.cancel();
    };
    waiter.onAbort(suelta);
    return actual.promise.finally(suelta);
  }
}

// Cuántas lecturas pesadas (un control en una máquina) corren a la vez en el
// servidor del dashboard. Lo que sale de la memoria no pasa por aquí. Lo que
// alguien espera ahora pasa delante de lo que se refresca en segundo plano.
export class Semaphore {
  private active = 0;
  private readonly waiting: { resolve: () => void; background: boolean }[] = [];

  constructor(private readonly limit: number) {}

  get running(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiting.length;
  }

  async use<T>(task: () => Promise<T>, options: { background?: boolean } = {}): Promise<T> {
    if (this.active >= this.limit) {
      // Quien termina le pasa su plaza directamente (ver `finally`).
      await new Promise<void>(resolve => {
        const entrada = { resolve, background: Boolean(options.background) };
        if (entrada.background) this.waiting.push(entrada);
        else {
          const primeraDeFondo = this.waiting.findIndex(w => w.background);
          if (primeraDeFondo < 0) this.waiting.push(entrada);
          else this.waiting.splice(primeraDeFondo, 0, entrada);
        }
      });
    } else {
      this.active += 1;
    }
    try {
      return await task();
    } finally {
      const siguiente = this.waiting.shift();
      if (siguiente) siguiente.resolve();
      else this.active -= 1;
    }
  }
}
