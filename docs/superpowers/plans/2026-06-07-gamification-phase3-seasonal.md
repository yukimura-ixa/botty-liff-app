# Gamification Phase 3-C — Seasonal Drops (Thai festivals) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Time-limited shop items (Thai festival drops) — a catalog item may carry a `season` window; it's hidden from the shop outside the window and shows a countdown while active.

**Architecture:** An optional `season` attribute on `CatalogItem` + pure `isAvailable`/`seasonEndsAt` helpers. The shop list filters out-of-window items and annotates active ones; `buyItem` guards the write. Sample content: 2 seasonal terrains (inline SVG) + 4 festival decorations (rendered via `next/image` from `public/seasonal/*.jpg`). Reuses the Phase 2/3-A/3-B shop/catalog/ownership flows unchanged.

**Tech Stack:** Next.js 16 App Router (`next/image`), Firebase Admin Firestore, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-gamification-phase3-seasonal-design.md`
**bd issue:** `botty-vvc`

**Tool note:** repo mandates Serena symbol tools for code reads/edits (CLAUDE.md). Built-in Edit OK for tests + small edits. Shell is PowerShell; commands cross-shell. Do NOT push.

---

## File map

| File | Action |
|---|---|
| `src/server/shop/catalog.ts` | MODIFY — `season?` on `CatalogItem`; 2 seasonal terrains + 4 festival decorations |
| `src/server/shop/catalog.test.ts` | MODIFY — counts (terrain 8, deco 10), season presence |
| `src/server/shop/season.ts` | CREATE — `isAvailable`, `seasonEndsAt` |
| `src/server/shop/season.test.ts` | CREATE — availability tests |
| `src/server/shop/purchase.ts` | MODIFY — add `unavailable` deny code |
| `src/server/shop/repo.ts` | MODIFY — `buyItem` availability guard |
| `src/components/botty/terrains/Terrain.tsx` | MODIFY — `summer`, `songkran` gradients + accents |
| `src/components/botty/decorations/Decoration.tsx` | MODIFY — JPG asset branch (`next/image`) |
| `src/app/api/v1/shop/route.ts` | MODIFY — filter unavailable + annotate `seasonal`/`seasonEndsAt` |
| `src/lib/api.ts` | MODIFY — `ShopItem` gains `seasonal`/`seasonEndsAt` |
| `src/app/shop/page.tsx` | MODIFY — seasonal badge + sort-first |

---

## Task 1: Catalog — `season` attribute + seasonal items

**Files:** Modify `src/server/shop/catalog.ts`, `src/server/shop/catalog.test.ts`

- [ ] **Step 1: Update the catalog test**

In `src/server/shop/catalog.test.ts`, the terrain-count assertion currently expects 6.
Change it and add season checks. Find:
```ts
    expect(ALL_ITEMS.filter((i) => i.kind === "terrain").length).toBe(6);
```
Replace with:
```ts
    expect(ALL_ITEMS.filter((i) => i.kind === "terrain").length).toBe(8);
    expect(ALL_ITEMS.filter((i) => i.kind === "decoration").length).toBe(10);
```
Add a new test in `describe("catalog integrity", ...)`:
```ts
  it("seasonal items carry a from/until window", () => {
    for (const id of ["summer", "songkran", "teachers_day", "loy_krathong", "mothers_day", "fathers_day"]) {
      const item = findItem(id);
      expect(item?.season?.from).toBeTruthy();
      expect(item?.season?.until).toBeTruthy();
    }
    expect(findItem("grass")?.season).toBeUndefined(); // non-seasonal stays open
  });
```

- [ ] **Step 2: Run it (expect FAIL)**

```bash
npx vitest run src/server/shop/catalog.test.ts
```
Expected: FAIL — counts are 6/6; seasonal ids absent.

- [ ] **Step 3: Edit `catalog.ts`**

Add `season` to the type:
```ts
export type CatalogItem = {
  id: string;
  kind: ItemKind;
  name: string;        // Thai display name
  priceCoins: number;
  gate?: AchievementId; // undefined = buyable once affordable
  season?: { from: string; until: string }; // ISO UTC; absent = always available
};
```
Append the two seasonal terrains to `TERRAINS`:
```ts
  { id: "summer",   kind: "terrain", name: "ชายหาดฤดูร้อน", priceCoins: 60,  season: { from: "2026-04-01T00:00:00Z", until: "2026-08-31T23:59:59Z" } },
  { id: "songkran", kind: "terrain", name: "สงกรานต์",       priceCoins: 70,  season: { from: "2026-04-11T00:00:00Z", until: "2026-04-17T23:59:59Z" } },
