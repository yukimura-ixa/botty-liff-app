type Entry<T> = { value: T; exp: number };

const DEFAULT_MAX = 500;

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  constructor(private ttlMs: number, private maxEntries: number = DEFAULT_MAX) {}

  get(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T): void {
    this.pruneExpired();
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, exp: Date.now() + this.ttlMs });
  }

  bust(): void {
    this.store.clear();
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  private pruneExpired(): void {
    const now = Date.now();
    let scanned = 0;
    for (const [k, e] of this.store) {
      if (e.exp <= now) this.store.delete(k);
      if (++scanned >= 32) break;
    }
  }
}
