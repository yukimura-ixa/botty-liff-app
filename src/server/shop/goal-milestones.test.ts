import { describe, it, expect } from "vitest";
import { unclaimedMilestones, MILESTONE_COINS } from "./goal-milestones";

describe("unclaimedMilestones", () => {
  it("returns nothing below 25%", () => {
    expect(unclaimedMilestones(20, 100, [])).toEqual([]);
  });
  it("returns 25 milestone at 25%", () => {
    expect(unclaimedMilestones(25, 100, [])).toEqual([25]);
  });
  it("returns 25 and 50 at 60% when none claimed", () => {
    expect(unclaimedMilestones(60, 100, [])).toEqual([25, 50]);
  });
  it("skips already-claimed milestones", () => {
    expect(unclaimedMilestones(60, 100, [25])).toEqual([50]);
  });
  it("returns all three at/over 100%", () => {
    expect(unclaimedMilestones(100, 100, [])).toEqual([25, 50, 100]);
  });
  it("handles zero/empty target safely", () => {
    expect(unclaimedMilestones(5, 0, [])).toEqual([]);
  });
  it("MILESTONE_COINS pays each tier", () => {
    expect(MILESTONE_COINS[25]).toBe(20);
    expect(MILESTONE_COINS[50]).toBe(40);
    expect(MILESTONE_COINS[100]).toBe(100);
  });
});
