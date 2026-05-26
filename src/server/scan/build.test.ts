import { describe, it, expect } from "vitest";
import { buildScanDoc } from "./build";

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
