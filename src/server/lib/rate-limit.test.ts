import { describe, it, expect } from "vitest";
import { RateLimiter, clientIp } from "./rate-limit";

describe("RateLimiter token bucket", () => {
  it("allows up to capacity then rejects", () => {
    const rl = new RateLimiter({ capacity: 3, refillPerSec: 0.001 });
    const now = 1_000_000;
    expect(rl.take("ip1", now).ok).toBe(true);
    expect(rl.take("ip1", now).ok).toBe(true);
    expect(rl.take("ip1", now).ok).toBe(true);
    const res = rl.take("ip1", now);
    expect(res.ok).toBe(false);
    expect(res.retryAfterSec).toBeGreaterThan(0);
  });

  it("refills over time", () => {
    const rl = new RateLimiter({ capacity: 2, refillPerSec: 1 });
    const t0 = 1_000_000;
    rl.take("ip1", t0);
    rl.take("ip1", t0);
    expect(rl.take("ip1", t0).ok).toBe(false);
    expect(rl.take("ip1", t0 + 1500).ok).toBe(true);
  });

  it("isolates buckets per key", () => {
    const rl = new RateLimiter({ capacity: 1, refillPerSec: 0.001 });
    const now = 1_000_000;
    expect(rl.take("a", now).ok).toBe(true);
    expect(rl.take("a", now).ok).toBe(false);
    expect(rl.take("b", now).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("picks first hop from x-forwarded-for", () => {
    const req = new Request("https://x/", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip", () => {
    const req = new Request("https://x/", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(clientIp(req)).toBe("9.9.9.9");
  });
  it("returns 'unknown' when no header", () => {
    const req = new Request("https://x/");
    expect(clientIp(req)).toBe("unknown");
  });
});
