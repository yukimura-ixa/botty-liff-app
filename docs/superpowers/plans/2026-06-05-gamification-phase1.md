# Gamification Phase 1 — "Earn & Swap" MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full coin economy loop end-to-end — earn coins from scans/streaks/school-goal, buy a 2.5D tree variant in a shop (hybrid coin + achievement gating), set it as your headline tree, and see it on `/home` and in the class forest.

**Architecture:** Additive fields on the `users` Firestore doc (no new collections). Pure, unit-tested logic modules under `src/server/shop/` (earning, catalog, achievements, purchase validation). Thin Node-runtime API routes wrap the pure logic and Firestore transactions, following the existing `verifyBearerToken` + `jsonOk/jsonError` pattern. Client additions in `src/lib/api.ts` and a new `/shop` route. Rendering extends the existing SVG `RankTree` into variant-aware 2.5D components.

**Tech Stack:** Next.js 16 App Router (Node runtime routes), React 19, firebase-admin Firestore, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-05-gamification-phase1-design.md`

---

## Tuning constants (concrete starter values — balance later)

| Constant | Value |
|---|---|
| `COIN_PER_SCAN` | 2 |
| streak bonus | +1 coin if `newStreak >= 3`, +2 if `>= 7` |
| first-scan-of-day bonus | +1 coin |
| goal milestone payouts | 25% → 20, 50% → 40, 100% → 100 |
| tree prices | pine 40, sakura 80, willow 120, aurora 200 |
| gated trees | willow → `streak_7`, aurora → `rank_forest` |

## File structure

| File | Responsibility |
|---|---|
| `src/server/shop/earn.ts` | Pure `coinReward()` + constants |
| `src/server/shop/earn.test.ts` | Tests for `coinReward` |
| `src/server/shop/goal-milestones.ts` | Pure `unclaimedMilestones()` + payouts |
| `src/server/shop/goal-milestones.test.ts` | Tests |
| `src/server/shop/catalog.ts` | Static `TREE_VARIANTS`, `TreeVariant` type |
| `src/server/shop/achievements.ts` | `AchievementId`, `unlockedAchievements()` |
| `src/server/shop/achievements.test.ts` | Tests |
| `src/server/shop/purchase.ts` | Pure `canBuy()` + `itemState()` deriver |
| `src/server/shop/purchase.test.ts` | Tests |
| `src/server/shop/repo.ts` | Firestore txns: `buyTree`, `setHeadline`, `claimGoalMilestones` |
| `src/app/api/v1/shop/route.ts` | `GET` catalog + balance + states |
| `src/app/api/v1/shop/buy/route.ts` | `POST` buy |
| `src/app/api/v1/shop/headline/route.ts` | `POST` set headline |
| `src/components/botty/trees/TreeVariant.tsx` | `(variantId, stage) → 2.5D SVG` |
| `src/app/shop/page.tsx` | Shop UI |
| Modified: `src/server/user/helpers.ts` | Add fields to `Profile` + defaults |
| Modified: `src/server/user/repo.ts` | `coerceProfile` defaults |
| Modified: `src/server/scan/award.ts` | Increment `coins`/`coinsLifetime` in txn |
| Modified: `src/app/api/v1/scan/upload/route.ts` | Compute + pass `coinReward` |
| Modified: `src/app/api/v1/me/route.ts` | Lazy milestone grant before read |
| Modified: `src/lib/api.ts` | Client methods + `StudentProfile` fields |
| Modified: `src/components/shared/BottomNav.tsx` | `/shop` entry |
| Modified: `src/app/home/page.tsx` | Coin chip + headline tree render |
| Modified: `src/components/botty/ClassForest.tsx` | Per-student headline variant |

---

## Task 1: Profile gains economy fields

**Files:**
- Modify: `src/server/user/helpers.ts`
- Modify: `src/server/user/repo.ts` (`coerceProfile`, lines 28-37)

- [ ] **Step 1: Add fields to `Profile` and `defaultPendingProfile`**

In `src/server/user/helpers.ts`, add to the `Profile` type (after `dailyScanDate`):

```ts
  coins: number;
  coinsLifetime: number;
  ownedTrees: string[];
  headlineTree: string;
  claimedGoalMilestones: number[];
```

And to the object returned by `defaultPendingProfile` (after `dailyScanDate: ""`):

```ts
    coins: 0,
    coinsLifetime: 0,
    ownedTrees: ["oak"],
    headlineTree: "oak",
    claimedGoalMilestones: [],
```

- [ ] **Step 2: Back-fill defaults in `coerceProfile`**

In `src/server/user/repo.ts`, inside `coerceProfile`, before `return p;` add:

```ts
  p.coins = typeof raw.coins === "number" ? raw.coins : 0;
  p.coinsLifetime = typeof raw.coinsLifetime === "number" ? raw.coinsLifetime : 0;
  p.ownedTrees = Array.isArray(raw.ownedTrees) && raw.ownedTrees.length
    ? (raw.ownedTrees as string[])
    : ["oak"];
  p.headlineTree = typeof raw.headlineTree === "string" && raw.headlineTree
    ? raw.headlineTree
    : "oak";
  p.claimedGoalMilestones = Array.isArray(raw.claimedGoalMilestones)
    ? (raw.claimedGoalMilestones as number[])
    : [];
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (existing `Profile` consumers still compile; new fields are required but only constructed in `defaultPendingProfile` and coerced reads).

