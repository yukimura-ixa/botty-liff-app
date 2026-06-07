# Approver Standing Multi-Use QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the approver QR from a 5-min single-use, 30s-slot session into a standing QR that rotates every 5 minutes and can be scanned by unlimited distinct students (each once per code), with per-student volume governed by the existing exponential cooldown.

**Architecture:** Slots become 5-min windows. The server mints only the *current* slot token on demand (open + a new poll endpoint); the `/approver` client refetches each rotation. `claimSlot` drops single-use and instead writes a per-`(slot,uid)` claim doc. Confirm accepts the current or immediately-previous slot within a small grace.

**Tech Stack:** Next.js 16 App Router (Node runtime API routes), TypeScript, Firebase Admin (Firestore), Vitest. HMAC slot tokens (`node:crypto`).

---

## Spec

Source: `docs/superpowers/specs/2026-06-07-approver-qr-standing-multiuse-design.md`.

## Conventions (read before coding)

- Use Serena MCP tools for reading/editing code files (CLAUDE.md). New files may use Write.
- Firestore repos are NOT unit-tested (convention) — only pure functions/data get Vitest tests. Repos/routes/components verified by `npx tsc --noEmit`, `npm run lint`, `npm run build`, and manual checks.
- API routes: `export const runtime = "nodejs";`, auth via `verifyBearerToken`, `canApprove(ctx.role)` for staff, `jsonError`/`jsonOk` helpers.
- Tests run as `npm test -- <path>`.

## File structure

```
src/server/approver/
  mint.ts        # MODIFY: 5-min slots; add currentSlotToken + isSlotTokenValid (pure)   (TESTED)
  mint.test.ts   # CREATE: tests for currentSlot, currentSlotToken, isSlotTokenValid
  repo.ts        # MODIFY: open-ended createSession; multi-use claimSlot; ClaimError
  token.ts       # unchanged
src/app/api/v1/approver/sessions/
  route.ts                 # MODIFY: return current token (not array)
  [id]/token/route.ts      # CREATE: GET current token (owner-only)
  [id]/end/route.ts        # unchanged
src/app/api/v1/scan/
  confirm/route.ts         # MODIFY: grace via isSlotTokenValid; error mapping
src/lib/api.ts             # MODIFY: token types; openApproverSession; add getApproverToken
src/app/approver/page.tsx  # MODIFY: poll/refetch current token; awarded count; copy
```

---

## Task 1: mint.ts — 5-min slots + pure token/grace helpers

**Files:**
- Modify: `src/server/approver/mint.ts`
- Test: `src/server/approver/mint.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/server/approver/mint.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SLOT_DURATION_MS,
  currentSlot,
  currentSlotToken,
  isSlotTokenValid,
} from "./mint";
import { verifySlotToken } from "./token";

const secret = Buffer.from("test-secret-at-least-16-bytes-long");

describe("SLOT_DURATION_MS", () => {
  it("is 5 minutes", () => {
    expect(SLOT_DURATION_MS).toBe(300_000);
  });
});

describe("currentSlot", () => {
  it("is 0 in the first window and increments per slot", () => {
    const start = 1_000_000;
    expect(currentSlot(start, start)).toBe(0);
    expect(currentSlot(start, start + SLOT_DURATION_MS - 1)).toBe(0);
    expect(currentSlot(start, start + SLOT_DURATION_MS)).toBe(1);
    expect(currentSlot(start, start + 3 * SLOT_DURATION_MS + 5)).toBe(3);
  });
});

describe("currentSlotToken", () => {
  it("mints the active slot with a 5-min window that verifies", () => {
    const start = 1_700_000_000_000;
    const now = start + SLOT_DURATION_MS + 1234; // slot 1
    const minted = currentSlotToken("sess1", start, secret, now);
    expect(minted.slot).toBe(1);
    expect(minted.validUntil - minted.validFrom).toBe(SLOT_DURATION_MS / 1000);
    const claims = verifySlotToken(secret, minted.token);
    expect(claims.sessionId).toBe("sess1");
    expect(claims.slot).toBe(1);
    expect(claims.validFrom).toBe(minted.validFrom);
    expect(claims.validUntil).toBe(minted.validUntil);
  });
});

describe("isSlotTokenValid", () => {
  const validFrom = 1000;
  const validUntil = validFrom + SLOT_DURATION_MS / 1000; // +300
  const grace = 10;
  it("accepts inside the window", () => {
    expect(isSlotTokenValid(validFrom, validFrom, validUntil, grace)).toBe(true);
    expect(isSlotTokenValid(validUntil, validFrom, validUntil, grace)).toBe(true);
  });
  it("rejects before validFrom", () => {
    expect(isSlotTokenValid(validFrom - 1, validFrom, validUntil, grace)).toBe(false);
  });
  it("accepts just after validUntil within grace", () => {
    expect(isSlotTokenValid(validUntil + grace, validFrom, validUntil, grace)).toBe(true);
  });
  it("rejects past validUntil + grace", () => {
    expect(isSlotTokenValid(validUntil + grace + 1, validFrom, validUntil, grace)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server/approver/mint.test.ts`
