import { signSlotToken } from "./token";

export const SLOT_DURATION_MS = 30_000;
export const SLOTS_PER_SESSION = 10;
export const SESSION_DURATION_MS = SLOT_DURATION_MS * SLOTS_PER_SESSION; // 5 minutes

export type MintedSlot = {
  slot: number;
  token: string;
  validFrom: number; // unix seconds
  validUntil: number;
};

export function mintSessionTokens(sessionId: string, startedAtMs: number, secret: Buffer): MintedSlot[] {
  const out: MintedSlot[] = [];
  for (let slot = 0; slot < SLOTS_PER_SESSION; slot++) {
    const fromMs = startedAtMs + slot * SLOT_DURATION_MS;
    const untilMs = fromMs + SLOT_DURATION_MS;
    const validFrom = Math.floor(fromMs / 1000);
    const validUntil = Math.floor(untilMs / 1000);
    const token = signSlotToken(secret, { sessionId, slot, validFrom, validUntil });
    out.push({ slot, token, validFrom, validUntil });
  }
  return out;
}

export function currentSlot(startedAtMs: number, nowMs: number): number {
  return Math.floor((nowMs - startedAtMs) / SLOT_DURATION_MS);
}
