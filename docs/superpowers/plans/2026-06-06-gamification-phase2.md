# Gamification Phase 2 — Garden + Distinct Tree Art — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each tree variant a distinct silhouette and add a personal "my garden" page where students showcase owned trees and auto-arrange purchasable decorations.

**Architecture:** Generalize the existing Phase-1 tree shop to typed catalog *items* with a `kind` (`tree` | `decoration`), add an additive `ownedDecorations` profile field, generalize the buy transaction/route, rewrite `TreeVariant` into a per-variant silhouette dispatcher, add static decoration SVG components, and add a `/garden` route. All economy logic stays pure + unit-tested; render components follow the project convention of manual verification.

**Tech Stack:** Next.js 16 App Router (Node runtime API routes), React 19, Firebase Admin Firestore, Vitest. Serena symbolic tools for code edits per CLAUDE.md.

**Spec:** `docs/superpowers/specs/2026-06-06-gamification-phase2-design.md`

**Conventions for every task:**
- Use Serena tools (`get_symbols_overview`, `find_symbol`, `replace_symbol_body`, `insert_after_symbol`, `replace_content`) for code edits, not built-in Edit, per CLAUDE.md.
- Run `npm test` for unit steps, `npx tsc --noEmit` + `npm run lint` before each commit that touches TS/TSX.
- Commit messages end with the project trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: Catalog — typed items with `kind` + decorations

**Files:**
- Modify: `src/server/shop/catalog.ts`
- Test: `src/server/shop/catalog.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/server/shop/catalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ALL_ITEMS, TREE_VARIANTS, DECORATIONS, findItem, findVariant } from "./catalog";

const KNOWN_GATES = new Set(["rank_forest", "streak_7", "goal_half"]);

describe("catalog integrity", () => {
  it("has unique ids across every item kind", () => {
    const ids = ALL_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every gate references a known achievement", () => {
    for (const item of ALL_ITEMS) {
      if (item.gate) expect(KNOWN_GATES.has(item.gate)).toBe(true);
    }
  });

  it("tags every tree as kind=tree and every decoration as kind=decoration", () => {
    expect(TREE_VARIANTS.every((i) => i.kind === "tree")).toBe(true);
    expect(DECORATIONS.every((i) => i.kind === "decoration")).toBe(true);
  });

  it("findItem resolves both kinds; findVariant resolves trees only", () => {
    expect(findItem("oak")?.kind).toBe("tree");
    expect(findItem("flower_patch")?.kind).toBe("decoration");
    expect(findVariant("flower_patch")).toBeUndefined();
    expect(findVariant("oak")?.id).toBe("oak");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server/shop/catalog.test.ts`
Expected: FAIL — `DECORATIONS` / `ALL_ITEMS` / `findItem` not exported.

- [ ] **Step 3: Rewrite `catalog.ts`**

Replace the full contents of `src/server/shop/catalog.ts` with:

```ts
import type { AchievementId } from "./achievements";

export type ItemKind = "tree" | "decoration";

export type CatalogItem = {
  id: string;
  kind: ItemKind;
  name: string;        // Thai display name
  priceCoins: number;
  gate?: AchievementId; // undefined = buyable once affordable
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

export const DECORATIONS: CatalogItem[] = [
  { id: "rock",         kind: "decoration", name: "ก้อนหิน",    priceCoins: 25 },
  { id: "flower_patch", kind: "decoration", name: "แปลงดอกไม้", priceCoins: 30 },
  { id: "bush",         kind: "decoration", name: "พุ่มไม้",    priceCoins: 40 },
  { id: "log_bench",    kind: "decoration", name: "ม้านั่งไม้", priceCoins: 70 },
  { id: "pond",         kind: "decoration", name: "บ่อน้ำ",     priceCoins: 90 },
  { id: "statue",       kind: "decoration", name: "รูปปั้นทอง", priceCoins: 150, gate: "rank_forest" },
];

export const ALL_ITEMS: CatalogItem[] = [...TREE_VARIANTS, ...DECORATIONS];

export function findVariant(id: string): CatalogItem | undefined {
  return TREE_VARIANTS.find((v) => v.id === id);
}

export function findItem(id: string): CatalogItem | undefined {
  return ALL_ITEMS.find((v) => v.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/server/shop/catalog.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/shop/catalog.ts src/server/shop/catalog.test.ts
git commit -m "feat(shop): typed catalog items with kind + decorations"
```

---

## Task 2: Purchase logic — owned-check by item kind