- [ ] **Step 4: Commit**

```bash
git add src/server/user/helpers.ts src/server/user/repo.ts
git commit -m "feat(shop): add coin/inventory fields to Profile"
```

---

## Task 2: `coinReward` pure function

**Files:**
- Create: `src/server/shop/earn.ts`
- Test: `src/server/shop/earn.test.ts`

- [ ] **Step 1: Write the failing test**

`src/server/shop/earn.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { coinReward, COIN_PER_SCAN } from "./earn";

describe("coinReward", () => {
  it("gives base coins for a normal scan", () => {
    expect(coinReward(1, 2)).toBe(COIN_PER_SCAN); // streak<3, not first of day
  });
  it("adds +1 for the first scan of the day", () => {
    expect(coinReward(1, 1)).toBe(COIN_PER_SCAN + 1);
  });
  it("adds +1 streak bonus at 3-day streak", () => {
    expect(coinReward(3, 2)).toBe(COIN_PER_SCAN + 1);
  });
  it("adds +2 streak bonus at 7-day streak", () => {
    expect(coinReward(7, 2)).toBe(COIN_PER_SCAN + 2);
  });
  it("stacks first-of-day and streak bonuses", () => {
    expect(coinReward(7, 1)).toBe(COIN_PER_SCAN + 2 + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/shop/earn.test.ts`
Expected: FAIL — cannot find module `./earn`.

- [ ] **Step 3: Write minimal implementation**

`src/server/shop/earn.ts`:

```ts
// Spendable-coin rewards for scans. Pure: no IO. Tuning lives here, mirroring
// TEACHER_*_CAP in src/lib/api.ts.
export const COIN_PER_SCAN = 2;

function streakBonus(streakDays: number): number {
  if (streakDays >= 7) return 2;
  if (streakDays >= 3) return 1;
  return 0;
}

/**
 * Coins earned for one accepted scan.
 * @param newStreak the streak value after this scan
 * @param newDaily  the daily scan count after this scan (1 = first of day)
 */
export function coinReward(newStreak: number, newDaily: number): number {
  const firstOfDay = newDaily === 1 ? 1 : 0;
  return COIN_PER_SCAN + streakBonus(newStreak) + firstOfDay;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/shop/earn.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/shop/earn.ts src/server/shop/earn.test.ts
git commit -m "feat(shop): coinReward pure function"
```

---

## Task 3: School-goal milestone calculator

**Files:**
- Create: `src/server/shop/goal-milestones.ts`
- Test: `src/server/shop/goal-milestones.test.ts`

- [ ] **Step 1: Write the failing test**

`src/server/shop/goal-milestones.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { unclaimedMilestones, MILESTONE_COINS } from "./goal-milestones";

describe("unclaimedMilestones", () => {
  it("returns nothing below 25%", () => {
    expect(unclaimedMilestones(20, 100, [])).toEqual([]);
  });
  it("returns 25 milestone at 25%", () => {
    expect(unclaimedMilestones(25, 100, [])).toEqual([25]);
  });
  it("returns 25 and 50 at 60% when none claimed", () => {
    expect(unclaimedMilestones(60, 100, [])).toEqual([25, 50]);
  });
  it("skips already-claimed milestones", () => {
    expect(unclaimedMilestones(60, 100, [25])).toEqual([50]);
  });
  it("returns all three at/over 100%", () => {
    expect(unclaimedMilestones(100, 100, [])).toEqual([25, 50, 100]);
  });
  it("handles zero/empty target safely", () => {
    expect(unclaimedMilestones(5, 0, [])).toEqual([]);
  });
  it("MILESTONE_COINS pays each tier", () => {
    expect(MILESTONE_COINS[25]).toBe(20);
    expect(MILESTONE_COINS[50]).toBe(40);
    expect(MILESTONE_COINS[100]).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/shop/goal-milestones.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

`src/server/shop/goal-milestones.ts`:

```ts
// School-goal coin milestones. Pure. Granted lazily per-user on /me read to
// avoid a fan-out write across all students when the goal crosses a threshold.
export const MILESTONE_COINS: Record<number, number> = { 25: 20, 50: 40, 100: 100 };
const TIERS = [25, 50, 100] as const;

/** Milestones reached by current/target that the user has not yet claimed. */
export function unclaimedMilestones(
  current: number,
  target: number,
  claimed: number[],
): number[] {
  if (!target || target <= 0) return [];
  const pct = (current / target) * 100;
  return TIERS.filter((t) => pct >= t && !claimed.includes(t));
}

