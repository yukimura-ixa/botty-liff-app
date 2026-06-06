# Gamification — Phase 3-B: Terrain / Ground Skins

**Date:** 2026-06-06
**Status:** Approved design → implementation
**Phase:** 3, sub-project B (terrain skins). Phases 1–2 shipped on main.

## Goal

Buyable garden ground skins. A student owns one or more terrains (free `grass`
from onboarding) and picks one **active** terrain that renders as the ground layer
behind their trees/decorations on **/garden and their own /home** (personal — not
in the shared class-forest). Reuses the Phase 2 shop/catalog/purchase foundation
wholesale; terrain is just a third item `kind`.

## Decisions (locked)

| Knob | Value |
|---|---|
| Render scope | `/garden` + own `/home` only (personal; not class-forest) |
| Catalog | 6 terrains: 1 free + 5 buyable, one premium gated |
| Selection | single `activeTerrain` (mirrors `headlineTree`), default `grass` |
| Select endpoint | new sibling `POST /shop/terrain` (mirrors `/shop/headline`) |
| Ownership field | `ownedTerrains: string[]`, default `["grass"]` |

## 1. Catalog (`src/server/shop/catalog.ts`)

`ItemKind` gains `"terrain"`. New `TERRAINS` added to `ALL_ITEMS`:

| id | name (Thai) | price | gate |
|---|---|---|---|
| `grass` | สนามหญ้า | 0 | — (free, owned from onboarding) |
| `sand` | ชายหาด | 40 | — |
| `meadow` | ทุ่งดอกไม้ | 60 | — |
| `autumn` | ใบไม้ร่วง | 90 | — |
| `snow` | ลานหิมะ | 120 | `streak_7` |
| `cosmic` | ห้วงอวกาศ | 200 | `rank_forest` |

`findItem`/`ALL_ITEMS` already generic — terrains flow through automatically.

## 2. Profile model (additive, no migration)

`src/server/user/helpers.ts` `Profile` + `defaultPendingProfile`:
- `ownedTerrains: string[]` default `["grass"]`
- `activeTerrain: string` default `"grass"`

`src/server/user/repo.ts` `coerceProfile` back-fills both when the Firestore doc
lacks them (same pattern as `ownedTrees`/`headlineTree`):
```ts
p.ownedTerrains = Array.isArray(raw.ownedTerrains) && raw.ownedTerrains.length
  ? (raw.ownedTerrains as string[]) : ["grass"];
p.activeTerrain = typeof raw.activeTerrain === "string" ? raw.activeTerrain : "grass";
```

## 3. Purchase logic (`src/server/shop/purchase.ts`)

`Wallet` gains `ownedTerrains?: string[]`. `ownedArr` returns the right list per kind:
```ts
function ownedArr(item: CatalogItem, w: Wallet): string[] {
  if (item.kind === "decoration") return w.ownedDecorations ?? [];
  if (item.kind === "terrain") return w.ownedTerrains ?? [];
  return w.ownedTrees;
}
```
Owned/locked/tooPoor/buyable + gate logic already generic — no other change.

## 4. Buy repo (`src/server/shop/repo.ts buyItem`)

- Read `ownedTerrains` from the user doc (default `["grass"]`).
- The write `field` switch gains terrain:
  `item.kind === "decoration" ? "ownedDecorations" : item.kind === "terrain" ? "ownedTerrains" : "ownedTrees"`.
- `BuyResult.ok` + the returned wallet include `ownedTerrains`.

## 5. Select-active endpoint

New `POST /api/v1/shop/terrain` mirroring `/shop/headline`:
- Body `{ terrainId }`. Validate the student owns it (`ownedTerrains.includes`),
  else 400/403. Sets `activeTerrain`. Returns `{ activeTerrain }`.
- A repo helper `setActiveTerrain(uid, terrainId)` mirroring the headline setter.

## 6. Terrain art (`src/components/botty/terrains/`)

New module mirroring `decorations/` & `trees/`:
- `Terrain({ id, width, height })` dispatcher → 6 focused ground renderers (layered
  SVG / CSS-gradient, cheap — a handful of shapes each). Unknown id → `grass`.
- Pure presentational, no data deps. Reused by /garden, /home, and shop previews.

## 7. Render integration

- **`Garden.tsx`**: the current static `gardenStyle` background gradient becomes a
  `<Terrain id={activeTerrain} />` ground layer behind trees/decorations. Add a
  terrain picker row (owned terrains, tap-to-activate via `onSelectTerrain`) styled
  like the headline-tree selector. New props: `ownedTerrains`, `activeTerrain`,
  `terrainBusy`, `onSelectTerrain`.
- **`/garden` page**: wire the new props from profile + a `setActiveTerrain` call
  (optimistic update, like headline).
- **`/home`**: render the active terrain as the ground behind the home tree.
- **Class-forest: unchanged** (no terrain).

## 8. Shop UI

Add a **Terrains** section alongside Trees / Decorations (reuse the Phase 2
section-split). Terrain items preview via `<Terrain id={item.id} />`. Buy flow
identical to trees/decorations.

## 9. Client API (`src/lib/api.ts`)

- `ShopItem.kind`: `'tree' | 'decoration' | 'terrain'`.
- `StudentProfile`: add `ownedTerrains?: string[]`, `activeTerrain?: string`.
- Buy response type includes `ownedTerrains`.
- `setActiveTerrain(terrainId)` wrapper → `POST /shop/terrain`.

## 10. Testing

- `catalog.test.ts`: 6 terrains present; `grass` free; `snow`/`cosmic` gated; in `ALL_ITEMS`.
- `purchase.test.ts`: terrain owned/locked/tooPoor/buyable; already-owned keys off `ownedTerrains`; gated terrain locked without achievement.
- Buy repo: buying a terrain appends to `ownedTerrains` and returns it (route/manual, as Phase 2).
- Select-active: rejects un-owned terrain; sets `activeTerrain`.
- `Terrain` dispatcher: unknown id falls back to `grass` (pure render test if Phase 2 had one for trees; else manual visual).

## Out of scope

- Free drag placement (Phase 3-A), seasonal drops (3-C), achievement expansion (3-D).
- Terrain in class-forest. Per-terrain animation. Migration scripts (back-fill at read).
- New achievements (reuses existing `streak_7`, `rank_forest` gates).
