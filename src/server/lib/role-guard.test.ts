import { describe, it, expect } from "vitest";
import { hasRole, canApprove } from "./role-guard";

describe("hasRole", () => {
  it("grants admin", () => {
    expect(hasRole({ uid: "x", role: "admin" }, "admin")).toBe(true);
  });
  it("denies student", () => {
    expect(hasRole({ uid: "x", role: "student" }, "admin")).toBe(false);
  });
  it("denies council", () => {
    expect(hasRole({ uid: "x", role: "council" }, "admin")).toBe(false);
  });
  it("denies unknown", () => {
    expect(hasRole({ uid: "x", role: "unknown" }, "admin")).toBe(false);
  });
});

describe("canApprove", () => {
  it("allows council", () => {
    expect(canApprove("council")).toBe(true);
  });
  it("allows admin", () => {
    expect(canApprove("admin")).toBe(true);
  });
  it("denies student", () => {
    expect(canApprove("student")).toBe(false);
  });
  it("denies unknown", () => {
    expect(canApprove("unknown")).toBe(false);
  });
});
