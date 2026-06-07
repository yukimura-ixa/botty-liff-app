# Approver QR — Standing, Multi-Use, 5-min Rotation

**Date:** 2026-06-07
**Status:** Approved design, ready for implementation plan

## Goal

Replace the current single-use, 30-second-slot approver QR with a **standing rotating QR**:

- Council opens a stand on `/approver`; the QR **rotates every 5 minutes** and stays live all day while the screen is open.
- **Unlimited distinct students** may scan the current code; **each student may claim a given code at most once** (allowed again on the next rotation).
- After a reward, per-student volume is governed by the **existing exponential cooldown** (`src/server/scan/cooldown.ts`) — not rebuilt.

The "~50 students per code per day" in the request is expected throughput, **not a hard counter** — there is no per-code claim cap.

## Background: current vs target

### Current (being replaced)
- `createSession(staffUid)` writes an `approverSessions` doc with a fixed 5-min `expiresAt`.
- `mintSessionTokens` precomputes 10 slot tokens (30s each, `SLOT_DURATION_MS = 30_000`, `SLOTS_PER_SESSION = 10`).
- `/approver` renders tokens by clock index; QR changes every 30s.
- `claimSlot` is single-use: writes `slots/{slot}` (throws `slot_used` if taken) and `students/{uid}` per-session (throws `student_already_awarded`). ~10 students/session max.
- Confirm flow: `BIN_CONFIRM_MODE=enforce` (default) → scan upload builds a locked pending; `POST /scan/confirm` claims a slot and awards.

### Target
- Open-ended stand; QR rotates every 5 min; multi-use code, once per student per code.
- Client fetches the current token on open and refetches each rotation (Approach A — on-demand current-token endpoint + client polling).

### Why multi-use is safe (abuse model)
Points never mint from a QR alone. Each student first uploads a **real AI-detected PET scan** gated by duplicate-image hash + exponential cooldown + daily-limit-10; the QR confirm only unlocks an already-earned pending. A leaked code (≤5-min life) lets a remote student confirm *their own* real scan slightly off-site — low value, bounded by per-student throttles. `already_claimed_code` prevents replaying one code for multiple pendings; pendings expire so codes can't be hoarded.

## Decisions

| Topic | Decision |
|---|---|
| QR lifecycle | Standing rotating QR (open-ended while screen open). |
| Rotation interval | **5 minutes** (`SLOT_DURATION_MS = 300_000`). |
| "50" cap | No hard per-code counter. Multi-use; once per student per code. |
| Per-student throttle | Reuse existing exponential `cooldownMs` + `DAILY_BOTTLE_LIMIT` (upload-side). |
| Token delivery | Approach A: on-demand current-token endpoint, client polls each rotation. |
| Collection/types | Keep `approverSessions` + `ApproverSession` (semantics change, names kept for minimal churn). |
| Stand safety cap | `APPROVER_STAND_MS`, default 4h (zombie-stand cap, not a usage limit). |
| Boundary grace | `APPROVER_SLOT_GRACE_SEC`, default 10s (accept immediately-previous slot). |

## Server changes

### `src/server/approver/mint.ts`
- `SLOT_DURATION_MS`: `30_000` → `300_000` (5 min).
- `mintSessionTokens` / `SLOTS_PER_SESSION`: no longer used by the live flow (left in place; deletion is an optional follow-up).
- Keep `currentSlot(startedAtMs, nowMs)`.
- Add pure `currentSlotToken(sessionId, startedAtMs, secret, nowMs): MintedSlot` — mints the single active slot's token with `validFrom`/`validUntil` = that slot's 5-min window.

### `src/server/approver/token.ts`
- Unchanged (still HMAC-signs `{ sessionId, slot, validFrom, validUntil }`).

### `src/server/approver/repo.ts`
- `createSession(staffUid)`: `expiresAt = startedAt + APPROVER_STAND_MS` (default 4h). `awardsCount` stays.
- `claimSlot(sessionId, slot, studentUid, scanId)`:
  - Remove the `slots/{slot}` single-use check (no more `slot_used`).
  - Replace the per-session `students/{uid}` guard with a per-`(slot,uid)` claim doc id `${slot}_${uid}` (in a `claims` subcollection). If it exists → throw `already_claimed_code`.
  - Keep session validity checks (`session_not_found` / `session_ended` / `session_expired`) and `awardsCount` increment.
  - Concurrency: distinct `${slot}_${uid}` docs in separate transactions → no single-slot hotspot.

