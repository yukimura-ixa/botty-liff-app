# Gamification — Phase 1: "Earn & Swap" MVP

**Date:** 2026-06-05
**Status:** Design approved, pending spec review
**Scope:** First vertical slice of the gamification roadmap. Ships the full
coin economy loop end-to-end with the smallest surface: earn coins → buy a tree
variant → set it as your headline tree → see it on your home view *and* in the
class forest. No garden placement, decorations, terrain, or seasonal items
(those are Phase 2/3).

---

## Context

botty-liff-app is a school recycling rewards system (LINE LIFF mobile webview).
Students scan plastic bottles → AI detects → earn points immediately.

Current gamification state:
- `totalPoints` drives a 4-tier rank (🌱 ต้นกล้า → 🌿 ต้นไม้ → 🌳 ป่าไม้ →
  🌲 ผืนป่า), defined in `src/lib/theme.ts` (`RANKS`).
- Trees are hand-drawn **2D SVG** (`src/components/botty/RankTree.tsx`,
  `ClassForest.tsx`). Personal view shows a single rank tree; class view shows a
  shared island forest.
- `schoolGoal/current` tracks bottles (`currentBottles` +1 per accepted scan),
  separate from points.
- No shop, inventory, unlock, or cosmetic system exists — this is greenfield.

## Decisions taken during brainstorming

1. **Dual currency.** `totalPoints` stays the permanent rank/leaderboard score
   (never spent). A new spendable `coins` currency funds the shop. Rank is never
   clawed back by spending.
2. **Canvas: personal garden + class-forest contribution.** A student's chosen
   headline tree represents them in the shared class forest; the richer personal
   garden plot (Phase 2) is for self-expression.
3. **Rendering: 2.5D isometric.** Layered SVG/CSS depth (stacking + parallax +
   soft shadows), extends existing SVG trees. No runtime 3D engine — chosen for
   mobile-webview bundle/GPU safety. (Real-time 3D and pre-baked 3D sprites were
   considered and deferred.)
4. **Coin earning sources:** per accepted scan, streak/daily bonuses, and
   school-goal milestones. (No rank-up payout.)
5. **Catalog:** tree variants, garden decorations, terrain skins, seasonal drops
   — full set across the roadmap. **Phase 1 ships tree variants only.**
6. **Unlock model: hybrid.** Most items bought with coins; prestige items are
   gated behind achievements (rank / streak / school goal) — gate = unlock to
   *purchase*, not a free grant.

## Roadmap (decomposition)

| Subsystem | Description |
|---|---|
| **E** Economy core | `coins` balance + earn hooks. Foundation. |
| **C** Catalog + unlocks | Item defs (id, type, price, gate) + achievement evaluator. |
| **I** Inventory + purchase | Ownership store, atomic buy API, item-state derivation. |
| **S** Shop UI | Browse, prices, locked badges, buy flow. |
| **G** Personal garden | Placed-decoration model, 2.5D render, drag-place UI. Biggest build. |
| **F** Class forest hook | Render student's headline tree variant in `ClassForest`. |
| **A** Asset library | The 2.5D tree-variant + decoration SVGs. Ongoing. |

**Phasing**
- **Phase 1 (this spec)** — E + minimal C/I/S + F + a few A assets. Tree variants only.
- **Phase 2 — "Decorate"** — G + decoration/terrain assets.
- **Phase 3 — "Seasonal & polish"** — seasonal drops, achievement expansion, more assets.

Each phase gets its own spec → plan → build cycle.

---

## Phase 1 design

### 1. Data model (additive, on the `users` doc)

| Field | Type | Purpose | Default |
|---|---|---|---|
| `coins` | number | Spendable balance | 0 |
| `coinsLifetime` | number | Total ever earned (audit, never decremented) | 0 |
| `ownedTrees` | string[] | Tree-variant ids owned | `["oak"]` |
| `headlineTree` | string | Selected variant id shown to others | `"oak"` |
| `claimedGoalMilestones` | number[] | School-goal % milestones already paid | `[]` |

No new Firestore collections in Phase 1. Catalog and gates live in code.
`oak` is the free default, granted at onboarding (and back-filled lazily for
existing users — see §6). The `Profile` type in `src/server/user/helpers.ts`
gains these optional fields; reads coerce missing values to the defaults above.

### 2. Earning coins — `src/server/shop/earn.ts` (pure + tested)

- **Per scan.** Extend the existing `awardScan` transaction
  (`src/server/scan/award.ts`): inside the same `tx.update(userRef, …)` that
  already increments `totalPoints`, add
  `coins: FieldValue.increment(reward)` and
  `coinsLifetime: FieldValue.increment(reward)`. No new write.
- **Streak/daily.** `reward` is computed by a pure
  `coinReward(newStreak, newDaily)` that returns base (`COIN_PER_SCAN`) plus a
  streak/daily bonus from a small table. Reuses values `awardScan` already
  computes (`newStreak`, `newDaily`).
