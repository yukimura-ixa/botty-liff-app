# Gamification — Phase 3-C: Seasonal Drops

**Date:** 2026-06-07
**Status:** Approved design → implementation
**Phase:** 3, sub-project C (seasonal drops). Phases 1, 2, 3-B, 3-A shipped on main.

## Goal

Time-limited shop items. A catalog item may carry an availability window; outside
it the item is **hidden from the shop entirely** (before and after). While active
it shows a countdown. The window is an attribute orthogonal to `kind` — any tree,
decoration, or terrain can be seasonal. Already-owned items remain owned/usable
after the window closes.

## Decisions (locked)

| Knob | Value |
|---|---|
| Out-of-window | hidden before + after; only active shown (with countdown) |
| Carrier | optional `season` window on `CatalogItem` (any kind) |
| Definition | static catalog (hardcoded ISO dates, tunable in code) |
| Sample items | 2 terrains (cheap art, reuse 3-B render): one active now, one future |
| Time source | server `Date.now()` (UTC); windows are ISO UTC strings |

## 1. Model (`src/server/shop/catalog.ts`)

`CatalogItem` gains:
```ts
season?: { from: string; until: string }; // ISO UTC; absent = always available
```

## 2. Pure availability (`src/server/shop/season.ts`, new)

```ts
import type { CatalogItem } from "./catalog";

export function isAvailable(item: CatalogItem, nowMs: number): boolean {
  if (!item.season) return true;
  const from = Date.parse(item.season.from);
  const until = Date.parse(item.season.until);
  return nowMs >= from && nowMs <= until;
}

export function seasonEndsAt(item: CatalogItem): string | null {
  return item.season?.until ?? null;
}
```
Storage-free, unit-tested directly.

## 3. Sample seasonal items (terrains)

Two new terrains added to `TERRAINS` in `catalog.ts` (and to the `Terrain`
dispatcher's `TERRAIN_BG` + `accents`):

| id | name | price | season | now (2026-06) |
|---|---|---|---|---|
| `summer` | ชายหาดฤดูร้อน | 60 | `2026-04-01T00:00:00Z` → `2026-08-31T23:59:59Z` | **active** |
| `frost` | ลานน้ำแข็ง | 100 | `2026-12-01T00:00:00Z` → `2026-12-31T23:59:59Z` | **hidden** |

- `Terrain.tsx`: add `summer` (warm sand/sun gradient) + `frost` (icy blue gradient)
  to `TERRAIN_BG`; optional accent cases (e.g. sun glint / ice shards).
- The seasonal **attribute** is generic: a future seasonal decoration/tree needs
  only a catalog entry with `season`, no new mechanism code.

## 4. Shop list route (`src/app/api/v1/shop/route.ts`)

- Compute `now = Date.now()`. Build items from
  `ALL_ITEMS.filter((v) => isAvailable(v, now))` — out-of-window items are omitted.
- For each emitted item, add `seasonal` + `seasonEndsAt`:
  ```ts
  const seasonal = !!v.season;
  seasonEndsAt: seasonal ? seasonEndsAt(v) : null,
  ```
- Response item shape gains `seasonal: boolean`, `seasonEndsAt: string | null`.

## 5. Buy guard (`src/server/shop/repo.ts buyItem`)

Defense in depth (item is normally not shown when expired, but guard the write):
- New deny code `unavailable` added to `BuyDenyCode` (`purchase.ts`).
- In `buyItem`, before `canBuy`: `if (!isAvailable(item, Date.now())) return { ok: false, code: "unavailable" };`
- Buy route maps `unavailable` → 409 (in the existing non-`unknown_item`/`insufficient_coins` branch, which already returns 409).

## 6. Client + UI

- `src/lib/api.ts` `ShopItem`: add `seasonal?: boolean`, `seasonEndsAt?: string | null`.
- `src/app/shop/page.tsx`: seasonal items render a badge
  **`✨ ตามฤดูกาล · เหลือ N วัน`** where `N = ceil((Date.parse(seasonEndsAt) - Date.now()) / 86_400_000)` (min 0). Within each kind section, sort seasonal items first (`seasonal` desc) so drops are prominent.

## 7. Testing

- `season.test.ts`: `isAvailable` — no `season` → always true; `now < from` → false;
  `from ≤ now ≤ until` → true; `now > until` → false. `seasonEndsAt` → `until` or null.
- Shop route filter (covered via the pure helper + a focused route-shape note):
  an active seasonal item is listed with `seasonal:true`/`seasonEndsAt`; an
  out-of-window one is absent.
- Buy guard: `buyItem` on an expired item returns `{ ok:false, code:"unavailable" }`
  (route-level/manual, as Phase 2 repo tests are manual).
- `catalog.test.ts`: terrain count updates (8 terrains now); `summer`/`frost`
  carry a `season`.

## Out of scope

- Admin-configurable / Firestore-driven catalog windows (separate project).
- "Coming soon" teaser cards, expired-but-visible states (we hide off-window).
- Push/notification of drops. Achievement expansion (Phase 3-D).
- New decoration/tree seasonal art (mechanism supports them; none added now).

## Compatibility

`season` is an additive optional catalog attribute; existing items (no `season`)
are unaffected and always available. No data model / profile changes. Buying a
seasonal terrain reuses the 3-B `ownedTerrains` flow unchanged.
