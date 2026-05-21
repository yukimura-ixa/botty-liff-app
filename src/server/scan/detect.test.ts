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
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r).toEqual({ accepted: true, confidence: 0.85, class: "PET Bottle", itemCount: 1 });
  });

  it("rejects below-threshold prediction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([{ class: "PET Bottle", confidence: 0.5 }])));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r.accepted).toBe(false);
    expect(r.confidence).toBe(0.5);
  });

  it("picks the highest-confidence PET-Bottle when multiple present", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([
      { class: "PET Bottle", confidence: 0.71 },
      { class: "PET Bottle", confidence: 0.91 },
      { class: "HDPE Plastic", confidence: 0.99 },
    ])));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r.accepted).toBe(true);
    expect(r.confidence).toBe(0.91);
    expect(r.itemCount).toBe(2);
  });

  it("returns rejected/zero on empty predictions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([])));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r).toEqual({ accepted: false, confidence: 0, class: "", itemCount: 0 });
  });

  it("throws on non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    await expect(detect(cfg, Buffer.from("fake-bytes"))).rejects.toThrow(/roboflow status 500/);
  });

  it("throws on empty imageBytes", async () => {
    await expect(detect(cfg, Buffer.alloc(0))).rejects.toThrow(/empty image bytes/);
  });

  it("throws on Roboflow workflow error envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ outputs: [], error_type: "RateLimit", message: "slow down" }),
    }));
    await expect(detect(cfg, Buffer.from("fake-bytes"))).rejects.toThrow(/roboflow workflow: RateLimit/);
  });

  const okResponseFull = (
    preds: { class: string; confidence: number }[],
    extras: Partial<{ outputImage: string; countObjects: number }> = {},
  ) => ({
    ok: true,
    status: 200,
    json: async () => ({
      outputs: [{
        predictions: { image: { width: 100, height: 100 }, predictions: preds },
        ...(extras.outputImage !== undefined ? { output_image: { type: "base64", value: extras.outputImage } } : {}),
        ...(extras.countObjects !== undefined ? { count_objects: { output: extras.countObjects } } : {}),
      }],
    }),
  });

  it("extracts annotatedImage from output_image.value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponseFull(
      [{ class: "PET Bottle", confidence: 0.85 }],
      { outputImage: "AAA_BASE64_BYTES" },
    )));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r.annotatedImage).toBe("AAA_BASE64_BYTES");
  });

  it("strips data URI prefix from output_image.value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponseFull(
      [{ class: "PET Bottle", confidence: 0.85 }],
      { outputImage: "data:image/jpeg;base64,ZZZ_BYTES" },
    )));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r.annotatedImage).toBe("ZZZ_BYTES");
  });

  it("leaves annotatedImage undefined when output_image missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponseFull(
      [{ class: "PET Bottle", confidence: 0.85 }],
    )));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r.annotatedImage).toBeUndefined();
  });

  it("prefers count_objects.output for itemCount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponseFull(
      [{ class: "PET Bottle", confidence: 0.85 }, { class: "PET Bottle", confidence: 0.9 }],
      { countObjects: 5 },
    )));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r.itemCount).toBe(5);
  });
});
