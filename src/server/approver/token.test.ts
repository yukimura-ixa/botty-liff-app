import { describe, it, expect } from "vitest";
import { signSlotToken, verifySlotToken } from "./token";

const SECRET = Buffer.from("test-secret-please-rotate-in-prod-32bytes!!");

describe("slot token", () => {
  const claims = { sessionId: "sess_abc123", slot: 4, validFrom: 1700000000, validUntil: 1700000030 };

  it("signs and verifies a roundtrip", () => {
    const tok = signSlotToken(SECRET, claims);
    expect(tok.startsWith("botty-staff:v1:")).toBe(true);
    expect(verifySlotToken(SECRET, tok)).toEqual(claims);
  });

  it("rejects tampered signature", () => {
    const tok = signSlotToken(SECRET, claims);
    const tampered = tok.slice(0, -3) + "AAA";
    expect(() => verifySlotToken(SECRET, tampered)).toThrow();
  });

  it("rejects tampered slot", () => {
    const tok = signSlotToken(SECRET, claims);
    const parts = tok.split(":");
    parts[3] = "7";
    expect(() => verifySlotToken(SECRET, parts.join(":"))).toThrow();
  });

  it("rejects wrong prefix", () => {
    expect(() => verifySlotToken(SECRET, "notmytoken:abc:1:2:3:sig")).toThrow();
  });

  it("rejects wrong secret", () => {
    const tok = signSlotToken(SECRET, claims);
    const other = Buffer.from("different-secret-of-correct-length-32!!");
    expect(() => verifySlotToken(other, tok)).toThrow();
  });
});
