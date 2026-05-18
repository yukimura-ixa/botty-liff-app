import { describe, it, expect } from "vitest";
import { buildEntries, type LeaderboardEntry } from "./build";

const baseProfile = {
  fullName: "", classKey: "", rank: "", totalPoints: 0, totalScans: 0, streakDays: 0,
};

describe("buildEntries", () => {
  it("preserves Firestore order (descending points) and assigns ranks 1-N", () => {
    const profiles = [
      { uid: "a", ...baseProfile, fullName: "Alice", totalPoints: 100 },
      { uid: "b", ...baseProfile, fullName: "Bob",   totalPoints: 80  },
      { uid: "c", ...baseProfile, fullName: "Carol", totalPoints: 50  },
    ];
    const r = buildEntries(profiles, "x-not-in-list");
    expect(r.entries.map((e) => e.uid)).toEqual(["a", "b", "c"]);
    expect(r.myRank).toBe(-1);
    expect(r.myEntry).toBeNull();
  });

  it("computes myRank (1-based) and myEntry when caller is in the list", () => {
    const profiles = [
      { uid: "a", ...baseProfile, totalPoints: 100 },
      { uid: "me", ...baseProfile, totalPoints: 80, fullName: "Me" },
      { uid: "c", ...baseProfile, totalPoints: 50 },
    ];
    const r = buildEntries(profiles, "me");
    expect(r.myRank).toBe(2);
    expect(r.myEntry?.uid).toBe("me");
    expect(r.myEntry?.fullName).toBe("Me");
  });

  it("maps Profile fields onto LeaderboardEntry shape", () => {
    const profiles = [{ uid: "u", ...baseProfile, fullName: "X", classKey: "4-3", rank: "ต้นกล้า", totalPoints: 10, totalScans: 2, streakDays: 1 }];
    const r = buildEntries(profiles, "u");
    const e: LeaderboardEntry = r.entries[0];
    expect(e).toEqual({ uid: "u", fullName: "X", classKey: "4-3", rank: "ต้นกล้า", points: 10, scans: 2, streakDays: 1 });
  });

  it("returns empty entries on empty input", () => {
    const r = buildEntries([], "me");
    expect(r.entries).toEqual([]);
    expect(r.myRank).toBe(-1);
    expect(r.myEntry).toBeNull();
  });
});
