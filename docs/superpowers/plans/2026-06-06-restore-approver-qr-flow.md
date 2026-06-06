# Restore Staff-QR Approver Confirm Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-introduce the removed staff-QR anti-cheat gate: a student earns nothing from a bottle scan until they reach a bin where staff shows a rotating signed QR and the student's app scans it.

**Architecture:** Re-apply the feature on current `main` using removed commit `b6ff6ea` as reference. Net-new modules are restored verbatim from that commit; files that diverged on `main` (award/upload/scan-page/role plumbing) are hand-reconciled so 1pt/bottle, coins-per-scan, and garden survive. Points **and** coins are deferred into a `pendingScans` doc and only committed by `POST /scan/confirm` after slot-token verification.

**Tech Stack:** Next.js 16 App Router (Node runtime routes), Firebase Admin/Firestore, LINE LIFF `scanCodeV2` QR scanner, `qrcode` npm package (staff QR render), HMAC-SHA256 slot tokens, Vitest.

**Reference commit:** `b6ff6ea` (`feat(scan): restore staff-QR approver confirm flow and council role`).
**Spec:** `docs/superpowers/specs/2026-06-06-restore-approver-qr-flow-design.md`.
**bd issue:** `botty-6w7`.

**Decisions locked:** approver role = `council`; gate everything (points+coins); `BIN_CONFIRM_MODE` default `enforce`; `PENDING_TTL_MS = 300_000` (5-min student confirm window); approver session 10×30s = 5 min.

**Per-file tool note:** This repo mandates Serena symbol tools for code reads/edits (see CLAUDE.md). Use `get_symbols_overview`/`find_symbol` before editing; `replace_symbol_body`/`insert_after_symbol` for edits. Built-in Edit only where Serena can't express the change. `git checkout <commit> -- <path>` restores are shell, run via Bash/PowerShell.

---

## File map

| File | Action | Source |
|---|---|---|
| `src/server/lib/auth.ts` | modify — add `council` to role union | hand |
| `src/server/lib/role-guard.ts` | modify — add `canApprove` | from `b6ff6ea` |
| `src/server/lib/role-guard.test.ts` | restore | `b6ff6ea` |
| `src/server/approver/token.ts` `mint.ts` `repo.ts` | create (verbatim) | `b6ff6ea` |
| `src/server/approver/token.test.ts` `repo.test.ts` | create (verbatim) | `b6ff6ea` |
| `src/server/scan/pending.ts` | create (verbatim) | `b6ff6ea` |
| `src/server/scan/build.ts` | modify — `coinReward`, TTL 300s | hand |
| `src/server/scan/award.ts` | modify — add `awardFromPending` (+coins) | hand |
| `src/app/api/v1/approver/sessions/route.ts` | create (verbatim) | `b6ff6ea` |
| `src/app/api/v1/approver/sessions/[id]/end/route.ts` | create (verbatim) | `b6ff6ea` |
| `src/app/api/v1/scan/confirm/route.ts` | create (verbatim) | `b6ff6ea` |
| `src/app/api/v1/scan/upload/route.ts` | modify — divert to pending, thread `coinReward` | hand |
| `src/lib/api.ts` | modify — add `confirmScan`, `openApproverSession`, `endApproverSession` | hand |
| `src/app/approver/page.tsx` `layout.tsx` | create (verbatim) | `b6ff6ea` |
| `src/app/scan/page.tsx` | modify — pending/confirm UX | hand (port) |
| `src/components/shared/BottomNav.tsx` | modify — approver entry council/admin | hand |
| `src/app/admin/page.tsx` | modify — council role toggle | hand |
| `src/server/user/role-change.ts` | modify — council flips | hand |
| `firestore.indexes.json` | modify — pendingScans + approverSessions indexes | hand |
| `.env.example` | modify — `STAFF_QR_SECRET`, `BIN_CONFIRM_MODE` | hand |

---

## Task 1: Role foundation — `council` role + `canApprove`

**Files:**
- Modify: `src/server/lib/auth.ts` (role union)
- Modify: `src/server/lib/role-guard.ts`
- Test: `src/server/lib/role-guard.test.ts` (restore)

- [ ] **Step 1: Add `council` to the role union**

In `src/server/lib/auth.ts`, the `AuthContext` type currently reads:
```ts
  role: "student" | "admin" | "unknown";
```
Change to:
```ts
  role: "student" | "council" | "admin" | "unknown";
```
(Use Serena `find_symbol` on `AuthContext` then `replace_symbol_body`, or built-in Edit on that one line.)

