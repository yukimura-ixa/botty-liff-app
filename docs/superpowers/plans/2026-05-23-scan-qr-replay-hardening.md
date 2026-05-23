# Scan QR Replay Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two abuse paths in the scan→approver-QR award flow (mode-default mismatch and per-session multi-slot capture), bound per-scan point yield, and shorten approver session to 5 minutes.

**Architecture:** Server-side only. Three Firestore transaction additions (per-(student, session) cap), one mode-default flip, one points-clamp, one slot-count constant change. UI receives a new `pointedItems` response field for transparency when capping triggers.

**Tech Stack:** Next.js 16 App Router (Node runtime route handlers), Firebase Admin Firestore (transactions), Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-23-scan-qr-replay-hardening-design.md`

---

## File Map

| File | Action |
|---|---|
| `src/server/scan/points.ts` | Modify — add `maxItemsPerScan` to `PointsConfig`, clamp in `calculatePoints` |
| `src/server/scan/points.test.ts` | Modify — add cap tests |
| `src/server/approver/mint.ts` | Modify — `SLOTS_PER_SESSION: 30 → 10` |
| `src/server/approver/repo.ts` | Modify — extend `ClaimError`, add per-(student, session) cap in `claimSlot` |
| `src/server/approver/repo.test.ts` | Create — claimSlot transaction tests |
| `src/app/api/v1/scan/confirm/route.ts` | Modify — map new `student_already_awarded` error to 409 |
| `src/app/api/v1/scan/upload/route.ts` | Modify — `mode()` default `"log"` → `"enforce"`; populate `pointedItems` in response |
| `src/lib/api.ts` | Modify — add `pointedItems?: number` to `ScanResult` |

---

## Task 1: Add `maxItemsPerScan` to PointsConfig and clamp itemCount

**Files:**
- Modify: `src/server/scan/points.ts`
- Test: `src/server/scan/points.test.ts`

- [ ] **Step 1: Add failing tests for the cap**

Append the following block inside `src/server/scan/points.test.ts` after the existing `describe("calculatePoints (default config)", ...)` block (before `describe("DEFAULT_POINTS_CONFIG", ...)`):

```typescript
describe("calculatePoints itemCount cap", () => {
  const cfg = DEFAULT_POINTS_CONFIG;

  it("caps itemCount to maxItemsPerScan", () => {
    expect(calculatePoints(cfg, 0, false, 100)).toEqual({ basePoints: 10, streakBonus: 0, total: 10 });
    expect(calculatePoints(cfg, 0, false, 11)).toEqual({ basePoints: 10, streakBonus: 0, total: 10 });
  });
  it("does not cap when itemCount equals maxItemsPerScan", () => {
    expect(calculatePoints(cfg, 0, false, 10)).toEqual({ basePoints: 10, streakBonus: 0, total: 10 });
  });
  it("does not cap when itemCount is below maxItemsPerScan", () => {
    expect(calculatePoints(cfg, 0, false, 9)).toEqual({ basePoints: 9, streakBonus: 0, total: 9 });
  });
  it("treats NaN itemCount as 1", () => {
    expect(calculatePoints(cfg, 0, false, NaN)).toEqual({ basePoints: 1, streakBonus: 0, total: 1 });
  });
});

