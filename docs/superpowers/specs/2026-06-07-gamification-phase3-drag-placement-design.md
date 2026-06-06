# Gamification — Phase 3-A: Free Drag Placement

**Date:** 2026-06-07
**Status:** Approved design → implementation
**Phase:** 3, sub-project A (free drag placement). Phases 1, 2, 3-B shipped on main.

## Goal

Let students drag their placed garden decorations to any position on the plot and
have those positions persist. Replaces the fixed flex-row layout with free x/y
placement. Decorations only (the headline tree stays anchored). Plot decoration
cap rises 4 → 8.

## Decisions (locked)

| Knob | Value |
|---|---|
| Draggable | decorations only (tree/terrain unchanged) |
| Cap | 8 placed decorations (`GARDEN_DECORATION_SLOTS` 4→8) |
| Source of truth | new `decorationLayout: {id,x,y}[]` (authoritative); `displayedDecorations` kept in sync = layout ids |
| Coordinates | fractional 0–1 of plot dimensions (responsive) |
| Drag mechanism | Pointer Events (mouse + touch; HTML5 DnD unusable in LIFF webview) |
| Add/remove | existing tap-tray (membership); drag = reposition only; no collision |

## 1. Constants (`src/lib/garden.ts`)

`GARDEN_DECORATION_SLOTS` 4 → 8.

## 2. Data model (additive on `users` doc)

| Field | Type | Purpose | Default |
|---|---|---|---|
| `decorationLayout` | `{ id: string; x: number; y: number }[]` | placed decorations + fractional positions | `[]` |

- `x`, `y` ∈ [0,1] (fraction of plot width/height).
- Authoritative for what's on the plot. `displayedDecorations: string[]` is still
  written (= `layout.map(p => p.id)`) so any existing reader stays consistent, but
  the garden page reads `decorationLayout`.
- `coerceProfile` back-fill (no migration script):
  1. valid `raw.decorationLayout` → use it (clamped/sanitized via `validLayout`);
  2. else legacy `raw.displayedDecorations: string[]` → `defaultLayout(ids)`;
  3. else `[]`.

## 3. Pure logic (`src/server/garden/layout.ts`, mirrors `display.ts`)

```ts
export type PlacedDecoration = { id: string; x: number; y: number };
export type LayoutDenyCode = "too_many" | "not_owned" | "duplicate" | "bad_input";
export type LayoutCheck = { ok: true; layout: PlacedDecoration[] } | { ok: false; code: LayoutDenyCode };

// Validates + sanitizes a requested layout: array of {id,x,y}; ids a deduped
// subset of owned; <= limit; x/y coerced to finite numbers clamped to [0,1].
export function validLayout(owned: string[], layout: unknown, limit: number): LayoutCheck;

// Auto-grid positions for a list of decoration ids (back-fill + tray-add default).
export function defaultLayout(ids: string[]): PlacedDecoration[];
```

- `validLayout` deny codes mirror `validDisplaySelection`: `bad_input` (not an array,
  or any entry missing string `id` / non-finite `x`/`y`), `too_many` (> limit),
  `duplicate` (dup ids), `not_owned` (id ∉ owned). On success, `x`/`y` are clamped
  to [0,1] (out-of-range is sanitized, not rejected).
- `defaultLayout`: lower-garden grid, e.g. up to 4 per row, `x = (col+0.5)/cols`,
  `y` stepped from ~0.55 downward, all within [0,1]. Stable + ≤ limit.

## 4. Persistence

- Repo `setDecorationLayout(uid, layout)` (`display-repo.ts` or sibling
  `layout-repo.ts`): txn reads `ownedDecorations`, runs `validLayout(owned, layout,
  GARDEN_DECORATION_SLOTS)`, writes `decorationLayout` + `displayedDecorations`
  (ids). Mirrors `setDisplayedDecorations`. Returns the sanitized layout or deny code.
- Route `POST /api/v1/garden/layout` `{ layout: {id,x,y}[] }` → 200 `{ decorationLayout }`
  or 409/400 on deny. Mirrors `/garden/display/route.ts`.
- Client `setGardenLayout(layout)` wrapper (`api.ts`); `StudentProfile` gains
  `decorationLayout?: PlacedDecoration[]`.

## 5. Drag UX (`Garden.tsx`)

- The decorations row becomes an **absolute layer** inside the (already relative)
  plot: each placed decoration positioned at `left: x*100%`, `top: y*100%`
  (translate -50% to center), above the terrain layer.
- **Pointer drag**: on a decoration `onPointerDown` → `setPointerCapture` + record
  grab offset; `onPointerMove` → compute new fractional x/y from the pointer
  relative to the plot rect, clamp [0,1], update local state; `onPointerUp` →
  release capture + persist the layout (optimistic; rollback + error on failure).
  A tiny pure helper `clientToFraction(clientXY, rect)` → clamped {x,y} is unit-tested.
- **Tray** (unchanged role): tap to add (drops at the next `defaultLayout` slot not
  already occupied) / remove a decoration from the plot. Label `placed N/8`.
- No collision; free overlap allowed. Trees row + terrain ground/picker unchanged.

## 6. Garden page wiring (`/garden`)

- Replace the `placed`/`displayedDecorations` + `toggleDecoration`/`setGardenDisplay`
  flow with a `layout` state driven by `me.decorationLayout`.
- `onMoveDecoration(id, x, y)` → optimistic local update + `setGardenLayout`.
- `onToggleDecoration(id)` → add (append via `defaultLayout` next slot) or remove,
  then `setGardenLayout`. Optimistic + rollback, same shape as today.

## 7. Testing

- `layout.test.ts`: `validLayout` — rejects non-array/bad entries (`bad_input`),
  over-cap (`too_many`), dup ids (`duplicate`), un-owned (`not_owned`); clamps
  x/y > 1 and < 0 into [0,1]; passes a valid layout. `defaultLayout` — N ids →
  N positions, all in [0,1], ≤ limit, deterministic.
- `clientToFraction` helper — maps pointer px within a rect to clamped fraction.
- Manual (dev login): drag a decoration, release, reload → position persists;
  add up to 8; remove; overlap allowed; terrain/tree unaffected.

## Out of scope

- Dragging trees or terrain. Collision/snapping/grid-lock. Z-order controls,
  rotation, scaling. Layout in class-forest or home (personal garden only).
- Seasonal drops (Phase 3-C), achievement expansion (3-D).

## Compatibility

`decorationLayout` is additive; existing docs back-fill from `displayedDecorations`
at read. The `/garden/display` route + `setGardenDisplay` client remain (unused by
the garden page after this, but harmless) to avoid touching unrelated callers.
