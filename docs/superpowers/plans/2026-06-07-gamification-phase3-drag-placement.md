# Gamification Phase 3-A — Free Drag Placement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students drag placed garden decorations to free x/y positions (fractional, persisted), cap raised 4→8, with a new authoritative `decorationLayout` field.

**Architecture:** Shared pure helpers (`lib/garden.ts`: slots, `PlacedDecoration`, `defaultSlot`/`defaultLayout`/`clientToFraction`) + server validation (`server/garden/layout.ts`: `validLayout`) + a `setDecorationLayout` repo and `POST /garden/layout` route mirroring the existing display path. `Garden.tsx` renders placed decorations as an absolutely-positioned drag layer over the terrain, moved via Pointer Events (touch-safe in LIFF). `decorationLayout` is authoritative; `displayedDecorations` is written in sync for back-compat.

**Tech Stack:** Next.js 16 App Router, Firebase Admin Firestore, React 19 (Pointer Events), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-gamification-phase3-drag-placement-design.md`
**bd issue:** `botty-uiw`

**Tool note:** repo mandates Serena symbol tools for code reads/edits (CLAUDE.md). Built-in Edit OK for tests + small precise edits; full-file rewrites use Write. Shell is PowerShell; commands cross-shell.

---

## File map

| File | Action |
|---|---|
| `src/lib/garden.ts` | MODIFY — slots 4→8; `PlacedDecoration`, `defaultSlot`, `defaultLayout`, `clientToFraction` |
| `src/lib/garden.test.ts` | CREATE — pure helper tests |
| `src/server/garden/layout.ts` | CREATE — `validLayout` |
| `src/server/garden/layout.test.ts` | CREATE — validation tests |
| `src/server/garden/layout-repo.ts` | CREATE — `setDecorationLayout` |
| `src/server/user/helpers.ts` | MODIFY — `Profile` + default: `decorationLayout` |
| `src/server/user/repo.ts` | MODIFY — `coerceProfile` back-fills layout |
| `src/app/api/v1/garden/layout/route.ts` | CREATE — POST set layout |
| `src/lib/api.ts` | MODIFY — `StudentProfile.decorationLayout`, `setGardenLayout` |
| `src/components/botty/Garden.tsx` | MODIFY — drag layer + pointer handlers |
| `src/app/garden/page.tsx` | MODIFY — layout state + move/toggle |

---

## Task 1: Shared pure helpers (`lib/garden.ts`)

**Files:** Modify `src/lib/garden.ts`; Create `src/lib/garden.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/garden.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  GARDEN_DECORATION_SLOTS, defaultSlot, defaultLayout, clientToFraction,
} from "./garden";

describe("garden slots", () => {
  it("caps placed decorations at 8", () => {
    expect(GARDEN_DECORATION_SLOTS).toBe(8);
  });
});

describe("defaultSlot", () => {
  it("returns fractions in [0,1] across rows of 4", () => {
    for (let i = 0; i < 8; i++) {
      const s = defaultSlot(i);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(1);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(1);
    }
    expect(defaultSlot(0).x).toBeCloseTo(0.125);
    expect(defaultSlot(4).y).toBeGreaterThan(defaultSlot(0).y); // row 2 lower
  });
});

describe("defaultLayout", () => {
  it("positions each id, in order, within [0,1]", () => {
    const out = defaultLayout(["a", "b", "c"]);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(out.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true);
  });
});

