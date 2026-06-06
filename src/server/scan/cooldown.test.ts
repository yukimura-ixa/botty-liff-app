import { describe, it, expect } from "vitest";
import {
  cooldownMs, remainingBottles,
  COOLDOWN_BASE_MS, COOLDOWN_MAX_MS, DAILY_BOTTLE_LIMIT,
} from "./cooldown";

describe("cooldownMs", () => {
  it("starts at base and doubles per scan", () => {
    expect(cooldownMs(0)).toBe(60_000);
    expect(cooldownMs(1)).toBe(120_000);
    expect(cooldownMs(2)).toBe(240_000);
    expect(cooldownMs(3)).toBe(480_000);
  });
  it("caps at 4 hours", () => {
    expect(cooldownMs(8)).toBe(COOLDOWN_MAX_MS);   // 60s*256 = 15360s > 14400s
    expect(cooldownMs(20)).toBe(COOLDOWN_MAX_MS);
    expect(cooldownMs(1000)).toBe(COOLDOWN_MAX_MS); // no overflow
  });
  it("clamps negatives / floors fractionals", () => {
    expect(cooldownMs(-5)).toBe(COOLDOWN_BASE_MS);
    expect(cooldownMs(1.9)).toBe(120_000);
  });
  it("exposes 4h as the max constant", () => {
    expect(COOLDOWN_MAX_MS).toBe(14_400_000);
  });
});

describe("remainingBottles", () => {
  it("counts down from the daily limit", () => {
    expect(DAILY_BOTTLE_LIMIT).toBe(10);
    expect(remainingBottles(0)).toBe(10);
    expect(remainingBottles(8)).toBe(2);
    expect(remainingBottles(10)).toBe(0);
    expect(remainingBottles(99)).toBe(0);
    expect(remainingBottles(-3)).toBe(10);
  });
});
