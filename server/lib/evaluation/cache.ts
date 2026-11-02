export const EVALUATION_TTL_MS = 60 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  fingerprint: string;
  storedAt: number;
  bytes: number;
}

export class EvaluationCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private totalBytes = 0;

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

  setMaxBytes(maxBytes: number): void {
    this.maxBytes = maxBytes;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.totalBytes -= entry.bytes;
    this.entries.delete(key);
  }

  get(key: string, fingerprint: string): T | undefined {
    const entry = this.peek(key);
    if (!entry || entry.fingerprint !== fingerprint || this.clock() - entry.storedAt > this.ttlMs) {
      return undefined;
    }
    return entry.value;
  }

  peek(key: string): CacheEntry<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
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
