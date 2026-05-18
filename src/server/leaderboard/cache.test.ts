import { describe, it, expect, vi, afterEach } from "vitest";
import { TtlCache } from "./cache";

describe("TtlCache", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("returns stored value within TTL", () => {
    const c = new TtlCache<string>(1000);
    c.set("k", "v");
    expect(c.get("k")).toBe("v");
  });

  it("returns undefined after TTL expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const c = new TtlCache<string>(1000);
    c.set("k", "v");
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    expect(c.get("k")).toBeUndefined();
  });

  it("bust() clears every entry", () => {
    const c = new TtlCache<string>(60_000);
    c.set("a", "1");
    c.set("b", "2");
    c.bust();
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBeUndefined();
  });

  it("get of missing key returns undefined", () => {
    const c = new TtlCache<string>(1000);
    expect(c.get("missing")).toBeUndefined();
  });
});