describe("DEFAULT_POINTS_CONFIG maxItemsPerScan", () => {
  it("is 10", () => {
    expect(DEFAULT_POINTS_CONFIG.maxItemsPerScan).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/scan/points.test.ts`
Expected: FAIL — `Property 'maxItemsPerScan' does not exist on type 'PointsConfig'` and cap tests fail because no clamping.

- [ ] **Step 3: Implement clamp in `calculatePoints`**

Replace the entire contents of `src/server/scan/points.ts` with:

```typescript
export type PointsConfig = {
  basePoints: number;
  streakMultiplier: number;
  streakCap: number;
  maxItemsPerScan: number;
};

export type PointsResult = {
  basePoints: number;
  streakBonus: number;
  total: number;
};

export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  basePoints: 1,
  streakMultiplier: 0.5,
  streakCap: 10,
  maxItemsPerScan: 10,
};

export function calculatePoints(cfg: PointsConfig, streakDays: number, isFirstOfDay: boolean, itemCount: number = 1): PointsResult {
  const raw = Number.isFinite(itemCount) ? Math.floor(itemCount) : 1;
  const items = Math.min(cfg.maxItemsPerScan, Math.max(1, raw));
  const base = cfg.basePoints * items;
  if (!isFirstOfDay) return { basePoints: base, streakBonus: 0, total: base };
  const capped = Math.min(Math.max(streakDays, 0), cfg.streakCap);
  const bonus = Math.floor(capped * cfg.streakMultiplier);
  return { basePoints: base, streakBonus: bonus, total: base + bonus };
}
```

- [ ] **Step 4: Update the existing "matches Go backend values" test**

In `src/server/scan/points.test.ts`, find:

```typescript
expect(DEFAULT_POINTS_CONFIG).toEqual({ basePoints: 1, streakMultiplier: 0.5, streakCap: 10 });
```

Replace with:

```typescript
expect(DEFAULT_POINTS_CONFIG).toEqual({ basePoints: 1, streakMultiplier: 0.5, streakCap: 10, maxItemsPerScan: 10 });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/server/scan/points.test.ts`
Expected: PASS (all tests including the new ones).

- [ ] **Step 6: Run full test suite to confirm no regression**

Run: `npm test`
Expected: PASS (no failures).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 8: Commit**

```bash
git add src/server/scan/points.ts src/server/scan/points.test.ts
git commit -m "feat(scan): cap itemCount at maxItemsPerScan=10

Bound point yield per scan. Detectors that over-count (or are tricked)
can no longer mint arbitrary points. Raw det.itemCount continues to be
persisted for audit; only the points calculation clamps."
```

---

## Task 2: Shorten approver session to 5 minutes

**Files:**
- Modify: `src/server/approver/mint.ts`

- [ ] **Step 1: Change `SLOTS_PER_SESSION`**

In `src/server/approver/mint.ts`, find:

```typescript
export const SLOT_DURATION_MS = 30_000;
export const SLOTS_PER_SESSION = 30;
export const SESSION_DURATION_MS = SLOT_DURATION_MS * SLOTS_PER_SESSION; // 15 minutes
```

Replace with:

```typescript
export const SLOT_DURATION_MS = 30_000;
export const SLOTS_PER_SESSION = 10;
export const SESSION_DURATION_MS = SLOT_DURATION_MS * SLOTS_PER_SESSION; // 5 minutes
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: PASS — existing approver tests should not depend on a specific slot count, but verify.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/approver/mint.ts
git commit -m "feat(approver): shorten session to 5 min (SLOTS_PER_SESSION 30->10)

Reduces the window during which a leaked QR could be replayed and
shrinks the per-student multi-slot capture surface."
```

---

## Task 3: Add per-(student, session) award cap to `claimSlot`

**Files:**
- Modify: `src/server/approver/repo.ts`
- Test: `src/server/approver/repo.test.ts` (create)

This task adds a new branch inside the existing `claimSlot` transaction. The transaction now reads/writes two docs atomically: `sessions/{sid}/slots/{slot}` (existing) and `sessions/{sid}/students/{uid}` (new).

- [ ] **Step 1: Write failing tests using a mocked Firestore transaction**

Create `src/server/approver/repo.test.ts` with the following content:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

type TxOp = { kind: "get" | "set" | "update"; refKey: string; data?: unknown };

vi.mock("@/server/lib/firebase", () => {
  return {
    fbFirestore: () => globalThis.__fsMock,
  };
});

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { increment: (n: number) => ({ __increment: n }) },
}));

function makeFsMock(opts: {
  sessionExists: boolean;
  sessionData?: Record<string, unknown>;
  slotExists: boolean;
  studentExists: boolean;
}) {
  const ops: TxOp[] = [];
  const refFor = (path: string) => ({ __path: path });
  function docFn(path: string) {
    return {
      ...refFor(path),
      collection: (name: string) => ({
        doc: (id: string) => ({ ...refFor(`${path}/${name}/${id}`) }),
      }),
    };
  }
  const fs = {
    collection: (name: string) => ({
      doc: (id: string) => docFn(`${name}/${id}`),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const tx = {
        get: async (ref: { __path: string }) => {
          ops.push({ kind: "get", refKey: ref.__path });
          if (ref.__path.endsWith("/slots/0")) {
            return { exists: opts.slotExists };
          }
          if (ref.__path.includes("/students/")) {
            return { exists: opts.studentExists };
          }
          return {
            exists: opts.sessionExists,
            data: () => opts.sessionData ?? {},
          };
        },
        set: (ref: { __path: string }, data: unknown) => {
          ops.push({ kind: "set", refKey: ref.__path, data });
        },
        update: (ref: { __path: string }, data: unknown) => {
          ops.push({ kind: "update", refKey: ref.__path, data });
        },
      };
      return fn(tx);
    },
    __ops: ops,
  };
  return fs;
}

beforeEach(() => {
  globalThis.__fsMock = undefined;
});

async function importRepo() {
  return await import("./repo");
}

describe("claimSlot per-(student, session) cap", () => {
  it("rejects with student_already_awarded when student doc exists", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() + 60_000) },
      slotExists: false,
      studentExists: true,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("student_already_awarded");
    const ops = globalThis.__fsMock.__ops as TxOp[];
    expect(ops.find((o) => o.kind === "set" && o.refKey.endsWith("/slots/0"))).toBeUndefined();
    expect(ops.find((o) => o.kind === "set" && o.refKey.endsWith("/students/student1"))).toBeUndefined();
  });

  it("rejects with slot_used when slot doc exists", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() + 60_000) },
      slotExists: true,
      studentExists: false,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("slot_used");
  });

  it("writes both slot and student docs on success", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() + 60_000) },
      slotExists: false,
      studentExists: false,
    });
    const { claimSlot } = await importRepo();
    const result = await claimSlot("sess1", 0, "student1", "scan1");
    expect(result.staffUid).toBe("staff1");
    const ops = globalThis.__fsMock.__ops as TxOp[];
    expect(ops.find((o) => o.kind === "set" && o.refKey.endsWith("/slots/0"))).toBeTruthy();
    expect(ops.find((o) => o.kind === "set" && o.refKey.endsWith("/students/student1"))).toBeTruthy();
    expect(ops.find((o) => o.kind === "update" && o.refKey === "approverSessions/sess1")).toBeTruthy();
  });

  it("rejects with session_not_found when session missing", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: false,
      slotExists: false,
      studentExists: false,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("session_not_found");
  });

  it("rejects with session_ended when endedAt is set", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
      slotExists: false,
      studentExists: false,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("session_ended");
  });

  it("rejects with session_expired when past expiresAt", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() - 1_000) },
      slotExists: false,
      studentExists: false,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("session_expired");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/approver/repo.test.ts`
Expected: FAIL — `claimSlot` does not throw `student_already_awarded` (does not yet read/write `students/{uid}` doc).

- [ ] **Step 3: Update `ClaimError` type and `claimSlot` body**

In `src/server/approver/repo.ts`, find:

```typescript
export type ClaimError = "session_not_found" | "session_ended" | "session_expired" | "slot_used";

export async function claimSlot(sessionId: string, slot: number, studentUid: string, scanId: string): Promise<{ staffUid: string }> {
  const fs = fbFirestore();
  const sessionRef = fs.collection(COLLECTION).doc(sessionId);
  const slotRef = sessionRef.collection("slots").doc(String(slot));
  return fs.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new Error("session_not_found");
    const data = sessionSnap.data() ?? {};
    if (data.endedAt) throw new Error("session_ended");
    const expiresMs = tsToMs(data.expiresAt);
    if (expiresMs && Date.now() > expiresMs) throw new Error("session_expired");

    const slotSnap = await tx.get(slotRef);
    if (slotSnap.exists) throw new Error("slot_used");

    tx.set(slotRef, {
      usedBy: studentUid,
      usedAt: new Date(),
      scanId,
    });
    tx.update(sessionRef, { awardsCount: FieldValue.increment(1) });

    return { staffUid: String(data.staffUid ?? "") };
  });
}
```

Replace with:

```typescript
export type ClaimError =
  | "session_not_found"
  | "session_ended"
  | "session_expired"
  | "slot_used"
  | "student_already_awarded";

export async function claimSlot(sessionId: string, slot: number, studentUid: string, scanId: string): Promise<{ staffUid: string }> {
  const fs = fbFirestore();
  const sessionRef = fs.collection(COLLECTION).doc(sessionId);
  const slotRef = sessionRef.collection("slots").doc(String(slot));
  const studentRef = sessionRef.collection("students").doc(studentUid);
  return fs.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new Error("session_not_found");
    const data = sessionSnap.data() ?? {};
    if (data.endedAt) throw new Error("session_ended");
    const expiresMs = tsToMs(data.expiresAt);
    if (expiresMs && Date.now() > expiresMs) throw new Error("session_expired");

    const slotSnap = await tx.get(slotRef);
    if (slotSnap.exists) throw new Error("slot_used");

    const studentSnap = await tx.get(studentRef);
    if (studentSnap.exists) throw new Error("student_already_awarded");

    const now = new Date();
    tx.set(slotRef, {
      usedBy: studentUid,
      usedAt: now,
      scanId,
    });
    tx.set(studentRef, {
      awardedAt: now,
      slot,
      scanId,
    });
    tx.update(sessionRef, { awardsCount: FieldValue.increment(1) });

    return { staffUid: String(data.staffUid ?? "") };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/approver/repo.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/server/approver/repo.ts src/server/approver/repo.test.ts
git commit -m "feat(approver): cap one award per (student, session) in claimSlot tx

Atomically write sessions/{sid}/students/{uid} alongside the existing
slot doc. Second confirm attempt by the same student in the same
approver session now throws student_already_awarded (mapped to 409 by
the confirm route in a follow-up commit). Defense in depth: slot
single-use check still runs."
```

---

## Task 4: Wire `student_already_awarded` → 409 in `/scan/confirm`

**Files:**
- Modify: `src/app/api/v1/scan/confirm/route.ts`

- [ ] **Step 1: Add the new error branch**

In `src/app/api/v1/scan/confirm/route.ts`, find the existing error mapping block:

```typescript
  } catch (e) {
    const msg = e instanceof Error ? e.message : "claim failed";
    if (msg === "session_not_found") return jsonError(400, "approver session not found");
    if (msg === "session_ended") return jsonError(400, "approver session ended");
    if (msg === "session_expired") return jsonError(400, "approver session expired");
    if (msg === "slot_used") return jsonError(409, "QR ถูกใช้ไปแล้ว ขอ QR ใหม่จากเจ้าหน้าที่");
    console.error("claim slot failed", e);
    return jsonError(500, "claim failed");
  }
```

Replace with:

```typescript
  } catch (e) {
    const msg = e instanceof Error ? e.message : "claim failed";
    if (msg === "session_not_found") return jsonError(400, "approver session not found");
    if (msg === "session_ended") return jsonError(400, "approver session ended");
    if (msg === "session_expired") return jsonError(400, "approver session expired");
    if (msg === "slot_used") return jsonError(409, "QR ถูกใช้ไปแล้ว ขอ QR ใหม่จากเจ้าหน้าที่");
    if (msg === "student_already_awarded") return jsonError(409, "คุณได้รับคะแนนจากรอบนี้แล้ว ขอ QR ใหม่จากเจ้าหน้าที่ในรอบถัดไป");
    console.error("claim slot failed", e);
    return jsonError(500, "claim failed");
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/scan/confirm/route.ts
git commit -m "feat(scan/confirm): map student_already_awarded -> 409 with Thai msg

Surfaces the new claimSlot cap to the client with a user-readable
message instructing the student to request a fresh QR in the next
approver session."
```

---

## Task 5: Flip `BIN_CONFIRM_MODE` default in upload route to `"enforce"`

**Files:**
- Modify: `src/app/api/v1/scan/upload/route.ts`

- [ ] **Step 1: Change the `mode()` default**

In `src/app/api/v1/scan/upload/route.ts`, find:

```typescript
function mode(): Mode {
  const m = (process.env.BIN_CONFIRM_MODE ?? "log") as Mode;
  return m === "off" || m === "enforce" ? m : "log";
}
```

Replace with:

```typescript
function mode(): Mode {
  // Default: enforce — students earn points only after staff QR scan.
  // Matches src/app/api/v1/scan/confirm/route.ts mode() default.
  const m = (process.env.BIN_CONFIRM_MODE ?? "enforce") as Mode;
  return m === "off" || m === "log" ? m : "enforce";
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS — no existing tests depend on the upload-route default mode.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/scan/upload/route.ts
git commit -m "fix(scan/upload): default BIN_CONFIRM_MODE to enforce

Previously defaulted to log mode (awarded at upload, made QR
decorative), which mismatched the confirm route default of enforce.
A prod deploy without the env var set would let students earn without
QR. Aligned defaults; log mode still selectable via explicit env."
```

---

## Task 6: Expose capped itemCount to client as `pointedItems`

**Files:**
- Modify: `src/app/api/v1/scan/upload/route.ts`
- Modify: `src/lib/api.ts`

The upload route already computes `pt.basePoints = basePoints * items` where `items` is now clamped. The client currently shows raw `itemCount`. We surface a new `pointedItems` field so the UI can display "Detected: N (counted: M)" when the two differ.

- [ ] **Step 1: Extend `ScanResult` type**

In `src/lib/api.ts`, find:

```typescript
export interface ScanResult {
  scanId: string
  detectedClass: string
  confidence: number
  itemCount: number
  basePoints: number
  streakBonus: number
  totalPoints: number
  newTotalPoints: number
  streakDays: number
  newRank: string
  prevRank: string
  pendingId?: string
  expiresInSec?: number
  annotatedImage?: string
}
```

Replace with:

```typescript
export interface ScanResult {
  scanId: string
  detectedClass: string
  confidence: number
  itemCount: number
  pointedItems: number
  basePoints: number
  streakBonus: number
  totalPoints: number
  newTotalPoints: number
  streakDays: number
  newRank: string
  prevRank: string
  pendingId?: string
  expiresInSec?: number
  annotatedImage?: string
}
```

- [ ] **Step 2: Compute and include `pointedItems` in upload responses**

In `src/app/api/v1/scan/upload/route.ts`, find this block (just after `const pt = calculatePoints(...)`):

```typescript
  const pt = calculatePoints(DEFAULT_POINTS_CONFIG, newStreak, isFirstOfDay, det.itemCount);
  const newTotal = (prof.totalPoints ?? 0) + pt.total;
```

Replace with:

```typescript
  const pt = calculatePoints(DEFAULT_POINTS_CONFIG, newStreak, isFirstOfDay, det.itemCount);
  const rawItems = Number.isFinite(det.itemCount) ? Math.floor(det.itemCount) : 1;
  const pointedItems = Math.min(DEFAULT_POINTS_CONFIG.maxItemsPerScan, Math.max(1, rawItems));
  const newTotal = (prof.totalPoints ?? 0) + pt.total;
```

- [ ] **Step 3: Add `pointedItems` to the three response payloads**

In the same file, find the first response (mode `"off"`):

```typescript
    return jsonOk({
      scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
      basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
      newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
      annotatedImage: det.annotatedImage,
    });
```

Replace with:

```typescript
    return jsonOk({
      scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
      pointedItems,
      basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
      newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
      annotatedImage: det.annotatedImage,
    });
```

Find the second response (mode `"log"`):

```typescript
  if (m === "log") {
    return jsonOk({
      pendingId, expiresInSec: Math.floor(PENDING_TTL_MS / 1000),
      scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
      basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
      newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
      annotatedImage: det.annotatedImage,
    });
  }
```

Replace with:

```typescript
  if (m === "log") {
    return jsonOk({
      pendingId, expiresInSec: Math.floor(PENDING_TTL_MS / 1000),
      scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
      pointedItems,
      basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
      newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
      annotatedImage: det.annotatedImage,
    });
  }
```

Find the third response (mode `"enforce"`):

```typescript
  return jsonOk({
    pendingId, expiresInSec: Math.floor(PENDING_TTL_MS / 1000),
    scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
    basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
    newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
    awarded: false,
    annotatedImage: det.annotatedImage,
  });
```

Replace with:

```typescript
  return jsonOk({
    pendingId, expiresInSec: Math.floor(PENDING_TTL_MS / 1000),
    scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
    pointedItems,
    basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
    newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
    awarded: false,
    annotatedImage: det.annotatedImage,
  });
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/scan/upload/route.ts src/lib/api.ts
git commit -m "feat(scan): expose pointedItems alongside raw itemCount

Lets the client surface 'Detected: N (counted: M max)' when the
points-side itemCount cap clamps. Raw itemCount unchanged for audit."
```

---

## Task 7: Render capped count on scan result UI (when it differs)

**Files:**
- Modify: `src/app/scan/page.tsx`

- [ ] **Step 1: Find the scan result display section**

Open `src/app/scan/page.tsx`. Search for the JSX that renders `result.itemCount` (use Grep). The exact JSX block depends on current markup. The change is purely additive: where `result.itemCount` is shown, also render a secondary line if `result.pointedItems !== result.itemCount`.

- [ ] **Step 2: Add inline conditional under the itemCount label**

Where the scan result JSX renders the bottle count (search for `itemCount` inside `src/app/scan/page.tsx`), add a small subdued line immediately under it:

```tsx
{result.pointedItems !== result.itemCount && (
  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
    นับให้สูงสุด {result.pointedItems} ขวด/สแกน
  </div>
)}
```

Replace `{result.pointedItems !== ...}` placement so it appears as a child sibling immediately after the existing count display. Do not refactor surrounding markup.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Start dev server and verify**

Run: `npm run dev`
Then in LIFF / browser preview, upload a scan whose detector returns >10 bottles (or temporarily lower `maxItemsPerScan` to 1 in `DEFAULT_POINTS_CONFIG` for testing — revert before commit). Confirm the subdued line appears only when raw and capped differ.

- [ ] **Step 5: Stop dev server, ensure no temporary edits remain**

Verify `npx tsc --noEmit` still clean and `git diff` shows only the intended subdued-line addition.

- [ ] **Step 6: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat(scan/ui): show capped pointedItems hint when detector over-counts"
```

---

## Task 8: Manual end-to-end verification

**No files modified.** This task verifies the full feature in the LIFF webview against a real Firestore.

- [ ] **Step 1: Confirm env**

Ensure `BIN_CONFIRM_MODE` is **either unset** (uses new `enforce` default) **or explicitly `enforce`** in `.env.local` and on Vercel preview env.

Run: `vercel env pull` (or read `.env.local`).

- [ ] **Step 2: Golden path**

In LIFF webview:
1. Student logs in, navigates to `/scan`, uploads a PET bottle photo.
2. Response shows `pendingId` (enforce mode → no award yet).
3. Open `/approver` on a teacher/council/admin account; QR appears and rotates every 30 s.
4. Student scans the QR via the in-page LINE scanner.
5. `/scan/confirm` returns 200; UI shows `confirmed`; profile points increased.

Expected: PASS.

- [ ] **Step 3: Per-student-per-session cap**

With approver session still active from Step 2:
1. Same student uploads a second PET photo (wait past the 60 s cooldown).
2. Scans current rotating approver QR.
3. `/scan/confirm` returns 409 with body `{"error":"คุณได้รับคะแนนจากรอบนี้แล้ว ขอ QR ใหม่จากเจ้าหน้าที่ในรอบถัดไป"}`.
4. Profile points unchanged.

Expected: PASS.

- [ ] **Step 4: Different student same session**

A second student account scans the approver QR (within the same session, different slot or same slot via different timing): should succeed once. Same student rule scoped per-uid only.

Expected: PASS.

- [ ] **Step 5: itemCount cap**

Upload a photo where the detector reports >10 bottles (or temporarily mock by setting `maxItemsPerScan` to 1 — revert immediately). Confirm:
- Response includes `itemCount: <raw>`, `pointedItems: 10`, `basePoints: 10`.
- Result card shows subdued capped-count hint.

Expected: PASS.

- [ ] **Step 6: 5-minute session boundary**

Open `/approver`, note start time. After 5 minutes:
- Approver page shows expired/refresh banner (or final slot ends).
- Attempted `/scan/confirm` with a stale token returns `approver token expired` or `session_expired`.

Expected: PASS.

- [ ] **Step 7: Defense check: replay of saved QR**

Save the QR token string from one slot. After that slot used by any student, attempting a second confirm with the same saved token returns 409 `slot_used`.

Expected: PASS.

- [ ] **Step 8: Push branch**

Run:
```bash
git pull --rebase
bd dolt push
git push
git status
```

Expected: `Your branch is up to date with 'origin/main'.`

---

## Notes for the implementing engineer

- **Project rules:** Use Serena tools for code reads/edits on TypeScript files (`get_symbols_overview`, `find_symbol`, `replace_symbol_body`, `insert_after_symbol`). Use built-in `Read`/`Edit` only on markdown, JSON, env files.
- **Tracking:** Create a beads issue for this work before touching code: `bd create --title="Implement scan QR replay hardening" --type=feature --priority=1`. Claim it with `bd update <id> --claim`. Close when done.
- **No TodoWrite / TaskCreate** — beads only.
- **Commit per task.** Every task ends with a commit. Do not bundle.
- **Push at the end** of the full session, not after each task.
- **TDD discipline:** Tasks 1 and 3 explicitly require running the test, watching it fail, then making it pass. Do not skip the failing-test step — it validates the test actually exercises the new behavior.
- **Test file paths** are co-located next to source: `src/server/.../foo.test.ts`. Follow this pattern.
