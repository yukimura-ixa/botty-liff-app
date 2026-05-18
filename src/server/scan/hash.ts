import { createHash } from "node:crypto";

export function imageHash(data: Uint8Array | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
