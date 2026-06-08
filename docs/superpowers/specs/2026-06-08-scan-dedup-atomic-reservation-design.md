# Scan dedup: atomic imageHash reservation

**Issues:** botty-cnr (fix), botty-j1r (resolve as by-design)
**Date:** 2026-06-08

## Problem

`isDuplicateScan` (`src/server/scan/repo.ts`) checks other users' in-flight
`pendingScans` for the same `imageHash`, but the check is **read-then-write with
no atomic reservation**. Two students who submit the same photo within the
`detect()` window (~Roboflow round-trip) both pass the dedup read before either
`createPending` (`upload/route.ts`) runs, then both confirm via their own
single-use staff QR → **double award**. PR15 narrowed the window but did not
close it.

The same race exists in `off`/`log` mode: two concurrent same-image uploads get
distinct (client-generated) `scanId`s, so the `awardScan` create-if-absent guard
does not dedup them and both award.

### Why a query-based fix cannot work

Firestore transactions only conflict on documents actually read/written. A query
for "no matching pending" does **not** lock the absent row, so two concurrent
transactions both observe an empty result and both proceed. The race can only be
closed by keying the reservation on a **deterministic document id** = the sha256
`imageHash`.

## Scope

**In scope:** atomic exact-`imageHash` (sha256) reservation written at upload
time, before `detect()`.

**Out of scope (j1r, resolved as by-design):** cooldown / daily-cap / pHash
markers remain award-keyed. Rationale: re-upload is bounded by
`hasOutstandingPending` (one open pending per 5 min) and, after this change, the
reservation blocks identical-bytes cross-user in-flight submissions. pHash is
fuzzy (hamming distance) and cannot be keyed to a deterministic doc id, so it
stays a best-effort read — same caveat class as the pHash/sharp fallback already
documented in PR15.

## Design

### New unit: `src/server/scan/reservation.ts`

- **`reservationDecision(existing, uid, now) -> "reserve" | "blocked"`** — pure,
  unit-tested (TDD). `existing` is `{ uid: string; expiresAt: Date } | null`.
  Returns `"reserve"` when there is no existing doc, OR it is expired
  (`expiresAt <= now`), OR it is held by the same `uid`. Otherwise `"blocked"`.
- **`reserveImageHash(uid, sha256, now = new Date()) -> Promise<{ reserved: boolean; holderUid?: string }>`**
  — runs a Firestore transaction on `scanReservations/{sha256}`. Reads the doc,
  applies `reservationDecision`. On `"reserve"`, `tx.set` `{ uid, expiresAt: now +
  PENDING_TTL_MS, createdAt: now }` and returns `{ reserved: true }`. On
  `"blocked"`, returns `{ reserved: false, holderUid }`.
- **`releaseImageHash(sha256, uid) -> Promise<void>`** — best-effort: delete
  `scanReservations/{sha256}` only if held by `uid` (transactional check). Swallows
  errors. Called on non-awarding exit paths so a failed scan frees the slot.

`PENDING_TTL_MS` (5 min, from `src/server/scan/build.ts`) is the reservation
lifetime — identical to the in-flight pending window. Doc id is the sha256 hex
string (64 chars, valid Firestore id). The doc is read only by id (never
queried), so it needs **no composite index**.

### Route wiring: `src/app/api/v1/scan/upload/route.ts`

1. After `isDuplicateScan` passes, **before `detect()`**:
   ```
   const r = await reserveImageHash(ctx.uid, hash);
   if (!r.reserved) {
     // log denied_dup_hash, return 409 { error: "duplicate scan", reason: "pending_sha256" }
   }
   ```
   Same client response shape as today's `pending_sha256` path.
2. On the post-reserve failure exits — not-a-bottle (422), detector-error (500),
   storage-error (500) — call `await releaseImageHash(hash, ctx.uid)`
   (best-effort) before returning.
3. Award and pending creation paths are unchanged. The reservation lingers up to
   5 min then TTL-purges; once the scan is awarded the scans-doc sha256 dedup
   (per-user 24 h) and pHash global (7 d) take over, exactly as today.

### `isDuplicateScan` (`src/server/scan/repo.ts`)

- Remove the non-atomic exact `pendingShaSnap` block (lines ~53–62) — superseded
  by the atomic reservation.
- Keep: scans sha256 (awarded, per-user 24 h), pHash same-user, pHash global, and
  `pending_phash` (fuzzy → cannot be doc-keyed, stays best-effort read).
- Remove `"pending_sha256"` from the `DuplicateResult` reason union; the route now
  supplies that reason string from the reservation result.

### Ops

- Add a `scanReservations.expiresAt` TTL `fieldOverride` to
  `firestore.indexes.json` (mirrors the existing `scanAttempts.expiresAt`
  override). No `indexes` entry (doc-id gets only).
- Post-deploy (human, cannot be done from code):
  `firebase deploy --only firestore:indexes`, then enable the TTL policy on
  `scanReservations.expiresAt` in the Firebase console (Blaze already enabled per
  botty-2yh).
- Add a CLAUDE.md post-deploy note and file an ops issue (sibling of botty-kdr).
  Without TTL the collection grows unbounded (one doc per distinct upload hash).

### Testing

- TDD `reservationDecision`: no-doc → reserve; expired → reserve; same-uid →
  reserve; live other-uid → blocked; boundary `expiresAt === now` → reserve
  (expired).
- `reserveImageHash` / `releaseImageHash` transactions: Firestore repos, verified
  manually per project convention (not unit-tested). Manual check: two concurrent
  same-image uploads from different uids → exactly one reserves, the other gets
  409.

### j1r resolution

Close botty-j1r as by-design. Add a code comment at the cooldown/daily-cap site
noting these are intentionally award-keyed, bounded by `hasOutstandingPending` +
the new reservation. Record the rationale in the close reason.

## Files touched

- `src/server/scan/reservation.ts` (new) + `reservation.test.ts` (new)
- `src/server/scan/repo.ts` (remove pending_sha256 block, trim union)
- `src/app/api/v1/scan/upload/route.ts` (reserve before detect, release on fail)
- `firestore.indexes.json` (TTL fieldOverride)
- `CLAUDE.md` (post-deploy note)