Expected: FAIL — `currentSlotToken` / `isSlotTokenValid` not exported, and `SLOT_DURATION_MS` is still 30000.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/server/approver/mint.ts` with:

```ts
import { signSlotToken } from "./token";

export const SLOT_DURATION_MS = 300_000; // 5 minutes (QR rotation interval)

// Standing-stand safety cap (zombie-stand cleanup, NOT a usage limit). Default 4h.
export const STAND_DURATION_MS = (() => {
  const n = Number(process.env.APPROVER_STAND_MS);
  return Number.isFinite(n) && n > 0 ? n : 14_400_000;
})();

// Grace (seconds) for accepting the immediately-previous slot at a rotation boundary.
export const SLOT_GRACE_SEC = (() => {
  const n = Number(process.env.APPROVER_SLOT_GRACE_SEC);
  return Number.isFinite(n) && n >= 0 ? n : 10;
})();

export type MintedSlot = {
  slot: number;
  token: string;
  validFrom: number; // unix seconds
  validUntil: number;
};

export function currentSlot(startedAtMs: number, nowMs: number): number {
  return Math.floor((nowMs - startedAtMs) / SLOT_DURATION_MS);
}

// Mints the token for the single slot that `nowMs` falls in.
export function currentSlotToken(
  sessionId: string,
  startedAtMs: number,
  secret: Buffer,
  nowMs: number,
): MintedSlot {
  const slot = currentSlot(startedAtMs, nowMs);
  const fromMs = startedAtMs + slot * SLOT_DURATION_MS;
  const untilMs = fromMs + SLOT_DURATION_MS;
  const validFrom = Math.floor(fromMs / 1000);
  const validUntil = Math.floor(untilMs / 1000);
  const token = signSlotToken(secret, { sessionId, slot, validFrom, validUntil });
  return { slot, token, validFrom, validUntil };
}

// A token is time-valid from validFrom through validUntil + grace (covers the
// rotation boundary where a scan happens just before the QR rotates).
export function isSlotTokenValid(
  nowSec: number,
  validFrom: number,
  validUntil: number,
  graceSec: number,
): boolean {
  return nowSec >= validFrom && nowSec <= validUntil + graceSec;
}
```

(Note: `mintSessionTokens` and `SLOTS_PER_SESSION` are intentionally removed — they were only used by the old precompute flow, which Task 4 replaces. `SESSION_DURATION_MS` is replaced by `STAND_DURATION_MS`; Task 2 updates repo.ts to use the new name.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/server/approver/mint.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/approver/mint.ts src/server/approver/mint.test.ts
git commit -m "feat(approver): 5-min slots + currentSlotToken/isSlotTokenValid helpers"
```

---

## Task 2: repo.ts — open-ended stand + multi-use claimSlot

**Files:**
- Modify: `src/server/approver/repo.ts`

No unit test (Firestore repo — convention). Verified by tsc in this task + manual checks in Task 8.

- [ ] **Step 1: Update the import**

In `src/server/approver/repo.ts`, change line 3 from:

```ts
import { SESSION_DURATION_MS } from "./mint";
```

to:

```ts
import { STAND_DURATION_MS } from "./mint";
```

- [ ] **Step 2: Update `createSession` to use the stand duration**

In `createSession`, change:

```ts
  const expiresAt = new Date(startedAt.getTime() + SESSION_DURATION_MS);
```

