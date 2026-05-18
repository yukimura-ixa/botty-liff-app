import { describe, it, expect } from "vitest";
import { buildScanDoc, buildPendingDoc } from "./build";

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
  it("produces the Go-compatible pending doc shape with TTL=90s", () => {
    const doc = buildPendingDoc({
      uid: "line:U1",
      classKey: "4-3",
      scanId: "scan-1",
      detectedClass: "PET Bottle",
      itemCount: 1,
      confidence: 0.9,
      basePoints: 1,
      streakBonus: 0,
      totalPoints: 1,
      isFirstOfDay: true,
      localDate: "2026-05-18",
      streakDays: 3,
      newDailyCount: 1,
      newTotalPoints: 10,
      newRank: "ต้นกล้า",
      prevRank: "ต้นกล้า",
      imagePath: "gs://b/p.jpg",
      imageHash: "h",
      capturedAt: fixedNow,
    });
    expect(doc.status).toBe("awaiting_bin");
    expect(doc.expiresAt.getTime() - doc.capturedAt.getTime()).toBe(90_000);
  });
});
