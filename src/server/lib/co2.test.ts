import { describe, it, expect } from "vitest";
import { co2KgFromBottles } from "./co2";

describe("co2KgFromBottles", () => {
  it("returns 0.012 kg per bottle", () => {
    expect(co2KgFromBottles(1)).toBeCloseTo(0.012, 4);
    expect(co2KgFromBottles(100)).toBeCloseTo(1.2, 4);
  });
  it("returns 0 for 0 bottles", () => {
    expect(co2KgFromBottles(0)).toBe(0);
  });
});
