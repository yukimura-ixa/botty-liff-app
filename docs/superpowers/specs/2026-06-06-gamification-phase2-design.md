# Gamification — Phase 2: "Decorate" (garden + distinct tree art)

**Date:** 2026-06-06
**Status:** Design approved, pending spec review
**Builds on:** `2026-06-05-gamification-phase1-design.md` (coin economy, tree shop,
class-forest headline trees). Phase 1 is shipped (PR #13).

## Scope

Two deliverables, one slice:

1. **Distinct tree art.** Phase 1 shipped five tree variants that share one
   canopy silhouette and differ only by palette — they look the same. Give each
   variant a real, recognizable shape while keeping the existing layered-SVG /
   palette / rank-stage rendering tech.
2. **"My garden" feature.** A personal 2.5D plot showing the student's owned
   trees plus newly purchasable **decorations**, auto-arranged into fixed slots.
   Tapping a tree sets it as the headline tree.

Explicitly **out of scope** (Phase 3): free drag placement / stored positions,
terrain skins, seasonal drops.

---

## Context (current state after Phase 1)

- `users` doc carries: `coins`, `coinsLifetime`, `ownedTrees: string[]`
  (`["oak"]` default), `headlineTree: string`, `claimedGoalMilestones: number[]`.
- Shop: `src/server/shop/` — `catalog.ts` (`TREE_VARIANTS`), `achievements.ts`
  (`unlockedAchievements`), `purchase.ts` (`canBuy`, `itemState`), `earn.ts`,
  `goal-milestones.ts`, `repo.ts` (`buyTree`, `setHeadline`, …).
- Routes: `GET /api/v1/shop`, `POST /api/v1/shop/buy`, `POST /api/v1/shop/headline`.
- Client: `src/lib/api.ts` — `ShopItem`, `getShop`, `shopBuy`, `setHeadlineTree`.
- Render: `src/components/botty/trees/TreeVariant.tsx` — `(variantId, stage, size)`
  → 2.5D SVG. Palettes per variant; **all silhouettes identical**.
- `ClassForest.tsx` renders each student's `headlineTree`.
- Profile coercion + defaults: `src/server/user/helpers.ts` (`coerceProfile`),
  repo writes in `src/server/user/repo.ts`.

---

## 1. Distinct tree art — `src/components/botty/trees/`

`TreeVariant` becomes a **dispatcher**: given `variantId`, it delegates to a
per-variant shape renderer. Each renderer is a small, focused, stage-aware
function that draws a distinct silhouette using that variant's existing palette
entry (`PALETTES[variantId]`). Stage 0–3 still scales canopy size and trunk
height as today.

Target silhouettes:

| Variant | Shape |
|---|---|
| `oak` | Full rounded multi-lobe canopy (broad, dense) |
| `pine` | Stacked triangular tiers (narrow conical evergreen) |
| `sakura` | Loose wispy blossom puffs, lighter and airier |
| `willow` | Central crown with drooping frond strands |
| `aurora` | Crystalline / spiky canopy with a glow gradient + sparkles |

Constraints:
- Keep the current rendering approach (layered `<svg>` shapes, soft ground
  shadow, `PALETTES` colors). No new render dependency, no per-tree bitmap.
- Cheap enough that `ClassForest` can draw many at once — favor a modest number
  of SVG primitives per tree (a handful of shapes), not dozens of paths.
- The component contract stays `TreeVariant({ variantId, stage, size })` so
  `/home`, `/shop`, `/garden`, and `ClassForest` all keep using it unchanged.
- Unknown `variantId` falls back to `oak` (as today).

Implementation shape: a `PALETTES`-style switch or a
`Record<variantId, (palette, stage, geom) => ReactNode>` of shape builders inside
the trees module, so adding a future variant = one entry. Keep files focused; if
`TreeVariant.tsx` grows large, split shape builders into a sibling module
(e.g. `tree-shapes.tsx`).

---

## 2. Data model (additive on the `users` doc)

| Field | Type | Purpose | Default |
|---|---|---|---|
| `ownedDecorations` | string[] | Decoration ids owned | `[]` |

No other new fields. `coerceProfile` defaults missing `ownedDecorations` to `[]`
(same back-fill pattern Phase 1 used for `ownedTrees`). No migration script.

---

## 3. Catalog — generalize to items

Extend the catalog so it carries both kinds:

```ts
type ItemKind = "tree" | "decoration";

type ShopItem = {
  id: string;
  kind: ItemKind;
  name: string;          // Thai display name
  priceCoins: number;
  gate?: AchievementId;  // undefined = buyable once affordable
};
```

- `TREE_VARIANTS` keeps its existing ids/prices/gates (now typed with
  `kind: "tree"`).
- New `DECORATIONS` (~6), `kind: "decoration"`. Starter set (final ids/prices/
  gates tuned during build):
  - `flower_patch` — cheap
  - `rock` — cheap
  - `bush` — cheap/mid
  - `pond` — mid
  - `log_bench` — mid
  - `statue` — prestige, **gated** (e.g. `rank_forest`) to exercise the hybrid
    unlock model for decorations too
- A combined accessor (e.g. `allItems()` / `itemById(id)`) lets the buy route and
  `GET /shop` treat both kinds uniformly.
- Decorations have **no rank stage** — they render statically.

---

## 4. Purchase / item-state (generalize existing pure code)

- `itemState(profile, item)` and `canBuy(profile, item)` already key off
  ownership + gate + coins. Generalize "owned" to check the array matching the
  item's `kind`: `ownedTrees` for trees, `ownedDecorations` for decorations.
- States unchanged: `owned` | `locked` | `tooPoor` | `buyable`.
- Gate logic (`unlockedAchievements`) unchanged — applies to decorations too.

---

## 5. API

- **`POST /api/v1/shop/buy { itemId }`** — generalized. Resolve item → kind;
  run the same atomic `users`-doc transaction as Phase 1 but append to the array
  for that kind (`ownedTrees` or `ownedDecorations`). Same typed errors:
  `already_owned`, `locked`, `insufficient_coins`, plus `unknown_item`.
  (`repo.buyTree` becomes / is wrapped by a generic `buyItem(uid, item)`.)
- **`GET /api/v1/shop`** — returns both kinds, each with derived item-state, so
  the shop UI can group Trees vs Decorations.
- **`GET /api/v1/me`** — profile now includes `ownedDecorations`.
- **`POST /api/v1/shop/headline`** — unchanged (trees only; rejects non-owned).

Client `src/lib/api.ts`: `ShopItem` gains `kind`; `shopBuy(itemId)` already
generic. Add `ownedDecorations` to the profile type.

---

## 6. Garden UI — `/garden`

New student route `/garden`, added to `BottomNav`.

- **Plot:** a 2.5D isometric ground with fixed anchor positions — ~5 tree spots
  and ~6 decoration spots (exact counts set during build; must cover all 5 tree
  variants).
- **Auto-fill, no drag:** owned trees fill tree spots in a deterministic order
  (e.g. catalog order); owned decorations fill decoration spots in acquisition
  order. No stored x/y, no placement persistence.
- **Headline interaction:** tapping a tree calls `setHeadlineTree(id)`
  (optimistic, rollback on `ApiError`); the current headline tree is marked
  (ring / glow).
- **Coin balance** shown in the header (consistent with `/home`, `/shop`).
- **Empty state:** new students see oak + empty decoration slots with a hint to
  visit the shop.
- Renders trees via `TreeVariant`; decorations via new components in
  `src/components/botty/decorations/` (small static 2.5D SVGs, one focused
  component per decoration, dispatched like `TreeVariant`).

---

## 7. Shop UI update

`/shop` groups items into **Trees** and **Decorations** sections, each card using
the same state badges as Phase 1 (`owned ✓`, `Buy`, `🔒 + gate hint`, greyed
`tooPoor`). Decoration cards preview the decoration SVG.

---

## 8. Testing (Vitest, co-located, per project convention)

Pure units only (Firestore repos verified manually / via routes):
- `coerceProfile` defaults `ownedDecorations` to `[]` and preserves provided.
- `canBuy` / `itemState` for **decoration** items (owned / locked / tooPoor /
  buyable), including the gated `statue`.
- Catalog integrity: unique ids across both kinds; every `gate` is a known
  `AchievementId`; `itemById` resolves both kinds.

---

## 9. Out of scope (Phase 3)

Free drag placement + stored positions, terrain/ground skins, seasonal drops,
achievement expansion beyond existing gates.

## Open questions / risks

- **Slot counts & layout** — exact tree/decoration anchor positions are a design
  detail finalized against the real component; spec fixes only the model
  (fixed slots, auto-fill, no drag).
- **Decoration art effort** — six static 2.5D SVGs is real art work but far
  lighter than stage-aware trees.
- **Price/gate tuning** — decoration prices and the prestige gate are placeholders
  to balance during build, same as Phase 1 tree prices.
