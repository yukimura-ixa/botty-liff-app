import { describe, it, expect, vi } from "vitest";
import {
  seenKey,
  clampIndex,
  nextIndex,
  prevIndex,
  isLastSlide,
  shouldAutoShow,
  markSeen,
} from "./logic";

describe("index math", () => {
  it("clamps within bounds", () => {
    expect(clampIndex(-1, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(2, 5)).toBe(2);
  });
  it("nextIndex stops at last", () => {
    expect(nextIndex(0, 5)).toBe(1);
    expect(nextIndex(4, 5)).toBe(4);
  });
  it("prevIndex stops at first", () => {
    expect(prevIndex(4, 5)).toBe(3);
    expect(prevIndex(0, 5)).toBe(0);
  });
  it("isLastSlide true only on last", () => {
    expect(isLastSlide(4, 5)).toBe(true);
    expect(isLastSlide(3, 5)).toBe(false);
  });
});

describe("seen flag", () => {
  it("builds a per-deck key", () => {
    expect(seenKey("student")).toBe("tutorial_seen_student");
    expect(seenKey("council")).toBe("tutorial_seen_council");
  });
  it("auto-shows when flag is absent", () => {
    expect(shouldAutoShow("student", () => null)).toBe(true);
  });
  it("does not auto-show when flag is set", () => {
    expect(shouldAutoShow("student", () => "1")).toBe(false);
  });
  it("auto-shows when storage read throws (LIFF private mode)", () => {
    expect(shouldAutoShow("student", () => { throw new Error("blocked"); })).toBe(true);
  });
  it("markSeen writes the flag", () => {
    const write = vi.fn();
    markSeen("council", write);
    expect(write).toHaveBeenCalledWith("tutorial_seen_council", "1");
  });
  it("markSeen swallows write errors", () => {
    expect(() => markSeen("council", () => { throw new Error("blocked"); })).not.toThrow();
  });
});