/** Total coins owed for a set of milestones. */
export function milestonePayout(milestones: number[]): number {
  return milestones.reduce((sum, m) => sum + (MILESTONE_COINS[m] ?? 0), 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/shop/goal-milestones.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/shop/goal-milestones.ts src/server/shop/goal-milestones.test.ts
git commit -m "feat(shop): school-goal milestone calculator"
```

---

## Task 4: Award coins inside the scan transaction

**Files:**
- Modify: `src/server/scan/award.ts` (lines 6-11 type, 32-42 txn update)
- Modify: `src/app/api/v1/scan/upload/route.ts` (around line 311-340)

- [ ] **Step 1: Extend `AwardFromScanInput` with `coinReward`**

In `src/server/scan/award.ts`, change the type:

```ts
type AwardFromScanInput = ScanDocInput & {
  scanId: string;
  newStreak: number;
  newDaily: number;
  newRank: string;
  coinReward: number;
};
```

- [ ] **Step 2: Increment coins in the user update**

In the same file, inside `tx.update(userRef, { … })`, add two lines after `totalPoints: FieldValue.increment(i.totalPoints),`:

```ts
      coins: FieldValue.increment(i.coinReward),
      coinsLifetime: FieldValue.increment(i.coinReward),
```

- [ ] **Step 3: Compute and pass `coinReward` from the upload route**

In `src/app/api/v1/scan/upload/route.ts`, add the import at the top with the other `@/server/scan/*` imports:

```ts
import { coinReward } from "@/server/shop/earn";
```

Then in the awarding branch, after `const newRank = rankForPoints(newTotal);` (line ~318), add:

```ts
  const coins = coinReward(newStreak, newDaily);
```

And add `coinReward: coins,` to the `awardArgs` object (after `newRank,`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the existing award/scan tests**

Run: `npx vitest run src/server/scan`
Expected: PASS (no regressions; `awardScan` is exercised through existing tests if present, otherwise this confirms nothing broke).

- [ ] **Step 6: Commit**

```bash
git add src/server/scan/award.ts src/app/api/v1/scan/upload/route.ts
git commit -m "feat(shop): award coins per accepted scan"
```

---

## Task 5: Tree catalog + achievement ids

**Files:**
- Create: `src/server/shop/catalog.ts`
- Create: `src/server/shop/achievements.ts`
- Test: `src/server/shop/achievements.test.ts`

- [ ] **Step 1: Define the catalog**

`src/server/shop/catalog.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing achievements test**

`src/server/shop/achievements.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { unlockedAchievements } from "./achievements";

const base = { totalPoints: 0, streakDays: 0 };

describe("unlockedAchievements", () => {
  it("unlocks nothing at zero", () => {
    expect(unlockedAchievements(base, 0).size).toBe(0);
  });
  it("unlocks rank_forest at 1600 points", () => {
    expect(unlockedAchievements({ ...base, totalPoints: 1600 }, 0).has("rank_forest")).toBe(true);
  });
  it("unlocks streak_7 at a 7-day streak", () => {
    expect(unlockedAchievements({ ...base, streakDays: 7 }, 0).has("streak_7")).toBe(true);
  });
  it("unlocks goal_half at >=50% school goal", () => {
    expect(unlockedAchievements(base, 50).has("goal_half")).toBe(true);
    expect(unlockedAchievements(base, 49).has("goal_half")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/server/shop/achievements.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Implement achievements**

`src/server/shop/achievements.ts`:

```ts
// Achievement gates derived live from profile + school-goal state. No storage.
export type AchievementId = "rank_forest" | "streak_7" | "goal_half";

const FOREST_POINTS = 1600; // 🌳 ป่าไม้ threshold (see RANKS in src/lib/theme.ts)

/**
 * @param p profile fields that drive gates
 * @param goalPct current school-goal completion percentage (0-100+)
 */
export function unlockedAchievements(
  p: { totalPoints: number; streakDays: number },
  goalPct: number,
): Set<AchievementId> {
  const out = new Set<AchievementId>();
  if (p.totalPoints >= FOREST_POINTS) out.add("rank_forest");
  if (p.streakDays >= 7) out.add("streak_7");
  if (goalPct >= 50) out.add("goal_half");
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/server/shop/achievements.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/shop/catalog.ts src/server/shop/achievements.ts src/server/shop/achievements.test.ts
git commit -m "feat(shop): tree catalog + achievement gates"
```

---

## Task 6: Purchase validation + item-state deriver

**Files:**
- Create: `src/server/shop/purchase.ts`
- Test: `src/server/shop/purchase.test.ts`

- [ ] **Step 1: Write the failing test**

`src/server/shop/purchase.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canBuy, itemState } from "./purchase";
import type { TreeVariant } from "./catalog";

const pine: TreeVariant = { id: "pine", name: "ต้นสน", priceCoins: 40 };
const willow: TreeVariant = { id: "willow", name: "ต้นหลิว", priceCoins: 120, gate: "streak_7" };

const profile = (over: Partial<{ coins: number; ownedTrees: string[] }> = {}) => ({
  coins: 0, ownedTrees: ["oak"], ...over,
});

describe("itemState", () => {
  it("owned when in ownedTrees", () => {
    expect(itemState(pine, profile({ ownedTrees: ["oak", "pine"] }), new Set())).toBe("owned");
  });
  it("locked when gate not unlocked", () => {
    expect(itemState(willow, profile({ coins: 999 }), new Set())).toBe("locked");
  });
  it("tooPoor when unlocked/gated-ok but cannot afford", () => {
    expect(itemState(willow, profile({ coins: 10 }), new Set(["streak_7"]))).toBe("tooPoor");
    expect(itemState(pine, profile({ coins: 10 }), new Set())).toBe("tooPoor");
  });
  it("buyable when affordable and gate satisfied", () => {
    expect(itemState(pine, profile({ coins: 40 }), new Set())).toBe("buyable");
    expect(itemState(willow, profile({ coins: 120 }), new Set(["streak_7"]))).toBe("buyable");
  });
});

describe("canBuy", () => {
  it("rejects already owned", () => {
    expect(canBuy(pine, profile({ coins: 99, ownedTrees: ["oak", "pine"] }), new Set()))
      .toEqual({ ok: false, code: "already_owned" });
  });
  it("rejects locked gate", () => {
    expect(canBuy(willow, profile({ coins: 999 }), new Set()))
      .toEqual({ ok: false, code: "locked" });
  });
  it("rejects insufficient coins", () => {
    expect(canBuy(pine, profile({ coins: 10 }), new Set()))
      .toEqual({ ok: false, code: "insufficient_coins" });
  });
  it("allows a valid purchase", () => {
    expect(canBuy(pine, profile({ coins: 40 }), new Set())).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/shop/purchase.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement purchase logic**

`src/server/shop/purchase.ts`:

```ts
import type { TreeVariant } from "./catalog";
import type { AchievementId } from "./achievements";

export type ItemState = "owned" | "locked" | "tooPoor" | "buyable";
export type BuyDenyCode = "already_owned" | "locked" | "insufficient_coins";
export type CanBuy = { ok: true } | { ok: false; code: BuyDenyCode };

type Wallet = { coins: number; ownedTrees: string[] };

function gateOk(item: TreeVariant, unlocked: Set<AchievementId>): boolean {
  return !item.gate || unlocked.has(item.gate);
}

export function itemState(
  item: TreeVariant,
  w: Wallet,
  unlocked: Set<AchievementId>,
): ItemState {
  if (w.ownedTrees.includes(item.id)) return "owned";
  if (!gateOk(item, unlocked)) return "locked";
  if (w.coins < item.priceCoins) return "tooPoor";
  return "buyable";
}

export function canBuy(
  item: TreeVariant,
  w: Wallet,
  unlocked: Set<AchievementId>,
): CanBuy {
  if (w.ownedTrees.includes(item.id)) return { ok: false, code: "already_owned" };
  if (!gateOk(item, unlocked)) return { ok: false, code: "locked" };
  if (w.coins < item.priceCoins) return { ok: false, code: "insufficient_coins" };
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/shop/purchase.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/shop/purchase.ts src/server/shop/purchase.test.ts
git commit -m "feat(shop): purchase validation + item-state deriver"
```

---

## Task 7: Shop Firestore repo (buy / headline / claim milestones)

**Files:**
- Create: `src/server/shop/repo.ts`

These are Firestore transactions, not unit-tested (project convention). Verified via routes in Task 11 manual check.

- [ ] **Step 1: Implement the repo**

`src/server/shop/repo.ts`:

```ts
import { fbFirestore } from "@/server/lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { bust } from "@/server/lib/cache-bus";
import { findVariant } from "./catalog";
import { canBuy, type BuyDenyCode } from "./purchase";
import { unlockedAchievements } from "./achievements";
import { unclaimedMilestones, milestonePayout } from "./goal-milestones";

export type BuyResult =
  | { ok: true; coins: number; ownedTrees: string[] }
  | { ok: false; code: BuyDenyCode | "unknown_item" };

/** Atomically spend coins and grant a tree. */
export async function buyTree(uid: string, itemId: string, goalPct: number): Promise<BuyResult> {
  const item = findVariant(itemId);
  if (!item) return { ok: false, code: "unknown_item" };
  const fs = fbFirestore();
  const ref = fs.collection("users").doc(uid);

  const result = await fs.runTransaction<BuyResult>(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const wallet = {
      coins: typeof d.coins === "number" ? d.coins : 0,
      ownedTrees: Array.isArray(d.ownedTrees) ? (d.ownedTrees as string[]) : ["oak"],
    };
    const unlocked = unlockedAchievements(
      { totalPoints: (d.totalPoints as number) ?? 0, streakDays: (d.streakDays as number) ?? 0 },
      goalPct,
    );
    const verdict = canBuy(item, wallet, unlocked);
    if (!verdict.ok) return { ok: false, code: verdict.code };
    const coins = wallet.coins - item.priceCoins;
    tx.update(ref, {
      coins,
      ownedTrees: FieldValue.arrayUnion(item.id),
      updatedAt: new Date(),
    });
    return { ok: true, coins, ownedTrees: [...wallet.ownedTrees, item.id] };
  });

  if (result.ok) bust(`user:${uid}`);
  return result;
}

export type HeadlineResult = { ok: true } | { ok: false; code: "not_owned" };

/** Set the headline tree; must already be owned. */
export async function setHeadline(uid: string, itemId: string): Promise<HeadlineResult> {
  const fs = fbFirestore();
  const ref = fs.collection("users").doc(uid);
  const result = await fs.runTransaction<HeadlineResult>(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const owned = Array.isArray(d.ownedTrees) ? (d.ownedTrees as string[]) : ["oak"];
    if (!owned.includes(itemId)) return { ok: false, code: "not_owned" };
    tx.update(ref, { headlineTree: itemId, updatedAt: new Date() });
    return { ok: true };
  });
  if (result.ok) bust(`user:${uid}`);
  return result;
}

/**
 * Grant any unclaimed school-goal milestone coins for this user. Idempotent.
 * Returns coins granted (0 if none). Called lazily on /me read.
 */
export async function claimGoalMilestones(
  uid: string,
  current: number,
  target: number,
): Promise<number> {
  const fs = fbFirestore();
  const ref = fs.collection("users").doc(uid);
  const granted = await fs.runTransaction<number>(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const claimed = Array.isArray(d.claimedGoalMilestones)
      ? (d.claimedGoalMilestones as number[])
      : [];
    const due = unclaimedMilestones(current, target, claimed);
    if (!due.length) return 0;
    const payout = milestonePayout(due);
    tx.update(ref, {
      coins: FieldValue.increment(payout),
      coinsLifetime: FieldValue.increment(payout),
      claimedGoalMilestones: FieldValue.arrayUnion(...due),
      updatedAt: new Date(),
    });
    return payout;
  });
  if (granted > 0) bust(`user:${uid}`);
  return granted;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/shop/repo.ts
git commit -m "feat(shop): Firestore txns for buy/headline/milestones"
```

---

## Task 8: `GET /api/v1/shop` — catalog + balance + states

**Files:**
- Create: `src/app/api/v1/shop/route.ts`

- [ ] **Step 1: Implement the route**

`src/app/api/v1/shop/route.ts`:

```ts
import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getUser } from "@/server/user/repo";
import { getSchoolGoal } from "@/server/school/repo";
import { TREE_VARIANTS } from "@/server/shop/catalog";
import { unlockedAchievements } from "@/server/shop/achievements";
import { itemState } from "@/server/shop/purchase";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  const prof = await getUser(ctx.uid);
  if (!prof) return jsonError(404, "not found");

  const goal = await getSchoolGoal();
  const goalPct = goal.targetBottles > 0
    ? (goal.currentBottles / goal.targetBottles) * 100
    : 0;
  const unlocked = unlockedAchievements(
    { totalPoints: prof.totalPoints, streakDays: prof.streakDays },
    goalPct,
  );
  const wallet = { coins: prof.coins, ownedTrees: prof.ownedTrees };

  const items = TREE_VARIANTS.map((v) => ({
    id: v.id,
    name: v.name,
    priceCoins: v.priceCoins,
    gate: v.gate ?? null,
    state: itemState(v, wallet, unlocked),
  }));

  return jsonOk({
    coins: prof.coins,
    headlineTree: prof.headlineTree,
    items,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/shop/route.ts
git commit -m "feat(shop): GET /shop catalog + balance + states"
```

---

## Task 9: `POST /api/v1/shop/buy`

**Files:**
- Create: `src/app/api/v1/shop/buy/route.ts`

- [ ] **Step 1: Implement the route**

`src/app/api/v1/shop/buy/route.ts`:

```ts
import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getSchoolGoal } from "@/server/school/repo";
import { buyTree } from "@/server/shop/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  let body: { itemId?: unknown };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (typeof body.itemId !== "string") return jsonError(400, "itemId required");

  const goal = await getSchoolGoal();
  const goalPct = goal.targetBottles > 0
    ? (goal.currentBottles / goal.targetBottles) * 100
    : 0;

  const result = await buyTree(ctx.uid, body.itemId, goalPct);
  if (!result.ok) {
    const status = result.code === "unknown_item" ? 404
      : result.code === "insufficient_coins" ? 402
      : 409;
    return jsonError(status, result.code);
  }
  return jsonOk({ coins: result.coins, ownedTrees: result.ownedTrees });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/shop/buy/route.ts
git commit -m "feat(shop): POST /shop/buy"
```

---

## Task 10: `POST /api/v1/shop/headline`

**Files:**
- Create: `src/app/api/v1/shop/headline/route.ts`

- [ ] **Step 1: Implement the route**

`src/app/api/v1/shop/headline/route.ts`:

```ts
import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { setHeadline } from "@/server/shop/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  let body: { itemId?: unknown };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (typeof body.itemId !== "string") return jsonError(400, "itemId required");

  const result = await setHeadline(ctx.uid, body.itemId);
  if (!result.ok) return jsonError(409, result.code);
  return jsonOk({ headlineTree: body.itemId });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/shop/headline/route.ts
git commit -m "feat(shop): POST /shop/headline"
```

---

## Task 11: Lazy milestone grant on `/me` + manual route verification

**Files:**
- Modify: `src/app/api/v1/me/route.ts`

- [ ] **Step 1: Grant milestones before reading the profile**

In `src/app/api/v1/me/route.ts`, add imports:

```ts
import { getSchoolGoal } from "@/server/school/repo";
import { claimGoalMilestones } from "@/server/shop/repo";
```

Then, after the `isAdminSeed` block and **before** `const prof = await getUser(ctx.uid);`, add:

```ts
  try {
    const goal = await getSchoolGoal();
    await claimGoalMilestones(ctx.uid, goal.currentBottles, goal.targetBottles);
  } catch (err) {
    console.error("milestone claim failed", ctx.uid, err);
  }
```

(The grant busts the user cache, so the following `getUser` reflects any new coins.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification (dev server)**

Run: `npm run dev`, log in as a student, then with the browser devtools or a REST client (using the Firebase ID token as bearer):
- `GET /v1/shop` → returns `coins`, `items[]` with `state` values; `oak` shows `owned`.
- `POST /v1/shop/buy { "itemId": "pine" }` with enough coins → `200`, `coins` decremented; insufficient → `402`; repeat → `409 already_owned`; `willow` without 7-day streak → `409 locked`.
- `POST /v1/shop/headline { "itemId": "pine" }` after owning → `200`; unowned → `409 not_owned`.

Expected: all responses as described. Note any deviation and fix before committing.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/me/route.ts
git commit -m "feat(shop): lazy school-goal milestone grant on /me"
```

---

## Task 12: Client API methods + profile fields

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Extend `StudentProfile`**

In `src/lib/api.ts`, add to the `StudentProfile` interface (after `status: string`):

```ts
  coins?: number
  ownedTrees?: string[]
  headlineTree?: string
```

- [ ] **Step 2: Add shop types + methods**

Append to `src/lib/api.ts` (before the Scan logs section, or at end of Student section):

```ts
// ── Shop ──────────────────────────────────────────────────────
export type ShopItemState = 'owned' | 'locked' | 'tooPoor' | 'buyable'
export interface ShopItem {
  id: string
  name: string
  priceCoins: number
  gate: string | null
  state: ShopItemState
}
export interface ShopResponse {
  coins: number
  headlineTree: string
  items: ShopItem[]
}

export function getShop() {
  return request<ShopResponse>('/shop')
}

export function shopBuy(itemId: string) {
  return request<{ coins: number; ownedTrees: string[] }>('/shop/buy', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  })
}

export function setHeadlineTree(itemId: string) {
  return request<{ headlineTree: string }>('/shop/headline', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  })
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(shop): client api methods + profile fields"
```

---

## Task 13: `TreeVariant` render component (2.5D)

**Files:**
- Create: `src/components/botty/trees/TreeVariant.tsx`

This extends the existing `RankTree` pattern: variant × stage → SVG. 2.5D = an elliptical ground shadow + layered canopy. For Phase 1, each variant reuses the staged silhouette with a distinct palette; the contract (`variantId`, `stage`, `size`) is what later asset work fills in.

- [ ] **Step 1: Implement the component**

`src/components/botty/trees/TreeVariant.tsx`:

```tsx
'use client'

// Palette per tree variant. stage 0-3 mirrors RANK_STAGE in RankTree.tsx.
const PALETTES: Record<string, { trunk: string; dark: string; mid: string; light: string }> = {
  oak:    { trunk: '#5C3A1F', dark: '#0F3D2E', mid: '#1F6E4A', light: '#3FA66B' },
  pine:   { trunk: '#4A3318', dark: '#0C3526', mid: '#1B5E3F', light: '#2E8B57' },
  sakura: { trunk: '#6B4A3A', dark: '#9E4763', mid: '#D97A98', light: '#F4B8CC' },
  willow: { trunk: '#5A4A2A', dark: '#3F5E2F', mid: '#6E8B4A', light: '#A8C97A' },
  aurora: { trunk: '#3A3A5C', dark: '#1F3D6E', mid: '#4A6EA6', light: '#9AD0F4' },
}

export interface TreeVariantProps {
  variantId: string
  stage: number // 0=sapling .. 3=big
  size?: number
}

export function TreeVariant({ variantId, stage, size = 80 }: TreeVariantProps) {
  const p = PALETTES[variantId] ?? PALETTES.oak
  const s = Math.max(0, Math.min(3, stage))
  const scale = size / 80
  // canopy radius grows with stage; trunk height too
  const canopyR = [8, 12, 16, 20][s]
  const trunkH = [10, 18, 26, 34][s]
  const cx = 40
  const groundY = 70

  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <svg width={80 * scale} height={80 * scale} viewBox="0 0 80 80">
        {/* 2.5D ground shadow */}
        <ellipse cx={cx} cy={groundY + 2} rx={canopyR * 1.1} ry={canopyR * 0.32} fill="rgba(0,0,0,0.18)" />
        {/* trunk */}
        <rect x={cx - 3} y={groundY - trunkH} width={6} height={trunkH} rx={2} fill={p.trunk} />
        {/* canopy: layered for depth */}
        <circle cx={cx} cy={groundY - trunkH - canopyR * 0.4} r={canopyR} fill={p.dark} />
        <circle cx={cx - canopyR * 0.5} cy={groundY - trunkH} r={canopyR * 0.7} fill={p.mid} />
        <circle cx={cx + canopyR * 0.5} cy={groundY - trunkH} r={canopyR * 0.7} fill={p.mid} />
        <circle cx={cx} cy={groundY - trunkH - canopyR} r={canopyR * 0.6} fill={p.light} />
        <circle cx={cx - canopyR * 0.4} cy={groundY - trunkH - canopyR * 0.6} r={canopyR * 0.18} fill="#fff" opacity={0.25} />
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/botty/trees/TreeVariant.tsx
git commit -m "feat(shop): 2.5D TreeVariant render component"
```

---

## Task 14: `/shop` page

**Files:**
- Create: `src/app/shop/page.tsx`

Follow the existing client-page pattern (`'use client'`, call `api.*`, render with `theme`). Optimistic buy with rollback on `ApiError`.

- [ ] **Step 1: Implement the page**

`src/app/shop/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { getShop, shopBuy, setHeadlineTree, ApiError, type ShopItem } from '@/lib/api'
import { TreeVariant } from '@/components/botty/trees/TreeVariant'
import { theme as t } from '@/lib/theme'
import BottomNav from '@/components/shared/BottomNav'

const GATE_HINT: Record<string, string> = {
  streak_7: 'ต่อเนื่อง 7 วัน',
  rank_forest: 'ถึงระดับป่าไม้ 🌳',
  goal_half: 'เป้าหมายโรงเรียน 50%',
}

export default function ShopPage() {
  const [coins, setCoins] = useState(0)
  const [headline, setHeadline] = useState('oak')
  const [items, setItems] = useState<ShopItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const r = await getShop()
    setCoins(r.coins); setHeadline(r.headlineTree); setItems(r.items)
  }
  useEffect(() => { load().catch(() => setErr('โหลดร้านค้าไม่สำเร็จ')) }, [])

  async function buy(item: ShopItem) {
    setBusy(item.id); setErr(null)
    try {
      const r = await shopBuy(item.id)
      setCoins(r.coins)
      await load()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'insufficient_coins') setErr('เหรียญไม่พอ')
      else if (e instanceof ApiError && e.code === 'locked') setErr('ยังปลดล็อกไม่ได้')
      else setErr('ซื้อไม่สำเร็จ')
    } finally { setBusy(null) }
  }

  async function choose(item: ShopItem) {
    setBusy(item.id)
    try { await setHeadlineTree(item.id); setHeadline(item.id) }
    catch { setErr('ตั้งต้นไม้ไม่สำเร็จ') }
    finally { setBusy(null) }
  }

  return (
    <main style={{ minHeight: '100vh', background: t.bone, paddingBottom: 110 }}>
      <header style={{ padding: '20px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: t.forest, fontSize: 22, fontWeight: 800, margin: 0 }}>ร้านต้นไม้</h1>
        <span style={{ background: t.mint, color: t.forest, fontWeight: 700, padding: '6px 12px', borderRadius: 20 }}>
          🪙 {coins}
        </span>
      </header>
      {err && <p style={{ color: t.coral, padding: '0 18px', fontSize: 13 }}>{err}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 14 }}>
        {items.map((item) => {
          const isHeadline = headline === item.id
          return (
            <div key={item.id} style={{
              background: 'white', borderRadius: 18, padding: 14,
              border: `2px solid ${isHeadline ? t.moss : t.mint}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              <TreeVariant variantId={item.id} stage={3} size={72} />
              <strong style={{ color: t.ink, fontSize: 14 }}>{item.name}</strong>

              {item.state === 'owned' && (
                <button disabled={isHeadline || busy === item.id} onClick={() => choose(item)}
                  style={btn(isHeadline ? t.muted : t.moss)}>
                  {isHeadline ? 'กำลังใช้' : 'ใช้ต้นนี้'}
                </button>
              )}
              {item.state === 'buyable' && (
                <button disabled={busy === item.id} onClick={() => buy(item)} style={btn(t.moss)}>
                  ซื้อ 🪙{item.priceCoins}
                </button>
              )}
              {item.state === 'tooPoor' && (
                <span style={{ color: t.muted, fontSize: 13 }}>🪙{item.priceCoins}</span>
              )}
              {item.state === 'locked' && (
                <span style={{ color: t.muted, fontSize: 11, textAlign: 'center' }}>
                  🔒 {item.gate ? GATE_HINT[item.gate] ?? 'ล็อก' : 'ล็อก'}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <BottomNav />
    </main>
  )
}

function btn(bg: string): React.CSSProperties {
  return {
    background: bg, color: 'white', border: 'none', borderRadius: 14,
    padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual check**

Run `npm run dev`, visit `/shop`: grid renders trees; buy/use/locked/tooPoor states behave; coin balance updates after a buy.

- [ ] **Step 4: Commit**

```bash
git add src/app/shop/page.tsx
git commit -m "feat(shop): /shop page UI"
```

---

## Task 15: BottomNav shop entry

**Files:**
- Modify: `src/components/shared/BottomNav.tsx` (lines 9-15 + add an icon)

> Note: this makes 6 items around the center scan button. On narrow screens this is tight — acceptable for Phase 1; revisit spacing in Phase 2 if needed.

- [ ] **Step 1: Add the shop item and icon**

In `studentItems`, insert before `/profile`:

```ts
  { href: '/shop',        label: 'ร้านค้า',   icon: ShopIcon },
```

Add the icon component at the bottom of the file (next to the other icons):

```tsx
function ShopIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16l-1 4a3 3 0 01-3 2.5H8A3 3 0 015 11L4 7z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M4 7l1-3h14l1 3M9 21v-5h6v5" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/BottomNav.tsx
git commit -m "feat(shop): add shop entry to BottomNav"
```

---

## Task 16: Home shows headline tree + coin chip

**Files:**
- Modify: `src/app/home/page.tsx`

First inspect the file to find where `RankTree` (or the personal tree) is rendered and where the header/stats sit.

- [ ] **Step 1: Inspect current home rendering**

Run: `npx tsx --eval "0"` is not needed — instead open the file and locate the `RankTree` usage and the profile/`getMe` call.

Read `src/app/home/page.tsx`. Identify: (a) the `getMe()`/profile state, (b) the JSX where the rank tree renders, (c) the rank→stage mapping (`RANK_STAGE` from `RankTree.tsx`).

- [ ] **Step 2: Render the headline variant at the current stage**

Import at the top:

```tsx
import { TreeVariant } from '@/components/botty/trees/TreeVariant'
import { RANK_STAGE } from '@/components/botty/RankTree'
```

Replace the existing `<RankTree rank={...} />` usage with:

```tsx
<TreeVariant
  variantId={profile?.headlineTree ?? 'oak'}
  stage={RANK_STAGE[profile?.rank ?? 'ต้นกล้า'] ?? 0}
  size={120}
/>
```

(If `RANK_STAGE` is not already exported, it is — see `RankTree.tsx` line 3. If `home/page.tsx` previously imported `RankTree` only for the tree and no longer uses it, remove the unused import to satisfy lint.)

- [ ] **Step 3: Add a coin chip near the points/header**

Where the header shows points, add a coin chip beside it:

```tsx
<span style={{ background: t.mint, color: t.forest, fontWeight: 700, padding: '4px 10px', borderRadius: 16, fontSize: 13 }}>
  🪙 {profile?.coins ?? 0}
</span>
```

(Use the page's existing `theme` import alias; add one if absent: `import { theme as t } from '@/lib/theme'`.)

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual check**

`npm run dev` → `/home` shows the headline tree variant at the right stage and the coin balance.

- [ ] **Step 6: Commit**

```bash
git add src/app/home/page.tsx
git commit -m "feat(shop): home shows headline tree + coin balance"
```

---

## Task 17: Class forest renders each student's headline variant

**Files:**
- Modify: `src/components/botty/ClassForest.tsx`
- Investigate: the data source feeding `ClassForest` (leaderboard/forest query) to include `headlineTree`.

> `ClassForest` currently renders per-class islands by stage. Phase 1 minimal hook: when the forest data includes a per-student `headlineTree`, use it; otherwise fall back to `'oak'`. The class-aggregate islands stay as-is — this task wires the *headline tree* through wherever an individual student's tree is shown (e.g., the viewer's own island / "mine").

- [ ] **Step 1: Inspect `ClassForest` and its props**

Read `src/components/botty/ClassForest.tsx` and `src/server/leaderboard/build.ts` / `repo.ts`. Determine where an individual student's tree is drawn vs. the class aggregate. Identify the prop carrying the current user's data.

- [ ] **Step 2: Thread `headlineTree` into the per-student tree**

Where the current user's own tree is rendered inside `ClassForest`, swap the silhouette for:

```tsx
import { TreeVariant } from '@/components/botty/trees/TreeVariant'
// ...
<TreeVariant variantId={mine?.headlineTree ?? 'oak'} stage={stage} size={/* existing size */} />
```

If the leaderboard/forest API does not yet return `headlineTree`, add it: include `headlineTree` in the leaderboard entry built in `src/server/leaderboard/build.ts` (read from the profile) and surface it on `LeaderboardEntry` in `src/lib/api.ts`. If Phase 1 only needs the *viewer's own* variant (already available from `getMe`), pass it down as a prop from the page instead and skip the leaderboard change — prefer this smaller path.

- [ ] **Step 3: Typecheck + lint + existing tests**

Run: `npx tsc --noEmit && npm run lint && npx vitest run src/components/botty`
Expected: no errors; existing `ClassForest`/`RankTree` tests still pass.

- [ ] **Step 4: Manual check**

`/home` or wherever `ClassForest` renders: the viewer's tree reflects their `headlineTree`.

- [ ] **Step 5: Commit**

```bash
git add src/components/botty/ClassForest.tsx src/server/leaderboard/build.ts src/lib/api.ts
git commit -m "feat(shop): class forest renders headline tree variant"
```

---

## Task 18: Full suite + lint gate

**Files:** none (verification).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS, including the new `src/server/shop/*.test.ts`.

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit any fixups**

```bash
git add -A
git commit -m "chore(shop): phase 1 quality gate fixups" || echo "nothing to commit"
```

---

## Self-review notes

- **Spec coverage:** data model (T1), per-scan earning (T2,T4), streak/daily (T2), school-goal milestones (T3,T7,T11), catalog (T5), achievement gates (T5), item-state + buy validation (T6), purchase/headline APIs (T9,T10), shop UI (T14), coin balance surfaced (T14,T16), 2.5D display personal (T16) + class forest (T17), assets/render contract (T13), testing (T2,T3,T5,T6,T18). All covered.
- **Deferred (per spec):** garden placement, decorations, terrain, seasonal — not in any task. Correct.
- **Type consistency:** `coinReward(newStreak,newDaily)` signature identical across earn.ts/award.ts/upload route. `itemState`/`canBuy` share the `Wallet` shape and `Set<AchievementId>`. `ShopItem.state` union matches `ItemState`. `headlineTree`/`ownedTrees` names consistent across Profile, repo, routes, client.
- **Open tuning:** coin/price constants are concrete here but flagged in the spec for a balancing pass.
