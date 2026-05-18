import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "botty:v1:";

function b64url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function signBinToken(secret: Buffer, binId: string): string {
  const mac = createHmac("sha256", secret).update(binId).digest();
  return `${PREFIX}${binId}:${b64url(mac)}`;
}

export function verifyBinToken(secret: Buffer, token: string): string {
  if (!token.startsWith(PREFIX)) throw new Error("bad prefix");
  const rest = token.slice(PREFIX.length);
  const idx = rest.lastIndexOf(":");
  if (idx <= 0) throw new Error("bad format");
  const binId = rest.slice(0, idx);
  const sig = rest.slice(idx + 1);
  const expected = b64url(createHmac("sha256", secret).update(binId).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("invalid signature");
  return binId;
}