**Files:**
- Modify: `src/server/shop/purchase.ts`
- Test: `src/server/shop/purchase.test.ts`

- [ ] **Step 1: Extend the failing test**

Append to `src/server/shop/purchase.test.ts` (and update the two existing fixtures to carry `kind: "tree"`). First update the fixtures at the top:

```ts
const pine: TreeVariant = { id: "pine", kind: "tree", name: "ต้นสน", priceCoins: 40 };
const willow: TreeVariant = { id: "willow", kind: "tree", name: "ต้นหลิว", priceCoins: 120, gate: "streak_7" };
```

Then update the `profile` helper to include decorations and append a decoration suite:

```ts
const profile = (over: Partial<{ coins: number; ownedTrees: string[]; ownedDecorations: string[] }> = {}) => ({
  coins: 0, ownedTrees: ["oak"], ownedDecorations: [], ...over,
});

const pond: TreeVariant = { id: "pond", kind: "decoration", name: "บ่อน้ำ", priceCoins: 90 };
const statue: TreeVariant = { id: "statue", kind: "decoration", name: "รูปปั้นทอง", priceCoins: 150, gate: "rank_forest" };

describe("decoration item-state", () => {
  it("owned when in ownedDecorations (not ownedTrees)", () => {
    expect(itemState(pond, profile({ ownedDecorations: ["pond"] }), new Set())).toBe("owned");
  });
  it("does not treat a decoration as owned just because a same-name tree is owned", () => {
    expect(itemState(pond, profile({ coins: 999, ownedTrees: ["oak", "pond"] }), new Set())).toBe("buyable");
  });
  it("locked decoration when gate unmet", () => {
    expect(itemState(statue, profile({ coins: 999 }), new Set())).toBe("locked");
  });
  it("buyable gated decoration once unlocked + affordable", () => {
    expect(itemState(statue, profile({ coins: 150 }), new Set(["rank_forest"]))).toBe("buyable");
  });
  it("canBuy rejects an already-owned decoration", () => {
    expect(canBuy(pond, profile({ coins: 999, ownedDecorations: ["pond"] }), new Set()))
      .toEqual({ ok: false, code: "already_owned" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server/shop/purchase.test.ts`
Expected: FAIL — decorations resolve against `ownedTrees`; `pond` reads as owned/locked incorrectly.

- [ ] **Step 3: Generalize `purchase.ts`**

Replace the full contents of `src/server/shop/purchase.ts` with:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/server/shop/purchase.test.ts`
Expected: PASS (existing tree suites + new decoration suite).

- [ ] **Step 5: Commit**

```bash
git add src/server/shop/purchase.ts src/server/shop/purchase.test.ts
git commit -m "feat(shop): item-state/canBuy resolve ownership by item kind"
```

---

## Task 3: Profile data model — `ownedDecorations`

**Files:**
- Modify: `src/server/user/helpers.ts` (Profile type + `defaultPendingProfile`)
- Modify: `src/server/user/repo.ts` (`coerceProfile`)

No unit test — `coerceProfile` is private and `repo.ts` imports firebase-admin, so it is verified via typecheck + the `/me` route (project convention: Firestore repos not unit-tested).

- [ ] **Step 1: Add the field to the `Profile` type**

In `src/server/user/helpers.ts`, in the `Profile` type, add after `ownedTrees: string[];`:

```ts
  ownedDecorations: string[];
```

- [ ] **Step 2: Default it in `defaultPendingProfile`**

In the same file, in `defaultPendingProfile`, add after `ownedTrees: ["oak"],`:

```ts
    ownedDecorations: [],
```

- [ ] **Step 3: Coerce it in `coerceProfile`**

In `src/server/user/repo.ts`, inside `coerceProfile`, add after the `p.ownedTrees = …` assignment:

```ts
  p.ownedDecorations = Array.isArray(raw.ownedDecorations)
    ? (raw.ownedDecorations as string[])
    : [];
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/user/helpers.ts src/server/user/repo.ts
git commit -m "feat(user): add ownedDecorations profile field (default [])"
```

---

## Task 4: Purchase repo — generic `buyItem`

**Files:**
- Modify: `src/server/shop/repo.ts`

No unit test (Firestore transaction; verified via buy route).

- [ ] **Step 1: Replace `buyTree` with `buyItem`**

In `src/server/shop/repo.ts`:

Update the import line:

```ts
import { findItem } from "./catalog";
```

Update `BuyResult`:

```ts
export type BuyResult =
  | { ok: true; coins: number; ownedTrees: string[]; ownedDecorations: string[] }
  | { ok: false; code: BuyDenyCode | "unknown_item" };
