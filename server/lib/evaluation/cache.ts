// Server memory for evaluations.
// An entry is valid while its fingerprint (configuration, scope, and the facts of that row: count and latest) is
// the same. The probe checks it on every request, so new data expires only its control on its machine. Maximum
// life 60 minutes for what changes with the clock alone (a collector that stops beating stops proving after 24
// h).
// What is no longer valid can still be SHOWN while recomputing (`peek`): the server answers at once with it,
// marked, and recomputes behind.
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

  // `maxBytes` and `sizeOf`: besides the entry count, a size cap (JSON size of each value, measured once on
  // store).
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

  // Adjusts the size cap (the service derives it from the scope). What no longer fits is evicted on the next
  // store.
  setMaxBytes(maxBytes: number): void {
    this.maxBytes = maxBytes;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.totalBytes -= entry.bytes;
    this.entries.delete(key);
  }

  // The value if the fingerprint matches and it has not expired; otherwise nothing.
  get(key: string, fingerprint: string): T | undefined {
    const entry = this.peek(key);
    if (!entry || entry.fingerprint !== fingerprint || this.clock() - entry.storedAt > this.ttlMs) {
      return undefined;
    }
    return entry.value;
  }

  // The entry as is, valid or not (to show while recomputing).
  peek(key: string): CacheEntry<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    // Used entries move to the end: the least recently used is evicted first.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
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
      const first = this.entries.keys().next().value;
      if (first === undefined || first === key) break;
      this.remove(first);
    }
  }

  // The stored keys, oldest first (tests check which rows were kept).
  keys(): string[] {
    return Array.from(this.entries.keys());
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

// A signal cancelled by hand.
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

// The same computation (one control on one machine, same fingerprint) is shared by all requests needing it at
// once. If all waiters leave (the browser closes the request), it is cancelled; the one launched to refresh in
// the background is not.
export class SharedTasks<T> {
  private readonly running = new Map<string, { promise: Promise<T>; waiters: number; signal: CancelSignal; pinned: boolean }>();

  get size(): number {
    return this.running.size;
  }

  // In progress and not cancelled (a cancelled one serves nobody).
  has(key: string): boolean {
    const entry = this.running.get(key);
    return Boolean(entry && !entry.signal.aborted);
  }

  run(key: string, task: (signal: Cancellable) => Promise<T>, waiter?: Cancellable): Promise<T> {
    let entry = this.running.get(key);
    // A cancelled computation is not shared: whoever arrives now starts another (the cancelled one's `finally`
    // does not delete the new one).
    if (entry && entry.signal.aborted) entry = undefined;
    if (!entry) {
      const signal = new CancelSignal();
      const promise = Promise.resolve()
        .then(() => task(signal))
        .finally(() => {
          if (this.running.get(key)?.promise === promise) this.running.delete(key);
        });
      entry = { promise, waiters: 0, signal, pinned: false };
      this.running.set(key, entry);
    }
    const actual = entry;
    if (!waiter) {
      actual.pinned = true;
      return actual.promise;
    }
    actual.waiters += 1;
    let loose = false;
    const looseOne = () => {
      if (loose) return;
      loose = true;
      actual.waiters -= 1;
      if (actual.waiters <= 0 && !actual.pinned) actual.signal.cancel();
    };
    waiter.onAbort(looseOne);
    return actual.promise.finally(looseOne);
  }
}

// How many heavy reads (one control on one machine) run at once on the dashboard server. Memory hits do not pass
// through here. What someone waits for now goes ahead of background refreshes.
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
      // Whoever finishes hands its slot over directly (see `finally`).
      await new Promise<void>(resolve => {
        const entry = { resolve, background: Boolean(options.background) };
        if (entry.background) this.waiting.push(entry);
        else {
          const firstBackground = this.waiting.findIndex(w => w.background);
          if (firstBackground < 0) this.waiting.push(entry);
          else this.waiting.splice(firstBackground, 0, entry);
        }
      });
    } else {
      this.active += 1;
    }
    try {
      return await task();
    } finally {
      const nextItem = this.waiting.shift();
      if (nextItem) nextItem.resolve();
      else this.active -= 1;
    }
  }
}
