import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { imageHash, perceptualHash, hammingDistance, phashBucket } from "./hash";

describe("imageHash", () => {
  it("returns hex SHA-256 (64 chars) for non-empty buffer", () => {
    const h = imageHash(Buffer.from("hello"));
    expect(h).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
  it("returns identical hash for identical bytes", () => {
    const a = imageHash(Buffer.from([1, 2, 3]));
    const b = imageHash(Buffer.from([1, 2, 3]));
    expect(a).toBe(b);
  });
  it("returns different hash for different bytes", () => {
    expect(imageHash(Buffer.from([1, 2, 3]))).not.toBe(imageHash(Buffer.from([1, 2, 4])));
  });
});

describe("hammingDistance", () => {
  it("zero for identical hashes", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
  });
  it("counts differing bits", () => {
    expect(hammingDistance("00", "ff")).toBe(8);
    expect(hammingDistance("0f", "f0")).toBe(8);
    expect(hammingDistance("01", "00")).toBe(1);
  });
  it("throws on length mismatch", () => {
    expect(() => hammingDistance("00", "0000")).toThrow();
  });
});

describe("phashBucket", () => {
  it("returns first 4 hex chars (16 bits)", () => {
    expect(phashBucket("abcdef1234567890")).toBe("abcd");
  });
});

async function makeGradient(seed: number): Promise<Buffer> {
  const width = 64, height = 64;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = (x * 4 + seed) & 0xff;
      raw[i + 1] = (y * 4 + seed) & 0xff;
      raw[i + 2] = ((x + y) * 2 + seed) & 0xff;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

describe("perceptualHash", () => {
  it("returns a 16-char hex (64 bits)", async () => {
    const img = await makeGradient(0);
    const h = await perceptualHash(img);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns same hash for same image bytes", async () => {
    const img = await makeGradient(0);
    const a = await perceptualHash(img);
    const b = await perceptualHash(img);
    expect(a).toBe(b);
  });

  it("survives re-compression at lower quality (small Hamming distance)", async () => {
    const raw = await sharp(await makeGradient(0)).raw().toBuffer({ resolveWithObject: true });
    const j90 = await sharp(raw.data, { raw: { width: raw.info.width, height: raw.info.height, channels: raw.info.channels } }).jpeg({ quality: 90 }).toBuffer();
    const j40 = await sharp(raw.data, { raw: { width: raw.info.width, height: raw.info.height, channels: raw.info.channels } }).jpeg({ quality: 40 }).toBuffer();
    const a = await perceptualHash(j90);
    const b = await perceptualHash(j40);
    expect(hammingDistance(a, b)).toBeLessThanOrEqual(6);
  });

  it("differs for visually different images", async () => {
    const a = await perceptualHash(await makeGradient(0));
    const b = await perceptualHash(await makeGradient(128));
    expect(hammingDistance(a, b)).toBeGreaterThan(6);
  });
});