to:

```ts
  const expiresAt = new Date(startedAt.getTime() + STAND_DURATION_MS);
```

- [ ] **Step 3: Update `ClaimError` and replace `claimSlot` with the multi-use version**

In `src/server/approver/repo.ts`, replace the `ClaimError` type:

```ts
export type ClaimError =
  | "session_not_found"
  | "session_ended"
  | "session_expired"
  | "slot_used"
  | "student_already_awarded";
```

with:

```ts
export type ClaimError =
  | "session_not_found"
  | "session_ended"
  | "session_expired"
  | "already_claimed_code";
```

Then replace the entire `claimSlot` function with:

```ts
// Multi-use: any number of distinct students may claim the same slot (code),
// but each student may claim a given slot at most once. The per-(slot,uid) claim
// doc enforces "once per code"; the upload-side exponential cooldown governs the
// student's overall volume.
export async function claimSlot(sessionId: string, slot: number, studentUid: string, scanId: string): Promise<{ staffUid: string }> {
  const fs = fbFirestore();
  const sessionRef = fs.collection(COLLECTION).doc(sessionId);
  const claimRef = sessionRef.collection("claims").doc(`${slot}_${studentUid}`);
  return fs.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new Error("session_not_found");
    const data = sessionSnap.data() ?? {};
    if (data.endedAt) throw new Error("session_ended");
    const expiresMs = tsToMs(data.expiresAt);
    if (expiresMs && Date.now() > expiresMs) throw new Error("session_expired");

    const claimSnap = await tx.get(claimRef);
    if (claimSnap.exists) throw new Error("already_claimed_code");

    tx.set(claimRef, {
      studentUid,
      slot,
      scanId,
      claimedAt: new Date(),
    });
    tx.update(sessionRef, { awardsCount: FieldValue.increment(1) });

    return { staffUid: String(data.staffUid ?? "") };
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in files that still reference the removed exports/errors (`src/app/api/v1/scan/confirm/route.ts` for `slot_used`/`student_already_awarded`, and `src/app/api/v1/approver/sessions/route.ts` for `mintSessionTokens`). These are fixed in Tasks 3 and 4. If any OTHER file errors, stop and report.

- [ ] **Step 5: Commit**

```bash
git add src/server/approver/repo.ts
git commit -m "feat(approver): open-ended stand + multi-use claimSlot (once per code per student)"
```

---

## Task 3: confirm route — grace window + new error mapping

**Files:**
- Modify: `src/app/api/v1/scan/confirm/route.ts`

- [ ] **Step 1: Update the token import**

In `src/app/api/v1/scan/confirm/route.ts`, the imports currently include:

```ts
import { verifySlotToken } from "@/server/approver/token";
```

Add `isSlotTokenValid` and `SLOT_GRACE_SEC` from mint. Change that line to:

```ts
import { verifySlotToken } from "@/server/approver/token";
import { isSlotTokenValid, SLOT_GRACE_SEC } from "@/server/approver/mint";
```

- [ ] **Step 2: Replace the token time-window check with the grace-aware check**

Find this block:

```ts
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec < claims.validFrom) return jsonError(400, "approver token not yet valid");
  if (nowSec > claims.validUntil) return jsonError(400, "approver token expired");
```

Replace it with:

```ts
  const nowSec = Math.floor(Date.now() / 1000);
  if (!isSlotTokenValid(nowSec, claims.validFrom, claims.validUntil, SLOT_GRACE_SEC)) {
    return jsonError(400, "approver token expired");
  }
```

- [ ] **Step 3: Update the claim error mapping**

Find this block in the `catch` after `claimSlot`:

```ts
    if (msg === "slot_used") return jsonError(409, "QR ถูกใช้ไปแล้ว ขอ QR ใหม่จากเจ้าหน้าที่");
    if (msg === "student_already_awarded") return jsonError(409, "คุณได้รับคะแนนจากรอบนี้แล้ว ขอ QR ใหม่จากเจ้าหน้าที่ในรอบถัดไป");
