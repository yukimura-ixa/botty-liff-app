import type { CatalogItem } from "./catalog";
import type { AchievementId } from "./achievements";

export type ItemState = "owned" | "locked" | "tooPoor" | "buyable";
export type BuyDenyCode = "already_owned" | "locked" | "insufficient_coins";
export type CanBuy = { ok: true } | { ok: false; code: BuyDenyCode };

type Wallet = { coins: number; ownedTrees: string[]; ownedDecorations?: string[] };

function ownedArr(item: CatalogItem, w: Wallet): string[] {
  return item.kind === "decoration" ? w.ownedDecorations ?? [] : w.ownedTrees;
}

function gateOk(item: CatalogItem, unlocked: Set<AchievementId>): boolean {
  return !item.gate || unlocked.has(item.gate);
}

export function itemState(
  item: CatalogItem,
  w: Wallet,
  unlocked: Set<AchievementId>,
): ItemState {
  if (ownedArr(item, w).includes(item.id)) return "owned";
  if (!gateOk(item, unlocked)) return "locked";
  if (w.coins < item.priceCoins) return "tooPoor";
  return "buyable";
}

export function canBuy(
  item: CatalogItem,
  w: Wallet,
  unlocked: Set<AchievementId>,
): CanBuy {
  if (ownedArr(item, w).includes(item.id)) return { ok: false, code: "already_owned" };
  if (!gateOk(item, unlocked)) return { ok: false, code: "locked" };
  if (w.coins < item.priceCoins) return { ok: false, code: "insufficient_coins" };
  return { ok: true };
}
