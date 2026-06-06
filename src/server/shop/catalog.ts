import type { AchievementId } from "./achievements";

export type ItemKind = "tree" | "decoration" | "terrain";

export type CatalogItem = {
  id: string;
  kind: ItemKind;
  name: string;        // Thai display name
  priceCoins: number;
  gate?: AchievementId; // undefined = buyable once affordable
  season?: { from: string; until: string }; // ISO UTC; absent = always available
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
  { id: "teachers_day", kind: "decoration", name: "พานไหว้ครู",   priceCoins: 50, season: { from: "2026-01-14T00:00:00Z", until: "2026-01-18T23:59:59Z" } },
  { id: "loy_krathong", kind: "decoration", name: "กระทง",        priceCoins: 80, season: { from: "2026-11-20T00:00:00Z", until: "2026-11-26T23:59:59Z" } },
  { id: "mothers_day",  kind: "decoration", name: "พวงมาลัยมะลิ",  priceCoins: 60, season: { from: "2026-08-08T00:00:00Z", until: "2026-08-16T23:59:59Z" } },
  { id: "fathers_day",  kind: "decoration", name: "ดอกพุทธรักษา",  priceCoins: 60, season: { from: "2026-12-03T00:00:00Z", until: "2026-12-09T23:59:59Z" } },
];

// grass is the free default every student owns from onboarding.
export const TERRAINS: CatalogItem[] = [
  { id: "grass",  kind: "terrain", name: "สนามหญ้า",  priceCoins: 0 },
  { id: "sand",   kind: "terrain", name: "ชายหาด",    priceCoins: 40 },
  { id: "meadow", kind: "terrain", name: "ทุ่งดอกไม้", priceCoins: 60 },
  { id: "autumn", kind: "terrain", name: "ใบไม้ร่วง",  priceCoins: 90 },
  { id: "snow",   kind: "terrain", name: "ลานหิมะ",    priceCoins: 120, gate: "streak_7" },
  { id: "cosmic", kind: "terrain", name: "ห้วงอวกาศ",  priceCoins: 200, gate: "rank_forest" },
  { id: "summer",   kind: "terrain", name: "ชายหาดฤดูร้อน", priceCoins: 60,  season: { from: "2026-04-01T00:00:00Z", until: "2026-08-31T23:59:59Z" } },
  { id: "songkran", kind: "terrain", name: "สงกรานต์",       priceCoins: 70,  season: { from: "2026-04-11T00:00:00Z", until: "2026-04-17T23:59:59Z" } },
];

export const ALL_ITEMS: CatalogItem[] = [...TREE_VARIANTS, ...DECORATIONS, ...TERRAINS];

export function findItem(id: string): CatalogItem | undefined {
  return ALL_ITEMS.find((v) => v.id === id);
}