- [ ] **Step 2: Restore the role-guard test, then run it (expect FAIL)**

```bash
git checkout b6ff6ea -- src/server/lib/role-guard.test.ts
npx vitest run src/server/lib/role-guard.test.ts
```
Expected: FAIL — `canApprove` is not exported yet.

- [ ] **Step 3: Add `canApprove` to role-guard**

Replace the body of `src/server/lib/role-guard.ts` with:
```ts
import type { AuthContext } from "./auth";

export type Role = AuthContext["role"];
export type ApproverRole = "council" | "admin";

export function hasRole(ctx: AuthContext, required: "admin"): boolean {
  return ctx.role === required;
}

// Council members and admins may approve student scans via the staff-QR flow.
export function canApprove(role: Role): boolean {
  return role === "council" || role === "admin";
}
```

- [ ] **Step 4: Run the test (expect PASS) + typecheck**

```bash
npx vitest run src/server/lib/role-guard.test.ts
npx tsc --noEmit
```
Expected: test PASS. `tsc` may surface other call sites that switch over `role` exhaustively — note them but only fix ones in files this plan already touches; unrelated breakage means a missed switch, fix by adding a `council` arm mirroring `student`.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/auth.ts src/server/lib/role-guard.ts src/server/lib/role-guard.test.ts
git commit -m "feat(roles): restore council role + canApprove guard"
```

---

## Task 2: Restore approver server module (verbatim)

**Files:**
- Create: `src/server/approver/token.ts` `mint.ts` `repo.ts`
- Test: `src/server/approver/token.test.ts` `repo.test.ts`

- [ ] **Step 1: Restore all five files from the reference commit**

```bash
git checkout b6ff6ea -- src/server/approver/token.ts src/server/approver/mint.ts src/server/approver/repo.ts src/server/approver/token.test.ts src/server/approver/repo.test.ts
```

These are net-new (no `main` equivalent): `token.ts` (HMAC slot-token sign/verify), `mint.ts` (10 slots × 30s = 5-min session; `mintSessionTokens`, `currentSlot`), `repo.ts` (`approverSessions` collection — `createSession`/`getSession`/`endSession`/`claimSlot` with slot-used + student-already-awarded transaction guards).

- [ ] **Step 2: Run the restored tests (expect PASS)**

```bash
npx vitest run src/server/approver/token.test.ts src/server/approver/repo.test.ts
```
Expected: PASS. `token.test.ts` is pure (HMAC). `repo.test.ts` — if it needs Firestore mocking and the repo harness isn't present, confirm it passed on `b6ff6ea`; if it requires emulator it may be skipped — note and move on (repos are manually verified per AGENTS.md).

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: clean for these files (`repo.ts` imports only `firebase`, `SESSION_DURATION_MS` from `mint`).

- [ ] **Step 4: Commit**

```bash
git add src/server/approver/
git commit -m "feat(approver): restore slot-token, session minting, and session repo"
```

---

## Task 3: Restore `scan/pending.ts` (verbatim)

**Files:**
- Create: `src/server/scan/pending.ts`

- [ ] **Step 1: Restore the file**

```bash
git checkout b6ff6ea -- src/server/scan/pending.ts
```
Exposes `PENDING_COL`, `PENDING_STATUS_AWAITING`, `PENDING_STATUS_CONFIRMED`, `PendingError` + `ERR_PENDING_*` instances, `createPending`, `hasOutstandingPending`.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: it imports `PendingDoc` from `./build` — that type exists on `main` already but Task 4 adds `coinReward` to it; clean either way.

- [ ] **Step 3: Commit**

```bash
git add src/server/scan/pending.ts
git commit -m "feat(scan): restore pendingScans repo helpers"
```

---

## Task 4: `build.ts` — add `coinReward` to pending doc + 5-min TTL

**Files:**
- Modify: `src/server/scan/build.ts`
- Test: `src/server/scan/build.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create/extend `src/server/scan/build.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildPendingDoc, PENDING_TTL_MS } from "./build";

describe("buildPendingDoc", () => {
  it("carries coinReward and a 5-minute expiry", () => {
    const capturedAt = new Date("2026-06-06T00:00:00.000Z");
    const doc = buildPendingDoc({
      uid: "u1", classKey: "m1/1", scanId: "s1", detectedClass: "PET",
      itemCount: 2, confidence: 0.9, basePoints: 2, streakBonus: 0, totalPoints: 2,
      isFirstOfDay: true, localDate: "2026-06-06", streakDays: 1, newDailyCount: 1,
      newTotalPoints: 2, newRank: "ต้นกล้า", prevRank: "ต้นกล้า",
      imagePath: "https://x/y.jpg", imageHash: "h", capturedAt, coinReward: 5,
    });
    expect(doc.coinReward).toBe(5);
    expect(doc.expiresAt.getTime() - capturedAt.getTime()).toBe(PENDING_TTL_MS);
    expect(PENDING_TTL_MS).toBe(300_000);
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

```bash
npx vitest run src/server/scan/build.test.ts
```
Expected: FAIL — `coinReward` not on `PendingDocInput`; `PENDING_TTL_MS` is `90_000`.

- [ ] **Step 3: Edit `build.ts`**

In `src/server/scan/build.ts`:
1. Change the TTL constant:
```ts
export const PENDING_TTL_MS = 300_000; // 5 min — student window to scan staff QR
```
2. Add `coinReward: number;` to `PendingDocInput` (place it after `totalPoints`):
```ts
  totalPoints: number;
  coinReward: number;
