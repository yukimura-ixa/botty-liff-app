import { describe, it, expect } from "vitest";
import { defaultScanColumns, buildScanHeader, buildScanRow, type ScanRow, type ExportOptions } from "./rows";

const fixed: ScanRow = {
  uid: "line:U1",
  localDate: "2026-05-18",
  capturedAt: new Date("2026-05-18T03:00:00Z"),
  fullName: "ทดสอบ",
  classKey: "4-3",
  detectedClass: "PET Bottle",
  itemCount: 1,
  basePoints: 1,
  streakBonus: 1,
  totalPoints: 2,
  confidence: 0.9,
  imagePath: "gs://b/scans/x.jpg",
  imageURL: "",
  streakDays: 3,
};

const opts: ExportOptions = { groupBy: "scan", columns: [], includeAdjustments: false, includeImageLinks: false };

describe("defaultScanColumns", () => {
  it("returns the canonical column list", () => {
    expect(defaultScanColumns()).toEqual([
      "localDate", "capturedAt", "fullName", "classKey", "detectedClass",
      "itemCount", "basePoints", "streakBonus", "totalPoints", "confidence", "streakDays",
    ]);
  });
});

describe("buildScanHeader", () => {
  it("uses defaults when columns is empty", () => {
    expect(buildScanHeader(opts)).toEqual(defaultScanColumns());
  });
  it("respects the whitelist if provided", () => {
    expect(buildScanHeader({ ...opts, columns: ["localDate", "totalPoints"] })).toEqual(["localDate", "totalPoints"]);
  });
  it("appends imageURL when includeImageLinks=true", () => {
    expect(buildScanHeader({ ...opts, includeImageLinks: true })).toContain("imageURL");
  });
});

describe("buildScanRow", () => {
  it("matches default column values in order", () => {
    const row = buildScanRow(fixed, opts);
    expect(row[0]).toBe("2026-05-18");
    expect(row[2]).toBe("ทดสอบ");
    expect(row[8]).toBe(2);
  });
  it("emits imagePath as fallback when imageURL empty + includeImageLinks=true", () => {
    const row = buildScanRow(fixed, { ...opts, includeImageLinks: true });
    expect(row[row.length - 1]).toBe("gs://b/scans/x.jpg");
  });
});
