import { describe, it, expect } from "vitest";
import { reservationDecision } from "./reservation";

describe("reservationDecision", () => {
  const now = new Date("2026-06-08T12:00:00Z");
  const future = new Date(now.getTime() + 60_000);
  const past = new Date(now.getTime() - 1);

  it("reserves when no existing reservation", () => {
    expect(reservationDecision(null, "u1", now)).toBe("reserve");
  });

  it("reserves when existing reservation is expired", () => {
    expect(reservationDecision({ uid: "u2", expiresAt: past }, "u1", now)).toBe("reserve");
  });

  it("reserves when held by the same uid (retry)", () => {
    expect(reservationDecision({ uid: "u1", expiresAt: future }, "u1", now)).toBe("reserve");
  });

  it("blocks when held live by another uid", () => {
    expect(reservationDecision({ uid: "u2", expiresAt: future }, "u1", now)).toBe("blocked");
  });

  it("treats expiresAt === now as expired and reserves", () => {
    expect(reservationDecision({ uid: "u2", expiresAt: now }, "u1", now)).toBe("reserve");
  });
});
