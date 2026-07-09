import { describe, it, expect, vi, beforeEach } from "vitest";
import { detect, classMatches, classMatchesAny, parseSpoofScore, type DetectorConfig } from "./detect";

const cfg: DetectorConfig = {
  url: "https://serverless.roboflow.com/test/workflows/test",
  apiKey: "k",
  bottleClasses: ["PET Bottle"],
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

describe("classMatchesAny", () => {
  it("matches when any accepted label matches", () => {
    expect(classMatchesAny("pet-bottle", ["PET Bottle", "pet-bottle"])).toBe(true);
    expect(classMatchesAny("PET Bottle", ["pet-bottle", "PET Bottle"])).toBe(true);
    expect(classMatchesAny("HDPE", ["PET Bottle", "pet-bottle"])).toBe(false);
  });
});

describe("detect", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("accepts above-threshold PET-Bottle prediction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([{ class: "PET Bottle", confidence: 0.85 }])));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r).toEqual({ accepted: true, confidence: 0.85, class: "PET Bottle", itemCount: 1 });
  });

  it("rejects below-threshold prediction with low_conf reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([{ class: "PET Bottle", confidence: 0.5 }])));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r.accepted).toBe(false);
    expect(r.confidence).toBe(0.5);
    expect(r.rejectReason).toBe("low_conf");
  });

  it("matches any of multiple accepted class labels", async () => {
    const multi: DetectorConfig = { ...cfg, bottleClasses: ["PET Bottle", "pet-bottle"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([{ class: "pet-bottle", confidence: 0.9 }])));
    const r = await detect(multi, Buffer.from("fake-bytes"));
    expect(r.accepted).toBe(true);
    expect(r.class).toBe("pet-bottle");
  });

  it("reports no_match with the model's top guess when nothing matches the class", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([
      { class: "HDPE Plastic", confidence: 0.95 },
      { class: "Glass", confidence: 0.6 },
    ])));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r.accepted).toBe(false);
    expect(r.rejectReason).toBe("no_match");
    expect(r.observedClass).toBe("HDPE Plastic");
    expect(r.observedConfidence).toBe(0.95);
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
    expect(r).toEqual({
      accepted: false, confidence: 0, class: "", itemCount: 0,
      rejectReason: "no_match", observedClass: undefined, observedConfidence: undefined,
    });
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

  it("flows spoofScore from the workflow spoof output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        outputs: [{
          predictions: { predictions: [{ class: "PET Bottle", confidence: 0.85 }] },
          spoof: { predictions: [{ class: "flat2d", confidence: 0.93 }, { class: "real", confidence: 0.07 }] },
        }],
      }),
    }));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r.spoofScore).toBe(0.93);
  });

  it("leaves spoofScore undefined when the workflow emits no spoof output (fail-open)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([{ class: "PET Bottle", confidence: 0.85 }])));
    const r = await detect(cfg, Buffer.from("fake-bytes"));
    expect(r.spoofScore).toBeUndefined();
  });
});

describe("parseSpoofScore", () => {
  it("reads flat2d from a per-class list", () => {
    expect(parseSpoofScore({ predictions: [
      { class: "real", confidence: 0.1 },
      { class: "flat2d", confidence: 0.9 },
    ] })).toBe(0.9);
  });

  it("matches flat2d case-insensitively", () => {
    expect(parseSpoofScore({ predictions: [{ class: "FLAT2D", confidence: 0.8 }] })).toBe(0.8);
  });

  it("reads flat2d from a per-class map", () => {
    expect(parseSpoofScore({ predictions: { real: { confidence: 0.2 }, flat2d: { confidence: 0.77 } } })).toBe(0.77);
  });

  it("uses top + confidence when top is flat2d", () => {
    expect(parseSpoofScore({ top: "flat2d", confidence: 0.6 })).toBe(0.6);
  });

  it("inverts top + confidence when top is the real class", () => {
    expect(parseSpoofScore({ top: "real", confidence: 0.95 })).toBeCloseTo(0.05);
  });

  it("clamps out-of-range confidences into 0..1", () => {
    expect(parseSpoofScore({ predictions: [{ class: "flat2d", confidence: 1.4 }] })).toBe(1);
    expect(parseSpoofScore({ predictions: [{ class: "flat2d", confidence: -0.3 }] })).toBe(0);
  });

  it("returns undefined when absent (fail-open)", () => {
    expect(parseSpoofScore(undefined)).toBeUndefined();
    expect(parseSpoofScore({})).toBeUndefined();
  });

  it("returns undefined on malformed shapes (fail-open)", () => {
    expect(parseSpoofScore({ predictions: [] })).toBeUndefined();
    expect(parseSpoofScore({ predictions: [{ class: "real", confidence: 0.9 }] })).toBeUndefined();
    expect(parseSpoofScore({ predictions: [{ class: "flat2d", confidence: NaN }] })).toBeUndefined();
    expect(parseSpoofScore({ predictions: [{ class: "flat2d", confidence: "0.9" as unknown as number }] })).toBeUndefined();
    expect(parseSpoofScore({ top: "flat2d" })).toBeUndefined();
  });
});