### `src/server/scan/cooldown.ts`
- Untouched. Reused as-is.

## API changes

### `POST /api/v1/approver/sessions` (open stand)
Auth: `canApprove(ctx.role)`. Response returns the **current** token (not the array):
```
{ sessionId, startedAt, expiresAt, token, slot, validFrom, validUntil, awardsCount }
```

### NEW `GET /api/v1/approver/sessions/[id]/token`
Auth: `canApprove` **and** caller `uid === session.staffUid` (owner-only). Validates open + not past `expiresAt`. Returns:
```
{ token, slot, validFrom, validUntil, awardsCount }
```
Errors: `404` no session; `403` not owner; `410` ended/expired.

### `POST /api/v1/scan/confirm`
- `claimSlot` is now multi-use. Token window check accepts the current slot **or** the immediately-previous slot within `APPROVER_SLOT_GRACE_SEC` (default 10s) — covers rotation-boundary races.
- Error mapping: drop `slot_used`; map `already_claimed_code` → `409 "คุณรับคะแนนจาก QR นี้แล้ว รอรอบถัดไป"`.

### `POST /api/v1/approver/sessions/[id]/end`
- Unchanged.

## Client changes

### `src/lib/api.ts`
- `openApproverSession()` return type → single token (+ `validUntil`, `awardsCount`).
- Add `getApproverToken(sessionId)` → `{ token, slot, validFrom, validUntil, awardsCount }`.
- `confirmScan(pendingId, token)` signature unchanged.

### `src/app/approver/page.tsx`
- Remove precomputed-array + clock-index rendering.
- On open: render the returned token; set a timer to refetch via `getApproverToken` at `validUntil` minus ~2s lead; re-render the new QR; repeat.
- Show live **awarded count** ("ให้คะแนนแล้ว N ครั้ง") from the refetch payload (partial fix for `botty-8c7`; `botty-9a8` becomes moot — QR auto-rotates).
- On `410`: show "เซสชันหมดเวลา · เปิดใหม่" reopen UI (as today).
- On refetch failure: keep the stale QR + a manual "รีเฟรช" fallback button; never crash.
- Copy: "QR เปลี่ยนทุก 5 นาที · นักเรียนสแกนรับคะแนนได้หลายคน".

### `src/app/scan/page.tsx` (student)
- No functional change (already scans staff QR → `confirmScan`). Only the server-supplied rejection text differs.

## Edge cases

- **Rotation-boundary race** → previous-slot grace (`APPROVER_SLOT_GRACE_SEC`, 10s).
- **Clock skew** → absorbed by 5-min windows + grace; token times are server-minted unix seconds.
- **Stand expiry (4h)** → token endpoint `410` → client reopen prompt.
- **Owner-only token fetch** → non-owner `403` (each council opens their own stand/counter).
- **Refetch failure on council device** → stale QR + manual refresh; no crash.
- **Concurrent claims** → per-`(slot,uid)` docs, no slot hotspot.

## Testing

Pure-logic only (project convention — Firestore repos verified manually + via routes):
- `mint.ts`: `currentSlot` (existing) + new `currentSlotToken` — asserts it signs the slot for `nowMs`, correct 5-min `validFrom`/`validUntil`, round-trips through `verifySlotToken`.
- Extract pure `isSlotAcceptable(claimedSlot, currentSlot, graceSec, nowSec, claimValidUntil)` for the boundary/grace rule; unit-test current/previous-within-grace/expired.
- `cooldown.ts`: existing tests unchanged.
- Manual: two students same code both succeed; same student same code again → `already_claimed_code`; same student next rotation (cooldown passed) → allowed; standing QR rotates at 5 min; counter increments; expired-stand reopen; non-owner token fetch `403`.

## Out of scope

- Changing upload-side cooldown / daily-limit values.
- The `council` vs `hasRole` docs topic (handled in `botty-6aj`).
- Deleting unused `mintSessionTokens` / `SLOTS_PER_SESSION` (optional follow-up).
- Closes/supersedes `botty-9a8` (refresh-after-scan); partially addresses `botty-8c7` (awarded count).
