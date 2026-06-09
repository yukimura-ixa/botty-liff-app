import { createHash } from "node:crypto";
import sharp from "sharp";

// SHA-256 of raw image bytes. Fast-path for exact byte-equality dedup.
export function imageHash(data: Uint8Array | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

// Alias to clarify call sites that explicitly want the SHA-256.
export const sha256Hash = imageHash;

// Perceptual hash (dHash 9x8): resize to 9x8 grayscale, set bit if a pixel is
// brighter than its right-hand neighbour. 8 comparisons per row × 8 rows = 64
// bits, returned as 16-char hex. dHash encodes the *direction* of local
// brightness gradients rather than each pixel vs the frame mean (aHash), so it
// discriminates between similar-but-distinct scenes far better — two different
// bottles photographed against the same desk no longer collapse to near-equal
// hashes — while staying tolerant to recompression and brightness shifts.
//
// NOTE: dHash and the previous aHash are not comparable. Pre-existing aHash
// values stored on `scans`/`pendingScans` docs will not match new dHash values,
// so perceptual dedup effectively resets on deploy (fail-open: at worst a
// previously-deduped image can be scanned once more). Exact SHA-256 dedup is
// unaffected and still catches byte-identical re-uploads.
export async function perceptualHash(buf: Buffer): Promise<string> {
  const pixels = await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .grayscale()
    .resize(9, 8, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
  if (pixels.length < 72) {
    throw new Error("phash: unexpected pixel buffer size");
  }
  const bytes = Buffer.alloc(8);
  let bit = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = pixels[row * 9 + col]!;
      const right = pixels[row * 9 + col + 1]!;
      if (left > right) {
        bytes[bit >> 3]! |= 1 << (7 - (bit & 7));
      }
      bit++;
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
