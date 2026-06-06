import { describe, it, expect } from "vitest";
import { calculatePoints, DEFAULT_POINTS_CONFIG } from "./points";

describe("calculatePoints — 1 bottle = 1 point, no streak bonus", () => {
  const cfg = DEFAULT_POINTS_CONFIG;

  it("awards exactly 1 point for a single bottle regardless of streak / first-of-day", () => {
    expect(calculatePoints(cfg, 0, false)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
    expect(calculatePoints(cfg, 5, false)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
    expect(calculatePoints(cfg, 10, true)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
    expect(calculatePoints(cfg, 100, true)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
  });

  it("scales points by itemCount (1 point per bottle)", () => {
    expect(calculatePoints(cfg, 0, false, 3)).toEqual({ basePoints: 3, streakBonus: 0, total: 3 });
    expect(calculatePoints(cfg, 4, true, 5)).toEqual({ basePoints: 5, streakBonus: 0, total: 5 });
  });

  it("floors itemCount to >=1", () => {
    expect(calculatePoints(cfg, 0, false, 0)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
    expect(calculatePoints(cfg, 0, false, 2.7)).toEqual({ basePoints: 2, streakBonus: 0, total: 2 });
  });

  it("treats NaN itemCount as 1", () => {
    expect(calculatePoints(cfg, 0, false, NaN)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
  });

  it("caps itemCount to maxItemsPerScan", () => {
    expect(calculatePoints(cfg, 0, false, 100)).toEqual({ basePoints: 10, streakBonus: 0, total: 10 });
    expect(calculatePoints(cfg, 0, false, 10)).toEqual({ basePoints: 10, streakBonus: 0, total: 10 });
    expect(calculatePoints(cfg, 0, false, 9)).toEqual({ basePoints: 9, streakBonus: 0, total: 9 });
  });
});

describe("DEFAULT_POINTS_CONFIG", () => {
  it("is 1 base point, max 10 items, with no streak fields", () => {
    expect(DEFAULT_POINTS_CONFIG).toEqual({ basePoints: 1, maxItemsPerScan: 10 });
  });
});