describe("clientToFraction", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  it("maps a pointer inside the rect to a fraction", () => {
    expect(clientToFraction(200, 100, rect)).toEqual({ x: 0.5, y: 0.5 });
  });
  it("clamps outside the rect to [0,1]", () => {
    expect(clientToFraction(0, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(clientToFraction(9999, 9999, rect)).toEqual({ x: 1, y: 1 });
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

```bash
npx vitest run src/lib/garden.test.ts
```
Expected: FAIL — `defaultSlot`/`defaultLayout`/`clientToFraction` not exported; slots is 4.

- [ ] **Step 3: Edit `src/lib/garden.ts`**

Replace the whole file with:
```ts
// Shared garden constants + pure layout math (client + server safe — no imports).

// How many decorations a student may place on their garden plot at once.
export const GARDEN_DECORATION_SLOTS = 8;

export type PlacedDecoration = { id: string; x: number; y: number };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

// Default fractional position for the i-th placed decoration: rows of 4,
// spread across the lower garden. Deterministic, always within [0,1].
export function defaultSlot(i: number): { x: number; y: number } {
  const idx = Math.max(0, Math.floor(i));
  const col = idx % 4;
  const rowN = Math.floor(idx / 4);
  const x = (col + 0.5) / 4;            // 0.125, 0.375, 0.625, 0.875
  const y = clamp01(0.45 + rowN * 0.25); // 0.45, 0.70, 0.95...
  return { x, y };
}

// Auto-grid layout for a list of decoration ids (back-fill + tray-add default).
export function defaultLayout(ids: string[]): PlacedDecoration[] {
  return ids.map((id, i) => ({ id, ...defaultSlot(i) }));
}

// Map a pointer's client coords within a rect to a clamped [0,1] fraction.
export function clientToFraction(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  return { x: clamp01(x), y: clamp01(y) };
}
```

- [ ] **Step 4: Run it (expect PASS) + typecheck**

```bash
npx vitest run src/lib/garden.test.ts
npx tsc --noEmit
```
Expected: PASS. `tsc` may flag the garden page's `placed`/slots usage — fixed in Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/lib/garden.ts src/lib/garden.test.ts
git commit -m "feat(garden): slots 4->8 + pure layout/position helpers"
```

---

## Task 2: Server validation (`server/garden/layout.ts`)

**Files:** Create `src/server/garden/layout.ts`, `src/server/garden/layout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/garden/layout.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validLayout } from "./layout";

const owned = ["rock", "bush", "pond", "log_bench"];

describe("validLayout", () => {
  it("accepts a valid layout and passes positions through", () => {
    const layout = [{ id: "rock", x: 0.2, y: 0.5 }, { id: "pond", x: 0.8, y: 0.6 }];
    expect(validLayout(owned, layout, 8)).toEqual({ ok: true, layout });
  });
  it("clamps out-of-range x/y into [0,1]", () => {
    const r = validLayout(owned, [{ id: "rock", x: 1.5, y: -3 }], 8);
    expect(r).toEqual({ ok: true, layout: [{ id: "rock", x: 1, y: 0 }] });
  });
  it("rejects non-array input", () => {
    expect(validLayout(owned, "nope", 8)).toEqual({ ok: false, code: "bad_input" });
  });
  it("rejects entries missing id or non-finite coords", () => {
    expect(validLayout(owned, [{ id: "rock", x: 0.1 }], 8)).toEqual({ ok: false, code: "bad_input" });
    expect(validLayout(owned, [{ id: 5, x: 0.1, y: 0.1 }], 8)).toEqual({ ok: false, code: "bad_input" });
  });
  it("rejects more than the limit", () => {
    const many = Array.from({ length: 9 }, () => ({ id: "rock", x: 0.1, y: 0.1 }));
    expect(validLayout(owned, many, 8)).toEqual({ ok: false, code: "too_many" });
  });
  it("rejects duplicate ids", () => {
    const dup = [{ id: "rock", x: 0.1, y: 0.1 }, { id: "rock", x: 0.2, y: 0.2 }];
    expect(validLayout(owned, dup, 8)).toEqual({ ok: false, code: "duplicate" });
  });
  it("rejects an un-owned id", () => {
    expect(validLayout(owned, [{ id: "statue", x: 0.1, y: 0.1 }], 8))
      .toEqual({ ok: false, code: "not_owned" });
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

```bash
npx vitest run src/server/garden/layout.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/server/garden/layout.ts`**

```ts
// Pure validation for a garden decoration LAYOUT: the positioned items a student
// wants on their plot. Each id must be a deduped subset of what they own, within
// the slot limit; x/y are clamped to [0,1]. Storage-free for direct unit tests.
import type { PlacedDecoration } from "@/lib/garden";

export type LayoutDenyCode = "too_many" | "not_owned" | "duplicate" | "bad_input";
export type LayoutCheck =
  | { ok: true; layout: PlacedDecoration[] }
  | { ok: false; code: LayoutDenyCode };

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function validLayout(owned: string[], layout: unknown, limit: number): LayoutCheck {
  if (!Array.isArray(layout)) return { ok: false, code: "bad_input" };
  const out: PlacedDecoration[] = [];
  for (const entry of layout) {
    if (
      !entry || typeof entry !== "object" ||
      typeof (entry as { id?: unknown }).id !== "string" ||
      !Number.isFinite((entry as { x?: unknown }).x) ||
      !Number.isFinite((entry as { y?: unknown }).y)
    ) {
      return { ok: false, code: "bad_input" };
    }
    const e = entry as { id: string; x: number; y: number };
    out.push({ id: e.id, x: clamp01(e.x), y: clamp01(e.y) });
  }
  if (out.length > limit) return { ok: false, code: "too_many" };
  const ids = out.map((p) => p.id);
  if (new Set(ids).size !== ids.length) return { ok: false, code: "duplicate" };
  const ownedSet = new Set(owned);
  if (!ids.every((id) => ownedSet.has(id))) return { ok: false, code: "not_owned" };
  return { ok: true, layout: out };
}
```

- [ ] **Step 4: Run it (expect PASS) + typecheck**

```bash
npx vitest run src/server/garden/layout.test.ts
npx tsc --noEmit
```
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/garden/layout.ts src/server/garden/layout.test.ts
git commit -m "feat(garden): validLayout decoration-layout validation"
```

---

## Task 3: Profile model — `decorationLayout`

**Files:** Modify `src/server/user/helpers.ts`, `src/server/user/repo.ts`

- [ ] **Step 1: Add the field to `Profile`**

In `src/server/user/helpers.ts`, import the type at the top:
```ts
import type { PlacedDecoration } from "@/lib/garden";
```
In the `Profile` type, after `displayedDecorations: string[];` add:
```ts
  displayedDecorations: string[];
  decorationLayout: PlacedDecoration[];
```

- [ ] **Step 2: Default it in `defaultPendingProfile`**

Where the default object sets `displayedDecorations: [],` add:
```ts
    displayedDecorations: [],
    decorationLayout: [],
```

- [ ] **Step 3: Back-fill in `coerceProfile`**

In `src/server/user/repo.ts`, add the import:
```ts
import { defaultLayout, type PlacedDecoration } from "@/lib/garden";
```
In `coerceProfile`, next to the `displayedDecorations` coercion, add:
```ts
  p.decorationLayout = coerceLayout(raw.decorationLayout, raw.displayedDecorations);
```
And add this module-level helper near the other coerce helpers in the file:
```ts
function coerceLayout(rawLayout: unknown, rawDisplayed: unknown): PlacedDecoration[] {
  if (Array.isArray(rawLayout)) {
    const ok = rawLayout.filter(
      (e): e is PlacedDecoration =>
        !!e && typeof e === "object" &&
        typeof (e as PlacedDecoration).id === "string" &&
        Number.isFinite((e as PlacedDecoration).x) &&
        Number.isFinite((e as PlacedDecoration).y),
    );
    if (ok.length) return ok;
  }
  if (Array.isArray(rawDisplayed) && rawDisplayed.every((x) => typeof x === "string")) {
    return defaultLayout(rawDisplayed as string[]);
  }
  return [];
}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```
Expected: clean (additive; existing consumers unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/server/user/helpers.ts src/server/user/repo.ts
git commit -m "feat(user): decorationLayout profile field with legacy back-fill"
```

---

## Task 4: Layout repo — `setDecorationLayout`

**Files:** Create `src/server/garden/layout-repo.ts`

- [ ] **Step 1: Create the repo**

Mirrors `display-repo.ts`:
```ts
import { fbFirestore } from "@/server/lib/firebase";
import { bust } from "@/server/lib/cache-bus";
import { GARDEN_DECORATION_SLOTS, type PlacedDecoration } from "@/lib/garden";
import { validLayout, type LayoutDenyCode } from "./layout";

export type LayoutResult =
  | { ok: true; decorationLayout: PlacedDecoration[] }
  | { ok: false; code: LayoutDenyCode };

/** Set the positioned decoration layout on the garden plot. Writes the
 *  authoritative `decorationLayout` and keeps `displayedDecorations` (ids) in sync. */
export async function setDecorationLayout(uid: string, layout: unknown): Promise<LayoutResult> {
  const fs = fbFirestore();
  const ref = fs.collection("users").doc(uid);

  const result = await fs.runTransaction<LayoutResult>(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const owned = Array.isArray(d.ownedDecorations) ? (d.ownedDecorations as string[]) : [];
    const verdict = validLayout(owned, layout, GARDEN_DECORATION_SLOTS);
    if (!verdict.ok) return { ok: false, code: verdict.code };
    tx.update(ref, {
      decorationLayout: verdict.layout,
      displayedDecorations: verdict.layout.map((p) => p.id),
      updatedAt: new Date(),
    });
    return { ok: true, decorationLayout: verdict.layout };
  });

  if (result.ok) bust(`user:${uid}`);
  return result;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/server/garden/layout-repo.ts
git commit -m "feat(garden): setDecorationLayout repo"
```

---

## Task 5: Route — `POST /garden/layout`

**Files:** Create `src/app/api/v1/garden/layout/route.ts`

- [ ] **Step 1: Create the route** (mirrors `garden/display/route.ts`)

```ts
import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { setDecorationLayout } from "@/server/garden/layout-repo";

export const runtime = "nodejs";
export const maxDuration = 10;

// Set the positioned decoration layout on the student's garden plot.
export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  let body: { layout?: unknown };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }

  const result = await setDecorationLayout(ctx.uid, body.layout);
  if (!result.ok) {
    const status = result.code === "not_owned" ? 409 : 400;
    return jsonError(status, result.code);
  }
  return jsonOk({ decorationLayout: result.decorationLayout });
}
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npx eslint src/app/api/v1/garden/layout/route.ts
git add src/app/api/v1/garden/layout/route.ts
git commit -m "feat(api): POST /garden/layout"
```

---

## Task 6: Client API

**Files:** Modify `src/lib/api.ts`

- [ ] **Step 1: Add the type import, profile field, and wrapper**

In `src/lib/api.ts`:

(a) At the top, import the shared type:
```ts
import type { PlacedDecoration } from '@/lib/garden'
```
(b) In `StudentProfile`, after `displayedDecorations?: string[]` add:
```ts
  displayedDecorations?: string[]
  decorationLayout?: PlacedDecoration[]
```
(c) After `setGardenDisplay`, add:
```ts
export function setGardenLayout(layout: PlacedDecoration[]) {
  return request<{ decorationLayout: PlacedDecoration[] }>('/garden/layout', {
    method: 'POST',
    body: JSON.stringify({ layout }),
  })
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/api.ts
git commit -m "feat(api-client): decorationLayout + setGardenLayout"
```

---

## Task 7: Garden component — drag layer

**Files:** Modify `src/components/botty/Garden.tsx`

This rewrites the decorations area: the flex row of placed decorations becomes an
absolutely-positioned drag layer over the plot; positions come from `layout`; drag
uses Pointer Events. Trees row + terrain ground/picker are unchanged.

- [ ] **Step 1: Replace the whole file**

Write `src/components/botty/Garden.tsx`:
```tsx
'use client'
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { TreeVariant } from './trees/TreeVariant'
import { Decoration } from './decorations/Decoration'
import { Terrain } from './terrains/Terrain'
import { GARDEN_DECORATION_SLOTS, clientToFraction, type PlacedDecoration } from '@/lib/garden'
import { theme as t } from '@/lib/theme'

export interface GardenProps {
  ownedTrees: string[]
  headlineTree: string
  busy?: string | null
  onSelectHeadline: (id: string) => void
  // Decorations (positioned)
  ownedDecorations: string[]
  layout: PlacedDecoration[]
  decoBusy?: boolean
  onToggleDecoration: (id: string) => void
  onMoveDecoration: (id: string, x: number, y: number) => void
  // Terrain
  ownedTerrains: string[]
  activeTerrain: string
  terrainBusy?: string | null
  onSelectTerrain: (id: string) => void
}

export function Garden({
  ownedTrees, headlineTree, busy, onSelectHeadline,
  ownedDecorations, layout, decoBusy, onToggleDecoration, onMoveDecoration,
  ownedTerrains, activeTerrain, terrainBusy, onSelectTerrain,
}: GardenProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragId = useRef<string | null>(null)
  const placedIds = new Set(layout.map((p) => p.id))
  const full = layout.length >= GARDEN_DECORATION_SLOTS

  function onPointerDown(e: ReactPointerEvent, id: string) {
    dragId.current = id
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: ReactPointerEvent, id: string) {
    if (dragId.current !== id || !surfaceRef.current) return
    const r = surfaceRef.current.getBoundingClientRect()
    const { x, y } = clientToFraction(e.clientX, e.clientY, r)
    onMoveDecoration(id, x, y) // optimistic; page persists on release via committed state
  }
  function onPointerUp(e: ReactPointerEvent, id: string) {
    if (dragId.current !== id) return
    dragId.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    const p = layout.find((q) => q.id === id)
    if (p) onMoveDecoration(id, p.x, p.y) // final commit (page debounced persist)
  }

  return (
    <>
      <div style={plot}>
        <Terrain id={activeTerrain} style={{ borderRadius: 20 }} />
        {/* trees row (top, above terrain) */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={row}>
            {ownedTrees.map((id) => {
              const active = id === headlineTree
              return (
                <button
                  key={id}
                  disabled={active || busy === id}
                  onClick={() => onSelectHeadline(id)}
                  style={treeSlot(active)}
                  aria-label={active ? 'ต้นไม้ที่ใช้อยู่' : 'ใช้ต้นไม้นี้'}
                >
                  <TreeVariant variantId={id} stage={3} size={64} />
                </button>
              )
            })}
          </div>
        </div>
        {/* decoration drag surface fills the plot */}
        <div ref={surfaceRef} style={dragSurface}>
          {layout.length === 0 && (
            <span style={hint}>
              {ownedDecorations.length === 0
                ? 'ซื้อของตกแต่งจากร้านค้าเพื่อแต่งสวน 🌷'
                : 'เลือกของตกแต่งด้านล่างมาวางในสวน'}
            </span>
          )}
          {layout.map((p) => (
            <div
              key={p.id}
              onPointerDown={(e) => onPointerDown(e, p.id)}
              onPointerMove={(e) => onPointerMove(e, p.id)}
              onPointerUp={(e) => onPointerUp(e, p.id)}
              style={{
                position: 'absolute',
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                touchAction: 'none',
                cursor: 'grab',
                lineHeight: 0,
                opacity: decoBusy ? 0.7 : 1,
              }}
            >
              <Decoration id={p.id} size={44} />
            </div>
          ))}
        </div>
      </div>

      {/* manage tray: add/remove which decorations are on the plot */}
      {ownedDecorations.length > 0 && (
        <div style={tray}>
          <p style={trayTitle}>ของตกแต่ง · วางได้ {layout.length}/{GARDEN_DECORATION_SLOTS}</p>
          <div style={chips}>
            {ownedDecorations.map((id) => {
              const on = placedIds.has(id)
              const disabled = decoBusy || (!on && full)
              return (
                <button
                  key={id}
                  disabled={disabled}
                  onClick={() => onToggleDecoration(id)}
                  style={chip(on, disabled)}
                  aria-pressed={on}
                  aria-label={on ? 'นำออกจากสวน' : 'วางในสวน'}
                >
                  <Decoration id={id} size={40} />
                  {on && <span style={check}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* terrain picker — only when student owns more than just grass */}
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
    </>
  )
}

const plot: CSSProperties = {
  position: 'relative',
  background: 'transparent',
  borderRadius: 22,
  padding: '18px 12px 14px',
  border: `2px solid ${t.mint}`,
  minHeight: 240,
  overflow: 'hidden',
}
const dragSurface: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
}
const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'flex-end',
  gap: 6,
}
const hint: CSSProperties = {
  position: 'absolute', left: 0, right: 0, bottom: 16,
  color: t.muted, fontSize: 12, textAlign: 'center',
}

const tray: CSSProperties = { marginTop: 14 }
const trayTitle: CSSProperties = { color: t.forest, fontSize: 13, fontWeight: 700, margin: '0 0 8px' }
const chips: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }

function treeSlot(active: boolean): CSSProperties {
  return {
    background: 'transparent',
    border: active ? `2px solid ${t.moss}` : '2px solid transparent',
    borderRadius: 16,
    padding: 2,
    cursor: active ? 'default' : 'pointer',
  }
}

function chip(on: boolean, disabled: boolean): CSSProperties {
  return {
    position: 'relative',
    background: on ? t.mint : 'white',
    border: `2px solid ${on ? t.moss : t.mint}`,
    borderRadius: 14,
    padding: 4,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled && !on ? 0.45 : 1,
    lineHeight: 0,
  }
}

const check: CSSProperties = {
  position: 'absolute', top: -6, right: -6,
  background: t.moss, color: 'white', borderRadius: 10,
  fontSize: 11, fontWeight: 700, width: 18, height: 18,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
```
Note: the trees row sits at `zIndex: 2`; the drag surface (decorations) at `zIndex: 1` over the terrain. `onMoveDecoration` updates the page's `layout` state on every move (live drag); the page persists on a debounce/commit (Task 8). `touchAction: 'none'` is essential so the LIFF webview doesn't scroll-hijack the drag.

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit && npx eslint src/components/botty/Garden.tsx
```
Expected: the garden page (Garden's only caller) errors on changed props — fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/components/botty/Garden.tsx
git commit -m "feat(garden): pointer-drag decoration layer with fractional positions"
```

---

## Task 8: Garden page — layout state + move/toggle

**Files:** Modify `src/app/garden/page.tsx`

- [ ] **Step 1: Replace imports + the decoration flow**

In `src/app/garden/page.tsx`:

(a) Imports:
```ts
import { useEffect, useRef, useState } from 'react'
import { getMe, setHeadlineTree, setGardenLayout, setActiveTerrain, type StudentProfile } from '@/lib/api'
import { Garden } from '@/components/botty/Garden'
import { GARDEN_DECORATION_SLOTS, defaultSlot, type PlacedDecoration } from '@/lib/garden'
import { theme as t } from '@/lib/theme'
import BottomNav from '@/components/shared/BottomNav'
```

(b) Replace the `placed` useMemo and `toggleDecoration` with a `layout` state synced from `me`, a debounced persist, a move handler, and a toggle that adds/removes:
```ts
  const [layout, setLayout] = useState<PlacedDecoration[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local layout from the profile once loaded.
  useEffect(() => {
    if (me?.decorationLayout) setLayout(me.decorationLayout)
  }, [me?.decorationLayout])

  function persistLayout(next: PlacedDecoration[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setGardenLayout(next).catch(() => setErr('บันทึกการจัดสวนไม่สำเร็จ'))
    }, 350)
  }

  function moveDecoration(id: string, x: number, y: number) {
    setLayout((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, x, y } : p))
      persistLayout(next)
      return next
    })
  }

  function toggleDecoration(id: string) {
    setErr(null)
    setLayout((prev) => {
      const on = prev.some((p) => p.id === id)
      if (!on && prev.length >= GARDEN_DECORATION_SLOTS) return prev // full
      const next = on
        ? prev.filter((p) => p.id !== id)
        : [...prev, { id, ...defaultSlot(prev.length) }]
      persistLayout(next)
      return next
    })
  }
```
Remove the old `placed` memo, `decoBusy` state usage for the toggle is no longer needed (drop `decoBusy` or keep as `false`); keep `selectHeadline` and `selectTerrain` unchanged.

(c) Update the `<Garden>` props:
```tsx
          <Garden
            ownedTrees={me.ownedTrees ?? ['oak']}
            headlineTree={me.headlineTree ?? 'oak'}
            busy={busy}
            onSelectHeadline={selectHeadline}
            ownedDecorations={me.ownedDecorations ?? []}
            layout={layout}
            onToggleDecoration={toggleDecoration}
            onMoveDecoration={moveDecoration}
            ownedTerrains={me.ownedTerrains ?? ['grass']}
            activeTerrain={me.activeTerrain ?? 'grass'}
            terrainBusy={terrainBusy}
            onSelectTerrain={selectTerrain}
          />
```

(d) Update the helper caption text:
```tsx
          <p style={{ color: t.muted, fontSize: 12, textAlign: 'center', marginTop: 10 }}>
            แตะต้นไม้เพื่อใช้เป็นต้นไม้ประจำตัว · ลากของตกแต่งเพื่อจัดวาง
          </p>
```
If `decoBusy` state/`setDecoBusy` becomes unused, remove its `useState` line to keep lint clean.

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit && npx eslint src/app/garden/page.tsx
```
Expected: clean. If lint flags an unused `setGardenDisplay`/`useMemo`/`decoBusy`, remove them.

- [ ] **Step 3: Commit**

```bash
git add src/app/garden/page.tsx
git commit -m "feat(garden): drive plot via decorationLayout (drag + add/remove)"
```

---

## Task 9: Full verification

- [ ] **Step 1: Full gate**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```
Expected: all green (new garden tests included). The `/admin/scan-logs` prerender may fail locally only on empty `NEXT_PUBLIC_FIREBASE_*` — known non-regression, builds on Vercel.

- [ ] **Step 2: Manual (dev login)**

- /garden → drag a decoration; it follows the pointer (mouse + touch); release.
- Reload → position persists.
- Add decorations via tray up to 8; 9th blocked; remove via tray.
- Overlap allowed; terrain ground + tree unaffected; `touchAction:none` keeps the page from scrolling mid-drag.
- Legacy account (only `displayedDecorations`, no `decorationLayout`) → decorations appear auto-gridded, then draggable.

- [ ] **Step 3: Close issue**

```bash
bd close botty-uiw --reason="Phase 3-A free drag placement shipped"
```

---

## Self-review notes

- **Spec coverage:** slots 4→8 (T1); `decorationLayout` model + back-fill (T3); pure `validLayout`/`defaultLayout`/`clientToFraction` (T1–T2); persistence repo+route+client (T4–T6); pointer drag UI (T7); page wiring move/toggle (T8). All spec §1–§7 covered.
- **Type consistency:** `PlacedDecoration = {id,x,y}` defined once in `lib/garden.ts`, imported by `layout.ts` (T2), `helpers.ts`/`repo.ts` (T3), `layout-repo.ts` (T4), `api.ts` (T6), `Garden.tsx` (T7), page (T8). `setGardenLayout(layout)` ↔ `/garden/layout` ↔ `setDecorationLayout` signatures align. `GARDEN_DECORATION_SLOTS` used as the cap in T2 repo, T7/T8 UI.
- **Placeholder scan:** none — full code in every step; the only conditionals (remove unused `decoBusy`/`useMemo`/`setGardenDisplay`) have explicit instructions.
