import { describe, it, expect } from "vitest";
import { co2KgFromScans } from "./co2";

describe("co2KgFromScans", () => {
  it("returns 0.012 kg per scan", () => {
    expect(co2KgFromScans(1)).toBeCloseTo(0.012, 4);
    expect(co2KgFromScans(100)).toBeCloseTo(1.2, 4);
  });
  it("returns 0 for 0 scans", () => {
    expect(co2KgFromScans(0)).toBe(0);
  });
});
