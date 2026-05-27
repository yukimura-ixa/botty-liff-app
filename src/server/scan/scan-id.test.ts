import { describe, it, expect } from "vitest";
import { isValidScanId } from "./scan-id";
import { ulid } from "ulidx";

describe("isValidScanId", () => {
  it("accepts a generated ulid", () => {
    expect(isValidScanId(ulid())).toBe(true);
  });

  it("accepts uppercase Crockford base32, 26 chars", () => {
    expect(isValidScanId("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidScanId("01ARZ3NDEKTSV4RRFFQ69G5FA")).toBe(false); // 25
    expect(isValidScanId("01ARZ3NDEKTSV4RRFFQ69G5FAVX")).toBe(false); // 27
  });

  it("rejects disallowed Crockford letters I L O U", () => {
    expect(isValidScanId("01ARZ3NDEKTSV4RRFFQ69G5FAI")).toBe(false);
    expect(isValidScanId("01ARZ3NDEKTSV4RRFFQ69G5FAU")).toBe(false);
  });

  it("rejects non-strings, empty, and path-injection chars", () => {
    expect(isValidScanId("")).toBe(false);
    expect(isValidScanId("../../etc/passwd")).toBe(false);
    expect(isValidScanId(undefined as unknown as string)).toBe(false);
    expect(isValidScanId(123 as unknown as string)).toBe(false);
  });
});
