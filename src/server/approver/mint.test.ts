import { describe, it, expect } from "vitest";
import {
  SLOT_DURATION_MS,
  currentSlot,
  currentSlotToken,
  isSlotTokenValid,
} from "./mint";
import { verifySlotToken } from "./token";

const secret = Buffer.from("test-secret-at-least-16-bytes-long");

describe("SLOT_DURATION_MS", () => {
  it("is 5 minutes", () => {
    expect(SLOT_DURATION_MS).toBe(300_000);
  });
});

describe("currentSlot", () => {
  it("is 0 in the first window and increments per slot", () => {
    const start = 1_000_000;
    expect(currentSlot(start, start)).toBe(0);
    expect(currentSlot(start, start + SLOT_DURATION_MS - 1)).toBe(0);
    expect(currentSlot(start, start + SLOT_DURATION_MS)).toBe(1);
    expect(currentSlot(start, start + 3 * SLOT_DURATION_MS + 5)).toBe(3);
  });
});

describe("currentSlotToken", () => {
  it("mints the active slot with a 5-min window that verifies", () => {
    const start = 1_700_000_000_000;
    const now = start + SLOT_DURATION_MS + 1234; // slot 1
    const minted = currentSlotToken("sess1", start, secret, now);
    expect(minted.slot).toBe(1);
    expect(minted.validUntil - minted.validFrom).toBe(SLOT_DURATION_MS / 1000);
    const claims = verifySlotToken(secret, minted.token);
    expect(claims.sessionId).toBe("sess1");
    expect(claims.slot).toBe(1);
    expect(claims.validFrom).toBe(minted.validFrom);
    expect(claims.validUntil).toBe(minted.validUntil);
  });
});

describe("isSlotTokenValid", () => {
  const validFrom = 1000;
  const validUntil = validFrom + SLOT_DURATION_MS / 1000; // +300
  const grace = 10;
  it("accepts inside the window", () => {
    expect(isSlotTokenValid(validFrom, validFrom, validUntil, grace)).toBe(true);
    expect(isSlotTokenValid(validUntil, validFrom, validUntil, grace)).toBe(true);
  });
  it("rejects before validFrom", () => {
    expect(isSlotTokenValid(validFrom - 1, validFrom, validUntil, grace)).toBe(false);
  });
  it("accepts just after validUntil within grace", () => {
    expect(isSlotTokenValid(validUntil + grace, validFrom, validUntil, grace)).toBe(true);
  });
  it("rejects past validUntil + grace", () => {
    expect(isSlotTokenValid(validUntil + grace + 1, validFrom, validUntil, grace)).toBe(false);
  });
});
