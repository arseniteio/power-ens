// Memoria del servidor para las evaluaciones: una entrada vale mientras su
// huella sea la misma (configuración, hechos del control, presencia de las
// máquinas) y no haya pasado el tiempo de vida. El tiempo de vida existe porque
// el motor mide contra el reloj (un recolector sin latir más de 24 h deja de
// demostrar): sin datos nuevos el veredicto también puede cambiar.
export const EVALUATION_TTL_MS = 10 * 60 * 1000;

interface Entrada<T> {
  value: T;
  fingerprint: string;
  storedAt: number;
}

export class EvaluationCache<T> {
  private readonly entries = new Map<string, Entrada<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number = EVALUATION_TTL_MS,
    private readonly clock: () => number = Date.now
  ) {}

  // El valor si la huella coincide y no ha caducado; si no, nada.
  get(key: string, fingerprint: string): T | undefined {
    const entrada = this.entries.get(key);
    if (!entrada) return undefined;
    if (entrada.fingerprint !== fingerprint || this.clock() - entrada.storedAt > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    // Lo usado pasa al final: se descarta primero lo que lleva más sin usarse.
    this.entries.delete(key);
    this.entries.set(key, entrada);
    return entrada.value;
  }

  set(key: string, fingerprint: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, fingerprint, storedAt: this.clock() });
    while (this.entries.size > this.maxEntries) {
      const primera = this.entries.keys().next().value;
      if (primera === undefined) break;
      this.entries.delete(primera);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

// Dos peticiones iguales a la vez (el panel y otra pestaña, o dos montajes
// seguidos) comparten el mismo cálculo.
export class InFlight<T> {
  private readonly running = new Map<string, Promise<T>>();

  run(key: string, task: () => Promise<T>): Promise<T> {
    const existente = this.running.get(key);
    if (existente) return existente;
    const promesa = task().finally(() => this.running.delete(key));
    this.running.set(key, promesa);
    return promesa;
  }
}

// Cuántas evaluaciones pesadas corren a la vez en el servidor del dashboard.
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async use<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      // Quien termina le pasa su plaza directamente (ver `finally`).
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
