# Restore Staff-QR Approver Confirm Flow

**Date:** 2026-06-06
**Status:** Approved design → implementation
**Approach:** Re-apply on current `main` (reference commit `b6ff6ea`), reconcile with 44 commits of drift (1pt/bottle, coins-per-scan, garden). No branch merge — hand-reapply so points/coins/garden survive.

## Goal

Bring back the staff-QR anti-cheat gate removed in merge `305242f`. A student who
scans a bottle earns **nothing** until they physically reach a recycling bin where
staff displays a rotating signed QR and the student's app scans it. Restores the
`council` role as the non-admin approver.

## Decisions

| Knob | Value |
|---|---|
| Approver role | `council` restored (`student < council < admin`) |
| Gate scope | **Everything** — no points AND no coins until confirm |
| Rollout default | `BIN_CONFIRM_MODE=enforce` (gate live on deploy) |
| Student confirm window | `PENDING_TTL_MS = 300_000` (5 min) — time from bottle scan to staff-QR confirm |
| Approver session | 10 slots × 30s = 5 min (`mint.ts`, unchanged from `b6ff6ea`) |

## Architecture

### Modules to reintroduce (from `b6ff6ea`)

| File | Change vs `b6ff6ea` |
|---|---|
| `src/server/approver/token.ts` | verbatim — HMAC slot token sign/verify |
| `src/server/approver/mint.ts` | verbatim — session/slot minting (10×30s) |
| `src/server/approver/repo.ts` | verbatim — `approverSessions`: create/get/end/claimSlot (slot + per-student replay guards) |
| `src/server/scan/pending.ts` | verbatim — `pendingScans` create/hasOutstanding |
| `src/server/scan/build.ts` | **+`coinReward` field on `PendingDocInput`/`PendingDoc`; `PENDING_TTL_MS` 90s→300s** |
| `src/server/scan/award.ts::awardFromPending` | **+increment `coins`/`coinsLifetime` from `p.coinReward`** |
| `src/server/lib/role-guard.ts` | re-add `council` to hierarchy |
| `src/server/user/role-change.ts` + user module | restore council flips |

### Routes to recreate

- `POST /api/v1/approver/sessions` — start session (requires `council`+)
- `POST /api/v1/approver/sessions/[id]/end` — end session
- `POST /api/v1/scan/confirm` — verifySlotToken → claimSlot → awardFromPending
- `src/app/approver/page.tsx` + `layout.tsx` — rotating QR display UI
- `src/app/scan/page.tsx` — pending state + "scan staff QR to confirm" step
- `src/app/admin/page.tsx` — re-add student↔council role toggle
- `src/components/shared/BottomNav.tsx` — re-add approver entry for council+admin (coexist with garden nav)

## Data flow

```
student /scan → upload image → AI detect → calculatePoints (1pt/bottle) + coinReward(streak,daily)
   → buildPendingDoc {points, coinReward, ...} → createPending (status awaiting_bin, TTL 5min)
   → response: pending preview, NO points/coins yet

staff /approver → POST sessions → screen shows rotating QR (current 30s slot token)

student app scans staff QR → POST /scan/confirm {pendingId, approverToken}
   → verifySlotToken(STAFF_QR_SECRET) → claimSlot(session, slot, studentUid, scanId)
       (slot-used + student-already-awarded guards)
   → awardFromPending → points + coins + streak/daily/rank + class totals + goal land
```

`BIN_CONFIRM_MODE=off` short-circuits to the existing immediate `awardScan` path.

## Award reconcile (the gate-everything bit)

Upload route currently calls `awardScan` with both `calculatePoints` and
`coinReward`. Under the gate it instead stuffs both into the pending doc and
awards nothing. `awardFromPending` tx increments, idempotent on pending `awarded`:

- `totalPoints += p.totalPoints` (1pt/bottle, capped 10/scan)
- `coins += p.coinReward`, `coinsLifetime += p.coinReward`
- `totalScans += 1`, streak/daily/rank, class totals, school goal `currentBottles += 1`

`awardScan` (immediate path) retained for `off` mode.

## Env vars (new)

| Var | Use | Default |
|---|---|---|
| `STAFF_QR_SECRET` | HMAC sign approver slot tokens (≥16 bytes) | none — confirm route 500s if missing |
| `BIN_CONFIRM_MODE` | `off` \| `log` \| `enforce` | `enforce` |

## Firestore

`firestore.indexes.json` — add `pendingScans` composite (uid + status + expiresAt)
+ approver session indexes from `b6ff6ea`. Existing `scanAttempts` indexes kept.
Run `firebase deploy --only firestore:indexes` post-merge.

## Testing

- Restore `approver/token.test.ts`, `approver/repo.test.ts`, role-guard council cases.
- **New** `award` test: `awardFromPending` increments coins (regression guard for reconcile).
- **New** `build` test: pending doc carries `coinReward`.
- Manual: upload → pending (no points), confirm via approver QR → points+coins land; expiry after 5min; replay blocked.

## Out of scope

- Migrating existing accounts to council (manual in Firestore, like admin).
- Changing AI detection, abuse guards (cooldown/daily/IP), or garden.

## Post-deploy (human ops)

1. Set `STAFF_QR_SECRET` in Vercel env (≥16 random bytes).
2. `firebase deploy --only firestore:indexes`.
3. Grant `council` to staff accounts in Firestore.
