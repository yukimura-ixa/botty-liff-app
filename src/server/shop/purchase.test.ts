import { describe, it, expect } from "vitest";
import { canBuy, itemState } from "./purchase";
import type { CatalogItem, TreeVariant } from "./catalog";

const pine: TreeVariant = { id: "pine", kind: "tree", name: "ต้นสน", priceCoins: 40 };
const willow: TreeVariant = { id: "willow", kind: "tree", name: "ต้นหลิว", priceCoins: 120, gate: "streak_7" };

const profile = (over: Partial<{ coins: number; ownedTrees: string[]; ownedDecorations: string[]; ownedTerrains: string[] }> = {}) => ({
  coins: 0, ownedTrees: ["oak"], ownedDecorations: [], ownedTerrains: ["grass"], ...over,
});

const pond: CatalogItem = { id: "pond", kind: "decoration", name: "บ่อน้ำ", priceCoins: 90 };
const statue: CatalogItem = { id: "statue", kind: "decoration", name: "รูปปั้นทอง", priceCoins: 150, gate: "rank_forest" };
const sand: CatalogItem = { id: "sand", kind: "terrain", name: "ชายหาด", priceCoins: 40 };
const cosmic: CatalogItem = { id: "cosmic", kind: "terrain", name: "ห้วงอวกาศ", priceCoins: 200, gate: "rank_forest" };

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

describe("terrain purchase", () => {
  it("owned when in ownedTerrains", () => {
    expect(itemState(sand, profile({ ownedTerrains: ["grass", "sand"] }), new Set())).toBe("owned");
  });
  it("buyable when affordable", () => {
    expect(itemState(sand, profile({ coins: 40 }), new Set())).toBe("buyable");
  });
  it("locked behind its gate", () => {
    expect(itemState(cosmic, profile({ coins: 999 }), new Set())).toBe("locked");
    expect(itemState(cosmic, profile({ coins: 999 }), new Set(["rank_forest"]))).toBe("buyable");
  });
  it("canBuy rejects an already-owned terrain", () => {
    expect(canBuy(sand, profile({ coins: 99, ownedTerrains: ["grass", "sand"] }), new Set()))
      .toEqual({ ok: false, code: "already_owned" });
  });
});

describe("decoration item-state", () => {
  it("owned when in ownedDecorations (not ownedTrees)", () => {
    expect(itemState(pond, profile({ ownedDecorations: ["pond"] }), new Set())).toBe("owned");
  });
  it("does not treat a decoration as owned just because a same-name tree is owned", () => {
    expect(itemState(pond, profile({ coins: 999, ownedTrees: ["oak", "pond"] }), new Set())).toBe("buyable");
  });
  it("locked decoration when gate unmet", () => {
    expect(itemState(statue, profile({ coins: 999 }), new Set())).toBe("locked");
  });
  it("buyable gated decoration once unlocked + affordable", () => {
    expect(itemState(statue, profile({ coins: 150 }), new Set(["rank_forest"]))).toBe("buyable");
  });
  it("canBuy rejects an already-owned decoration", () => {
    expect(canBuy(pond, profile({ coins: 999, ownedDecorations: ["pond"] }), new Set()))
      .toEqual({ ok: false, code: "already_owned" });
  });
});
