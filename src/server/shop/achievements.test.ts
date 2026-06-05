import { describe, it, expect } from "vitest";
import { unlockedAchievements } from "./achievements";

const base = { totalPoints: 0, streakDays: 0 };

describe("unlockedAchievements", () => {
  it("unlocks nothing at zero", () => {
    expect(unlockedAchievements(base, 0).size).toBe(0);
  });
  it("unlocks rank_forest at 1600 points", () => {
    expect(unlockedAchievements({ ...base, totalPoints: 1600 }, 0).has("rank_forest")).toBe(true);
  });
  it("unlocks streak_7 at a 7-day streak", () => {
    expect(unlockedAchievements({ ...base, streakDays: 7 }, 0).has("streak_7")).toBe(true);
  });
  it("unlocks goal_half at >=50% school goal", () => {
    expect(unlockedAchievements(base, 50).has("goal_half")).toBe(true);
    expect(unlockedAchievements(base, 49).has("goal_half")).toBe(false);
  });
});
