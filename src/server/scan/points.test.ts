import { describe, it, expect } from "vitest";
import { calculatePoints, DEFAULT_POINTS_CONFIG } from "./points";

describe("calculatePoints (default config)", () => {
  const cfg = DEFAULT_POINTS_CONFIG;

  it("returns base only when isFirstOfDay=false", () => {
    expect(calculatePoints(cfg, 5, false)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
  });
  it("adds floor(streak * 0.5) bonus on first-of-day", () => {
    expect(calculatePoints(cfg, 0, true)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
    expect(calculatePoints(cfg, 1, true)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
    expect(calculatePoints(cfg, 2, true)).toEqual({ basePoints: 1, streakBonus: 1, total: 2 });
    expect(calculatePoints(cfg, 10, true)).toEqual({ basePoints: 1, streakBonus: 5, total: 6 });
  });
  it("caps streak at StreakCap=10", () => {
    expect(calculatePoints(cfg, 11, true)).toEqual({ basePoints: 1, streakBonus: 5, total: 6 });
    expect(calculatePoints(cfg, 100, true)).toEqual({ basePoints: 1, streakBonus: 5, total: 6 });
  });
  it("scales basePoints by itemCount", () => {
    expect(calculatePoints(cfg, 0, false, 3)).toEqual({ basePoints: 3, streakBonus: 0, total: 3 });
    expect(calculatePoints(cfg, 4, true, 5)).toEqual({ basePoints: 5, streakBonus: 2, total: 7 });
  });
  it("floors itemCount to >=1", () => {
    expect(calculatePoints(cfg, 0, false, 0)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
    expect(calculatePoints(cfg, 0, false, 2.7)).toEqual({ basePoints: 2, streakBonus: 0, total: 2 });
  });
});

describe("calculatePoints itemCount cap", () => {
  const cfg = DEFAULT_POINTS_CONFIG;

  it("caps itemCount to maxItemsPerScan", () => {
    expect(calculatePoints(cfg, 0, false, 100)).toEqual({ basePoints: 10, streakBonus: 0, total: 10 });
    expect(calculatePoints(cfg, 0, false, 11)).toEqual({ basePoints: 10, streakBonus: 0, total: 10 });
  });
  it("does not cap when itemCount equals maxItemsPerScan", () => {
    expect(calculatePoints(cfg, 0, false, 10)).toEqual({ basePoints: 10, streakBonus: 0, total: 10 });
  });
  it("does not cap when itemCount is below maxItemsPerScan", () => {
    expect(calculatePoints(cfg, 0, false, 9)).toEqual({ basePoints: 9, streakBonus: 0, total: 9 });
  });
  it("treats NaN itemCount as 1", () => {
    expect(calculatePoints(cfg, 0, false, NaN)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
  });
});

describe("DEFAULT_POINTS_CONFIG maxItemsPerScan", () => {
  it("is 10", () => {
    expect(DEFAULT_POINTS_CONFIG.maxItemsPerScan).toBe(10);
  });
});

describe("DEFAULT_POINTS_CONFIG", () => {
  it("matches Go backend values", () => {
    expect(DEFAULT_POINTS_CONFIG).toEqual({ basePoints: 1, streakMultiplier: 0.5, streakCap: 10, maxItemsPerScan: 10 });
  });
});
