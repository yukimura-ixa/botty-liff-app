import { describe, it, expect } from "vitest";
import { hasRole } from "./role-guard";

describe("hasRole", () => {
  it("admin satisfies admin requirement", () => {
    expect(hasRole({ uid: "u", role: "admin" }, "admin")).toBe(true);
  });
  it("admin satisfies teacher requirement (admin can do anything teacher can)", () => {
    expect(hasRole({ uid: "u", role: "admin" }, "teacher")).toBe(true);
  });
  it("teacher does NOT satisfy admin requirement", () => {
    expect(hasRole({ uid: "u", role: "teacher" }, "admin")).toBe(false);
  });
  it("teacher satisfies teacher requirement", () => {
    expect(hasRole({ uid: "u", role: "teacher" }, "teacher")).toBe(true);
  });
  it("student/unknown satisfies neither", () => {
    expect(hasRole({ uid: "u", role: "student" }, "teacher")).toBe(false);
    expect(hasRole({ uid: "u", role: "unknown" }, "admin")).toBe(false);
  });
});
