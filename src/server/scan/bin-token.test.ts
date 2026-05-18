import { describe, it, expect } from "vitest";
import { signBinToken, verifyBinToken } from "./bin-token";

describe("bin-token", () => {
  it("signs and verifies round-trip", () => {
    const t = signBinToken(Buffer.from("test-secret"), "binA");
    expect(verifyBinToken(Buffer.from("test-secret"), t)).toBe("binA");
  });
  it("rejects tampered signature", () => {
    const t = signBinToken(Buffer.from("s"), "binA");
    expect(() => verifyBinToken(Buffer.from("s"), t.slice(0, -1) + "X")).toThrow(/invalid signature/);
  });
  it("rejects wrong secret", () => {
    const t = signBinToken(Buffer.from("s1"), "binA");
    expect(() => verifyBinToken(Buffer.from("s2"), t)).toThrow(/invalid signature/);
  });
  it("rejects bad prefix", () => {
    expect(() => verifyBinToken(Buffer.from("s"), "garbage")).toThrow(/bad prefix/);
  });
});
