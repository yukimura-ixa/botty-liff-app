# Exponential Cooldown + Bottle-Based Daily Limit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 60s scan cooldown with a per-day exponential backoff (60s × 2^scansToday, capped 4h, reset daily), and change the daily cap from 20 scans to 10 bottles/day with cap-to-remainder on the crossing scan.

**Architecture:** A new pure module `src/server/scan/cooldown.ts` holds `cooldownMs` + `remainingBottles` + constants (unit-tested). The upload route consumes them: reset-aware counters `scansToday`/`bottlesToday`, exponential cooldown check, bottle-limit check, and `allowedItems` capping that feeds points + the new `dailyBottles` running total. `dailyBottles` is carried through the pending doc and written by both award paths, exactly like the existing `dailyScans`/`coinReward`.

**Tech Stack:** Next.js 16 Node route, Firebase Admin Firestore, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-exponential-cooldown-bottle-limit-design.md`
**bd issue:** `botty-6ar`

**Tool note:** repo mandates Serena symbol tools for code reads/edits (CLAUDE.md). Use `get_symbols_overview`/`find_symbol` before editing and `replace_symbol_body`/`replace_content`/`insert_after_symbol` to edit. Built-in Edit only where Serena can't express the change. Shell is PowerShell; commands below are cross-shell.

**Locked decisions:** cooldown `min(60s × 2^scansToday, 4h)` reset daily · daily limit 10 **bottles** (sum awarded itemCount) · per-scan cap stays 10 · over-limit scan capped to remainder · counters written at award time (gate-aware).

---

## File map

| File | Action |
|---|---|
| `src/server/scan/cooldown.ts` | NEW — `cooldownMs`, `remainingBottles`, constants |
| `src/server/scan/cooldown.test.ts` | NEW — unit tests |
| `src/server/scan/build.ts` | MODIFY — `PendingDocInput` gains `dailyBottles` |
| `src/server/scan/award.ts` | MODIFY — `awardScan` + `awardFromPending` write `dailyBottles` |
| `src/app/api/v1/scan/upload/route.ts` | MODIFY — exponential cooldown + bottle limit + `allowedItems` + thread `dailyBottles` |

---

## Task 1: Pure cooldown + bottle-limit helpers

**Files:**
- Create: `src/server/scan/cooldown.ts`
- Test: `src/server/scan/cooldown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/scan/cooldown.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  cooldownMs, remainingBottles,
  COOLDOWN_BASE_MS, COOLDOWN_MAX_MS, DAILY_BOTTLE_LIMIT,
} from "./cooldown";

describe("cooldownMs", () => {
  it("starts at base and doubles per scan", () => {
    expect(cooldownMs(0)).toBe(60_000);
    expect(cooldownMs(1)).toBe(120_000);
    expect(cooldownMs(2)).toBe(240_000);
    expect(cooldownMs(3)).toBe(480_000);
  });
  it("caps at 4 hours", () => {
    expect(cooldownMs(8)).toBe(COOLDOWN_MAX_MS);   // 60s*256 = 15360s > 14400s
    expect(cooldownMs(20)).toBe(COOLDOWN_MAX_MS);
    expect(cooldownMs(1000)).toBe(COOLDOWN_MAX_MS); // no overflow
  });
  it("clamps negatives / floors fractionals", () => {
    expect(cooldownMs(-5)).toBe(COOLDOWN_BASE_MS);
    expect(cooldownMs(1.9)).toBe(120_000);
  });
  it("exposes 4h as the max constant", () => {
    expect(COOLDOWN_MAX_MS).toBe(14_400_000);
  });
});