```
Append the four festival decorations to `DECORATIONS`:
```ts
  { id: "teachers_day", kind: "decoration", name: "พานไหว้ครู",   priceCoins: 50, season: { from: "2026-01-14T00:00:00Z", until: "2026-01-18T23:59:59Z" } },
  { id: "loy_krathong", kind: "decoration", name: "กระทง",        priceCoins: 80, season: { from: "2026-11-20T00:00:00Z", until: "2026-11-26T23:59:59Z" } },
  { id: "mothers_day",  kind: "decoration", name: "พวงมาลัยมะลิ",  priceCoins: 60, season: { from: "2026-08-08T00:00:00Z", until: "2026-08-16T23:59:59Z" } },
  { id: "fathers_day",  kind: "decoration", name: "ดอกพุทธรักษา",  priceCoins: 60, season: { from: "2026-12-03T00:00:00Z", until: "2026-12-09T23:59:59Z" } },
```

- [ ] **Step 4: Run it (expect PASS) + typecheck**

```bash
npx vitest run src/server/shop/catalog.test.ts
npx tsc --noEmit
```
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/shop/catalog.ts src/server/shop/catalog.test.ts
git commit -m "feat(shop): season attribute + Thai festival seasonal items"
```

---

## Task 2: Pure availability (`season.ts`)

**Files:** Create `src/server/shop/season.ts`, `src/server/shop/season.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/shop/season.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isAvailable, seasonEndsAt } from "./season";
import type { CatalogItem } from "./catalog";

const base: CatalogItem = { id: "x", kind: "decoration", name: "x", priceCoins: 10 };
const seasonal: CatalogItem = {
  ...base, id: "s",
  season: { from: "2026-04-01T00:00:00Z", until: "2026-04-30T23:59:59Z" },
};
const apr15 = Date.parse("2026-04-15T00:00:00Z");
const mar = Date.parse("2026-03-15T00:00:00Z");
const may = Date.parse("2026-05-15T00:00:00Z");

describe("isAvailable", () => {
  it("non-seasonal items are always available", () => {
    expect(isAvailable(base, mar)).toBe(true);
  });
  it("true inside the window", () => {
    expect(isAvailable(seasonal, apr15)).toBe(true);
  });
  it("false before the window", () => {
    expect(isAvailable(seasonal, mar)).toBe(false);
  });
  it("false after the window", () => {
    expect(isAvailable(seasonal, may)).toBe(false);
  });
});

describe("seasonEndsAt", () => {
  it("returns until for seasonal, null otherwise", () => {
    expect(seasonEndsAt(seasonal)).toBe("2026-04-30T23:59:59Z");
    expect(seasonEndsAt(base)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

```bash
npx vitest run src/server/shop/season.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `season.ts`**

```ts
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
```

- [ ] **Step 4: Run it (expect PASS) + typecheck**

```bash
npx vitest run src/server/shop/season.test.ts
npx tsc --noEmit
```
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/shop/season.ts src/server/shop/season.test.ts
git commit -m "feat(shop): isAvailable + seasonEndsAt season helpers"
```

---

## Task 3: Purchase — `unavailable` deny code

**Files:** Modify `src/server/shop/purchase.ts`

- [ ] **Step 1: Add the deny code**

In `src/server/shop/purchase.ts`, widen `BuyDenyCode`:
```ts
export type BuyDenyCode = "already_owned" | "locked" | "insufficient_coins" | "unavailable";
```
(`canBuy` stays time-free; the availability check lives in `buyItem` — Task 4.)

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/server/shop/purchase.ts
git commit -m "feat(shop): add 'unavailable' buy deny code"
```

---

## Task 4: Buy guard (`buyItem`)

**Files:** Modify `src/server/shop/repo.ts`

- [ ] **Step 1: Add the availability guard**

