import { describe, it, expect } from "vitest";
import { canBuy, itemState } from "./purchase";
import type { TreeVariant } from "./catalog";

const pine: TreeVariant = { id: "pine", name: "ต้นสน", priceCoins: 40 };
const willow: TreeVariant = { id: "willow", name: "ต้นหลิว", priceCoins: 120, gate: "streak_7" };

const profile = (over: Partial<{ coins: number; ownedTrees: string[] }> = {}) => ({
  coins: 0, ownedTrees: ["oak"], ...over,
});

describe("itemState", () => {
  it("owned when in ownedTrees", () => {
    expect(itemState(pine, profile({ ownedTrees: ["oak", "pine"] }), new Set())).toBe("owned");
  });
  it("locked when gate not unlocked", () => {
    expect(itemState(willow, profile({ coins: 999 }), new Set())).toBe("locked");
  });
  it("tooPoor when unlocked/gated-ok but cannot afford", () => {
    expect(itemState(willow, profile({ coins: 10 }), new Set(["streak_7"]))).toBe("tooPoor");
    expect(itemState(pine, profile({ coins: 10 }), new Set())).toBe("tooPoor");
  });
  it("buyable when affordable and gate satisfied", () => {
    expect(itemState(pine, profile({ coins: 40 }), new Set())).toBe("buyable");
    expect(itemState(willow, profile({ coins: 120 }), new Set(["streak_7"]))).toBe("buyable");
  });
});

describe("canBuy", () => {
  it("rejects already owned", () => {
    expect(canBuy(pine, profile({ coins: 99, ownedTrees: ["oak", "pine"] }), new Set()))
      .toEqual({ ok: false, code: "already_owned" });
  });
  it("rejects locked gate", () => {
    expect(canBuy(willow, profile({ coins: 999 }), new Set()))
      .toEqual({ ok: false, code: "locked" });
  });
  it("rejects insufficient coins", () => {
    expect(canBuy(pine, profile({ coins: 10 }), new Set()))
      .toEqual({ ok: false, code: "insufficient_coins" });
  });
  it("allows a valid purchase", () => {
    expect(canBuy(pine, profile({ coins: 40 }), new Set())).toEqual({ ok: true });
  });
});
