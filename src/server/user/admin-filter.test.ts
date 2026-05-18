import { describe, it, expect } from "vitest";
import { filterAndSortProfiles, type AdminProfile } from "./admin-filter";

const mk = (uid: string, fullName: string, role: AdminProfile["role"] = "student"): AdminProfile => ({
  uid, fullName, role, classKey: "", totalPoints: 0,
});

describe("filterAndSortProfiles", () => {
  it("sorts by fullName case-insensitively", () => {
    expect(filterAndSortProfiles([mk("a", "charlie"), mk("b", "Alice"), mk("c", "bob")], "", "").map((p) => p.fullName))
      .toEqual(["Alice", "bob", "charlie"]);
  });
  it("filters by role", () => {
    const out = filterAndSortProfiles([
      mk("a", "Alice", "student"), mk("b", "Bob", "teacher"), mk("c", "Carol", "student"),
    ], "student", "");
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.role === "student")).toBe(true);
  });
  it("filters by q substring case-insensitive", () => {
    const out = filterAndSortProfiles([mk("a", "John Smith"), mk("b", "Jane Doe"), mk("c", "Bob")], "", "jo");
    expect(out).toHaveLength(1);
    expect(out[0].fullName).toBe("John Smith");
  });
  it("matches Thai substrings", () => {
    const out = filterAndSortProfiles([mk("a", "สมชาย ใจดี"), mk("b", "สมหญิง ดีมาก")], "", "ใจดี");
    expect(out).toHaveLength(1);
    expect(out[0].uid).toBe("a");
  });
  it("combines role + q", () => {
    const out = filterAndSortProfiles([
      mk("a", "Alice Wonder", "student"),
      mk("b", "Alice Teacher", "teacher"),
    ], "student", "alice");
    expect(out).toHaveLength(1);
    expect(out[0].uid).toBe("a");
  });
});
