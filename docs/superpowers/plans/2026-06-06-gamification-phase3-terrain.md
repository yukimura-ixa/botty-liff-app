# Gamification Phase 3-B — Terrain / Ground Skins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buyable garden ground skins — a student owns terrains (free `grass`), selects one `activeTerrain` that renders behind their trees/decorations on `/garden` and their own `/home`.

**Architecture:** Terrain is a third catalog `kind` reusing the Phase 2 shop/catalog/purchase/buy foundation. Two additive profile fields (`ownedTerrains`, `activeTerrain`) mirror `ownedTrees`/`headlineTree`. A new presentational `terrains/` art module mirrors `trees/` and `decorations/`. Render integration is personal-only (garden + home), never class-forest.

**Tech Stack:** Next.js 16 App Router, Firebase Admin Firestore, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-gamification-phase3-terrain-design.md`
**bd issue:** `botty-g0d`.

**Tool note:** repo mandates Serena symbol tools for code reads/edits (CLAUDE.md) — `get_symbols_overview`/`find_symbol` to read, `replace_symbol_body`/`replace_content`/`insert_after_symbol` to edit. Built-in Edit acceptable for tests and small precise edits. Shell is PowerShell; commands are cross-shell.

---

## File map

| File | Action |
|---|---|
| `src/server/shop/catalog.ts` | MODIFY — `ItemKind` += `terrain`, add `TERRAINS`, extend `ALL_ITEMS` |
| `src/server/shop/catalog.test.ts` | MODIFY — terrain assertions |
| `src/server/shop/purchase.ts` | MODIFY — `ownedArr` terrain, `Wallet.ownedTerrains?` |
| `src/server/shop/purchase.test.ts` | MODIFY — terrain owned/locked cases |
| `src/server/shop/repo.ts` | MODIFY — `buyItem` terrain field+return; new `setActiveTerrain` |
| `src/server/user/helpers.ts` | MODIFY — `Profile` + defaults: `ownedTerrains`, `activeTerrain` |
| `src/server/user/repo.ts` | MODIFY — `coerceProfile` back-fills both |
| `src/app/api/v1/shop/route.ts` | MODIFY — wallet `ownedTerrains` |
| `src/app/api/v1/shop/buy/route.ts` | MODIFY — return `ownedTerrains` |
| `src/app/api/v1/shop/terrain/route.ts` | CREATE — set active terrain |
| `src/lib/api.ts` | MODIFY — `ShopItem.kind`, `StudentProfile` fields, `setActiveTerrain`, buy resp |
| `src/components/botty/terrains/Terrain.tsx` | CREATE — dispatcher + 6 ground renderers |
| `src/components/botty/Garden.tsx` | MODIFY — terrain ground layer + picker |
| `src/app/garden/page.tsx` | MODIFY — wire terrain props + select handler |
| `src/app/home/page.tsx` | MODIFY — terrain ground behind home tree |
| `src/app/shop/page.tsx` | MODIFY — Terrains section + terrain preview |

---

## Task 1: Catalog — terrain kind + items

**Files:** Modify `src/server/shop/catalog.ts`, `src/server/shop/catalog.test.ts`

- [ ] **Step 1: Extend the catalog test**

In `src/server/shop/catalog.test.ts`, update the import to add `TERRAINS`:
```ts
import { ALL_ITEMS, TREE_VARIANTS, DECORATIONS, TERRAINS, findItem, findVariant } from "./catalog";
```
Add a test inside `describe("catalog integrity", ...)`:
```ts
  it("tags every terrain as kind=terrain and includes a free grass default", () => {
    expect(TERRAINS.every((i) => i.kind === "terrain")).toBe(true);
    const grass = TERRAINS.find((i) => i.id === "grass");
    expect(grass?.priceCoins).toBe(0);
    expect(grass?.gate).toBeUndefined();
    expect(findItem("cosmic")?.kind).toBe("terrain");
    expect(ALL_ITEMS.filter((i) => i.kind === "terrain").length).toBe(6);
  });