```

Replace the entire `buyTree` function with:

```ts
/** Atomically spend coins and grant a catalog item (tree or decoration). */
export async function buyItem(uid: string, itemId: string, goalPct: number): Promise<BuyResult> {
  const item = findItem(itemId);
  if (!item) return { ok: false, code: "unknown_item" };
  const fs = fbFirestore();
  const ref = fs.collection("users").doc(uid);

  const result = await fs.runTransaction<BuyResult>(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const wallet = {
      coins: typeof d.coins === "number" ? d.coins : 0,
      ownedTrees: Array.isArray(d.ownedTrees) && d.ownedTrees.length
        ? (d.ownedTrees as string[])
        : ["oak"],
      ownedDecorations: Array.isArray(d.ownedDecorations) ? (d.ownedDecorations as string[]) : [],
    };
    const unlocked = unlockedAchievements(
      { totalPoints: (d.totalPoints as number) ?? 0, streakDays: (d.streakDays as number) ?? 0 },
      goalPct,
    );
    const verdict = canBuy(item, wallet, unlocked);
    if (!verdict.ok) return { ok: false, code: verdict.code };
    const coins = wallet.coins - item.priceCoins;
    const field = item.kind === "decoration" ? "ownedDecorations" : "ownedTrees";
    tx.update(ref, {
      coins,
      [field]: FieldValue.arrayUnion(item.id),
      updatedAt: new Date(),
    });
    return {
      ok: true,
      coins,
      ownedTrees: item.kind === "tree" ? [...wallet.ownedTrees, item.id] : wallet.ownedTrees,
      ownedDecorations:
        item.kind === "decoration" ? [...wallet.ownedDecorations, item.id] : wallet.ownedDecorations,
    };
  });

  if (result.ok) bust(`user:${uid}`);
  return result;
}
```

(`setHeadline` and `claimGoalMilestones` are unchanged. `findVariant` import is no longer used in this file — drop it from the import if present.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `src/app/api/v1/shop/buy/route.ts` (still imports `buyTree`) — fixed in Task 5.

- [ ] **Step 3: Commit** (after Task 5 makes typecheck clean, or commit together with Task 5)

```bash
git add src/server/shop/repo.ts
git commit -m "feat(shop): generic buyItem appends by item kind"
```

---

## Task 5: API routes — buy + shop list

**Files:**
- Modify: `src/app/api/v1/shop/buy/route.ts`
- Modify: `src/app/api/v1/shop/route.ts`

- [ ] **Step 1: Update the buy route**

In `src/app/api/v1/shop/buy/route.ts`:

Change the import:

```ts
import { buyItem } from "@/server/shop/repo";
```

Change the call site:

```ts
  const result = await buyItem(ctx.uid, body.itemId, goalPct);
```

And widen the success response to include decorations:

```ts
  return jsonOk({
    coins: result.coins,
    ownedTrees: result.ownedTrees,
    ownedDecorations: result.ownedDecorations,
  });
```

- [ ] **Step 2: Update the shop list route**

In `src/app/api/v1/shop/route.ts`:

Change the catalog import:

```ts
import { ALL_ITEMS } from "@/server/shop/catalog";
```

Replace the `wallet` and `items` block with:

```ts
  const wallet = {
    coins: prof.coins,
    ownedTrees: prof.ownedTrees,
    ownedDecorations: prof.ownedDecorations,
  };

  const items = ALL_ITEMS.map((v) => ({
    id: v.id,
    kind: v.kind,
    name: v.name,
    priceCoins: v.priceCoins,
    gate: v.gate ?? null,
    state: itemState(v, wallet, unlocked),
  }));
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/shop/buy/route.ts src/app/api/v1/shop/route.ts src/server/shop/repo.ts
git commit -m "feat(shop): buy + list routes serve both item kinds"
```

---

## Task 6: Client API types

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Extend `ShopItem`, `StudentProfile`, `shopBuy`**

In `src/lib/api.ts`:

Add `kind` to `ShopItem`:

```ts
export interface ShopItem {
  id: string
  kind: 'tree' | 'decoration'
  name: string
  priceCoins: number
  gate: string | null
  state: ShopItemState
}
```

Add `ownedDecorations` to `StudentProfile` (after `headlineTree?: string`):

```ts
  ownedDecorations?: string[]