describe("remainingBottles", () => {
  it("counts down from the daily limit", () => {
    expect(DAILY_BOTTLE_LIMIT).toBe(10);
    expect(remainingBottles(0)).toBe(10);
    expect(remainingBottles(8)).toBe(2);
    expect(remainingBottles(10)).toBe(0);
    expect(remainingBottles(99)).toBe(0);
    expect(remainingBottles(-3)).toBe(10);
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

```bash
npx vitest run src/server/scan/cooldown.test.ts
```
Expected: FAIL — module `./cooldown` does not exist.

- [ ] **Step 3: Implement `cooldown.ts`**

Create `src/server/scan/cooldown.ts`:
```ts
// Per-day scan throttle: cooldown grows exponentially with the number of scans
// already awarded today, capped at 4h. Daily allowance is counted in bottles.

export const COOLDOWN_BASE_MS = 60_000;        // 60s
export const COOLDOWN_MAX_MS = 14_400_000;     // 4h
export const DAILY_BOTTLE_LIMIT = 10;

/** Required gap before the next scan: min(60s * 2^scansToday, 4h). */
export function cooldownMs(scansToday: number): number {
  const n = Math.max(0, Math.floor(scansToday));
  // 60s * 2^18 already exceeds 4h; short-circuit so the shift can't overflow.
  if (n >= 18) return COOLDOWN_MAX_MS;
  return Math.min(COOLDOWN_BASE_MS * 2 ** n, COOLDOWN_MAX_MS);
}

/** Bottles a student may still earn today (>= 0). */
export function remainingBottles(bottlesToday: number): number {
  return Math.max(0, DAILY_BOTTLE_LIMIT - Math.max(0, Math.floor(bottlesToday)));
}
```

- [ ] **Step 4: Run it (expect PASS)**

```bash
npx vitest run src/server/scan/cooldown.test.ts
npx tsc --noEmit
```
Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/scan/cooldown.ts src/server/scan/cooldown.test.ts
git commit -m "feat(scan): exponential cooldown + bottle-limit helpers"
```

---

## Task 2: `build.ts` — pending doc carries `dailyBottles`

**Files:**
- Modify: `src/server/scan/build.ts`
- Test: `src/server/scan/build.test.ts`

- [ ] **Step 1: Extend the build test**

In `src/server/scan/build.test.ts`, inside the existing `describe("buildPendingDoc", ...)`, add an assertion to the first test (`carries coinReward and a 5-minute expiry`): add `dailyBottles: 4` to the input object and assert `expect(doc.dailyBottles).toBe(4);`. The full input now includes both `coinReward: 5` and `dailyBottles: 4`.

- [ ] **Step 2: Run it (expect FAIL)**

```bash
npx vitest run src/server/scan/build.test.ts
```
Expected: FAIL — `dailyBottles` is not a known property of `PendingDocInput` (tsc error in the test) or the assertion fails.

- [ ] **Step 3: Add the field to `PendingDocInput`**

In `src/server/scan/build.ts`, in `PendingDocInput`, add `dailyBottles` right after `newDailyCount`:
```ts
  newDailyCount: number;
  dailyBottles: number;
```
`PendingDoc = PendingDocInput & {...}` and `buildPendingDoc` spread all input fields, so no other change is needed.

- [ ] **Step 4: Run it (expect PASS)**

```bash
npx vitest run src/server/scan/build.test.ts
npx tsc --noEmit
```
Expected: build tests PASS. `tsc` now flags the `buildPendingDoc` caller in the upload route missing `dailyBottles` — fixed in Task 4. If only that site errors, proceed.

- [ ] **Step 5: Commit**

```bash
git add src/server/scan/build.ts src/server/scan/build.test.ts
git commit -m "feat(scan): pending doc carries dailyBottles running total"
```

---

## Task 3: `award.ts` — both award paths write `dailyBottles`

**Files:**
- Modify: `src/server/scan/award.ts`
- Test: `src/server/scan/award.test.ts`

- [ ] **Step 1: Extend the award test**

In `src/server/scan/award.test.ts`, the existing `pending` fixture and `AwardFromScanInput` usage drive `awardFromPending`. Add `dailyBottles: 6` to the `pending` fixture object, and add a new test asserting the user update sets it:
```ts
it("sets dailyBottles from the pending running total", async () => {
  await awardFromPending("u1", pending, "pend1");
  const userUpdate = updates.find((d) => "dailyScans" in d);
  expect(userUpdate!.dailyBottles).toBe(6);
});
```
(The `updates` capture array + mocks already exist in this file from the coins test.)

- [ ] **Step 2: Run it (expect FAIL)**

```bash
npx vitest run src/server/scan/award.test.ts
```
Expected: FAIL — `dailyBottles` is undefined in the user update (and a tsc error that `dailyBottles` isn't on `PendingDoc` is impossible here since Task 2 added it; the failure is the missing write).

- [ ] **Step 3: Write `dailyBottles` in both award paths**

In `src/server/scan/award.ts`:

(a) `AwardFromScanInput` type — add `newDailyBottles: number;` after `newDaily`:
```ts
  newStreak: number;
  newDaily: number;
  newDailyBottles: number;
  newRank: string;
```

(b) In `awardScan`'s `tx.update(userRef, {...})`, add after `dailyScans: i.newDaily,`:
```ts
      dailyScans: i.newDaily,
      dailyBottles: i.newDailyBottles,
```

(c) In `awardFromPending`'s `tx.update(userRef, {...})`, add after `dailyScans: p.newDailyCount,`:
```ts
      dailyScans: p.newDailyCount,
      dailyBottles: p.dailyBottles,
```

- [ ] **Step 4: Run it (expect PASS)**

```bash
npx vitest run src/server/scan/award.test.ts
npx tsc --noEmit
```
Expected: award tests PASS. `tsc` now flags the `awardScan` caller (upload route) missing `newDailyBottles` — fixed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/server/scan/award.ts src/server/scan/award.test.ts
git commit -m "feat(scan): award paths write dailyBottles counter"
```

---

## Task 4: Upload route — exponential cooldown, bottle limit, capping

**Files:**
- Modify: `src/app/api/v1/scan/upload/route.ts`

- [ ] **Step 1: Add imports + drop the dead constants**

At the top of `src/app/api/v1/scan/upload/route.ts`, add:
```ts
import { cooldownMs, remainingBottles } from "@/server/scan/cooldown";
```
Remove the now-unused module constants `const COOLDOWN_MS = 60_000;` and `const DAILY_LIMIT = 20;` (they are replaced below; leaving them causes an unused-var lint error).

- [ ] **Step 2a: Add `dailyBottles` to the `Profile` type + defaults**

`Profile` (in `src/server/user/helpers.ts`) has `dailyScans`/`dailyScanDate` but no `dailyBottles`. Add it right after `dailyScans`:
```ts
  dailyScans: number;
  dailyBottles: number;
  dailyScanDate: string;
```
In the same file, `defaultPendingProfile` initializes `dailyScans: 0,` — add `dailyBottles: 0,` next to it.

In `src/server/user/repo.ts`, `coerceProfile` does `{ ...raw } as Profile` then coerces a few fields (e.g. `p.coins = typeof raw.coins === "number" ? raw.coins : 0;`). Add the same runtime-safe default for the new field next to the `coins` line:
```ts
  p.dailyBottles = typeof raw.dailyBottles === "number" ? raw.dailyBottles : 0;
```
This makes existing user docs (without the field) read as `0`.

- [ ] **Step 2b: Compute reset-aware counters before the guards**

In the student path of the upload route, immediately before the cooldown `if (prof.lastScanAt) {` block, insert:
```ts
  const sameDay = prof.dailyScanDate === localDate;
  const scansToday = sameDay ? (prof.dailyScans ?? 0) : 0;
  const bottlesToday = sameDay ? (prof.dailyBottles ?? 0) : 0;
```

- [ ] **Step 3: Replace the fixed-cooldown check**

Replace:
```ts
  if (prof.lastScanAt) {
    const last = prof.lastScanAt instanceof Date ? prof.lastScanAt : new Date(prof.lastScanAt as unknown as string);
    const wait = COOLDOWN_MS - (Date.now() - last.getTime());
    if (wait > 0) {
```
with:
```ts
  if (prof.lastScanAt) {
    const last = prof.lastScanAt instanceof Date ? prof.lastScanAt : new Date(prof.lastScanAt as unknown as string);
    const wait = cooldownMs(scansToday) - (Date.now() - last.getTime());
    if (wait > 0) {
```
(The rest of the block — `logScanAttempt("denied_cooldown")` + the 429 `{error:"cooldown", retryAfter}` — is unchanged.)

- [ ] **Step 4: Replace the daily-cap check with the bottle limit**

Replace:
```ts
  if (prof.dailyScanDate === localDate && (prof.dailyScans ?? 0) >= DAILY_LIMIT) {
    await logScanAttempt({
      scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
      outcome: "denied_daily_cap",
      at: new Date(), localDate,
    });
    return new Response(JSON.stringify({ error: "daily_limit", limit: DAILY_LIMIT }), {
      status: 429, headers: { "Content-Type": "application/json" },
    });
  }
```
with:
```ts
  if (remainingBottles(bottlesToday) <= 0) {
    await logScanAttempt({
      scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
      outcome: "denied_daily_cap",
      at: new Date(), localDate,
    });
    return new Response(JSON.stringify({ error: "daily_limit", limit: 10 }), {
      status: 429, headers: { "Content-Type": "application/json" },
    });
  }
```

- [ ] **Step 5: Cap awarded items to the remaining allowance**

Find the award-computation block (after detection succeeds):
```ts
  const newStreak = computeStreak(prof.streakDays ?? 0, prof.lastScanLocalDate ?? "", localDate);
  const isFirstOfDay = prof.dailyScanDate !== localDate;
  const newDaily = isFirstOfDay ? 1 : (prof.dailyScans ?? 0) + 1;
  const pt = calculatePoints(DEFAULT_POINTS_CONFIG, newStreak, isFirstOfDay, det.itemCount);
  const rawItems = Number.isFinite(det.itemCount) ? Math.floor(det.itemCount) : 1;
  const pointedItems = Math.min(DEFAULT_POINTS_CONFIG.maxItemsPerScan, Math.max(1, rawItems));
  const newTotal = (prof.totalPoints ?? 0) + pt.total;
  const newRank = rankForPoints(newTotal);
  const coins = coinReward(newStreak, newDaily);
```
Replace it with (caps detected items to the day's remainder; points + counters follow the cap):
```ts
  const newStreak = computeStreak(prof.streakDays ?? 0, prof.lastScanLocalDate ?? "", localDate);
  const isFirstOfDay = prof.dailyScanDate !== localDate;
  const newDaily = isFirstOfDay ? 1 : (prof.dailyScans ?? 0) + 1;
  const rawItems = Number.isFinite(det.itemCount) ? Math.floor(det.itemCount) : 1;
  // Award at most the bottles still allowed today (cap-to-remainder).
  const allowedItems = Math.min(
    DEFAULT_POINTS_CONFIG.maxItemsPerScan,
    remainingBottles(bottlesToday),
    Math.max(1, rawItems),
  );
  const pt = calculatePoints(DEFAULT_POINTS_CONFIG, newStreak, isFirstOfDay, allowedItems);
  const pointedItems = allowedItems;
  const newDailyBottles = bottlesToday + allowedItems;
  const newTotal = (prof.totalPoints ?? 0) + pt.total;
  const newRank = rankForPoints(newTotal);
  const coins = coinReward(newStreak, newDaily);
```
Note: `remainingBottles(bottlesToday) >= 1` is guaranteed here because the Step-4 guard already returned 429 when it was 0, so `allowedItems >= 1`.

- [ ] **Step 6: Thread `dailyBottles` into the award args**

In the `awardArgs` object, add `newDailyBottles` next to `newDaily`:
```ts
    newStreak,
    newDaily,
    newDailyBottles,
    newRank,
    coinReward: coins,
```

- [ ] **Step 7: Thread `dailyBottles` into the pending doc**

In the `buildPendingDoc({...})` call (the `log`/`enforce` branch), add `dailyBottles` next to `newDailyCount`:
```ts
        newDailyCount: newDaily,
        dailyBottles: newDailyBottles,
```

- [ ] **Step 8: Typecheck, then run scan tests**

```bash
npx tsc --noEmit
npx vitest run src/server/scan
```
Expected: tsc clean (if `prof.dailyBottles` errored, the Step-2 profile-type fix resolves it); scan tests PASS.

- [ ] **Step 9: Lint + commit**

```bash
npx eslint src/app/api/v1/scan/upload/route.ts
git add src/app/api/v1/scan/upload/route.ts src/server/user/helpers.ts src/server/user/repo.ts
git commit -m "feat(scan): exponential cooldown + 10-bottle daily cap with remainder capping"
```

---

## Task 5: Full verification

- [ ] **Step 1: Full gate**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```
Expected: all green (192+ tests, plus the new cooldown tests).

- [ ] **Step 2: Manual smoke (BIN_CONFIRM_MODE can be `off` for fast local testing)**

- Scan once → confirm/award → immediately scan again: cooldown error shows a growing `retryAfter` (≈120s after the 2nd scan, ≈240s after the 3rd).
- Scan a photo with 10 bottles → daily cap reached in one scan; next scan returns `daily_limit` (limit 10).
- At 8 bottles, a 5-bottle photo awards 2 (`pointedItems` = 2), `dailyBottles` → 10.
- New Bangkok day → cooldown back to 60s, `dailyBottles` back to 0.

- [ ] **Step 3: Close issue**

```bash
bd close botty-6ar --reason="exponential cooldown + 10-bottle daily limit shipped"
```

---

## Self-review notes

- **Spec coverage:** cooldown formula + 4h cap (T1 `cooldownMs`, T4 step 3); reset daily (T4 step 2 reset-aware `scansToday`); 10-bottle limit (T1 `remainingBottles`, T4 step 4); cap-to-remainder (T4 step 5 `allowedItems`); `dailyBottles` counter carried + written (T2 build, T3 award, T4 steps 6–7); per-scan cap unchanged (T4 uses `maxItemsPerScan` in the `min`). All covered.
- **Type consistency:** `newDailyBottles` (route local + `AwardFromScanInput` field) and `dailyBottles` (pending doc field + Firestore user field) are used consistently — the route computes `newDailyBottles`, passes it as `awardArgs.newDailyBottles` and as `buildPendingDoc({ dailyBottles: newDailyBottles })`; `awardScan` reads `i.newDailyBottles`, `awardFromPending` reads `p.dailyBottles`. `cooldownMs`/`remainingBottles` signatures match all call sites.
- **Placeholder scan:** none — every code step has full code; the only conditional is the `prof.dailyBottles` profile-type addition, with exact instructions.
