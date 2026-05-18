import { describe, it, expect } from "vitest";
import { imageHash } from "./hash";

describe("imageHash", () => {
  it("returns hex SHA-256 (64 chars) for non-empty buffer", () => {
    const h = imageHash(Buffer.from("hello"));
    expect(h).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
  it("returns identical hash for identical bytes", () => {
    const a = imageHash(Buffer.from([1, 2, 3]));
    const b = imageHash(Buffer.from([1, 2, 3]));
    expect(a).toBe(b);
  });
  it("returns different hash for different bytes", () => {
    expect(imageHash(Buffer.from([1, 2, 3]))).not.toBe(imageHash(Buffer.from([1, 2, 4])));
  });
});
