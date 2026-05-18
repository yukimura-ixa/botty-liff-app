import { describe, it, expect } from "vitest";
import { groupByStudent, groupByClass } from "./group";
import type { ScanRow } from "./rows";

const base: Omit<ScanRow, "uid" | "fullName" | "classKey" | "totalPoints" | "itemCount"> = {
  localDate: "2026-05-18", capturedAt: new Date(), detectedClass: "PET Bottle",
  basePoints: 1, streakBonus: 0, confidence: 0.9, imagePath: "", imageURL: "", streakDays: 1,
};

describe("groupByStudent", () => {
  it("sums points and counts per uid", () => {
    const rows: ScanRow[] = [
      { ...base, uid: "u1", fullName: "Alice", classKey: "4-3", totalPoints: 2, itemCount: 1 },
      { ...base, uid: "u1", fullName: "Alice", classKey: "4-3", totalPoints: 1, itemCount: 1 },
      { ...base, uid: "u2", fullName: "Bob",   classKey: "4-1", totalPoints: 5, itemCount: 1 },
    ];
    const groups = groupByStudent(rows);
    const alice = groups.find((g) => g.uid === "u1")!;
    expect(alice.scans).toBe(2);
    expect(alice.totalPoints).toBe(3);
    const bob = groups.find((g) => g.uid === "u2")!;
    expect(bob.totalPoints).toBe(5);
  });
});

describe("groupByClass", () => {
  it("sums per classKey", () => {
    const rows: ScanRow[] = [
      { ...base, uid: "u1", fullName: "A", classKey: "4-1", totalPoints: 2, itemCount: 1 },
      { ...base, uid: "u2", fullName: "B", classKey: "4-1", totalPoints: 3, itemCount: 1 },
      { ...base, uid: "u3", fullName: "C", classKey: "4-2", totalPoints: 5, itemCount: 1 },
    ];
    const groups = groupByClass(rows);
    expect(groups.find((g) => g.classKey === "4-1")!.totalPoints).toBe(5);
    expect(groups.find((g) => g.classKey === "4-2")!.totalPoints).toBe(5);
  });
});