```

- [ ] **Step 2: Run it (expect FAIL)**

```bash
npx vitest run src/server/shop/catalog.test.ts
```
Expected: FAIL — `TERRAINS` not exported.

- [ ] **Step 3: Edit `catalog.ts`**

Change the kind union:
```ts
export type ItemKind = "tree" | "decoration" | "terrain";
```
Add `TERRAINS` after `DECORATIONS`:
```ts
// grass is the free default every student owns from onboarding.
export const TERRAINS: CatalogItem[] = [
  { id: "grass",  kind: "terrain", name: "สนามหญ้า",  priceCoins: 0 },
  { id: "sand",   kind: "terrain", name: "ชายหาด",    priceCoins: 40 },
  { id: "meadow", kind: "terrain", name: "ทุ่งดอกไม้", priceCoins: 60 },
  { id: "autumn", kind: "terrain", name: "ใบไม้ร่วง",  priceCoins: 90 },
  { id: "snow",   kind: "terrain", name: "ลานหิมะ",    priceCoins: 120, gate: "streak_7" },
  { id: "cosmic", kind: "terrain", name: "ห้วงอวกาศ",  priceCoins: 200, gate: "rank_forest" },
];
```
Extend `ALL_ITEMS`:
```ts
export const ALL_ITEMS: CatalogItem[] = [...TREE_VARIANTS, ...DECORATIONS, ...TERRAINS];
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
git commit -m "feat(shop): terrain catalog items (6, grass free)"
```

---

## Task 2: Profile model — `ownedTerrains` + `activeTerrain`

**Files:** Modify `src/server/user/helpers.ts`, `src/server/user/repo.ts`

- [ ] **Step 1: Add fields to `Profile`**

In `src/server/user/helpers.ts`, in the `Profile` type after `headlineTree: string;` add:
```ts
  headlineTree: string;
  ownedTerrains: string[];
  activeTerrain: string;
```

- [ ] **Step 2: Default them in `defaultPendingProfile`**

In the same file, where the default object sets `headlineTree: "oak",` add:
```ts
    headlineTree: "oak",
    ownedTerrains: ["grass"],
    activeTerrain: "grass",