In `src/server/shop/repo.ts`, add the import:
```ts
import { isAvailable } from "./season";
```
In `buyItem`, right after the `findItem` guard (`if (!item) return { ok: false, code: "unknown_item" };`), add:
```ts
  if (!isAvailable(item, Date.now())) return { ok: false, code: "unavailable" };
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: clean. The buy route maps any non-`unknown_item`/non-`insufficient_coins` code to 409, so `unavailable` → 409 with no route change.

- [ ] **Step 3: Commit**

```bash
git add src/server/shop/repo.ts
git commit -m "feat(shop): buyItem rejects out-of-window seasonal items"
```

---

## Task 5: Terrain art — `summer`, `songkran`

**Files:** Modify `src/components/botty/terrains/Terrain.tsx`

- [ ] **Step 1: Add the gradients**

In `src/components/botty/terrains/Terrain.tsx`, add to the `TERRAIN_BG` record:
```ts
  summer:   'linear-gradient(180deg, #FFE08A 0%, #F2C14E 100%)',
  songkran: 'linear-gradient(180deg, #BFE9F5 0%, #7FC8E8 100%)',
```

- [ ] **Step 2: Add accent cases**

In the `accents(id)` switch, add before `default`:
```ts
    case 'summer':
      return <circle cx="80" cy="20" r="8" fill="#FFF3C4" />
    case 'songkran':
      return (
        <>
          <circle cx="22" cy="78" r="3" fill="#FFFFFF" />
          <circle cx="58" cy="86" r="3" fill="#FFFFFF" />
          <circle cx="84" cy="74" r="3" fill="#FFFFFF" />
        </>
      )
```

- [ ] **Step 3: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npx eslint src/components/botty/terrains/Terrain.tsx
git add src/components/botty/terrains/Terrain.tsx
git commit -m "feat(terrains): summer + songkran seasonal grounds"
```

---

## Task 6: Decoration — JPG asset branch (`next/image`)

**Files:** Modify `src/components/botty/decorations/Decoration.tsx`

- [ ] **Step 1: Add the asset map + render branch**

In `src/components/botty/decorations/Decoration.tsx`, add the import:
```ts
import Image from 'next/image'
```
Add a module-level map below the imports:
```ts
// Festival decorations ship as JPG art (public/seasonal/*.jpg) instead of inline SVG.
const SEASONAL_DECORATION_ASSETS: Record<string, string> = {
  teachers_day: '/seasonal/teachers_day.jpg',
  loy_krathong: '/seasonal/loy_krathong.jpg',
  mothers_day: '/seasonal/mothers_day.jpg',
  fathers_day: '/seasonal/fathers_day.jpg',
}
```
At the START of the `Decoration` function body (before the SVG `return`), add:
```ts
export function Decoration({ id, size = 48 }: DecorationProps) {
  const asset = SEASONAL_DECORATION_ASSETS[id]
  if (asset) {
    return (
      <Image
        src={asset}
        alt=""
        width={size}
        height={size}
        style={{ objectFit: 'contain', display: 'inline-block' }}
      />
    )
  }
  const scale = size / 48
  // ...existing SVG return unchanged
```
(Keep the rest of the function — `scale`, the `<svg>` + `shape(id)` — exactly as is.)

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit && npx eslint src/components/botty/decorations/Decoration.tsx
```
Expected: clean. (`next/image` with a `public/` path string needs no static import; missing files only 404 at runtime, not build.)

- [ ] **Step 3: Commit**

```bash
git add src/components/botty/decorations/Decoration.tsx
git commit -m "feat(decorations): render festival decorations from JPG via next/image"
```

---

## Task 7: Shop list route — filter + annotate

**Files:** Modify `src/app/api/v1/shop/route.ts`

- [ ] **Step 1: Filter out-of-window items + annotate active ones**

In `src/app/api/v1/shop/route.ts`, add the import:
```ts
import { isAvailable, seasonEndsAt } from "@/server/shop/season";
```
Replace the `items` build:
```ts
  const items = ALL_ITEMS.map((v) => ({ ... }));