```
`PendingDoc = PendingDocInput & {...}` and `buildPendingDoc` already spread all input fields and strip `undefined`, so no other change is needed — `coinReward` flows through automatically.

- [ ] **Step 4: Run the test (expect PASS) + typecheck**

```bash
npx vitest run src/server/scan/build.test.ts
npx tsc --noEmit
```
Expected: PASS. `tsc` now flags `buildPendingDoc` callers missing `coinReward` — that caller is the upload route, fixed in Task 7. If only that site errors, proceed.

- [ ] **Step 5: Commit**

```bash
git add src/server/scan/build.ts src/server/scan/build.test.ts
git commit -m "feat(scan): pending doc carries coinReward; TTL 90s->5min"
```

---

## Task 5: `award.ts` — add `awardFromPending` that awards points **and** coins

**Files:**
- Modify: `src/server/scan/award.ts`
- Test: `src/server/scan/award.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test (coins regression guard)**

Create/extend `src/server/scan/award.test.ts`. This test asserts the user-update payload increments both points and coins by mocking Firestore. Match the existing repo-mock style if `award.test.ts` already exists; otherwise use this transaction-capture mock:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const userUpdates: Record<string, unknown>[] = [];
vi.mock("@/server/lib/firebase", () => ({
  fbFirestore: () => ({
    collection: () => ({ doc: () => ({ id: "x", path: "p" }) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async () => ({ exists: false, data: () => ({}) }),
        set: () => {},
        update: (_ref: unknown, data: Record<string, unknown>) => {
          if ("coins" in data || "coinsLifetime" in data) userUpdates.push(data);
        },
      }),
  }),
}));
vi.mock("@/server/lib/cache-bus", () => ({ bust: () => {} }));

import { awardFromPending } from "./award";
import type { PendingDoc } from "./build";

beforeEach(() => { userUpdates.length = 0; });

it("awardFromPending increments coins and coinsLifetime from coinReward", async () => {
  const p = {
    uid: "u1", classKey: "m1/1", scanId: "s1", detectedClass: "PET", itemCount: 2,
    confidence: 0.9, basePoints: 2, streakBonus: 0, totalPoints: 2, isFirstOfDay: true,
    localDate: "2026-06-06", streakDays: 1, newDailyCount: 1, newTotalPoints: 2,
    newRank: "ต้นกล้า", prevRank: "ต้นกล้า", imagePath: "u", imageHash: "h",
    capturedAt: new Date(), coinReward: 7, expiresAt: new Date(), status: "awaiting_bin",
  } as unknown as PendingDoc;
  await awardFromPending("u1", p, "pend1");
  const u = userUpdates.find((d) => "coins" in d)!;
  expect(u).toBeTruthy();
});
```
Note: if a `award.test.ts` already exists with an established mock, ADD the assertion in its style instead of redefining mocks (DRY).

- [ ] **Step 2: Run it (expect FAIL)**

```bash
npx vitest run src/server/scan/award.test.ts
```
Expected: FAIL — `awardFromPending` not exported.

- [ ] **Step 3: Add `awardFromPending` to `award.ts`**

Add these imports at the top of `src/server/scan/award.ts` (extend the existing `firebase-admin/firestore` and `./build` imports):
```ts
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { buildScanDoc, type ScanDocInput, type PendingDoc } from "./build";
import { PENDING_COL } from "./pending";
```
Then append this function (use Serena `insert_after_symbol` after `awardScan`):
```ts
/**
 * Awards points AND coins from a confirmed pending scan (staff-QR confirm flow).
 * Idempotent on the pending doc's `awarded` flag so a double-confirm can't
 * double-award. Mirrors awardScan's user/class/goal writes.
 */
