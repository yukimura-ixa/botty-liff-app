import { describe, it, expect } from "vitest";
import { validThresholds, DEFAULT_THRESHOLDS, pickConfig } from "./validate";

describe("validThresholds", () => {
  it("accepts an array of exactly 3 numbers", () => {
    expect(validThresholds([1, 2, 3])).toBe(true);
  });
  it("rejects wrong length", () => {
    expect(validThresholds([1, 2])).toBe(false);
    expect(validThresholds([1, 2, 3, 4])).toBe(false);
  });
  it("rejects non-arrays", () => {
    expect(validThresholds(null)).toBe(false);
    expect(validThresholds(undefined)).toBe(false);
    expect(validThresholds("a,b,c")).toBe(false);
  });
  it("rejects arrays containing non-numbers", () => {
    expect(validThresholds([1, "2" as unknown as number, 3])).toBe(false);
    expect(validThresholds([1, NaN, 3])).toBe(false);
  });
});

describe("pickConfig", () => {
  it("returns the input thresholds when valid", () => {
    expect(pickConfig({ thresholds: [10, 20, 30] })).toEqual({ thresholds: [10, 20, 30] });
  });
  it("returns DEFAULT_THRESHOLDS for missing/invalid input", () => {
    expect(pickConfig(null)).toEqual({ thresholds: DEFAULT_THRESHOLDS });
    expect(pickConfig({ thresholds: "bad" })).toEqual({ thresholds: DEFAULT_THRESHOLDS });
    expect(pickConfig({ thresholds: [1, 2] })).toEqual({ thresholds: DEFAULT_THRESHOLDS });
  });
});

describe("DEFAULT_THRESHOLDS", () => {
  it("matches the Go backend defaults", () => {
    expect(DEFAULT_THRESHOLDS).toEqual([25, 75, 175]);
  });
});