```

Replace it with:

```ts
    if (msg === "already_claimed_code") return jsonError(409, "คุณรับคะแนนจาก QR นี้แล้ว รอรอบถัดไป");
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: the confirm-route errors are gone; the only remaining error is `mintSessionTokens` in `src/app/api/v1/approver/sessions/route.ts` (fixed in Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/scan/confirm/route.ts
git commit -m "feat(approver): confirm accepts grace window; map already_claimed_code"
```

---

## Task 4: open-session route returns current token

**Files:**
- Modify: `src/app/api/v1/approver/sessions/route.ts`

- [ ] **Step 1: Replace the route body**

Replace the entire contents of `src/app/api/v1/approver/sessions/route.ts` with:

```ts
import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { canApprove } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { createSession } from "@/server/approver/repo";
import { currentSlotToken } from "@/server/approver/mint";

export const runtime = "nodejs";
export const maxDuration = 15;

function staffSecret(): Buffer {
  const raw = process.env.STAFF_QR_SECRET;
  if (!raw) throw new Error("STAFF_QR_SECRET not configured");
  return Buffer.from(raw, "utf8");
}

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!canApprove(ctx.role)) return jsonError(403, "forbidden");

  try {
    const session = await createSession(ctx.uid);
    const minted = currentSlotToken(session.id, session.startedAtMs, staffSecret(), Date.now());
    return jsonOk({
      sessionId: session.id,
      startedAt: new Date(session.startedAtMs).toISOString(),
      expiresAt: new Date(session.expiresAtMs).toISOString(),
      token: minted.token,
      slot: minted.slot,
      validFrom: minted.validFrom,
      validUntil: minted.validUntil,
      awardsCount: session.awardsCount,
    });
  } catch (err) {
    console.error("approver session create failed", err);
    return jsonError(500, err instanceof Error ? err.message : "failed");
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the `lib/api.ts` client still compiles against its old `tokens[]` type until Task 6, but it does not import from this route, so tsc stays clean; the client/page update happens in Tasks 6-7).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/approver/sessions/route.ts
git commit -m "feat(approver): open-session returns current rotating token"
```

---

## Task 5: new GET current-token endpoint

**Files:**
- Create: `src/app/api/v1/approver/sessions/[id]/token/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/v1/approver/sessions/[id]/token/route.ts`:

```ts
import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { canApprove } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getSession } from "@/server/approver/repo";
import { currentSlotToken } from "@/server/approver/mint";

export const runtime = "nodejs";
export const maxDuration = 10;

