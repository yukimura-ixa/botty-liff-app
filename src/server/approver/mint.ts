import { signSlotToken } from "./token";

export const SLOT_DURATION_MS = 300_000; // 5 minutes (QR rotation interval)

// Standing-stand safety cap (zombie-stand cleanup, NOT a usage limit). Default 4h.
export const STAND_DURATION_MS = (() => {
  const n = Number(process.env.APPROVER_STAND_MS);
  return Number.isFinite(n) && n > 0 ? n : 14_400_000;
})();

// Grace (seconds) for accepting the immediately-previous slot at a rotation boundary.
export const SLOT_GRACE_SEC = (() => {
  const n = Number(process.env.APPROVER_SLOT_GRACE_SEC);
  return Number.isFinite(n) && n >= 0 ? n : 10;
})();

export type MintedSlot = {
  slot: number;
  token: string;
  validFrom: number; // unix seconds
  validUntil: number;
};

export function currentSlot(startedAtMs: number, nowMs: number): number {
  return Math.floor((nowMs - startedAtMs) / SLOT_DURATION_MS);
}

// Mints the token for the single slot that `nowMs` falls in.
export function currentSlotToken(
  sessionId: string,
  startedAtMs: number,
  secret: Buffer,
  nowMs: number,
): MintedSlot {
  const slot = currentSlot(startedAtMs, nowMs);
  const fromMs = startedAtMs + slot * SLOT_DURATION_MS;
  const untilMs = fromMs + SLOT_DURATION_MS;
  const validFrom = Math.floor(fromMs / 1000);
  const validUntil = Math.floor(untilMs / 1000);
  const token = signSlotToken(secret, { sessionId, slot, validFrom, validUntil });
  return { slot, token, validFrom, validUntil };
}

// A token is time-valid from validFrom through validUntil + grace (covers the
// rotation boundary where a scan happens just before the QR rotates).
export function isSlotTokenValid(
  nowSec: number,
  validFrom: number,
  validUntil: number,
  graceSec: number,
): boolean {
  return nowSec >= validFrom && nowSec <= validUntil + graceSec;
}
