import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyLineIdToken, type LineClaims } from "./line";

describe("verifyLineIdToken", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("returns claims when LINE responds 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        iss: "https://access.line.me",
        sub: "Uabcd1234",
        aud: "channel-id-1",
        exp: 9999999999,
        iat: 1,
        name: "Somchai",
      }),
    }));
    const claims: LineClaims = await verifyLineIdToken("tok", "channel-id-1");
    expect(claims.sub).toBe("Uabcd1234");
    expect(claims.aud).toBe("channel-id-1");
  });

  it("throws when LINE responds non-200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "invalid id token",
    }));
    await expect(verifyLineIdToken("tok", "ch1")).rejects.toThrow(/invalid id token/);
  });

  it("throws when aud doesn't match channelId", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ iss: "https://access.line.me", sub: "U1", aud: "OTHER", exp: 9999999999, iat: 1 }),
    }));
    await expect(verifyLineIdToken("tok", "ch1")).rejects.toThrow(/aud mismatch/);
  });
});
