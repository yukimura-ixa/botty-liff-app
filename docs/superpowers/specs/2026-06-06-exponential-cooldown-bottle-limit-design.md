# Exponential Cooldown + Bottle-Based Daily Limit

**Date:** 2026-06-06
**Status:** Approved design → implementation
**Scope:** Scan abuse guards in `src/app/api/v1/scan/upload/route.ts` + award counters.

## Goal

Replace the fixed 60s scan cooldown with a per-day exponential backoff (60s base,
×2 each scan, capped 4h), and change the daily cap from 20 *scans* to 10 *bottles*.
Multi-bottle photos already award per detected bottle; keep that and make it the
efficient path (one full photo can fill the day in a single scan).

## Decisions (locked)

| Knob | Value |
|---|---|
| Cooldown | `min(60s × 2^scansToday, 4h)`, resets daily |
| Daily limit | 10 **bottles/day** (sum of awarded itemCount) |
| Per-scan cap | 10 bottles/photo (unchanged, `maxItemsPerScan`) |
| Over-limit scan | **capped to remainder** (partial award, lands exactly at 10) |
| Cooldown exponent source | existing `dailyScans` counter (reset-aware) |

## Counters

Two per-day counters on the user doc, both reset at Bangkok date rollover:

- **`dailyScans`** (exists) — count of awarded scan submissions. Drives the cooldown exponent.
- **`dailyBottles`** (NEW) — sum of awarded `itemCount` (capped per scan). Drives the daily limit.

Reset-aware reads in the upload route:
```
const sameDay = prof.dailyScanDate === localDate;
const scansToday   = sameDay ? (prof.dailyScans   ?? 0) : 0;
const bottlesToday = sameDay ? (prof.dailyBottles ?? 0) : 0;
```

## Exponential cooldown

Pure helper (new), unit-tested:
```ts
// src/server/scan/cooldown.ts
export const COOLDOWN_BASE_MS = 60_000;
export const COOLDOWN_MAX_MS = 14_400_000; // 4h
export function cooldownMs(scansToday: number): number {
  const n = Math.max(0, Math.floor(scansToday));
  if (n === 0) return COOLDOWN_BASE_MS;
  // 60s × 2^n, capped 4h. Guard the shift against overflow for large n.
  if (n >= 18) return COOLDOWN_MAX_MS;
  return Math.min(COOLDOWN_BASE_MS * 2 ** n, COOLDOWN_MAX_MS);
}
```
Sequence after k awarded scans today: scan 2 needs 120s, 3→240s, 4→480s, … scan 9+ → 4h.
First scan of a new day: `scansToday=0` → 60s (overnight gap already clears it).

Upload route cooldown check replaces the fixed `COOLDOWN_MS`:
```
const required = cooldownMs(scansToday);
const wait = required - (Date.now() - last.getTime());
if (wait > 0) return 429 { error:"cooldown", retryAfter: ceil(wait/1000) };
```
Response shape unchanged → existing scan-page cooldown countdown UI works as-is.

## Bottle-based daily limit (true 10 cap)

Pure helper (new), unit-tested:
```ts
// src/server/scan/cooldown.ts (same module)
export const DAILY_BOTTLE_LIMIT = 10;
export function remainingBottles(bottlesToday: number): number {
  return Math.max(0, DAILY_BOTTLE_LIMIT - Math.max(0, Math.floor(bottlesToday)));
}
```

Upload route, student path:
1. If `remainingBottles(bottlesToday) <= 0` → `429 { error:"daily_limit", limit:10 }` (before detector/upload, like today).
2. After detection, compute `allowedItems = min(maxItemsPerScan, remainingBottles(bottlesToday), rawDetectedItems)`.
   - `allowedItems` feeds `calculatePoints` (points = allowedItems) and the `pointedItems` response.
   - At 8 bottles, a 5-bottle photo awards 2 → `dailyBottles` 8→10.

## Award-time counter writes (gate-aware)

`dailyBottles` increments at award time alongside `dailyScans`:

- **`awardScan`** (off/log immediate path) — add `dailyBottles` field to input; `tx.update(userRef, { dailyBottles: <newBottlesToday> })`.
- **`awardFromPending`** (enforce path) — carry `dailyBottles` (the post-award running total) in the pending doc (like `coinReward`) and write it.
- Pending doc (`build.ts`) gains a `dailyBottles` field (the new running total to set), mirroring how `newDailyCount` is carried.

Counters reflect **confirmed** scans, consistent with the staff-QR gate + `hasOutstandingPending` (one pending in flight at a time). Unconfirmed/expired scans don't raise the cooldown — acceptable (no award).

Write semantics: like `dailyScans`, the route computes the new running totals and the award fns set them absolutely (not `FieldValue.increment`), so a reset day starts fresh:
```
newDailyScans   = sameDay ? scansToday + 1 : 1;
newDailyBottles = (sameDay ? bottlesToday : 0) + allowedItems;
```

## Files

| File | Change |
|---|---|
| `src/server/scan/cooldown.ts` | NEW — `cooldownMs`, `remainingBottles`, constants |
| `src/server/scan/cooldown.test.ts` | NEW — exponent growth, 4h cap, reset, remainder |
| `src/app/api/v1/scan/upload/route.ts` | exponential cooldown check; bottle-limit check + `allowedItems` capping; compute `newDailyBottles`; thread into award args + pending |
| `src/server/scan/award.ts` | `awardScan` + `awardFromPending` write `dailyBottles` |
| `src/server/scan/build.ts` | `PendingDocInput` gains `dailyBottles` |
| `src/server/scan/points.ts` | unchanged (cap already 10); `calculatePoints` called with `allowedItems` |

## Out of scope

- Changing the staff-QR gate, coins, detector, or streak.
- Migrating existing user docs (missing `dailyBottles` reads as 0 — safe).
- UI copy beyond what the existing cooldown/daily-limit screens already show
  (they show `retryAfter` and `limit` from the response, which still populate).

## Testing

- `cooldown.test.ts`: `cooldownMs(0)=60s`, `(1)=120s`, `(8)=14400s` cap, `(100)=cap`; `remainingBottles(0)=10`, `(8)=2`, `(10)=0`, `(99)=0`.
- Manual: rapid scans show growing cooldown; 10 bottles in one photo → daily cap reached, next scan blocked; partial-award when crossing 10; both reset next day.
