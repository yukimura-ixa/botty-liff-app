import { describe, it, expect } from "vitest";
import { sortByPoints, type ClassEntry } from "./sort";

describe("sortByPoints", () => {
  it("orders descending by totalPoints", () => {
    const e: ClassEntry[] = [
      { classKey: "4-1", totalPoints: 100, studentCount: 10 },
      { classKey: "4-2", totalPoints: 250, studentCount: 12 },
      { classKey: "4-3", totalPoints: 50,  studentCount: 8  },
    ];
    expect(sortByPoints(e).map((x) => x.classKey)).toEqual(["4-2", "4-1", "4-3"]);
  });
  it("returns a new array (does not mutate input)", () => {
    const input: ClassEntry[] = [{ classKey: "a", totalPoints: 1, studentCount: 0 }, { classKey: "b", totalPoints: 2, studentCount: 0 }];
    const snapshot = [...input];
    sortByPoints(input);
    expect(input).toEqual(snapshot);
  });
  it("handles empty input", () => {
    expect(sortByPoints([])).toEqual([]);
  });
});
