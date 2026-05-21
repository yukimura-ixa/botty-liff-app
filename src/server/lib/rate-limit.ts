// Simple in-memory token bucket per key. Used for IP-based throttling on
// public mutating endpoints. Per-instance only (Vercel Functions reuse
// instances under Fluid Compute, so this is effective but not cluster-wide).

type Bucket = { tokens: number; lastRefillMs: number };

export type RateLimitConfig = {
  capacity: number;
  refillPerSec: number;
};

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweepMs = Date.now();
  private readonly capacity: number;
  private readonly refillPerSec: number;
  private readonly sweepIntervalMs: number;
  private readonly maxKeys: number;

  constructor(cfg: RateLimitConfig & { sweepIntervalMs?: number; maxKeys?: number }) {
    this.capacity = cfg.capacity;
    this.refillPerSec = cfg.refillPerSec;
    this.sweepIntervalMs = cfg.sweepIntervalMs ?? 5 * 60_000;
    this.maxKeys = cfg.maxKeys ?? 10_000;
  }

  take(key: string, now: number = Date.now()): { ok: boolean; retryAfterSec: number } {
    this.maybeSweep(now);
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, lastRefillMs: now };
      this.buckets.set(key, b);
    } else {
      const elapsedSec = (now - b.lastRefillMs) / 1000;
      b.tokens = Math.min(this.capacity, b.tokens + elapsedSec * this.refillPerSec);
      b.lastRefillMs = now;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { ok: true, retryAfterSec: 0 };
    }
    const need = 1 - b.tokens;
    const retryAfterSec = Math.max(1, Math.ceil(need / this.refillPerSec));
    return { ok: false, retryAfterSec };
  }

  private maybeSweep(now: number) {
    if (this.buckets.size < this.maxKeys && now - this.lastSweepMs < this.sweepIntervalMs) return;
    this.lastSweepMs = now;
    const staleMs = this.sweepIntervalMs;
    for (const [k, b] of this.buckets) {
      if (now - b.lastRefillMs > staleMs && b.tokens >= this.capacity) {
        this.buckets.delete(k);
      }
    }
    if (this.buckets.size >= this.maxKeys) {
      // Hard cap: drop oldest entries.
      const sorted = [...this.buckets.entries()].sort((a, b) => a[1].lastRefillMs - b[1].lastRefillMs);
      const drop = sorted.slice(0, Math.floor(this.maxKeys / 4));
      for (const [k] of drop) this.buckets.delete(k);
    }
  }

  // Test/diagnostic only.
  _size(): number { return this.buckets.size; }
}

// Singletons per endpoint family.
export const ipScanLimiter = new RateLimiter({ capacity: 30, refillPerSec: 30 / 60 });
export const ipAuthLimiter = new RateLimiter({ capacity: 10, refillPerSec: 10 / 60 });

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ error: "rate_limited", retryAfter: retryAfterSec }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}