- **School-goal milestones.** No fan-out write. On home load, compare current
  goal percentage (`currentBottles / targetBottles`) against
  `claimedGoalMilestones`. For each unclaimed milestone in `{25, 50, 100}` that
  has been reached, grant its coin payout and append the milestone to the array
  (single per-user write, idempotent, self-healing).

Constants (`COIN_PER_SCAN`, streak bonus table, milestone payouts) are
co-located in this module, mirroring how `TEACHER_IMMEDIATE_CAP` /
`TEACHER_REQUEST_CAP` live in `src/lib/api.ts`.

### 3. Catalog — `src/server/shop/catalog.ts` (static, pure)

```ts
type TreeVariant = {
  id: string;            // "oak" | "sakura" | "pine" | "willow" | "aurora"
  name: string;          // Thai display name
  priceCoins: number;
  gate?: AchievementId;  // undefined = buyable once affordable
};
```

Phase 1 ships ~5 variants: `oak` (free default), 2–3 coin-only, 1–2
gate-locked (to prove the hybrid model end-to-end).

### 4. Achievement gates — `src/server/shop/achievements.ts` (pure)

`unlockedAchievements(profile): Set<AchievementId>` — derived live from existing
profile fields, no storage. Phase 1 gates:

- `rank_forest` → reach 🌳 (`totalPoints ≥ 1600`)
- `streak_7` → `streakDays ≥ 7`
- `goal_half` → school goal ≥ 50%

A gated item is **buyable** only when its achievement is unlocked *and* coins
suffice. Gate = unlock-to-purchase, not a free grant.

### 5. Item state + purchase

Pure deriver maps each catalog item, for a given profile, to exactly one state:

- `owned` — in `ownedTrees`
- `locked` — has a `gate` not in `unlockedAchievements`
- `tooPoor` — unlocked / gate satisfied, but `coins < priceCoins`
- `buyable` — gate satisfied and affordable

**`POST /api/v1/shop/buy { itemId }`** — transaction on the `users` doc:
1. Read profile. Item must exist and **not** already be owned.
2. Gate check: `item.gate` ∈ `unlockedAchievements(profile)`.
3. `coins ≥ priceCoins`.
4. Apply atomically: `coins -= price`; append `itemId` to `ownedTrees`.

Errors map to typed `ApiError`: `already_owned`, `locked`,
`insufficient_coins`. Pure `canBuy(profile, item)` validator is unit-tested; the
route is a thin wrapper.

**`POST /api/v1/shop/headline { itemId }`** — `itemId` must be owned, then set
`headlineTree`. Errors: `not_owned`.

### 6. UI

New student route **`/shop`** (added to `BottomNav`):
- Coin balance header (balance also surfaced on `/home` and `/profile`).
- Grid of tree cards: 2.5D preview, name, price.
- State badges: `owned` (✓), `buyable` (Buy button), `locked` (🔒 + gate hint,
  e.g. "reach 🌳"), `tooPoor` (greyed price).
- Buy → optimistic update → `api.shopBuy()`; roll back on `ApiError`.
- Owned trees expose "Set as my tree" → `api.setHeadline()`.

Existing-user back-fill: on first read where `ownedTrees` is missing, coerce to
`["oak"]` / `headlineTree="oak"` so legacy accounts have a valid default without
a migration script.

### 7. Display (2.5D)

- New variant-aware render component: `(variantId, rankStage) → 2.5D SVG`
  (layered, soft shadow, isometric base). Extends the structure of the current
  `RankTree`.
- **Personal view** (`/home`): headline tree rendered at the student's current
  rank stage (variant × stage).
- **Class forest** (`ClassForest`): each student's island tree uses their
  `headlineTree` variant. The forest/leaderboard query that feeds `ClassForest`
  must include `headlineTree` per user.

### 8. Assets — `src/components/botty/trees/`

~5 tree variants, each stage-aware, hand-built 2.5D SVG matching the `theme.ts`
palette. Each variant is a small, focused component.

### 9. Testing (Vitest, co-located)

Pure units tested directly: `coinReward`, `unlockedAchievements`, `canBuy`,
the item-state deriver, and the school-goal milestone calculator. Routes
(`buy`, `headline`) are verified manually and via thin integration, per project
convention (Firestore repos are not unit-tested).

### Explicitly out of Phase 1

Garden placement, decorations, terrain skins, seasonal drops — Phase 2/3.

---

## Open questions / risks

- **Coin reward tuning** (`COIN_PER_SCAN`, bonus table, milestone payouts, item
  prices) needs a balancing pass once numbers are real; values in this spec are
  placeholders to be set during implementation.
- **2.5D asset effort** — five stage-aware variants is real art work; the
  rendering component contract should land before the full asset set so assets
  can be produced against a stable interface.
