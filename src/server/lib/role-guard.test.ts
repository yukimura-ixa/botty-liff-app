import { describe, it, expect } from "vitest";
import { hasRole, canApprove } from "./role-guard";

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
  it("council does NOT satisfy teacher requirement", () => {
    expect(hasRole({ uid: "u", role: "council" }, "teacher")).toBe(false);
  });
  it("student/unknown satisfies neither", () => {
    expect(hasRole({ uid: "u", role: "student" }, "teacher")).toBe(false);
    expect(hasRole({ uid: "u", role: "unknown" }, "admin")).toBe(false);
  });
});

describe("canApprove", () => {
  it("council can approve", () => {
    expect(canApprove("council")).toBe(true);
  });
  it("teacher can approve", () => {
    expect(canApprove("teacher")).toBe(true);
  });
  it("admin can approve", () => {
    expect(canApprove("admin")).toBe(true);
  });
  it("student cannot approve", () => {
    expect(canApprove("student")).toBe(false);
  });
  it("unknown cannot approve", () => {
    expect(canApprove("unknown")).toBe(false);
  });
});
