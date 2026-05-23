# Scan QR Replay Hardening — Design

**Date:** 2026-05-23
**Status:** Approved (brainstorming)
**Author:** Claude Code + napat.pbd@gmail.com

## Problem

Two related abuse paths in the scan → approver-QR → award flow let a student earn points beyond the intended "one approver QR = one student award" semantics:

1. **Mode default mismatch.** `src/app/api/v1/scan/upload/route.ts:38` defaults `BIN_CONFIRM_MODE` to `"log"`, which grants the point award at upload time and treats the approver QR as decorative. `src/app/api/v1/scan/confirm/route.ts:19` defaults the same env var to `"enforce"`. If the env var is unset in any environment, students earn without QR.

2. **Per-session multi-slot capture.** An approver session currently lasts 15 minutes and rotates 30 distinct slot QRs (30 s each); this is being shortened to 5 minutes (10 slots × 30 s). The current `claimSlot` transaction in `src/server/approver/repo.ts:81` enforces uniqueness only on `(sessionId, slot)` — a single student who captures multiple rotating QRs (e.g. by recording the approver screen) can claim one award per slot, capped only by the 60 s scan cooldown and the 20-scan daily limit.

Additionally, `calculatePoints` in `src/server/scan/points.ts:18` floors `itemCount` to ≥1 but has no upper bound, so a detector that returns an unreasonably large bottle count produces unbounded `basePoints`.

## Goal

Make "one trip to an open bin → one award" the enforced invariant, and bound the point yield of any single scan.

## Approach

Four coordinated changes:

1. Align `BIN_CONFIRM_MODE` default to `"enforce"` in both routes.
2. Add a per-(student, session) award cap inside the `claimSlot` transaction.
3. Cap `itemCount` in points calculation.
4. Shorten approver session from 15 min → 5 min (`SLOTS_PER_SESSION: 30 → 10`).

## Components Touched

| File | Change |
|---|---|
| `src/server/approver/repo.ts` | `claimSlot` tx: read/write `sessions/{sid}/students/{uid}` doc |
| `src/app/api/v1/scan/confirm/route.ts` | Map new `student_already_awarded` error → 409 |
| `src/app/api/v1/scan/upload/route.ts` | Default `mode()` → `"enforce"` (was `"log"`) |
| `src/server/scan/points.ts` | `PointsConfig` adds `maxItemsPerScan`; clamp in `calculatePoints` |
| `src/server/scan/points.test.ts` | Cap tests |
| `src/server/approver/repo.test.ts` *(new)* | claimSlot tx student-cap tests |
| `src/server/approver/mint.ts` | `SLOTS_PER_SESSION: 30 → 10` (5-min session) |

## Firestore Layout

New sub-path under existing `approverSessions/{sessionId}`:

```
approverSessions/{sessionId}/
  slots/{slotNum}        ← existing: slot single-use globally
  students/{studentUid}  ← NEW: per-student cap
    awardedAt: Timestamp
    slot: number
    scanId: string
```

No schema migration. Existing in-flight sessions lazy-create the `students/` subcollection on first claim.

## Data Flow

### `/scan/confirm` after change

1. Verify bearer token (Firebase ID).
2. Verify approver slot token (HMAC, validFrom/validUntil).
3. `claimSlot` transaction:
   a. Read session doc → reject if `endedAt` or expired.
   b. Read `slots/{slot}` → if exists, throw `slot_used` (409).
   c. **Read `students/{uid}` → if exists, throw `student_already_awarded` (409).** *(NEW)*
   d. Atomically write both `slots/{slot}` and `students/{uid}`.
   e. Increment `awardsCount` on session doc.
4. Confirm pending → award (existing logic).

### `/scan/upload` after change

1. Auth, image validation, cooldown, daily limit (unchanged).
2. `mode()` returns `"enforce"` by default *(CHANGED)*.
3. Reject if an outstanding pending exists for the user (existing).
4. Detect → `calculatePoints` clamps `itemCount` to `maxItemsPerScan` *(CHANGED)*.
5. In `enforce` mode: `createPending` only, no award. Return `pendingId`.

## Constants

- `MAX_ITEMS_PER_SCAN = 10` baked into `DEFAULT_POINTS_CONFIG`. No env knob (YAGNI).
- `SLOTS_PER_SESSION = 10` (was 30) in `src/server/approver/mint.ts`. `SESSION_DURATION_MS` auto-derives to 5 min via existing expression.

## Error Handling

**New error: `student_already_awarded`**
- HTTP 409 from `/scan/confirm`.
- User-facing Thai: `"คุณได้รับคะแนนจากรอบนี้แล้ว ขอ QR ใหม่จากเจ้าหน้าที่ในรอบถัดไป"`.
- Wired in `confirm/route.ts` error map next to the existing `slot_used` branch.

**Pending state on student-cap rejection:**
- Pending stays in `awaiting` status (not consumed).
- Student may retry with a different approver session (different `sessionId`).
- Existing TTL expires the pending if unused.

**Mode-default flip risk:**
- Any production deploy without `BIN_CONFIRM_MODE` set will now require approver QR.
- Verify env in current Vercel project before merging; prior session work already set `BIN_CONFIRM_MODE=enforce`, so this is a safer default rather than a behavior change in practice.

**`itemCount` cap UX:**
- Raw `det.itemCount` is still persisted to Firestore (audit trail).
- Response includes both raw `itemCount` and capped `pointedItems` so the UI can show, e.g., `"Detected: 10 (counted: 5 max)"`. Frontend renders the diff only when they differ.

## Threat Model Coverage

| Path | Before | After |
|---|---|---|
| Direct upload bypass | award fires at upload in default-log mode | enforce default; no award without confirm |
| Replay single saved QR | already blocked (slot single-use) | unchanged |
| Capture multiple rotating QRs in one session | up to ~5 awards/session (cooldown-bounded, 5-min window) | 1 award/session per student |
| Detector inflated `itemCount` | unbounded points | capped at `maxItemsPerScan` |

## Backward Compatibility

- `log` mode still functional when explicitly set via env; only the default fallback changes.
- Raw `itemCount` storage unchanged — history, leaderboard, sheets exports continue to show detected count.
- Existing scan/award/pending Firestore documents need no migration.

## Testing

**Pure-function tests (Vitest):**
- `points.test.ts`:
  - `itemCount = 10` with `maxItemsPerScan = 5` → `items = 5`.
  - Edge cases: `itemCount = 0`, negative, `NaN`, exactly `maxItemsPerScan`.
- `repo.test.ts` (new):
  - `claimSlot` student-cap branch with mocked transaction.
  - Slot-cap still enforced (defense in depth).
  - Both docs written on success path; neither written on failure.

**Integration / manual:**
- LIFF webview golden path: scan → confirm → award.
- Same student scans a 2nd bottle in the same approver session → 409 with new Thai message.
- Two different students claim two different slots in the same session → both succeed.
- Photo where detector reports >5 bottles → response shows raw + capped fields.
- Env `BIN_CONFIRM_MODE` unset → enforce path runs (no award at upload).
- Existing in-flight approver session without `students/` subcollection → first claim lazy-creates and succeeds.

**Not tested:**
- Firestore repo internals beyond the new branch (project policy: integration-level coverage for repos).

## Out of Scope

- New per-class or per-bin caps.
- Server-side detector confidence revalidation.
- Audit log entries for capped scans (existing `scans/{id}` doc already records both raw and awarded counts implicitly via points).
