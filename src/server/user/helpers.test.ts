import { describe, it, expect } from "vitest";
import { classKey, defaultPendingProfile } from "./helpers";

describe("classKey", () => {
  it("joins grade and room with dash", () => {
    expect(classKey(4, 3)).toBe("4-3");
  });
  it("zero-pads nothing — raw integers", () => {
    expect(classKey(10, 1)).toBe("10-1");
  });
});

describe("defaultPendingProfile", () => {
  it("returns pending student record with the given LINE uid", () => {
    const p = defaultPendingProfile("Uabcd1234", new Date("2026-05-18T00:00:00Z"));
    expect(p.uid).toBe("line:Uabcd1234");
    expect(p.lineUserId).toBe("Uabcd1234");
    expect(p.role).toBe("student");
    expect(p.status).toBe("pending_onboard");
    expect(p.createdAt).toEqual(new Date("2026-05-18T00:00:00Z"));
  });
});
