import type { AchievementId } from "./achievements";

export type ItemKind = "tree" | "decoration";

export type CatalogItem = {
  id: string;
  kind: ItemKind;
  name: string;        // Thai display name
  priceCoins: number;
  gate?: AchievementId; // undefined = buyable once affordable
};

// Back-compat alias: Phase 1 code/tests refer to TreeVariant.
export type TreeVariant = CatalogItem;

// oak is the free default every student owns from onboarding.
export const TREE_VARIANTS: CatalogItem[] = [
  { id: "oak",    kind: "tree", name: "ต้นโอ๊ค",    priceCoins: 0 },
  { id: "pine",   kind: "tree", name: "ต้นสน",      priceCoins: 40 },
  { id: "sakura", kind: "tree", name: "ซากุระ",     priceCoins: 80 },
  { id: "willow", kind: "tree", name: "ต้นหลิว",    priceCoins: 120, gate: "streak_7" },
  { id: "aurora", kind: "tree", name: "ต้นแสงเหนือ", priceCoins: 200, gate: "rank_forest" },
];

export function findVariant(id: string): CatalogItem | undefined {
  return TREE_VARIANTS.find((v) => v.id === id);
}

export const DECORATIONS: CatalogItem[] = [
  { id: "rock",         kind: "decoration", name: "ก้อนหิน",    priceCoins: 25 },
  { id: "flower_patch", kind: "decoration", name: "แปลงดอกไม้", priceCoins: 30 },
  { id: "bush",         kind: "decoration", name: "พุ่มไม้",    priceCoins: 40 },
  { id: "log_bench",    kind: "decoration", name: "ม้านั่งไม้", priceCoins: 70 },
  { id: "pond",         kind: "decoration", name: "บ่อน้ำ",     priceCoins: 90 },
  { id: "statue",       kind: "decoration", name: "รูปปั้นทอง", priceCoins: 150, gate: "rank_forest" },
];

export const ALL_ITEMS: CatalogItem[] = [...TREE_VARIANTS, ...DECORATIONS];

export function findItem(id: string): CatalogItem | undefined {
  return ALL_ITEMS.find((v) => v.id === id);
}
