import { describe, it, expect } from "vitest";
import { coinReward, COIN_PER_SCAN } from "./earn";

describe("coinReward", () => {
  it("gives base coins for a normal scan", () => {
    expect(coinReward(1, 2)).toBe(COIN_PER_SCAN); // streak<3, not first of day
  });
  it("adds +1 for the first scan of the day", () => {
    expect(coinReward(1, 1)).toBe(COIN_PER_SCAN + 1);
  });
  it("adds +1 streak bonus at 3-day streak", () => {
    expect(coinReward(3, 2)).toBe(COIN_PER_SCAN + 1);
  });
  it("adds +2 streak bonus at 7-day streak", () => {
    expect(coinReward(7, 2)).toBe(COIN_PER_SCAN + 2);
  });
  it("stacks first-of-day and streak bonuses", () => {
    expect(coinReward(7, 1)).toBe(COIN_PER_SCAN + 2 + 1);
  });
});
