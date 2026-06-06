import type { CatalogItem } from "./catalog";

// Seasonal availability: an item with no `season` is always available; otherwise
// it is available only within [from, until] (inclusive), compared against nowMs.
export function isAvailable(item: CatalogItem, nowMs: number): boolean {
  if (!item.season) return true;
  return nowMs >= Date.parse(item.season.from) && nowMs <= Date.parse(item.season.until);
}

export function seasonEndsAt(item: CatalogItem): string | null {
  return item.season?.until ?? null;
}
