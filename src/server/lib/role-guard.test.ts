import { describe, it, expect } from "vitest";
import { hasRole } from "./role-guard";

describe("hasRole", () => {
  it("grants admin", () => {
    expect(hasRole({ uid: "x", role: "admin" }, "admin")).toBe(true);
  });
  it("denies student", () => {
    expect(hasRole({ uid: "x", role: "student" }, "admin")).toBe(false);
  });
  it("denies unknown", () => {
    expect(hasRole({ uid: "x", role: "unknown" }, "admin")).toBe(false);
  });
});
