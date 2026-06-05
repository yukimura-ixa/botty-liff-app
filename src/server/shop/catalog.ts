import type { AchievementId } from "./achievements";

export type TreeVariant = {
  id: string;
  name: string;        // Thai display name
  priceCoins: number;
  gate?: AchievementId; // undefined = buyable once affordable
};

// oak is the free default every student owns from onboarding.
export const TREE_VARIANTS: TreeVariant[] = [
  { id: "oak",    name: "ต้นโอ๊ค",    priceCoins: 0 },
  { id: "pine",   name: "ต้นสน",      priceCoins: 40 },
  { id: "sakura", name: "ซากุระ",     priceCoins: 80 },
  { id: "willow", name: "ต้นหลิว",    priceCoins: 120, gate: "streak_7" },
  { id: "aurora", name: "ต้นแสงเหนือ", priceCoins: 200, gate: "rank_forest" },
];

export function findVariant(id: string): TreeVariant | undefined {
  return TREE_VARIANTS.find((v) => v.id === id);
}
