import { describe, it, expect, vi, beforeEach } from "vitest";
import { detect, classMatches, type DetectorConfig } from "./detect";

const cfg: DetectorConfig = {
  url: "https://serverless.roboflow.com/test/workflows/test",
  apiKey: "k",
  bottleClass: "PET Bottle",
  acceptThreshold: 0.7,
};

const okResponse = (preds: { class: string; confidence: number }[]) => ({
  ok: true,
  status: 200,
  json: async () => ({
    outputs: [{ predictions: { image: { width: 100, height: 100 }, predictions: preds } }],
  }),
});

describe("classMatches", () => {
  it("trims and case-folds", () => {
    expect(classMatches("  pet bottle ", "PET Bottle")).toBe(true);
    expect(classMatches("HDPE", "PET")).toBe(false);
  });
});

describe("detect", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("accepts above-threshold PET-Bottle prediction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([{ class: "PET Bottle", confidence: 0.85 }])));
    const r = await detect(cfg, "https://storage.googleapis.com/b/scans/uid/scan.jpg");
    expect(r).toEqual({ accepted: true, confidence: 0.85, class: "PET Bottle", itemCount: 1 });
  });

  it("rejects below-threshold prediction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([{ class: "PET Bottle", confidence: 0.5 }])));
    const r = await detect(cfg, "https://storage.googleapis.com/b/scans/uid/scan.jpg");
    expect(r.accepted).toBe(false);
    expect(r.confidence).toBe(0.5);
  });

  it("picks the highest-confidence PET-Bottle when multiple present", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([
      { class: "PET Bottle", confidence: 0.71 },
      { class: "PET Bottle", confidence: 0.91 },
      { class: "HDPE Plastic", confidence: 0.99 },
    ])));
    const r = await detect(cfg, "https://storage.googleapis.com/b/scans/uid/scan.jpg");
    expect(r.accepted).toBe(true);
    expect(r.confidence).toBe(0.91);
    expect(r.itemCount).toBe(2);
  });

  it("returns rejected/zero on empty predictions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([])));
    const r = await detect(cfg, "https://storage.googleapis.com/b/scans/uid/scan.jpg");
    expect(r).toEqual({ accepted: false, confidence: 0, class: "", itemCount: 0 });
  });

  it("throws on non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    await expect(detect(cfg, "https://storage.googleapis.com/b/img.jpg")).rejects.toThrow(/roboflow status 500/);
  });

  it("throws on empty imageURL", async () => {
    await expect(detect(cfg, "")).rejects.toThrow(/empty image URL/);
  });

  it("throws on Roboflow workflow error envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ outputs: [], error_type: "RateLimit", message: "slow down" }),
    }));
    await expect(detect(cfg, "https://storage.googleapis.com/b/img.jpg")).rejects.toThrow(/roboflow workflow: RateLimit/);
  });
});