```

Widen the `shopBuy` return type:

```ts
export function shopBuy(itemId: string) {
  return request<{ coins: number; ownedTrees: string[]; ownedDecorations: string[] }>('/shop/buy', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(api): expose item kind + ownedDecorations to client"
```

---

## Task 7: Distinct tree art

**Files:**
- Modify: `src/components/botty/trees/TreeVariant.tsx`

Render component — no unit test; verified by typecheck/lint + manual visual check (project convention).

- [ ] **Step 1: Rewrite `TreeVariant.tsx`**

Replace the full contents with:

```tsx
'use client'
import type { ReactNode } from 'react'

// Palette per tree variant. stage 0-3 mirrors RANK_STAGE in RankTree.tsx.
const PALETTES: Record<string, { trunk: string; dark: string; mid: string; light: string }> = {
  oak:    { trunk: '#5C3A1F', dark: '#0F3D2E', mid: '#1F6E4A', light: '#3FA66B' },
  pine:   { trunk: '#4A3318', dark: '#0C3526', mid: '#1B5E3F', light: '#2E8B57' },
  sakura: { trunk: '#6B4A3A', dark: '#9E4763', mid: '#D97A98', light: '#F4B8CC' },
  willow: { trunk: '#5A4A2A', dark: '#3F5E2F', mid: '#6E8B4A', light: '#A8C97A' },
  aurora: { trunk: '#3A3A5C', dark: '#1F3D6E', mid: '#4A6EA6', light: '#9AD0F4' },
}
type Palette = (typeof PALETTES)[string]

export interface TreeVariantProps {
  variantId: string
  stage: number // 0=sapling .. 3=big
  size?: number
}

export function TreeVariant({ variantId, stage, size = 80 }: TreeVariantProps) {
  const id = variantId in PALETTES ? variantId : 'oak'
  const p = PALETTES[id]
  const s = Math.max(0, Math.min(3, stage))
  const scale = size / 80
  const canopyR = [8, 12, 16, 20][s]
  const trunkH = [10, 18, 26, 34][s]
  const cx = 40
  const groundY = 70
  const topY = groundY - trunkH // top of trunk = canopy anchor

  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <svg width={80 * scale} height={80 * scale} viewBox="0 0 80 80">
        {/* 2.5D ground shadow */}
        <ellipse cx={cx} cy={groundY + 2} rx={canopyR * 1.1} ry={canopyR * 0.32} fill="rgba(0,0,0,0.18)" />
        {/* trunk */}
        <rect x={cx - 3} y={groundY - trunkH} width={6} height={trunkH} rx={2} fill={p.trunk} />
        {/* variant-specific canopy */}
        {canopy(id, p, cx, topY, canopyR)}
      </svg>
    </div>
  )
}

function canopy(id: string, p: Palette, cx: number, topY: number, r: number): ReactNode {
  switch (id) {
    case 'pine':   return pineCanopy(p, cx, topY, r)
    case 'sakura': return sakuraCanopy(p, cx, topY, r)
    case 'willow': return willowCanopy(p, cx, topY, r)
    case 'aurora': return auroraCanopy(p, cx, topY, r)
    default:       return oakCanopy(p, cx, topY, r)
  }
}

function oakCanopy(p: Palette, cx: number, topY: number, r: number): ReactNode {
  return (
    <>
      <circle cx={cx} cy={topY - r * 0.4} r={r} fill={p.dark} />
      <circle cx={cx - r * 0.55} cy={topY} r={r * 0.72} fill={p.mid} />
      <circle cx={cx + r * 0.55} cy={topY} r={r * 0.72} fill={p.mid} />
      <circle cx={cx} cy={topY - r * 1.05} r={r * 0.62} fill={p.light} />
      <circle cx={cx - r * 0.4} cy={topY - r * 0.6} r={r * 0.18} fill="#fff" opacity={0.25} />
    </>
  )
}

function pineCanopy(p: Palette, cx: number, topY: number, r: number): ReactNode {
  const hw = r * 1.25
  const tierH = r * 1.0
  const bottom = topY + r * 0.3
  const tier = (cyBottom: number, halfW: number, fill: string) => (
    <polygon points={`${cx},${cyBottom - tierH} ${cx - halfW},${cyBottom} ${cx + halfW},${cyBottom}`} fill={fill} />
  )
  return (
    <>
      {tier(bottom, hw, p.dark)}
      {tier(bottom - tierH * 0.7, hw * 0.75, p.mid)}
      {tier(bottom - tierH * 1.4, hw * 0.5, p.light)}
    </>
  )
}

function sakuraCanopy(p: Palette, cx: number, topY: number, r: number): ReactNode {
  const pr = r * 0.62
  return (
    <>
      <circle cx={cx} cy={topY - r * 0.3} r={r * 0.9} fill={p.dark} />
      <circle cx={cx - r * 0.7} cy={topY - r * 0.1} r={pr} fill={p.mid} />
      <circle cx={cx + r * 0.7} cy={topY - r * 0.1} r={pr} fill={p.mid} />
      <circle cx={cx - r * 0.3} cy={topY - r * 1.0} r={pr * 0.85} fill={p.light} />
      <circle cx={cx + r * 0.4} cy={topY - r * 0.9} r={pr * 0.8} fill={p.light} />
      {/* drifting petals */}
      <circle cx={cx - r * 1.0} cy={topY + r * 0.4} r={1.4} fill={p.light} />
      <circle cx={cx + r * 0.9} cy={topY + r * 0.7} r={1.2} fill={p.mid} />
    </>
  )
}

function willowCanopy(p: Palette, cx: number, topY: number, r: number): ReactNode {
  const strand = (dx: number, len: number, col: string, key: number) => {
    const x = cx + dx
    return (
      <path
        key={key}
        d={`M ${x} ${topY - r * 0.2} Q ${x + 2} ${topY + len * 0.6} ${x - 1} ${topY + len}`}
        stroke={col}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
    )
  }
  return (
    <>
      <circle cx={cx} cy={topY - r * 0.4} r={r * 0.95} fill={p.dark} />
      <circle cx={cx - r * 0.4} cy={topY - r * 0.3} r={r * 0.6} fill={p.mid} />
      <circle cx={cx + r * 0.4} cy={topY - r * 0.3} r={r * 0.6} fill={p.light} />
      {strand(-r * 0.8, r * 1.3, p.mid, 0)}
      {strand(-r * 0.3, r * 1.6, p.light, 1)}
      {strand(r * 0.3, r * 1.5, p.mid, 2)}
      {strand(r * 0.8, r * 1.2, p.light, 3)}
    </>
  )
}

function auroraCanopy(p: Palette, cx: number, topY: number, r: number): ReactNode {
  const gid = `aurora-grad-${Math.round(r)}`
  const top = topY - r * 1.3
  const bot = topY + r * 0.4
  const hw = r * 0.95
  const midY = topY - r * 0.3
  return (
    <>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.light} />
          <stop offset="100%" stopColor={p.dark} />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={topY - r * 0.4} r={r * 1.25} fill={p.light} opacity={0.25} />
      <polygon points={`${cx},${top} ${cx + hw},${midY} ${cx},${bot} ${cx - hw},${midY}`} fill={`url(#${gid})`} />
      <polygon points={`${cx},${top} ${cx + hw * 0.5},${midY} ${cx},${bot}`} fill={p.mid} opacity={0.6} />
      <circle cx={cx - r * 0.6} cy={top + r * 0.5} r={1.3} fill="#fff" />
      <circle cx={cx + r * 0.7} cy={topY} r={1} fill="#fff" />
      <circle cx={cx} cy={top + r * 0.2} r={1.4} fill="#fff" opacity={0.9} />
    </>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Visual check**

Run `npm run dev`, open `/dev`, log in as a student, open `/shop`. Confirm oak / pine / sakura / willow / aurora now have clearly different silhouettes (round / conical tiers / wispy puffs / drooping strands / crystalline glow). Tune constants if a shape looks off.

- [ ] **Step 4: Commit**

```bash
git add src/components/botty/trees/TreeVariant.tsx
git commit -m "feat(trees): distinct per-variant silhouettes"
```

---

## Task 8: Decoration components

**Files:**
- Create: `src/components/botty/decorations/Decoration.tsx`

Render component — no unit test; verified by typecheck/lint + manual visual check.

- [ ] **Step 1: Create `Decoration.tsx`**

```tsx
'use client'
import type { ReactNode } from 'react'

export interface DecorationProps {
  id: string
  size?: number
}

export function Decoration({ id, size = 48 }: DecorationProps) {
  const scale = size / 48
  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <svg width={48 * scale} height={48 * scale} viewBox="0 0 48 48">
        <ellipse cx={24} cy={40} rx={14} ry={4} fill="rgba(0,0,0,0.15)" />
        {shape(id)}
      </svg>
    </div>
  )
}

function shape(id: string): ReactNode {
  switch (id) {
    case 'rock':
      return (
        <>
          <ellipse cx={24} cy={34} rx={12} ry={8} fill="#8A8F98" />
          <ellipse cx={20} cy={31} rx={5} ry={3.5} fill="#A7ADB6" />
        </>
      )
    case 'flower_patch':
      return (
        <>
          <ellipse cx={24} cy={36} rx={13} ry={5} fill="#3FA66B" />
          {([[16, '#F4B8CC'], [24, '#FFD66B'], [32, '#9AD0F4']] as const).map(([x, c], i) => (
            <g key={i}>
              <line x1={x} y1={36} x2={x} y2={28} stroke="#1F6E4A" strokeWidth={1.4} />
              <circle cx={x} cy={26} r={3} fill={c} />
            </g>
          ))}
        </>
      )
    case 'bush':
      return (
        <>
          <circle cx={18} cy={32} r={8} fill="#1F6E4A" />
          <circle cx={30} cy={32} r={8} fill="#1F6E4A" />
          <circle cx={24} cy={26} r={9} fill="#3FA66B" />
          <circle cx={21} cy={24} r={2} fill="#fff" opacity={0.25} />
        </>
      )
    case 'log_bench':
      return (
        <>
          <rect x={10} y={28} width={28} height={7} rx={3.5} fill="#7A5230" />
          <rect x={10} y={28} width={28} height={3} rx={1.5} fill="#9A6B3F" />
          <rect x={13} y={34} width={3} height={5} fill="#5C3A1F" />
          <rect x={32} y={34} width={3} height={5} fill="#5C3A1F" />
        </>
      )
    case 'pond':
      return (
        <>
          <ellipse cx={24} cy={34} rx={15} ry={8} fill="#4A8FC2" />
          <ellipse cx={24} cy={32} rx={11} ry={5} fill="#7FB8E0" />
          <ellipse cx={20} cy={31} rx={3} ry={1.2} fill="#fff" opacity={0.6} />
        </>
      )
    case 'statue':
      return (
        <>
          <rect x={18} y={32} width={12} height={6} rx={1} fill="#9AA0A8" />
          <rect x={21} y={20} width={6} height={13} rx={2} fill="#C9B27A" />
          <circle cx={24} cy={17} r={4} fill="#E0CB8E" />
          <circle cx={24} cy={17} r={4} fill="none" stroke="#fff" strokeOpacity={0.3} />
        </>
      )
    default:
      return null
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/botty/decorations/Decoration.tsx
git commit -m "feat(decorations): static 2.5D decoration SVGs"
```

---

## Task 9: Garden component

**Files:**
- Create: `src/components/botty/Garden.tsx`

Presentational component (no data fetching) — no unit test; verified via the page in Task 10.

- [ ] **Step 1: Create `Garden.tsx`**

```tsx
'use client'
import type { CSSProperties } from 'react'
import { TreeVariant } from './trees/TreeVariant'
import { Decoration } from './decorations/Decoration'
import { theme as t } from '@/lib/theme'

export interface GardenProps {
  ownedTrees: string[]
  ownedDecorations: string[]
  headlineTree: string
  busy?: string | null
  onSelectHeadline: (id: string) => void
}

export function Garden({ ownedTrees, ownedDecorations, headlineTree, busy, onSelectHeadline }: GardenProps) {
  return (
    <div style={plot}>
      <div style={row}>
        {ownedTrees.map((id) => {
          const active = id === headlineTree
          return (
            <button
              key={id}
              disabled={active || busy === id}
              onClick={() => onSelectHeadline(id)}
              style={treeSlot(active)}
              aria-label={active ? `${id} (กำลังใช้)` : `ใช้ ${id}`}
            >
              <TreeVariant variantId={id} stage={3} size={64} />
            </button>
          )
        })}
      </div>
      <div style={{ ...row, marginTop: 2 }}>
        {ownedDecorations.length === 0 ? (
          <span style={hint}>ซื้อของตกแต่งจากร้านค้าเพื่อแต่งสวน 🌷</span>
        ) : (
          ownedDecorations.map((id) => <Decoration key={id} id={id} size={44} />)
        )}
      </div>
    </div>
  )
}

const plot: CSSProperties = {
  background: `linear-gradient(180deg, ${t.mint} 0%, #CDE9C9 100%)`,
  borderRadius: 22,
  padding: '18px 12px 14px',
  border: `2px solid ${t.mint}`,
  minHeight: 220,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
}
const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'flex-end',
  gap: 6,
}
const hint: CSSProperties = { color: t.muted, fontSize: 12, textAlign: 'center', padding: '14px 0' }

function treeSlot(active: boolean): CSSProperties {
  return {
    background: 'transparent',
    border: active ? `2px solid ${t.moss}` : '2px solid transparent',
    borderRadius: 16,
    padding: 2,
    cursor: active ? 'default' : 'pointer',
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`theme` keys `mint`/`moss`/`muted` already exist — used by shop page.)

- [ ] **Step 3: Commit**

```bash
git add src/components/botty/Garden.tsx
git commit -m "feat(garden): presentational garden plot component"
```

---

## Task 10: Garden page (`/garden`)

**Files:**
- Create: `src/app/garden/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { getMe, setHeadlineTree, type StudentProfile } from '@/lib/api'
import { Garden } from '@/components/botty/Garden'
import { theme as t } from '@/lib/theme'
import BottomNav from '@/components/shared/BottomNav'

export default function GardenPage() {
  const [me, setMe] = useState<StudentProfile | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(() => { getMe().then(setMe).catch(() => setErr('โหลดสวนไม่สำเร็จ')) }, [])

  async function selectHeadline(id: string) {
    setBusy(id)
    try {
      await setHeadlineTree(id)
      setMe((m) => (m ? { ...m, headlineTree: id } : m))
    } catch {
      setErr('ตั้งต้นไม้ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: t.bone, paddingBottom: 110 }}>
      <header style={{ padding: '20px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: t.forest, fontSize: 22, fontWeight: 800, margin: 0 }}>สวนของฉัน</h1>
        <span style={{ background: t.mint, color: t.forest, fontWeight: 700, padding: '6px 12px', borderRadius: 20 }}>
          🪙 {me?.coins ?? 0}
        </span>
      </header>
      {err && <p style={{ color: t.coral, padding: '0 18px', fontSize: 13 }}>{err}</p>}
      {me && (
        <div style={{ padding: 14 }}>
          <Garden
            ownedTrees={me.ownedTrees ?? ['oak']}
            ownedDecorations={me.ownedDecorations ?? []}
            headlineTree={me.headlineTree ?? 'oak'}
            busy={busy}
            onSelectHeadline={selectHeadline}
          />
          <p style={{ color: t.muted, fontSize: 12, textAlign: 'center', marginTop: 10 }}>
            แตะต้นไม้เพื่อใช้เป็นต้นไม้ประจำตัว
          </p>
        </div>
      )}
      <BottomNav />
    </main>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Visual check**

`npm run dev` → `/dev` → student → navigate to `/garden`. Confirm owned trees render, the headline tree shows a ring, tapping another tree updates the ring, decorations row shows owned decorations (or the empty hint for a new student).

- [ ] **Step 4: Commit**

```bash
git add src/app/garden/page.tsx
git commit -m "feat(garden): /garden page wired to profile + headline select"
```

---

## Task 11: BottomNav — add Garden tab

**Files:**
- Modify: `src/components/shared/BottomNav.tsx`

- [ ] **Step 1: Add the nav item + icon**

In `src/components/shared/BottomNav.tsx`, add a Garden entry to `studentItems` after the `/shop` entry:

```ts
  { href: '/garden',      label: 'สวน',      icon: GardenIcon },
```

Add the icon component (next to the other icon functions):

```tsx
function GardenIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3c2.5 2 4 4 4 6.5A4 4 0 018 9.5C8 7 9.5 5 12 3z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M12 13v8M8 21h8" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Visual check**

Confirm the nav now shows a สวน tab and it routes to `/garden` and highlights when active. (Nav holds 7 items; verify it does not overflow on a ~360px-wide viewport — if cramped, reduce icon/label size in a follow-up.)

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/BottomNav.tsx
git commit -m "feat(nav): add garden tab"
```

---

## Task 12: Shop page — group Trees and Decorations

**Files:**
- Modify: `src/app/shop/page.tsx`

- [ ] **Step 1: Render decorations with the decoration component and split sections**

In `src/app/shop/page.tsx`:

Add the import:

```tsx
import { Decoration } from '@/components/botty/decorations/Decoration'
```

Extract a reusable card renderer and render two sections. Replace the single grid block (the `<div style={{ display: 'grid', … }}>…</div>` containing `items.map(...)`) with:

```tsx
      {section('ต้นไม้', items.filter((i) => i.kind === 'tree'))}
      {section('ของตกแต่ง', items.filter((i) => i.kind === 'decoration'))}
```

…where `section` is a local helper defined inside the component body (it closes over `headline`, `busy`, `buy`, `choose`):

```tsx
  function section(title: string, list: ShopItem[]) {
    if (list.length === 0) return null
    return (
      <section>
        <h2 style={{ color: t.forest, fontSize: 15, fontWeight: 700, padding: '8px 18px 0', margin: 0 }}>{title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 14 }}>
          {list.map((item) => {
            const isHeadline = item.kind === 'tree' && headline === item.id
            return (
              <div key={item.id} style={{
                background: 'white', borderRadius: 18, padding: 14,
                border: `2px solid ${isHeadline ? t.moss : t.mint}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}>
                {item.kind === 'tree'
                  ? <TreeVariant variantId={item.id} stage={3} size={72} />
                  : <Decoration id={item.id} size={64} />}
                <strong style={{ color: t.ink, fontSize: 14 }}>{item.name}</strong>

                {item.state === 'owned' && item.kind === 'tree' && (
                  <button disabled={isHeadline || busy === item.id} onClick={() => choose(item)}
                    style={btn(isHeadline ? t.muted : t.moss)}>
                    {isHeadline ? 'กำลังใช้' : 'ใช้ต้นนี้'}
                  </button>
                )}
                {item.state === 'owned' && item.kind === 'decoration' && (
                  <span style={{ color: t.moss, fontSize: 13, fontWeight: 700 }}>✓ มีแล้ว</span>
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
      </section>
    )
  }
```

(Keep the existing `GATE_HINT`, `buy`, `choose`, `btn`, and the header unchanged.)

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Visual check**

`/shop` now shows a ต้นไม้ section (trees, with Set/Buy/locked badges) and a ของตกแต่ง section (decorations previewed via `Decoration`, with Buy/owned/locked/tooPoor). Buy a decoration, then open `/garden` and confirm it appears.

- [ ] **Step 4: Commit**

```bash
git add src/app/shop/page.tsx
git commit -m "feat(shop): split Trees/Decorations sections with decoration previews"
```

---

## Task 13: Full verification + dev seed refresh

**Files:** none (verification only) — optional `scripts/seed-dev.ts` note.

- [ ] **Step 1: Full test + typecheck + lint + build**

Run:
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```
Expected: all green. (A local `npm run build` may fail prerender only if `NEXT_PUBLIC_FIREBASE_*` are unset — that is an env issue, not a code regression; confirm the error references missing Firebase env, not the new code.)

- [ ] **Step 2: Optional — give dev accounts decorations**

The dev seed (`scripts/seed-dev.ts`) writes profiles but no `ownedDecorations`, so seeded accounts start with an empty garden (valid — coerced to `[]`). To showcase decorations in dev, optionally add an `ownedDecorations` field to seeded students (e.g. a couple of decoration ids) in `src/server/dev/accounts.ts` + write it in `seed-dev.ts`. This is a dev-data change run by the user (prod-project write, blocked for the agent):
```bash
npx tsx scripts/seed-dev.ts --apply
```

- [ ] **Step 3: Manual end-to-end (LIFF/dev login)**

`/dev` → student → `/shop`: buy a tree and a decoration → `/garden`: decoration shows, tree silhouettes distinct, tap tree sets headline → `/leaderboard`: class forest reflects the chosen headline variant.

---

## Self-review notes

- **Spec coverage:** distinct tree art (Task 7), garden trees+decorations auto-fill (Tasks 9–10), decoration shop kind (Tasks 1–6, 12), `ownedDecorations` model (Task 3), generalized buy/list API (Tasks 4–6), BottomNav entry (Task 11), tests for catalog integrity + decoration purchase (Tasks 1–2). `coerceProfile` default is covered by typecheck + `/me` integration per project convention (repos not unit-tested), noted in Task 3.
- **Type consistency:** `CatalogItem` (with `kind`) flows through `catalog.ts` → `purchase.ts` → `repo.ts` (`buyItem`) → routes → `api.ts` (`ShopItem.kind`, `shopBuy` return, `StudentProfile.ownedDecorations`). `TreeVariant` kept as a back-compat alias so Phase-1 imports/tests still compile.
- **Out of scope (Phase 3):** drag placement / stored positions, terrain skins, seasonal drops.
```
