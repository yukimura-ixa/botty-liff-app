import { createHash } from "node:crypto";
import sharp from "sharp";

// SHA-256 of raw image bytes. Fast-path for exact byte-equality dedup.
export function imageHash(data: Uint8Array | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

// Alias to clarify call sites that explicitly want the SHA-256.
export const sha256Hash = imageHash;

// Perceptual hash (aHash 8x8): resize to 8x8 grayscale, set bit i if pixel ≥ mean.
// Returns 16-char hex (64 bits). Tolerant to recompression, mild rotation/crop,
// and brightness shifts. Defeats raw-byte dedup bypass via JPEG re-save.
export async function perceptualHash(buf: Buffer): Promise<string> {
  const pixels = await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .grayscale()
    .resize(8, 8, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
  if (pixels.length < 64) {
    throw new Error("phash: unexpected pixel buffer size");
  }
  let sum = 0;
  for (let i = 0; i < 64; i++) sum += pixels[i]!;
  const mean = sum / 64;
  const bytes = Buffer.alloc(8);
  for (let i = 0; i < 64; i++) {
    if (pixels[i]! >= mean) {
      bytes[i >> 3]! |= 1 << (7 - (i & 7));
    }
  }
  return bytes.toString("hex");
}

// Hamming distance between two 64-bit hex pHashes.
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) throw new Error("hash length mismatch");
  let dist = 0;
  for (let i = 0; i < a.length; i += 2) {
    const x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    let v = x;
    v = v - ((v >> 1) & 0x55);
    v = (v & 0x33) + ((v >> 2) & 0x33);
    dist += ((v + (v >> 4)) & 0x0f);
  }
  return dist;
}

// First 16 bits of pHash for Firestore bucketing. Candidates within bucket
// are filtered locally by Hamming distance; cuts query cost from O(N) to
// O(N / 65536) in expectation for uniform hashes.
export function phashBucket(phash: string): string {
  return phash.slice(0, 4);
}
