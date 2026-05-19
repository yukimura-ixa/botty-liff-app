import { describe, it, expect } from "vitest";
import { bangkokDate } from "./time";

describe("bangkokDate", () => {
  it("returns YYYY-MM-DD in Asia/Bangkok (+07:00)", () => {
    const d = new Date("2026-05-18T18:00:00Z");
    expect(bangkokDate(d)).toBe("2026-05-19");
  });
  it("rolls over at Bangkok midnight, not UTC midnight", () => {
    const before = new Date("2026-05-18T16:59:59Z");
    expect(bangkokDate(before)).toBe("2026-05-18");
    const after = new Date("2026-05-18T17:00:00Z");
    expect(bangkokDate(after)).toBe("2026-05-19");
  });
});
