import { describe, it, expect } from "vitest";
import { buildScanDoc, buildPendingDoc, PENDING_TTL_MS } from "./build";

const fixedNow = new Date("2026-05-18T10:00:00Z");

describe("buildScanDoc", () => {
  it("produces the Go-compatible scan doc shape", () => {
    const doc = buildScanDoc({
      uid: "line:U1",
      classKey: "4-3",
      detectedClass: "PET Bottle",
      itemCount: 2,
      basePoints: 1,
      streakBonus: 1,
      totalPoints: 2,
      confidence: 0.91,
      clientConf: 0.8,
      imagePath: "gs://b/scans/line:U1/abc.jpg",
      imageHash: "deadbeef",
      capturedAt: fixedNow,
      localDate: "2026-05-18",
    });
    expect(doc).toEqual({
      uid: "line:U1",
      classKey: "4-3",
      detectedClass: "PET Bottle",
      itemCount: 2,
      basePoints: 1,
      streakBonus: 1,
      totalPoints: 2,
      confidence: 0.91,
      clientConf: 0.8,
      imagePath: "gs://b/scans/line:U1/abc.jpg",
      imageHash: "deadbeef",
      capturedAt: fixedNow,
      localDate: "2026-05-18",
    });
  });
});

describe("buildPendingDoc", () => {
  it("carries coinReward and a 5-minute expiry", () => {
    const capturedAt = new Date("2026-06-06T00:00:00.000Z");
    const doc = buildPendingDoc({
      uid: "u1", classKey: "m1/1", scanId: "s1", detectedClass: "PET",
      itemCount: 2, confidence: 0.9, basePoints: 2, streakBonus: 0, totalPoints: 2,
      isFirstOfDay: true, localDate: "2026-06-06", streakDays: 1, newDailyCount: 1,
      newTotalPoints: 2, newRank: "ต้นกล้า", prevRank: "ต้นกล้า",
      imagePath: "https://x/y.jpg", imageHash: "h", capturedAt, coinReward: 5,
      dailyBottles: 4,
    });
    expect(doc.coinReward).toBe(5);
    expect(doc.dailyBottles).toBe(4);
    expect(doc.expiresAt.getTime() - capturedAt.getTime()).toBe(PENDING_TTL_MS);
    expect(PENDING_TTL_MS).toBe(300_000);
  });

  it("strips undefined optional fields and defaults status", () => {
    const doc = buildPendingDoc({
      uid: "u1", classKey: "m1/1", scanId: "s1", detectedClass: "PET",
      itemCount: 1, confidence: 0.9, basePoints: 1, streakBonus: 0, totalPoints: 1,
      isFirstOfDay: true, localDate: "2026-06-06", streakDays: 1, newDailyCount: 1,
      newTotalPoints: 1, newRank: "ต้นกล้า", prevRank: "ต้นกล้า",
      imagePath: "u", imageHash: "h", capturedAt: new Date(), coinReward: 0, dailyBottles: 0,
    });
    expect("phash" in doc).toBe(false);
    expect(doc.status).toBe("awaiting_bin");
  });
});