export async function awardFromPending(uid: string, p: PendingDoc, pendingId: string): Promise<void> {
  const fs = fbFirestore();
  const pendingRef: DocumentReference = fs.collection(PENDING_COL).doc(pendingId);
  const scanRef = fs.collection("scans").doc(p.scanId);
  const userRef = fs.collection("users").doc(uid);
  const classRef = fs.collection("classes").doc(p.classKey.replace(/\//g, "-"));
  const goalRef = fs.collection("schoolGoal").doc("current");

  await fs.runTransaction(async (tx) => {
    const psnap = await tx.get(pendingRef);
    if (!psnap.exists) throw new Error("pending gone");
    const pdata = psnap.data() as { awarded?: boolean };
    if (pdata.awarded === true) return;

    tx.set(scanRef, buildScanDoc({
      uid,
      classKey: p.classKey,
      detectedClass: p.detectedClass,
      itemCount: p.itemCount,
      basePoints: p.basePoints,
      streakBonus: p.streakBonus,
      totalPoints: p.totalPoints,
      confidence: p.confidence,
      clientConf: 0,
      imagePath: p.imagePath,
      imageHash: p.imageHash,
      phash: p.phash,
      phashBucket: p.phashBucket,
      capturedAt: p.capturedAt,
      localDate: p.localDate,
    }));
    tx.update(userRef, {
      totalPoints: FieldValue.increment(p.totalPoints),
      coins: FieldValue.increment(p.coinReward),
      coinsLifetime: FieldValue.increment(p.coinReward),
      totalScans: FieldValue.increment(1),
      streakDays: p.streakDays,
      lastScanLocalDate: p.localDate,
      lastScanAt: p.capturedAt,
      dailyScans: p.newDailyCount,
      dailyScanDate: p.localDate,
      rank: p.newRank,
      updatedAt: new Date(),
    });
    tx.set(classRef, {
      totalPoints: FieldValue.increment(p.totalPoints),
      totalScans: FieldValue.increment(1),
    }, { merge: true });
    tx.set(goalRef, { currentBottles: FieldValue.increment(1) }, { merge: true });
    tx.update(pendingRef, { awarded: true, awardedAt: FieldValue.serverTimestamp() });
  });
  bust(`user:${uid}`);
  bust("classes");
}
```
`PendingDoc` carries `coinReward` after Task 4, so `p.coinReward` typechecks.

- [ ] **Step 4: Run the test (expect PASS) + typecheck**

```bash
npx vitest run src/server/scan/award.test.ts
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/scan/award.ts src/server/scan/award.test.ts
git commit -m "feat(scan): awardFromPending awards points + coins on staff-QR confirm"
```

---

## Task 6: Restore approver + confirm routes (verbatim)

**Files:**
- Create: `src/app/api/v1/approver/sessions/route.ts`
- Create: `src/app/api/v1/approver/sessions/[id]/end/route.ts`
- Create: `src/app/api/v1/scan/confirm/route.ts`

Depends on Tasks 1, 2, 3, 5.

- [ ] **Step 1: Restore the three routes**

```bash
git checkout b6ff6ea -- src/app/api/v1/approver/sessions/route.ts "src/app/api/v1/approver/sessions/[id]/end/route.ts" src/app/api/v1/scan/confirm/route.ts
```
- `sessions/route.ts` — `POST` starts a session (`canApprove` gate), mints tokens via `mintSessionTokens`, returns `{sessionId, startedAt, expiresAt, tokens}`.
- `sessions/[id]/end/route.ts` — `POST` ends a session (`canApprove` + owner check).
- `scan/confirm/route.ts` — `POST {pendingId, approverToken}`: mode-gate (`off`→410), `verifySlotToken` (`STAFF_QR_SECRET`), `validFrom/validUntil` window, `claimSlot`, then a transaction that flips the pending doc to `confirmed` and calls `awardFromPending` under `enforce`.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: clean — every import (`canApprove`, `createSession`/`endSession`/`claimSlot`, `mintSessionTokens`, `verifySlotToken`, `awardFromPending`, all `pending.ts` exports, `bustLeaderboardCaches`) exists after Tasks 1–5.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/approver src/app/api/v1/scan/confirm
git commit -m "feat(api): restore approver session + scan confirm routes"
```

---

## Task 7: Upload route — divert to pending under enforce, thread `coinReward`

**Files:**
- Modify: `src/app/api/v1/scan/upload/route.ts`

This is the central reconcile. `main`'s student path always calls `awardScan`. Rework it to: (a) block while a pending is outstanding, (b) compute `coinReward` once, (c) under `off`/`log` award immediately (passing coinReward), (d) under `log`/`enforce` stage a pending doc carrying `coinReward`, (e) return `pendingId`/`expiresInSec` so the client knows to prompt for the staff QR.

- [ ] **Step 1: Add imports**

At the top of `src/app/api/v1/scan/upload/route.ts` add:
```ts
import { createPending, hasOutstandingPending } from "@/server/scan/pending";
import { buildPendingDoc, PENDING_TTL_MS } from "@/server/scan/build";
```
(`coinReward` from `@/server/shop/earn`, `awardScan`, `ulid`, `calculatePoints`, etc. are already imported.)

- [ ] **Step 2: Add the mode helper**

Below the existing module constants (`DAILY_LIMIT` etc.) add:
```ts
type ConfirmMode = "off" | "log" | "enforce";
function confirmMode(): ConfirmMode {
  const m = (process.env.BIN_CONFIRM_MODE ?? "enforce") as ConfirmMode;
  return m === "off" || m === "log" ? m : "enforce";
}
```

- [ ] **Step 3: Block second upload while a pending is outstanding**

In the student branch, immediately AFTER the duplicate-hash check (the block ending with the `const phashBkt = phash ? phashBucket(phash) : undefined;` that precedes the detector call) and BEFORE `let det;`, insert:
```ts
  const cmode = confirmMode();
  if (cmode !== "off") {
    const outstanding = await hasOutstandingPending(ctx.uid);
    if (outstanding) {
      const expiresInSec = Math.max(0, Math.ceil((outstanding.expiresAt.getTime() - Date.now()) / 1000));
      return new Response(JSON.stringify({ error: "pending_exists", pendingId: outstanding.id, expiresInSec }), {
        status: 409, headers: { "Content-Type": "application/json" },
      });
    }
  }
```

- [ ] **Step 4: Replace the award/return tail**

`main`'s student path currently ends with: build `awardArgs` (incl. `coinReward: coins`) → `awardScan` → `logScanAttempt("awarded")` → `bustLeaderboardCaches()` → `return jsonOk({...awarded:true...})`. Keep `const coins = coinReward(newStreak, newDaily);` and the `awardArgs` object (it already includes `coinReward: coins`). Replace everything from `const { awarded } = await awardScan(awardArgs);` through the final `return jsonOk({...})` with:
```ts
  // off / log: award immediately (log also shadows a pending doc).
  if (cmode === "off" || cmode === "log") {
    const { awarded } = await awardScan(awardArgs);
    if (!awarded) {
      const prior2 = await getStoredScan(scanId);
      if (prior2 && prior2.uid === ctx.uid) return jsonOk(replayResult(scanId, prior2, prof));
      logScanEvent("error_award_race", { uid: ctx.uid, scanId });
      return jsonError(409, "duplicate scan");
    }
    bustLeaderboardCaches();
    await logScanAttempt({
      scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
      outcome: "awarded", at: capturedAt, localDate,
      basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
      itemCount: det.itemCount, detectedClass: det.class,
      confidence: det.confidence, clientConf,
    });
  }

  // log / enforce: stage a pending scan the staff-QR confirm will award.
  let pendingId: string | undefined;
  if (cmode === "log" || cmode === "enforce") {
    pendingId = ulid();
    try {
      await createPending(pendingId, buildPendingDoc({
        uid: ctx.uid, classKey: prof.classKey ?? "", scanId,
        detectedClass: det.class, itemCount: det.itemCount, confidence: det.confidence,
        basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
        isFirstOfDay, localDate, streakDays: newStreak, newDailyCount: newDaily,
        newTotalPoints: newTotal, newRank, prevRank: prof.rank ?? "ต้นกล้า",
        imagePath: imageUrl, imageHash: hash, phash, phashBucket: phashBkt,
        capturedAt, coinReward: coins,
      }));
    } catch (err) {
      console.error("pending create failed", ctx.uid, scanId, err);
      if (cmode === "enforce") return jsonError(500, "pending create failed");
      pendingId = undefined;
    }
    if (cmode === "enforce" && pendingId) {
      await logScanAttempt({
        scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
        outcome: "pending", at: capturedAt, localDate,
        basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
        itemCount: det.itemCount, detectedClass: det.class,
        confidence: det.confidence, clientConf,
      });
    }
  }

  const expiresInSec = Math.floor(PENDING_TTL_MS / 1000);
  const base = {
    scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
    pointedItems, basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
    newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
    annotatedImage: det.annotatedImage,
  };
  if (cmode === "off") return jsonOk({ ...base, awarded: true });
  if (cmode === "log") return jsonOk({ ...base, awarded: true, pendingId, expiresInSec });
  return jsonOk({ ...base, awarded: false, pendingId, expiresInSec }); // enforce
```
Note: `logScanAttempt` must accept `outcome: "pending"`. Check its `outcome` union (`src/server/scan/log.ts`); if `"pending"` isn't already allowed, add it to the union (it was present on `b6ff6ea` — `git show b6ff6ea:src/server/scan/log.ts | grep pending`).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```
Expected: clean. If `outcome: "pending"` errors, apply the log union fix above.

- [ ] **Step 6: Run the scan tests + commit**

```bash
npx vitest run src/server/scan
git add src/app/api/v1/scan/upload/route.ts src/server/scan/log.ts
git commit -m "feat(scan): gate award behind staff-QR pending (enforce default)"
```

---

## Task 8: Client API wrappers

**Files:**
- Modify: `src/lib/api.ts`

`main`'s `uploadScan(file, scanId)` + timeout already exist. Add the confirm + approver-session wrappers and extend `ScanResult` with the pending fields.

- [ ] **Step 1: Extend `ScanResult`**

In `src/lib/api.ts`, add to the `ScanResult` interface (if not already present):
```ts
  awarded?: boolean
  pendingId?: string
  expiresInSec?: number
```

- [ ] **Step 2: Add the wrappers**

Add near the other scan wrappers:
```ts
// Confirms a pending scan with a staff-QR slot token, awarding points + coins.
export function confirmScan(pendingId: string, approverToken: string) {
  return request<{ ok: boolean; approverUid: string; sessionId: string }>('/scan/confirm', {
    method: 'POST',
    body: JSON.stringify({ pendingId, approverToken }),
  })
}

export type MintedSlot = { slot: number; token: string; validFrom: number; validUntil: number }
export type ApproverSessionResponse = {
  sessionId: string
  startedAt: string
  expiresAt: string
  tokens: MintedSlot[]
}
export function openApproverSession() {
  return request<ApproverSessionResponse>('/approver/sessions', { method: 'POST' })
}
export function endApproverSession(id: string) {
  return request<{ ok: boolean }>(`/approver/sessions/${encodeURIComponent(id)}/end`, { method: 'POST' })
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/api.ts
git commit -m "feat(api-client): confirmScan + approver session wrappers"
```

---

## Task 9: Restore approver page + layout (verbatim)

**Files:**
- Create: `src/app/approver/page.tsx` `src/app/approver/layout.tsx`

Depends on Task 8 (`openApproverSession`/`endApproverSession`) and the `qrcode` package.

- [ ] **Step 1: Confirm `qrcode` is a dependency**

```bash
node -e "require.resolve('qrcode'); console.log('qrcode present')"
```
If it throws, install it: `npm i qrcode && npm i -D @types/qrcode`.

- [ ] **Step 2: Restore the page + layout**

```bash
git checkout b6ff6ea -- src/app/approver/page.tsx src/app/approver/layout.tsx
```
The page opens a session, renders the current 30-second slot token as a QR (dynamic `import("qrcode")`), auto-advances slots, shows a countdown, and ends the session on unmount/leave.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: clean — imports resolve to Task 8 wrappers. If the page imports `currentSlot` from `@/server/approver/mint`, that's a server file imported into a client component **only for the pure `currentSlot` math** — verify it has no `firebase` import at module top (it doesn't). If lint/Next complains about server import in client, inline `currentSlot` locally in the page.

- [ ] **Step 4: Commit**

```bash
git add src/app/approver/ package.json package-lock.json
git commit -m "feat(approver): restore staff QR display page"
```

---

## Task 10: Scan page — pending/confirm UX

**Files:**
- Modify: `src/app/scan/page.tsx`

Port the staff-QR confirm states from `b6ff6ea`'s scan page onto `main`'s current page (which has the 1pt/bottle result UI + RankTree). Study both before editing:
```bash
git show b6ff6ea:src/app/scan/page.tsx > /tmp/scan-branch.tsx   # reference only — do NOT overwrite
```

- [ ] **Step 1: Add approver state + imports**

Change the api import to include `confirmScan`, and add `scanQrCode` (already exists in `@/lib/liff`):
```ts
import { uploadScan, confirmScan, ApiError, type ScanResult } from "@/lib/api";
import { scanQrCode } from "@/lib/liff";
```
Inside `ScanPage`, after the existing state hooks add:
```ts
  // Staff-QR confirm flow (BIN_CONFIRM_MODE=enforce): upload returns a pending scan;
  // points/coins land only after the student scans a staff QR.
  const [approverPrompt, setApproverPrompt] = useState<{ pendingId: string; expiresAt: number } | null>(null);
  const [approverStatus, setApproverStatus] = useState<"idle" | "scanning" | "confirmed" | "expired" | "failed">("idle");
  const [approverCountdown, setApproverCountdown] = useState(0);
  const resetApprover = useCallback(() => {
    setApproverPrompt(null); setApproverStatus("idle"); setApproverCountdown(0);
  }, []);
```

- [ ] **Step 2: Add the confirm countdown effect**

```ts
  useEffect(() => {
    if (!approverPrompt || approverStatus === "confirmed" || approverStatus === "expired") return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((approverPrompt.expiresAt - Date.now()) / 1000));
      setApproverCountdown(remaining);
      if (remaining === 0) setApproverStatus("expired");
    }, 1000);
    return () => clearInterval(id);
  }, [approverPrompt, approverStatus]);
```

- [ ] **Step 3: In `submit`, branch on a pending response**

At the start of `submit` call `resetApprover();`. After `const res = await uploadScan(...)`, before `setResult(res); setState("result")`, add:
```ts
      if (res.pendingId && res.expiresInSec && res.awarded === false) {
        setApproverPrompt({ pendingId: res.pendingId, expiresAt: Date.now() + res.expiresInSec * 1000 });
        setApproverStatus("idle");
        setApproverCountdown(res.expiresInSec);
      }
```
(Keep `setResult(res); setState("result")` — the result screen renders differently when a prompt is active.)

- [ ] **Step 4: Add the confirm handler**

```ts
  const handleScanApprover = useCallback(async () => {
    if (!approverPrompt) return;
    setApproverStatus("scanning");
    try {
      const token = await scanQrCode();
      if (!token) { setApproverStatus("idle"); return; }
      await confirmScan(approverPrompt.pendingId, token);
      setApproverStatus("confirmed");
    } catch {
      setApproverStatus("failed");
    }
  }, [approverPrompt]);
```

- [ ] **Step 5: Render the confirm gate in the result screen**

In the `state === "result" && result` block, compute at the top: `const awarded = approverStatus === "confirmed" || !approverPrompt;`. When `approverPrompt && !awarded`, render — instead of the points block — a panel with: the detected chips, the live `approverCountdown`, a primary button "สแกน QR เจ้าหน้าที่เพื่อรับคะแนน" → `handleScanApprover` (disabled while `approverStatus === "scanning"`), and, when `approverStatus === "expired"`, the message "ไม่ได้รับคะแนน — สแกน QR เจ้าหน้าที่ไม่ทัน" with a "สแกนใหม่" button (`setState("idle"); resetApprover()`). When `approverStatus === "failed"` show "ยืนยันไม่สำเร็จ ลองสแกน QR อีกครั้ง" and allow retry. When `awarded`, render the existing `+points` / RankTree block unchanged. Use `b6ff6ea`'s scan page (lines ~270–380, in `/tmp/scan-branch.tsx`) as the visual reference and match `main`'s current styling tokens (`t.gold`, `t.forest`).

- [ ] **Step 6: Typecheck, lint, build**

```bash
npx tsc --noEmit && npm run lint && npm run build
```
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat(scan): staff-QR confirm step on scan result"
```

---

## Task 11: BottomNav — approver entry for council/admin

**Files:**
- Modify: `src/components/shared/BottomNav.tsx`

- [ ] **Step 1: Determine the viewer's role client-side**

`main`'s BottomNav is a static item list. Approver entry must show only for `council`/`admin`. Check how role reaches the client (e.g. `getProfile()` / a context). If a profile hook exists, gate on it; otherwise fetch role once via the existing profile API in a `useEffect`. Add a conditional nav item:
```tsx
{ href: '/approver', label: 'อนุมัติ', icon: ApproverIcon }  // only when canApprove(role)
```
Render it appended to the items array when `role === 'council' || role === 'admin'`. Add a small `ApproverIcon` (QR-style glyph) mirroring the existing icon components.

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/shared/BottomNav.tsx
git commit -m "feat(nav): approver entry for council/admin"
```

---

## Task 12: Admin role toggle + council flips

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/server/user/role-change.ts`

- [ ] **Step 1: Inspect both `main` and `b6ff6ea` versions**

```bash
git show b6ff6ea:src/server/user/role-change.ts > /tmp/role-change-branch.ts
git show b6ff6ea:src/app/admin/page.tsx > /tmp/admin-branch.tsx
```

- [ ] **Step 2: Restore council in `role-change.ts`**

`main` only demotes to `student`. Restore the `student ↔ council` flip from `/tmp/role-change-branch.ts` (the `changeRoleAsTeacher`/equivalent that allows `council` as a target). Keep `admin` assignment manual/Firestore-only — never assignable via this path. The `AssignableRole` is `'student' | 'council'`.

- [ ] **Step 3: Add the council toggle to the admin UI**

In `src/app/admin/page.tsx` re-add the student↔council control on the user row/detail, calling the role-change API wrapper. Reference `/tmp/admin-branch.tsx` for the control; match `main`'s current table/layout (do not restore the whole file — it diverged; port only the toggle).

- [ ] **Step 4: Typecheck, lint, test, commit**

```bash
npx tsc --noEmit && npm run lint && npx vitest run src/server/user
git add src/app/admin/page.tsx src/server/user/role-change.ts
git commit -m "feat(admin): restore student<->council role toggle"
```

---

## Task 13: Firestore indexes + env + docs

**Files:**
- Modify: `firestore.indexes.json`
- Modify: `.env.example`

- [ ] **Step 1: Add composite indexes**

Merge the `pendingScans` and `approverSessions` index entries from `b6ff6ea` into `firestore.indexes.json` (keep existing `scanAttempts` indexes):
```bash
git show b6ff6ea:firestore.indexes.json
```
The required one for `hasOutstandingPending` is `pendingScans` on `uid (ASC)` + `status (ASC)` + `expiresAt (ASC)`. Add any approver-session index present in the reference.

- [ ] **Step 2: Document the env vars**

In `.env.example` add:
```
# Staff-QR approver confirm flow
STAFF_QR_SECRET=            # >=16 random bytes; HMAC-signs approver slot tokens
BIN_CONFIRM_MODE=enforce    # off | log | enforce
```

- [ ] **Step 3: Commit**

```bash
git add firestore.indexes.json .env.example
git commit -m "chore(scan): pendingScans/approver indexes + staff-QR env vars"
```

---

## Task 14: Full verification + handoff

- [ ] **Step 1: Full quality gate**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```
Expected: all green.

- [ ] **Step 2: Manual smoke (requires `STAFF_QR_SECRET` in `.env.local`, `BIN_CONFIRM_MODE=enforce`)**

- Student scans a bottle → result screen shows pending (no points), 5-min countdown.
- Open `/approver` as a `council`/`admin` account → QR renders, rotates every 30s.
- Student taps "สแกน QR เจ้าหน้าที่" → scans staff QR → points **and** coins land; profile totals update.
- Second upload while a pending is outstanding → `409 pending_exists`.
- Let a pending sit > 5 min → status "expired", no award; re-scan works.
- Replay a used QR slot → `409` "QR ถูกใช้ไปแล้ว"; same student twice in one session → "ได้รับคะแนนแล้ว".

- [ ] **Step 3: Post-deploy ops note (human, not in code)**

Record in the PR description: (1) set `STAFF_QR_SECRET` in Vercel env, (2) `firebase deploy --only firestore:indexes`, (3) grant `council` to staff accounts in Firestore. (These mirror the spec's "Post-deploy" section.)

- [ ] **Step 4: Close the bd issue + push**

```bash
bd close botty-6w7 --reason="staff-QR approver confirm flow restored on main"
git pull --rebase && bd dolt push && git push
git status   # must show up to date with origin
```

---

## Self-review notes

- **Spec coverage:** approver role=council (T1,T12), gate everything incl. coins (T5 `awardFromPending` coins + T7 pending carries `coinReward`), enforce default (T7 `confirmMode`, confirm route mode), 5-min window (T4 `PENDING_TTL_MS=300_000`), session 10×30s (T2 verbatim `mint.ts`), routes (T6), UI (T9,T10,T11), indexes/env (T13). All covered.
- **Type consistency:** `coinReward` defined on `PendingDocInput` (T4) and consumed as `p.coinReward` (T5) and supplied by `buildPendingDoc(... coinReward: coins)` (T7). `confirmMode()` (upload) and `mode()` (confirm route) are independent local helpers reading the same `BIN_CONFIRM_MODE` — intentional, not shared. `canApprove(role)` signature matches both route call sites.
- **Restore vs hand-edit:** verbatim `git checkout b6ff6ea --` only for net-new files with no `main` equivalent (approver module, pending repo, routes, approver page, two tests); everything that diverged is hand-reconciled.