function staffSecret(): Buffer {
  const raw = process.env.STAFF_QR_SECRET;
  if (!raw) throw new Error("STAFF_QR_SECRET not configured");
  return Buffer.from(raw, "utf8");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!canApprove(ctx.role)) return jsonError(403, "forbidden");

  const { id } = await params;
  let session;
  try { session = await getSession(id); }
  catch (err) {
    console.error("approver token fetch failed", err);
    return jsonError(500, "failed");
  }
  if (!session) return jsonError(404, "session not found");
  if (session.staffUid !== ctx.uid) return jsonError(403, "not session owner");
  if (session.endedAtMs !== null) return jsonError(410, "session ended");
  if (Date.now() > session.expiresAtMs) return jsonError(410, "session expired");

  const minted = currentSlotToken(session.id, session.startedAtMs, staffSecret(), Date.now());
  return jsonOk({
    token: minted.token,
    slot: minted.slot,
    validFrom: minted.validFrom,
    validUntil: minted.validUntil,
    awardsCount: session.awardsCount,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build (verifies the new dynamic route registers)**

Run: `npm run build`
Expected: build succeeds; route `/api/v1/approver/sessions/[id]/token` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/v1/approver/sessions/[id]/token/route.ts"
git commit -m "feat(approver): GET current-token endpoint (owner-only)"
```

---

## Task 6: client API wrapper

**Files:**
- Modify: `src/lib/api.ts` (the approver section, currently lines ~164-177)

- [ ] **Step 1: Replace the approver types + functions**

In `src/lib/api.ts`, find:

```ts
export type ApproverSlotToken = { slot: number; token: string; validFrom: number; validUntil: number }
export type ApproverSessionResponse = {
  sessionId: string
  startedAt: string
  expiresAt: string
  tokens: ApproverSlotToken[]
}
// Staff opens an approver session; returns the minted rotating slot tokens.
export function openApproverSession() {
  return request<ApproverSessionResponse>('/approver/sessions', { method: 'POST' })
}
export function endApproverSession(id: string) {
  return request<{ ok: boolean }>(`/approver/sessions/${encodeURIComponent(id)}/end`, { method: 'POST' })
}
```

Replace it with:

```ts
export type ApproverTokenInfo = {
  token: string
  slot: number
  validFrom: number
  validUntil: number
  awardsCount: number
}
export type ApproverSessionResponse = {
  sessionId: string
  startedAt: string
  expiresAt: string
} & ApproverTokenInfo
// Staff opens a standing approver stand; returns the current rotating token.
export function openApproverSession() {
  return request<ApproverSessionResponse>('/approver/sessions', { method: 'POST' })
}
// Fetches the current rotating token for an open stand (client polls each rotation).
export function getApproverToken(id: string) {
  return request<ApproverTokenInfo>(`/approver/sessions/${encodeURIComponent(id)}/token`, { method: 'GET' })
}
export function endApproverSession(id: string) {
  return request<{ ok: boolean }>(`/approver/sessions/${encodeURIComponent(id)}/end`, { method: 'POST' })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors now appear in `src/app/approver/page.tsx` (it still imports `ApproverSlotToken` and uses `r.tokens`). Fixed in Task 7. No other files should error (`confirmScan` is unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(approver): client api — current-token open + getApproverToken poll"
```

---

## Task 7: /approver page — poll/refetch + awarded count

**Files:**
- Modify: `src/app/approver/page.tsx` (full rewrite of the client logic)

This page also has the council-tutorial auto-show effect and the reopen button added earlier — **preserve both**.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/app/approver/page.tsx` with:

```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { theme as t } from "@/lib/theme";
import {
  openApproverSession, getApproverToken, endApproverSession,
  ApiError, type ApproverTokenInfo,
} from "@/lib/api";
import { shouldAutoShow } from "@/components/tutorial/logic";

// Guards against an auto-show redirect loop when localStorage writes are blocked
// (LIFF private mode): markSeen can't persist, so without this in-memory guard the
// council tutorial would re-trigger every time the user is routed back to /approver.
// Module-level state survives client-side navigation (the module isn't reloaded),
// so the auto-show fires at most once per loaded session.
let councilTutorialAutoShown = false;

type Stand = {
  sessionId: string;
  expiresAtMs: number;
  tok: ApproverTokenInfo;
};

export default function ApproverPage() {
  const router = useRouter();
  const [stand, setStand] = useState<Stand | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // First time a staff member opens this screen, show the council tutorial once.
  useEffect(() => {
    if (!councilTutorialAutoShown && shouldAutoShow("council", (k) => localStorage.getItem(k))) {
      councilTutorialAutoShown = true;
      router.replace("/tutorial?deck=council");
    }
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const clearRefetch = useCallback(() => {
    if (refetchTimer.current) {
      clearTimeout(refetchTimer.current);
      refetchTimer.current = null;
    }
  }, []);

  // Schedules the next current-token fetch ~2s before the active token expires.
  const scheduleRefetch = useCallback((sessionId: string, validUntilSec: number) => {
    clearRefetch();
    const leadMs = 2000;
    const delay = Math.max(1000, validUntilSec * 1000 - Date.now() - leadMs);
    refetchTimer.current = setTimeout(async () => {
      try {
        const tok = await getApproverToken(sessionId);
        setStand((s) => (s ? { ...s, tok } : s));
        scheduleRefetch(sessionId, tok.validUntil);
      } catch (e: unknown) {
        if (e instanceof ApiError && e.status === 410) {
          setExpired(true);
          return;
        }
        // Transient failure: keep the stale QR; a manual refresh button is shown.
        setErr(e instanceof Error ? e.message : "รีเฟรชไม่สำเร็จ");
      }
    }, delay);
  }, [clearRefetch]);

  const startSession = useCallback(async () => {
    setBusy(true); setErr(""); setExpired(false);
    try {
      const r = await openApproverSession();
      const tok: ApproverTokenInfo = {
        token: r.token, slot: r.slot, validFrom: r.validFrom, validUntil: r.validUntil, awardsCount: r.awardsCount,
      };
      setStand({ sessionId: r.sessionId, expiresAtMs: new Date(r.expiresAt).getTime(), tok });
      scheduleRefetch(r.sessionId, r.validUntil);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(false); }
  }, [scheduleRefetch]);

  const manualRefresh = useCallback(async () => {
    if (!stand) return;
    setErr("");
    try {
      const tok = await getApproverToken(stand.sessionId);
      setStand((s) => (s ? { ...s, tok } : s));
      scheduleRefetch(stand.sessionId, tok.validUntil);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 410) { setExpired(true); return; }
      setErr(e instanceof Error ? e.message : "รีเฟรชไม่สำเร็จ");
    }
  }, [stand, scheduleRefetch]);

  const stopSession = useCallback(async () => {
    if (!stand) return;
    setBusy(true);
    clearRefetch();
    try {
      await endApproverSession(stand.sessionId);
      setStand(null);
      setQrDataUrl("");
      setExpired(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(false); }
  }, [stand, clearRefetch]);

  useEffect(() => () => clearRefetch(), [clearRefetch]);

  // Render the QR whenever the active token changes.
  useEffect(() => {
    if (!stand || expired) return;
    let cancelled = false;
    (async () => {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(stand.tok.token, { errorCorrectionLevel: "M", width: 512, margin: 1 });
      if (!cancelled) setQrDataUrl(url);
    })().catch((e) => console.error("qr render failed", e));
    return () => { cancelled = true; };
  }, [stand, expired]);

  const secsLeftInSlot = stand ? Math.max(0, Math.ceil(stand.tok.validUntil - now / 1000)) : 0;

  return (
    <main style={{ minHeight: "100dvh", background: t.bone, padding: "32px 20px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={() => router.replace("/home")}
          style={{
            background: "transparent", border: "none", color: t.muted,
            fontSize: 13, padding: 0, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← กลับ
        </button>
        <button
          onClick={() => router.push("/tutorial?deck=council")}
          style={{
            background: "transparent", border: "none", color: t.moss,
            fontSize: 13, padding: 0, cursor: "pointer", fontWeight: 700,
            fontFamily: "inherit",
          }}
        >
          วิธีใช้ ?
        </button>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 800, color: t.forest, margin: "0 0 6px" }}>
        QR เจ้าหน้าที่
      </h1>
      <p style={{ fontSize: 13, color: t.muted, margin: "0 0 22px", lineHeight: 1.5 }}>
        นักเรียนสแกน QR นี้เพื่อรับคะแนน · QR เปลี่ยนทุก 5 นาที · นักเรียนสแกนรับคะแนนได้หลายคน
      </p>

      {err && (
        <div style={{ padding: 12, background: `${t.coral}22`, color: t.coral, borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          {err}
        </div>
      )}

      {!stand && (
        <button
          onClick={startSession}
          disabled={busy}
          style={{
            width: "100%", height: 56, borderRadius: 14, border: "none",
            background: t.forest, color: "white",
            fontSize: 16, fontWeight: 800, cursor: busy ? "default" : "pointer",
            fontFamily: "inherit", opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "กำลังเปิด..." : "เปิด QR เจ้าหน้าที่"}
        </button>
      )}

      {stand && !expired && (
        <>
          <div style={{
            background: "white", border: `1px solid ${t.mint}`, borderRadius: 18,
            padding: 18, textAlign: "center",
          }}>
            <div style={{
              fontSize: 11, color: t.muted, letterSpacing: 0.8, fontWeight: 600,
              textTransform: "uppercase", marginBottom: 6,
            }}>
              ให้คะแนนแล้ว {stand.tok.awardsCount} ครั้ง
            </div>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="staff QR"
                style={{ width: "100%", maxWidth: 320, borderRadius: 10, margin: "0 auto", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", aspectRatio: "1", maxWidth: 320, margin: "0 auto", background: t.mint, borderRadius: 10 }} />
            )}
            <div style={{
              marginTop: 10, fontSize: 11, color: t.moss, fontWeight: 700,
            }}>
              QR จะเปลี่ยนใน {secsLeftInSlot} วิ
            </div>
          </div>

          <button
            onClick={manualRefresh}
            disabled={busy}
            style={{
              marginTop: 16, width: "100%", height: 44, borderRadius: 12,
              background: "white", color: t.forest, border: `1px solid ${t.mint}`,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            รีเฟรช QR
          </button>
          <button
            onClick={stopSession}
            disabled={busy}
            style={{
              marginTop: 10, width: "100%", height: 44, borderRadius: 12,
              background: "white", color: t.coral, border: `1px solid ${t.coral}`,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ปิด QR
          </button>
        </>
      )}

      {stand && expired && (
        <div style={{
          background: "white", border: `1px solid ${t.mint}`, borderRadius: 18,
          padding: 22, textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⏱️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.ink, marginBottom: 14 }}>
            เซสชันหมดเวลา
          </div>
          <button
            onClick={() => { setStand(null); setQrDataUrl(""); setExpired(false); startSession(); }}
            disabled={busy}
            style={{
              width: "100%", height: 44, borderRadius: 12, border: "none",
              background: t.forest, color: "white",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            เปิดใหม่
          </button>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors. (A pre-existing `<img>` warning on this file is acceptable — it existed before.)

- [ ] **Step 4: Commit**

```bash
git add src/app/approver/page.tsx
git commit -m "feat(approver): standing QR — poll/refetch each rotation + awarded count"
```

---

## Task 8: Full verification

- [ ] **Step 1: Tests**

Run: `npm test`
Expected: all pass, including `src/server/approver/mint.test.ts`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors (pre-existing `<img>`/repo.test warnings OK).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success; routes `/approver`, `/api/v1/approver/sessions`, `/api/v1/approver/sessions/[id]/token`, `/api/v1/approver/sessions/[id]/end`, `/api/v1/scan/confirm` all present.

- [ ] **Step 5: Manual checks (dev server, requires STAFF_QR_SECRET + BIN_CONFIRM_MODE=enforce)**

Run `npm run dev`. As a council/admin account:
- Open `/approver` → "เปิด QR เจ้าหน้าที่" → QR shows, "ให้คะแนนแล้ว 0 ครั้ง", countdown to 5min.
- Leave it ~5min → QR auto-rotates (new image) without manual action; countdown resets.
- "รีเฟรช QR" fetches a fresh code immediately.
As a student (separate account), with a real PET scan pending:
- Scan the staff QR → points unlock; council counter increments on next refetch.
- Same student scans the SAME on-screen code again → `409 "คุณรับคะแนนจาก QR นี้แล้ว รอรอบถัดไป"`.
- A second student scans the SAME code → succeeds (multi-use).
- After the stand's 4h cap (or temporarily set `APPROVER_STAND_MS=60000` to test), the token endpoint returns 410 → page shows "เซสชันหมดเวลา · เปิดใหม่".

- [ ] **Step 6: Final commit (only if manual checks required fixes)**

```bash
git add -A
git commit -m "chore(approver): verification fixes"
```

---

## Self-review notes

- **Spec coverage:** 5-min rotation (Task 1) · standing open-ended stand w/ 4h cap (Task 2) · multi-use, once-per-code-per-student via `${slot}_${uid}` claim (Task 2) · reuse exponential cooldown — untouched, enforced at upload (no task needed) · Approach A current-token endpoint + polling (Tasks 4,5,7) · open-session returns current token (Task 4) · owner-only token fetch w/ 410 (Task 5) · grace window (Tasks 1,3) · error remap (Task 3) · awarded count + copy (Task 7) · supersedes botty-9a8 / partial botty-8c7 (Task 7). All covered.
- **Placeholder scan:** none — every code step has full code.
- **Type consistency:** `currentSlotToken`/`isSlotTokenValid`/`SLOT_GRACE_SEC`/`STAND_DURATION_MS`/`SLOT_DURATION_MS` defined in Task 1 and used identically in Tasks 2-5. `already_claimed_code` defined in Task 2, mapped in Task 3. `ApproverTokenInfo` defined in Task 6, consumed in Task 7. `getApproverToken`/`openApproverSession` signatures consistent across Tasks 6-7.
- **Removed-symbol fallout sequenced:** Task 2 removes `SESSION_DURATION_MS`/`mintSessionTokens`/old `ClaimError` members; tsc errors are explicitly expected and resolved in Tasks 3 (confirm) and 4 (open-session route). Final tsc clean at Task 5+.
```