```
with:
```ts
  const now = Date.now();
  const items = ALL_ITEMS
    .filter((v) => isAvailable(v, now))
    .map((v) => ({
      id: v.id,
      kind: v.kind,
      name: v.name,
      priceCoins: v.priceCoins,
      gate: v.gate ?? null,
      state: itemState(v, wallet, unlocked),
      seasonal: !!v.season,
      seasonEndsAt: v.season ? seasonEndsAt(v) : null,
    }));
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npx eslint src/app/api/v1/shop/route.ts
git add src/app/api/v1/shop/route.ts
git commit -m "feat(api): shop hides out-of-window items + annotates seasonal"
```

---

## Task 8: Client API type

**Files:** Modify `src/lib/api.ts`

- [ ] **Step 1: Extend `ShopItem`**

In `src/lib/api.ts`, the `ShopItem` interface gains:
```ts
  state: ShopItemState
  seasonal?: boolean
  seasonEndsAt?: string | null
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/api.ts
git commit -m "feat(api-client): ShopItem seasonal fields"
```

---

## Task 9: Shop page — badge + sort

**Files:** Modify `src/app/shop/page.tsx`

- [ ] **Step 1: Add a days-left helper + sort seasonal first**

In `src/app/shop/page.tsx`, add a module-level helper near the top (after imports):
```ts
function daysLeft(endsAt?: string | null): number {
  if (!endsAt) return 0
  return Math.max(0, Math.ceil((Date.parse(endsAt) - Date.now()) / 86_400_000))
}
```
In the `section` helper, sort the list so seasonal items come first. Change:
```ts
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 14 }}>
          {list.map((item) => {
```
to:
```ts
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 14 }}>
          {[...list].sort((a, b) => Number(!!b.seasonal) - Number(!!a.seasonal)).map((item) => {
```

- [ ] **Step 2: Add the seasonal badge**

In the item card, right after the name `<strong>...</strong>` line, add:
```tsx
                <strong style={{ color: t.ink, fontSize: 14 }}>{item.name}</strong>
                {item.seasonal && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: t.forest,
                    background: t.mint, borderRadius: 999, padding: '2px 8px',
                  }}>
                    ✨ ตามฤดูกาล · เหลือ {daysLeft(item.seasonEndsAt)} วัน
                  </span>
                )}
```

- [ ] **Step 3: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npx eslint src/app/shop/page.tsx
git add src/app/shop/page.tsx
git commit -m "feat(shop): seasonal badge + sort drops first"
```

---

## Task 10: Full verification + asset note

**Files:** none (verification); `public/seasonal/` (human-supplied assets)

- [ ] **Step 1: Full gate**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```
Expected: all green (new season + catalog tests). `/admin/scan-logs` prerender may fail locally only on empty `NEXT_PUBLIC_FIREBASE_*` — known non-regression.

- [ ] **Step 2: Asset handoff note (human, not code)**

Record in the PR/handoff: drop the 4 festival JPGs into `public/seasonal/` —
`teachers_day.jpg`, `loy_krathong.jpg`, `mothers_day.jpg`, `fathers_day.jpg`.
Until present, those decorations render a broken `next/image` (alt empty) but all
window/buy/badge logic works. The 2 seasonal terrains (`summer`, `songkran`) are
SVG and need no asset.

- [ ] **Step 3: Manual (dev login)**

- Shop shows `summer` with `✨ ตามฤดูกาล · เหลือ N วัน`, buyable, sorted first; selectable on /garden.
- Festival decorations + `songkran` are NOT listed now (out of window). Temporarily
  widen one window in `catalog.ts` to confirm it appears with badge + JPG render, then revert.
- Direct API buy of an out-of-window item → 409 `unavailable`.

- [ ] **Step 4: Close issue**

```bash
bd close botty-vvc --reason="Phase 3-C seasonal drops shipped"
```

---

## Self-review notes

- **Spec coverage:** `season` model (T1); pure `isAvailable`/`seasonEndsAt` (T2);
  `unavailable` deny + buy guard (T3–T4); SVG terrains (T5); JPG decorations via
  `next/image` (T6); shop filter+annotate (T7); client type (T8); badge+sort (T9);
  asset handoff (T10). All spec §1–§8 covered.
- **Type consistency:** `season?: {from,until}` defined in `catalog.ts` (T1), consumed
  by `isAvailable`/`seasonEndsAt` (T2), `buyItem` (T4), shop route (T7). `seasonal`/
  `seasonEndsAt` response fields (T7) match `ShopItem` (T8) and shop-page reads (T9).
  `unavailable` added to `BuyDenyCode` (T3) and returned by `buyItem` (T4).
- **Placeholder scan:** none — full code per step; Task 6 keeps the existing SVG body
  verbatim (only prepends the asset branch).
