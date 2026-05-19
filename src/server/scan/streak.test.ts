import { describe, it, expect } from "vitest";
import { computeStreak } from "./streak";

describe("computeStreak", () => {
  it("returns 1 when lastDate is empty (first scan ever)", () => {
    expect(computeStreak(0, "", "2026-05-18")).toBe(1);
  });
  it("returns 1 when lastDate is malformed", () => {
    expect(computeStreak(5, "not-a-date", "2026-05-18")).toBe(1);
  });
  it("returns current streak when scanning again same day", () => {
    expect(computeStreak(5, "2026-05-18", "2026-05-18")).toBe(5);
  });
  it("returns current+1 when scanning next day", () => {
    expect(computeStreak(5, "2026-05-17", "2026-05-18")).toBe(6);
  });
  it("resets to 1 when more than one day gap", () => {
    expect(computeStreak(5, "2026-05-16", "2026-05-18")).toBe(1);
  });
  it("resets to 1 when lastDate is in the future (clock skew)", () => {
    expect(computeStreak(5, "2026-05-19", "2026-05-18")).toBe(1);
  });
});
