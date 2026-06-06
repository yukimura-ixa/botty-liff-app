# Gamification — Phase 3-C: Seasonal Drops (Thai festivals)

**Date:** 2026-06-07
**Status:** Approved design → implementation
**Phase:** 3, sub-project C (seasonal drops). Phases 1, 2, 3-B, 3-A shipped on main.

## Goal

Time-limited shop items, used to ship **Thai festival drops**. A catalog item may
carry an availability window; outside it the item is **hidden from the shop**
(before and after). While active it shows a countdown. The window is an attribute
orthogonal to `kind` — any tree, decoration, or terrain can be seasonal.
Already-owned items remain owned/usable after the window closes.

## Decisions (locked)

| Knob | Value |
|---|---|
| Out-of-window | hidden before + after; only active shown (with countdown) |
| Carrier | optional `season` window on `CatalogItem` (any kind) |
| Definition | static catalog (hardcoded ISO dates, tunable in code) |
| Content | Thai festivals (mix of terrains + decorations) + one always-live summer terrain |
| Render split | **terrains = inline SVG** (gradient ground); **festival decorations = `next/image` JPG** |
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
  return nowMs >= Date.parse(item.season.from) && nowMs <= Date.parse(item.season.until);
}

export function seasonEndsAt(item: CatalogItem): string | null {
  return item.season?.until ?? null;
}
```
Storage-free, unit-tested directly.

## 3. Sample seasonal items

| id | kind | render | name | price | window 2026 (tunable) | gate | now |
|---|---|---|---|---|---|---|---|
| `summer` | terrain | SVG | ชายหาดฤดูร้อน | 60 | Apr 1 – Aug 31 | — | **active** (live QA) |
| `songkran` | terrain | SVG | สงกรานต์ | 70 | Apr 11 – 17 | — | hidden |
| `teachers_day` | decoration | JPG | พานไหว้ครู | 50 | Jan 14 – 18 | — | hidden |
| `loy_krathong` | decoration | JPG | กระทง | 80 | Nov 20 – 26 | — | hidden |
| `mothers_day` | decoration | JPG | พวงมาลัยมะลิ | 60 | Aug 8 – 16 | — | hidden |
| `fathers_day` | decoration | JPG | ดอกพุทธรักษา | 60 | Dec 3 – 9 | — | hidden |

ISO windows, e.g. `summer`: `{ from: "2026-04-01T00:00:00Z", until: "2026-08-31T23:59:59Z" }`.
`summer` is always-live across the current period so QA has a guaranteed visible
seasonal item with no asset dependency. Festival windows are real dates (mostly
hidden now) — tunable in code; widen one temporarily to QA the active path.

- Added to `TERRAINS` (`summer`, `songkran`) and `DECORATIONS` (`teachers_day`,
  `loy_krathong`, `mothers_day`, `fathers_day`) in `catalog.ts`, each with `season`.
- Seasonal is generic: a future seasonal tree needs only a catalog entry with `season`.

## 4. Render: SVG terrains + JPG decorations

- **Terrains (`Terrain.tsx`)** — add `summer`, `songkran` to `TERRAIN_BG` (gradient)
  + optional `accents` cases (sun glint / water droplets). Inline SVG, no asset.
- **Festival decorations (`Decoration.tsx`)** — add a `SEASONAL_DECORATION_ASSETS:
  Record<string, string>` map (`teachers_day → "/seasonal/teachers_day.jpg"`, etc.).
  `Decoration` gains a FIRST branch: if `id ∈ SEASONAL_DECORATION_ASSETS`, render
  `next/image`:
  ```tsx
  import Image from 'next/image'
  // inside Decoration, before the SVG switch:
  const asset = SEASONAL_DECORATION_ASSETS[id]
  if (asset) {
    return <Image src={asset} alt="" width={size} height={size}
      style={{ objectFit: 'contain' }} />
  }
  ```
  The existing `shape(id)` SVG switch stays for all non-seasonal decorations.
  Component contract (`Decoration({ id, size })`) is unchanged, so garden / shop /
  drag-layer all keep working.
- **Assets** live at `public/seasonal/<id>.jpg` (4 files). Supplied by a human
  (ops/asset step); until present the `<Image>` 404s but window/buy logic is
  unaffected. Build does not require the files (no import-time reference).

## 5. Shop list route (`src/app/api/v1/shop/route.ts`)

- `const now = Date.now();` build from `ALL_ITEMS.filter((v) => isAvailable(v, now))`
  — out-of-window items omitted.
- Each emitted item gains `seasonal: !!v.season` and
  `seasonEndsAt: v.season ? seasonEndsAt(v) : null`.

## 6. Buy guard (`src/server/shop/repo.ts buyItem`)

Defense in depth (expired items aren't listed, but guard the write):
- Add `unavailable` to `BuyDenyCode` (`purchase.ts`).
- In `buyItem`, before `canBuy`: `if (!isAvailable(item, Date.now())) return { ok:false, code:"unavailable" };`
- Buy route: `unavailable` falls into the existing non-`unknown_item`/non-`insufficient_coins`
  branch → 409 (no route change needed beyond the union widening typechecking).

## 7. Client + UI

- `src/lib/api.ts` `ShopItem`: add `seasonal?: boolean`, `seasonEndsAt?: string | null`.
- `src/app/shop/page.tsx`:
  - Seasonal badge **`✨ ตามฤดูกาล · เหลือ N วัน`** where
    `N = max(0, ceil((Date.parse(seasonEndsAt) - Date.now()) / 86_400_000))`.
  - Within each kind section, sort seasonal items first (`seasonal` desc) for prominence.
  - Festival decorations already render via the updated `Decoration` (JPG), so shop
    previews need no special-casing.

## 8. Testing

- `season.test.ts`: `isAvailable` — no `season` → true always; `now<from` → false;
  in-window → true; `now>until` → false. `seasonEndsAt` → `until` | null.
- `catalog.test.ts`: terrain count now 8 (adds `summer`,`songkran`); decoration
  count now 10 (adds 4 festivals); `summer`/`teachers_day` carry a `season`.
- Buy guard: `buyItem` on an expired item → `{ ok:false, code:"unavailable" }`
  (route/manual, per Phase 2 repo-test convention).
- Manual (dev login): `summer` listed with countdown, buyable, selectable on
  /garden; festivals hidden (widen a window to verify active path + JPG render);
  buying an expired item via direct API → 409.

## Out of scope

- Admin-configurable / Firestore-driven windows. "Coming soon"/expired-visible
  states. Push notifications. Achievement expansion (3-D). Producing the actual
  JPG artwork (human-supplied).

## Compatibility

`season` is additive/optional; existing items unaffected (always available). No
profile/data-model change. Seasonal terrains reuse the 3-B `ownedTerrains` +
`activeTerrain` flow; seasonal decorations reuse the 3-A `decorationLayout` flow —
both unchanged.