```

- [ ] **Step 3: Back-fill in `coerceProfile`**

In `src/server/user/repo.ts`, in `coerceProfile`, next to the existing array/string coercions (near `p.ownedDecorations`/`p.headlineTree`), add:
```ts
  p.ownedTerrains = Array.isArray(raw.ownedTerrains) && raw.ownedTerrains.length
    ? (raw.ownedTerrains as string[])
    : ["grass"];
  p.activeTerrain = typeof raw.activeTerrain === "string" ? raw.activeTerrain : "grass";
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```
Expected: clean (existing `Profile` consumers don't break — fields are additive with defaults).

- [ ] **Step 5: Commit**

```bash
git add src/server/user/helpers.ts src/server/user/repo.ts
git commit -m "feat(user): ownedTerrains + activeTerrain profile fields"
```

---

## Task 3: Purchase — terrain ownership

**Files:** Modify `src/server/shop/purchase.ts`, `src/server/shop/purchase.test.ts`

- [ ] **Step 1: Extend the purchase test**

In `src/server/shop/purchase.test.ts`, after the `pond`/`statue` fixtures add terrain fixtures:
```ts
const sand: CatalogItem = { id: "sand", kind: "terrain", name: "ชายหาด", priceCoins: 40 };
const cosmic: CatalogItem = { id: "cosmic", kind: "terrain", name: "ห้วงอวกาศ", priceCoins: 200, gate: "rank_forest" };
```
Update the `profile` helper's `Partial<...>` generic to include `ownedTerrains` and default it:
```ts
const profile = (over: Partial<{ coins: number; ownedTrees: string[]; ownedDecorations: string[]; ownedTerrains: string[] }> = {}) => ({
  coins: 0, ownedTrees: ["oak"], ownedDecorations: [], ownedTerrains: ["grass"], ...over,
});
```
Add a `describe`:
```ts
describe("terrain purchase", () => {
  it("owned when in ownedTerrains", () => {
    expect(itemState(sand, profile({ ownedTerrains: ["grass", "sand"] }), new Set())).toBe("owned");
  });
  it("buyable when affordable", () => {
    expect(itemState(sand, profile({ coins: 40 }), new Set())).toBe("buyable");
  });
  it("locked behind its gate", () => {
    expect(itemState(cosmic, profile({ coins: 999 }), new Set())).toBe("locked");
    expect(itemState(cosmic, profile({ coins: 999 }), new Set(["rank_forest"]))).toBe("buyable");
  });
  it("canBuy rejects an already-owned terrain", () => {
    expect(canBuy(sand, profile({ coins: 99, ownedTerrains: ["grass", "sand"] }), new Set()))
      .toEqual({ ok: false, code: "already_owned" });
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

```bash
npx vitest run src/server/shop/purchase.test.ts
```
Expected: FAIL — terrain `itemState` reads `ownedTrees` (the `else` branch), so `sand`/`cosmic` mis-evaluate.

- [ ] **Step 3: Edit `purchase.ts`**

Update the `Wallet` type and `ownedArr`:
```ts
type Wallet = { coins: number; ownedTrees: string[]; ownedDecorations?: string[]; ownedTerrains?: string[] };

function ownedArr(item: CatalogItem, w: Wallet): string[] {
  if (item.kind === "decoration") return w.ownedDecorations ?? [];
  if (item.kind === "terrain") return w.ownedTerrains ?? [];
  return w.ownedTrees;
}
```

- [ ] **Step 4: Run it (expect PASS) + typecheck**

```bash
npx vitest run src/server/shop/purchase.test.ts
npx tsc --noEmit
```
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/shop/purchase.ts src/server/shop/purchase.test.ts
git commit -m "feat(shop): purchase logic handles terrain ownership"
```

---

## Task 4: Buy repo + `setActiveTerrain`

**Files:** Modify `src/server/shop/repo.ts`

- [ ] **Step 1: Generalize `buyItem` for terrain**

In `src/server/shop/repo.ts`:

(a) Widen `BuyResult`:
```ts
export type BuyResult =
  | { ok: true; coins: number; ownedTrees: string[]; ownedDecorations: string[]; ownedTerrains: string[] }
  | { ok: false; code: BuyDenyCode | "unknown_item" };
```

(b) In `buyItem`'s transaction, add `ownedTerrains` to the read `wallet`:
```ts
      ownedDecorations: Array.isArray(d.ownedDecorations) ? (d.ownedDecorations as string[]) : [],
      ownedTerrains: Array.isArray(d.ownedTerrains) && d.ownedTerrains.length
        ? (d.ownedTerrains as string[])
        : ["grass"],
```

(c) Replace the `field` line:
```ts
    const field = item.kind === "decoration" ? "ownedDecorations"
      : item.kind === "terrain" ? "ownedTerrains"
      : "ownedTrees";
```

(d) Add `ownedTerrains` to the success return:
```ts
      ownedDecorations:
        item.kind === "decoration" ? [...wallet.ownedDecorations, item.id] : wallet.ownedDecorations,
      ownedTerrains:
        item.kind === "terrain" ? [...wallet.ownedTerrains, item.id] : wallet.ownedTerrains,
```

- [ ] **Step 2: Add `setActiveTerrain` repo helper**

After `setHeadline` in the same file, add (mirrors `setHeadline`):
```ts
export type TerrainResult = { ok: true } | { ok: false; code: "not_owned" };

/** Set the active terrain; must already be owned. */
export async function setActiveTerrain(uid: string, terrainId: string): Promise<TerrainResult> {
  const fs = fbFirestore();
  const ref = fs.collection("users").doc(uid);
  const result = await fs.runTransaction<TerrainResult>(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const owned = Array.isArray(d.ownedTerrains) && d.ownedTerrains.length
      ? (d.ownedTerrains as string[]) : ["grass"];
    if (!owned.includes(terrainId)) return { ok: false, code: "not_owned" };
    tx.update(ref, { activeTerrain: terrainId, updatedAt: new Date() });
    return { ok: true };
  });
  if (result.ok) bust(`user:${uid}`);
  return result;
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: the buy route (returns `result.ownedTerrains`) is fixed in Task 5; if only that errors, proceed.

- [ ] **Step 4: Commit**

```bash
git add src/server/shop/repo.ts
git commit -m "feat(shop): buyItem grants terrain + setActiveTerrain repo"
```

---

## Task 5: Routes — shop list wallet, buy return, terrain select

**Files:** Modify `src/app/api/v1/shop/route.ts`, `src/app/api/v1/shop/buy/route.ts`; Create `src/app/api/v1/shop/terrain/route.ts`

- [ ] **Step 1: Shop list — include `ownedTerrains` in the wallet**

In `src/app/api/v1/shop/route.ts`, the `wallet` object:
```ts
  const wallet = {
    coins: prof.coins,
    ownedTrees: prof.ownedTrees,
    ownedDecorations: prof.ownedDecorations,
    ownedTerrains: prof.ownedTerrains,
  };
```
And include `activeTerrain` in the response (for the shop's owned-terrain highlight + parity with `headlineTree`):
```ts
  return jsonOk({ coins: prof.coins, headlineTree: prof.headlineTree, activeTerrain: prof.activeTerrain, items });
```

- [ ] **Step 2: Buy route — return `ownedTerrains`**

In `src/app/api/v1/shop/buy/route.ts`, the success `jsonOk`:
```ts
  return jsonOk({
    coins: result.coins,
    ownedTrees: result.ownedTrees,
    ownedDecorations: result.ownedDecorations,
    ownedTerrains: result.ownedTerrains,
  });
```

- [ ] **Step 3: Create the terrain-select route**

Create `src/app/api/v1/shop/terrain/route.ts` (mirrors `shop/headline/route.ts`):
```ts
import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { setActiveTerrain } from "@/server/shop/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  let body: { terrainId?: unknown };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (typeof body.terrainId !== "string") return jsonError(400, "terrainId required");

  const result = await setActiveTerrain(ctx.uid, body.terrainId);
  if (!result.ok) return jsonError(409, result.code);
  return jsonOk({ activeTerrain: body.terrainId });
}
```

- [ ] **Step 4: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npx eslint src/app/api/v1/shop/route.ts src/app/api/v1/shop/buy/route.ts src/app/api/v1/shop/terrain/route.ts
git add src/app/api/v1/shop/route.ts src/app/api/v1/shop/buy/route.ts src/app/api/v1/shop/terrain/route.ts
git commit -m "feat(api): shop terrain in wallet/buy + POST /shop/terrain select"
```

---

## Task 6: Client API

**Files:** Modify `src/lib/api.ts`

- [ ] **Step 1: Extend types + add the wrapper**

In `src/lib/api.ts`:

(a) `ShopItem.kind`:
```ts
  kind: 'tree' | 'decoration' | 'terrain'
```

(b) `StudentProfile` — add after `ownedDecorations?`:
```ts
  ownedTerrains?: string[]
  activeTerrain?: string
```

(c) `shopBuy` return type — add `ownedTerrains`:
```ts
  return request<{ coins: number; ownedTrees: string[]; ownedDecorations: string[]; ownedTerrains: string[] }>('/shop/buy', {
```

(d) After `setHeadlineTree`, add:
```ts
export function setActiveTerrain(terrainId: string) {
  return request<{ activeTerrain: string }>('/shop/terrain', {
    method: 'POST',
    body: JSON.stringify({ terrainId }),
  })
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/api.ts
git commit -m "feat(api-client): terrain kind + setActiveTerrain wrapper"
```

---

## Task 7: Terrain art module

**Files:** Create `src/components/botty/terrains/Terrain.tsx`

- [ ] **Step 1: Create the dispatcher + 6 renderers**

Create `src/components/botty/terrains/Terrain.tsx`. Each renderer returns a full-bleed ground layer (CSS gradient + a few SVG accents), cheap. The component fills its parent (`position: absolute; inset: 0`) so callers place it behind content.
```tsx
'use client'
import type { CSSProperties, ReactNode } from 'react'

export interface TerrainProps {
  id: string
  style?: CSSProperties
}

// Each terrain is a focused ground layer: a base gradient + optional SVG accents.
const TERRAIN_BG: Record<string, string> = {
  grass:  'linear-gradient(180deg, #BFE6B6 0%, #CDE9C9 100%)',
  sand:   'linear-gradient(180deg, #F3E2B3 0%, #E8D29A 100%)',
  meadow: 'linear-gradient(180deg, #C9E8A8 0%, #E7F0BE 100%)',
  autumn: 'linear-gradient(180deg, #E9C79A 0%, #D8A06A 100%)',
  snow:   'linear-gradient(180deg, #EAF2FA 0%, #D4E4F2 100%)',
  cosmic: 'linear-gradient(180deg, #2B2350 0%, #4B3A78 100%)',
}

function accents(id: string): ReactNode {
  switch (id) {
    case 'meadow':
      return (
        <>
          <circle cx="22" cy="78" r="3" fill="#F4A8C0" />
          <circle cx="60" cy="84" r="3" fill="#F7D154" />
          <circle cx="84" cy="74" r="3" fill="#F4A8C0" />
        </>
      )
    case 'autumn':
      return (
        <>
          <path d="M18 74l4 4-4 4-4-4z" fill="#C75B2A" />
          <path d="M70 80l4 4-4 4-4-4z" fill="#E08A3C" />
        </>
      )
    case 'snow':
      return (
        <>
          <circle cx="24" cy="76" r="2" fill="#ffffff" />
          <circle cx="58" cy="86" r="2" fill="#ffffff" />
          <circle cx="82" cy="72" r="2" fill="#ffffff" />
        </>
      )
    case 'cosmic':
      return (
        <>
          <circle cx="20" cy="30" r="1.5" fill="#FFFFFF" />
          <circle cx="74" cy="22" r="1.5" fill="#CDB7FF" />
          <circle cx="50" cy="46" r="1.5" fill="#FFFFFF" />
          <circle cx="88" cy="54" r="1.5" fill="#CDB7FF" />
        </>
      )
    case 'sand':
      return <path d="M0 88q25 -6 50 0t50 0" stroke="#D9BE80" strokeWidth="2" fill="none" />
    default:
      return null // grass: plain gradient
  }
}

export function Terrain({ id, style }: TerrainProps) {
  const bg = TERRAIN_BG[id] ?? TERRAIN_BG.grass
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg, overflow: 'hidden', ...style }} aria-hidden>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        {accents(id)}
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit && npx eslint src/components/botty/terrains/Terrain.tsx
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/botty/terrains/Terrain.tsx
git commit -m "feat(terrains): 6 ground-skin renderers + dispatcher"
```

---

## Task 8: Garden component — terrain ground + picker

**Files:** Modify `src/components/botty/Garden.tsx`

- [ ] **Step 1: Add props + import**

In `src/components/botty/Garden.tsx`, import the terrain component:
```ts
import { Terrain } from './terrains/Terrain'
```
Extend `GardenProps` (after the decoration props):
```ts
  // Terrain
  ownedTerrains: string[]
  activeTerrain: string
  terrainBusy?: string | null
  onSelectTerrain: (id: string) => void
```
And the destructure:
```ts
export function Garden({
  ownedTrees, headlineTree, busy, onSelectHeadline,
  ownedDecorations, placed, decoBusy, onToggleDecoration,
  ownedTerrains, activeTerrain, terrainBusy, onSelectTerrain,
}: GardenProps) {
```

- [ ] **Step 2: Render the terrain as the plot ground**

Make the `plot` container position-relative and drop its hard-coded gradient (the terrain provides it). Change the `plot` style const:
```ts
const plot: CSSProperties = {
  position: 'relative',
  background: 'transparent',
  borderRadius: 22,
  padding: '18px 12px 14px',
  border: `2px solid ${t.mint}`,
  minHeight: 220,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  overflow: 'hidden',
}
```
Inside `<div style={plot}>`, as the FIRST child (before the trees row), add the ground layer + ensure content sits above it by wrapping rows in a relative/zIndex layer. Concretely, immediately after `<div style={plot}>` insert:
```tsx
        <Terrain id={activeTerrain} style={{ borderRadius: 20 }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, gap: 6 }}>
```
and add a matching closing `</div>` right before the plot's closing `</div>` (i.e. wrap the existing trees-row + decorations-row in this relative layer).

- [ ] **Step 3: Add the terrain picker tray**

After the decorations manage-tray block (the `{ownedDecorations.length > 0 && ( ... )}` block), add a terrain picker (only when the student owns more than just grass — otherwise nothing to pick):
```tsx
      {ownedTerrains.length > 1 && (
        <div style={tray}>
          <p style={trayTitle}>พื้นสวน</p>
          <div style={chips}>
            {ownedTerrains.map((id) => {
              const on = id === activeTerrain
              return (
                <button
                  key={id}
                  disabled={on || terrainBusy === id}
                  onClick={() => onSelectTerrain(id)}
                  style={{ ...chip(on, terrainBusy === id), width: 56, height: 40, overflow: 'hidden' }}
                  aria-pressed={on}
                  aria-label={on ? 'พื้นที่ใช้อยู่' : 'ใช้พื้นนี้'}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Terrain id={id} style={{ borderRadius: 10 }} />
                  </div>
                  {on && <span style={check}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Typecheck + lint**

```bash
npx tsc --noEmit && npx eslint src/components/botty/Garden.tsx
```
Expected: clean. (Garden's only caller is the garden page, updated in Task 9 — a missing-prop tsc error there is expected and fixed next.)

- [ ] **Step 5: Commit**

```bash
git add src/components/botty/Garden.tsx
git commit -m "feat(garden): terrain ground layer + terrain picker"
```

---

## Task 9: Garden page — wire terrain

**Files:** Modify `src/app/garden/page.tsx`

- [ ] **Step 1: Add import + select handler + busy state**

In `src/app/garden/page.tsx`, extend the api import:
```ts
import { getMe, setHeadlineTree, setGardenDisplay, setActiveTerrain, type StudentProfile } from '@/lib/api'
```
Add a busy state next to the others:
```ts
  const [terrainBusy, setTerrainBusy] = useState<string | null>(null)
```
Add a handler next to `selectHeadline` (same optimistic/rollback shape):
```ts
  async function selectTerrain(id: string) {
    setErr(null)
    const prev = me?.activeTerrain ?? 'grass'
    setTerrainBusy(id)
    setMe((m) => (m ? { ...m, activeTerrain: id } : m)) // optimistic
    try {
      await setActiveTerrain(id)
    } catch {
      setMe((m) => (m ? { ...m, activeTerrain: prev } : m)) // rollback
      setErr('ตั้งพื้นสวนไม่สำเร็จ')
    } finally {
      setTerrainBusy(null)
    }
  }
```

- [ ] **Step 2: Pass the new props to `<Garden>`**

```tsx
          <Garden
            ownedTrees={me.ownedTrees ?? ['oak']}
            headlineTree={me.headlineTree ?? 'oak'}
            busy={busy}
            onSelectHeadline={selectHeadline}
            ownedDecorations={me.ownedDecorations ?? []}
            placed={placed}
            decoBusy={decoBusy}
            onToggleDecoration={toggleDecoration}
            ownedTerrains={me.ownedTerrains ?? ['grass']}
            activeTerrain={me.activeTerrain ?? 'grass'}
            terrainBusy={terrainBusy}
            onSelectTerrain={selectTerrain}
          />
```

- [ ] **Step 3: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npx eslint src/app/garden/page.tsx
git add src/app/garden/page.tsx
git commit -m "feat(garden): wire active terrain select"
```

---

## Task 10: Home — terrain ground behind the tree

**Files:** Modify `src/app/home/page.tsx`

- [ ] **Step 1: Import Terrain**

Add near the other botty imports:
```ts
import { Terrain } from "@/components/botty/terrains/Terrain";
```

- [ ] **Step 2: Wrap the home tree with a terrain pad**

Find the home tree render:
```tsx
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <TreeVariant
              variantId={profile?.headlineTree ?? 'oak'}
              stage={RANK_STAGE[profile?.rank ?? 'ต้นกล้า'] ?? 0}
              size={120}
            />
```
Replace the `<TreeVariant .../>` with a relative wrapper that puts a small terrain pad behind the tree:
```tsx
            <div style={{ position: "relative", width: 120, height: 120, borderRadius: 16, overflow: "hidden", flexShrink: 0 }}>
              <Terrain id={profile?.activeTerrain ?? 'grass'} style={{ borderRadius: 16 }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <TreeVariant
                  variantId={profile?.headlineTree ?? 'oak'}
                  stage={RANK_STAGE[profile?.rank ?? 'ต้นกล้า'] ?? 0}
                  size={120}
                />
              </div>
            </div>
```

- [ ] **Step 3: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npx eslint src/app/home/page.tsx
git add src/app/home/page.tsx
git commit -m "feat(home): active terrain ground behind home tree"
```

---

## Task 11: Shop page — Terrains section

**Files:** Modify `src/app/shop/page.tsx`

- [ ] **Step 1: Import Terrain + render terrain previews**

In `src/app/shop/page.tsx` add:
```ts
import { Terrain } from '@/components/botty/terrains/Terrain'
```
In the `section` helper's preview switch (currently `item.kind === 'tree' ? <TreeVariant.../> : <Decoration.../>`), handle three kinds. Replace that ternary with:
```tsx
                {item.kind === 'tree'
                  ? <TreeVariant variantId={item.id} stage={3} size={72} />
                  : item.kind === 'decoration'
                  ? <Decoration id={item.id} size={64} />
                  : <div style={{ position: 'relative', width: 72, height: 56, borderRadius: 12, overflow: 'hidden' }}>
                      <Terrain id={item.id} style={{ borderRadius: 12 }} />
                    </div>}
```

- [ ] **Step 2: Add the Terrains section**

Where the two sections render:
```tsx
      {section('ต้นไม้', items.filter((i) => i.kind === 'tree'))}
      {section('ของตกแต่ง', items.filter((i) => i.kind === 'decoration'))}
```
add a third:
```tsx
      {section('พื้นสวน', items.filter((i) => i.kind === 'terrain'))}
```
(Owned terrains show the standard "owned" state; selecting the active terrain lives on `/garden`. No headline-style action needed in the shop.)

- [ ] **Step 3: Typecheck + lint + visual check**

```bash
npx tsc --noEmit && npx eslint src/app/shop/page.tsx
```
Expected: clean. If the shop page reads `shopBuy`'s return and destructures `ownedTrees`/`ownedDecorations` into local state, also thread `ownedTerrains` through that state update so a just-bought terrain appears owned without a reload (check the buy handler in this file; mirror the existing owned-array update).

- [ ] **Step 4: Commit**

```bash
git add src/app/shop/page.tsx
git commit -m "feat(shop): Terrains section with ground-skin previews"
```

---

## Task 12: Full verification + dev seed

**Files:** Optionally `src/server/dev/accounts.ts`

- [ ] **Step 1: Full gate**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```
Expected: all green (the `/admin/scan-logs` prerender may fail locally only due to empty `NEXT_PUBLIC_FIREBASE_*` — same known non-regression noted on Phase 1/2; builds on Vercel).

- [ ] **Step 2: Optional — give dev accounts terrains**

If `src/server/dev/accounts.ts` seeds `ownedDecorations`/`ownedTrees` for dev login, add a couple terrains (e.g. `ownedTerrains: ["grass", "sand", "meadow"]`, `activeTerrain: "meadow"`) to at least one dev account so the picker is exercisable. Follow the existing seed shape; commit:
```bash
git add src/server/dev/accounts.ts
git commit -m "chore(dev): seed terrains on a dev account"
```

- [ ] **Step 3: Manual end-to-end (dev login)**

- Shop → Terrains section shows 6, grass owned, gated ones locked until achievement, buy with coins.
- Garden → terrain ground renders; picker appears once >1 owned; tap switches active (optimistic), persists across reload.
- Home → ground pad behind the tree reflects active terrain.
- Class-forest unchanged.

- [ ] **Step 4: Close issue**

```bash
bd close botty-g0d --reason="Phase 3-B terrain skins shipped"
```

---

## Self-review notes

- **Spec coverage:** catalog 6 terrains + kind (T1); profile `ownedTerrains`/`activeTerrain` + back-fill (T2); purchase ownership (T3); buy grant + select repo (T4); routes wallet/buy/select (T5); client api (T6); art module (T7); garden ground+picker (T8–T9); home ground (T10); shop section (T11). All §1–§10 covered.
- **Type consistency:** `ownedTerrains: string[]` and `activeTerrain: string` used identically across Profile (T2), Wallet (T3), BuyResult (T4), routes (T5), StudentProfile (T6), Garden props (T8), page wiring (T9). `setActiveTerrain` signature matches repo (T4) ↔ route (T5) ↔ client (T6) ↔ page (T9). `Terrain({ id, style })` contract identical across T7 consumers (T8/T10/T11).
- **Placeholder scan:** none — every code step has full code. The only conditional (T11 step 3 shop-buy local-state thread) gives exact instructions tied to the existing pattern.
