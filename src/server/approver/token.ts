import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "botty-staff:v1:";

function b64url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export type SlotTokenClaims = {
  sessionId: string;
  slot: number;
  validFrom: number;
  validUntil: number;
};

function payload(c: SlotTokenClaims): string {
  return `${c.sessionId}|${c.slot}|${c.validFrom}|${c.validUntil}`;
}

export function signSlotToken(secret: Buffer, c: SlotTokenClaims): string {
  const mac = createHmac("sha256", secret).update(payload(c)).digest();
  return `${PREFIX}${c.sessionId}:${c.slot}:${c.validFrom}:${c.validUntil}:${b64url(mac)}`;
}

export function verifySlotToken(secret: Buffer, token: string): SlotTokenClaims {
  if (!token.startsWith(PREFIX)) throw new Error("bad prefix");
  const rest = token.slice(PREFIX.length);
  const parts = rest.split(":");
  if (parts.length !== 5) throw new Error("bad format");
  const [sessionId, slotStr, validFromStr, validUntilStr, sig] = parts;
  const slot = Number(slotStr);
  const validFrom = Number(validFromStr);
  const validUntil = Number(validUntilStr);
  if (!Number.isInteger(slot) || !Number.isInteger(validFrom) || !Number.isInteger(validUntil)) {
    throw new Error("bad numbers");
  }
  const expected = b64url(createHmac("sha256", secret).update(payload({ sessionId, slot, validFrom, validUntil })).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("invalid signature");
  return { sessionId, slot, validFrom, validUntil };
}
