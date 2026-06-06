import { describe, it, expect } from "vitest";
import { isAvailable, seasonEndsAt } from "./season";
import type { CatalogItem } from "./catalog";

const base: CatalogItem = { id: "x", kind: "decoration", name: "x", priceCoins: 10 };
const seasonal: CatalogItem = {
  ...base, id: "s",
  season: { from: "2026-04-01T00:00:00Z", until: "2026-04-30T23:59:59Z" },
};
const apr15 = Date.parse("2026-04-15T00:00:00Z");
const mar = Date.parse("2026-03-15T00:00:00Z");
const may = Date.parse("2026-05-15T00:00:00Z");

describe("isAvailable", () => {
  it("non-seasonal items are always available", () => {
    expect(isAvailable(base, mar)).toBe(true);
  });
  it("true inside the window", () => {
    expect(isAvailable(seasonal, apr15)).toBe(true);
  });
  it("false before the window", () => {
    expect(isAvailable(seasonal, mar)).toBe(false);
  });
  it("false after the window", () => {
    expect(isAvailable(seasonal, may)).toBe(false);
  });
});

describe("seasonEndsAt", () => {
  it("returns until for seasonal, null otherwise", () => {
    expect(seasonEndsAt(seasonal)).toBe("2026-04-30T23:59:59Z");
    expect(seasonEndsAt(base)).toBeNull();
  });
});
