# Scan Attempt Logging — Design

**Date:** 2026-05-28
**Status:** Draft — pending implementation plan
**Author:** Brainstorm session w/ Claude

## Problem

`POST /api/v1/scan/upload` has ~10 outcome branches (award, preview, replay, cooldown, daily-cap, dup-hash, dup-phash, rejected-not-PET, plus several error paths). Current observability is scattered `console.warn`/`console.error` calls in `src/app/api/v1/scan/upload/route.ts`. We cannot:

1. Spot abuse patterns (repeated dup-hash spam, cooldown evasion) from a single user across sessions.
2. Triage "why didn't I get points?" tickets without server log access + grep skills.
3. Measure detector accuracy, daily success rate, or class-level engagement.

## Goals

- **Abuse detection.** Query attempts by uid / outcome / window.
- **Ops debugging.** Per-`scanId` audit trail with outcome and reason.
- **Analytics.** Aggregate outcomes per day / class for quick read.

## Non-goals

- Long-term audit retention. 30 days is enough.
- Logging IP addresses (PII concern, stdout already captures via Vercel Logs if needed).
- Backfilling historical scans.
- Detailed per-scan drill-down beyond what one table row holds.

## Architecture

### New files

- `src/server/scan/log.ts` — helper module. Exports `logScanAttempt(...)` (Firestore + stdout, awaited) and `logScanEvent(...)` (stdout-only, sync).
- `src/server/scan/log-repo.ts` — Firestore `scanAttempts` collection writes + paginated queries for admin UI.
- `src/server/scan/log.test.ts` — unit tests for `log.ts` (pure shape, error swallowing).
- `src/app/api/v1/admin/scan-logs/route.ts` — admin-guarded `GET` handler: filtered list + outcome aggregates.
- `src/app/admin/scan-logs/page.tsx` — global admin UI page.
- New `Scan Logs` tab inside `src/app/admin/student/[uid]/page.tsx` (or co-located component).

### Modified files

- `src/app/api/v1/scan/upload/route.ts` — replace scattered `console.warn`/`console.error` with `logScanEvent`; add `await logScanAttempt(...)` before each Firestore-tracked return.

### Firestore collection: `scanAttempts`

Document fields:

| Field | Type | Notes |
|---|---|---|
| `scanId` | string | client-supplied or server `ulid()` |
| `uid` | string | |
| `classKey` | string | `""` if missing on profile |
| `outcome` | enum (see below) | |
| `at` | Timestamp | server `serverTimestamp()` |
| `localDate` | string | `bangkokDate(at)`, `YYYY-MM-DD` |
| `expiresAt` | Timestamp | `at + 30d`; TTL field |
| `basePoints` | number? | award only |
| `streakBonus` | number? | award only |
| `totalPoints` | number? | award only |
| `itemCount` | number? | award + reject + preview |
| `detectedClass` | string? | award + reject + preview |
| `confidence` | number? | award + reject + preview |
| `clientConf` | number? | award + reject + preview |
| `dupReason` | `"hash"` \| `"phash"` | dup outcomes only |

### Outcome enum

**Firestore-tracked (`ScanOutcome`):**

- `awarded` — student earned points
- `preview` — admin/non-student detect+upload, no points
- `replay` — idempotent resubmit of already-awarded `scanId`
- `denied_cooldown` — 60s window not elapsed
- `denied_daily_cap` — daily limit hit (20)
- `denied_dup_hash` — exact-image hash match
- `denied_dup_phash` — perceptual-hash bucket match
- `rejected_not_pet` — detector returned `accepted=false`

**Stdout-only (`StdoutOnlyOutcome`), no Firestore write:**

- `ip_rate`, `auth`, `bad_request`, `bad_image`, `no_profile`, `not_eligible`
- `error_detector`, `error_storage`, `error_preview`, `error_award_race`

### Indexes

- `(uid, at desc)` — per-user history
- `(outcome, at desc)` — abuse query
- `(classKey, localDate)` — class analytics

### TTL

Firebase TTL policy on `scanAttempts.expiresAt`. Documents auto-purged ~24h after expiry. **Manual one-time step**: enable in Firebase console after first deploy.

## Helper API

```ts
// src/server/scan/log.ts

export type ScanOutcome =
  | "awarded" | "preview" | "replay"
  | "denied_cooldown" | "denied_daily_cap"
  | "denied_dup_hash" | "denied_dup_phash"
  | "rejected_not_pet";

export type StdoutOnlyOutcome =
  | "ip_rate" | "auth" | "bad_request" | "bad_image"
  | "no_profile" | "not_eligible"
  | "error_detector" | "error_storage" | "error_preview" | "error_award_race";

export interface ScanAttemptLog {
  scanId: string;
  uid: string;
  classKey: string;
  outcome: ScanOutcome;
  at: Date;
  localDate: string;
  basePoints?: number;
  streakBonus?: number;
  totalPoints?: number;
  itemCount?: number;
  detectedClass?: string;
  confidence?: number;
  clientConf?: number;
  dupReason?: "hash" | "phash";
}

/** Writes Firestore row + emits stdout JSON. Awaited at call site.
 *  Firestore errors are caught + emitted to stderr; scan flow never breaks. */
export async function logScanAttempt(input: ScanAttemptLog): Promise<void>;

/** Stdout-only path for errors/auth/etc. Synchronous, no await needed. */
export function logScanEvent(
  outcome: StdoutOnlyOutcome,
  ctx: { scanId?: string; uid?: string; reason?: string; err?: unknown },
): void;
```

**Stdout JSON shape (single line, both helpers):**

```json
{"tag":"scan","outcome":"awarded","scanId":"...","uid":"...","at":"2026-05-28T...","basePoints":10,...}
```

**Test no-op:** when `process.env.VITEST` is set, both functions skip Firestore + stdout to keep test output clean.

## Call-site mapping (`route.ts`)

| Source line (approx) | Branch | Outcome | Helper |
|---|---|---|---|
| 66 | IP rate-limit | — | `logScanEvent("ip_rate")` |
| 71-73 | auth fail | — | `logScanEvent("auth", { err })` |
| 77 | invalid multipart | — | `logScanEvent("bad_request")` |
| 80-87 | image validation | — | `logScanEvent("bad_image", { reason })` |
| 96 | profile missing | — | `logScanEvent("no_profile", { uid })` |
| 99 | not eligible | — | `logScanEvent("not_eligible", { uid })` |
| 108 | detector err (preview) | — | `logScanEvent("error_detector", { err })` |
| 110 | preview rejected | `rejected_not_pet` (preview) | `await logScanAttempt(...)` |
| 119 | blob upload err (preview) | — | `logScanEvent("error_storage", { err })` |
| 147 | preview write err | — | `logScanEvent("error_preview", { err })` |
| 150 | preview success | `preview` | `await logScanAttempt(...)` |
| 175 | replay | `replay` | `await logScanAttempt(...)` |
| 182 | cooldown | `denied_cooldown` | `await logScanAttempt(...)` |
| 188 | daily cap | `denied_daily_cap` | `await logScanAttempt(...)` |
| 202 | dup | `denied_dup_hash` or `denied_dup_phash` | `await logScanAttempt(...)` |
| 214 | detector err | — | `logScanEvent("error_detector", { err })` |
| 217 | rejected | `rejected_not_pet` | `await logScanAttempt(...)` |
| 225 | blob upload err | — | `logScanEvent("error_storage", { err })` |
| 266 | award race | — | `logScanEvent("error_award_race")` |
| 270 | awarded | `awarded` | `await logScanAttempt(...)` |

Both `rejected_not_pet` rows (preview path + student path) are distinguishable downstream by the absence/presence of `basePoints` (preview has none).

## Admin UI

### Global page: `/admin/scan-logs`

- **Filter bar (top):** date range (default last 7d), outcome multi-select, uid text, classKey dropdown, scanId lookup.
- **Aggregates strip (above table):** count per outcome over filtered window. Pills, e.g.:
  `awarded 142 · denied_dup_hash 8 · denied_cooldown 3 · rejected_not_pet 12 · denied_daily_cap 2 · preview 5 · replay 1`
- **Table (paginated, 50/page, cursor on `at`):**
  Columns: `at` (BKK) · `uid` (links to `/admin/student/[uid]`) · `classKey` · `outcome` chip · `detectedClass` · `confidence` · `points` (`base+bonus`) · `scanId` (short, click to copy).
- No detail drawer. Columns enough for triage.

### Per-user tab in `/admin/student/[uid]`

- New `Scan Logs` tab alongside existing tabs.
- Same table component, pre-filtered on `uid=<student>`.
- Filter bar reduced: date range + outcome only (uid fixed, classKey implied).
- Aggregates strip scoped to user.

### Admin API: `GET /api/v1/admin/scan-logs`

- **Query params:** `from`, `to`, `outcome` (csv), `uid`, `classKey`, `scanId`, `cursor`, `limit` (default 50, max 200).
- **Returns:**

  ```ts
  {
    rows: ScanAttemptLog[];
    nextCursor: string | null;
    aggregates: Record<ScanOutcome, number>;
  }
  ```

- **Guard:** `hasRole(ctx, "admin")` at top; 403 on student.
- **Implementation note:** aggregates require a separate query per outcome or a single full-scan within window. For 30d retention + ~600k docs steady-state, scan-once is fine; revisit if slow.

## Testing

- **`log.test.ts`** — unit tests:
  - shape: each outcome produces correct Firestore doc (mock repo)
  - stdout JSON contains expected fields per outcome
  - Firestore error swallowed (mock throws → fn resolves, stderr called)
  - `process.env.VITEST` is no-op
- **`log-repo.test.ts`** — skipped per project convention (Firestore repo, integration only).
- **Route tests** — if `src/app/api/v1/scan/upload/__tests__/` exists, extend; else add 3 minimum (awarded, dup, cooldown) asserting log helper called with right outcome.
- **Admin API test** — admin guard (403 non-admin), returns rows + aggregates for admin (mock Firestore).
- **Admin UI** — no e2e; hand-test in dev.

## Migration & rollout

- **Existing `console.warn`/`console.error` in `route.ts`** — replaced by `logScanEvent` calls. No net loss; gains structured `tag:"scan"` tagging for Vercel Logs grep.
- **Firestore TTL** — manual post-deploy step: enable TTL on `scanAttempts.expiresAt` field in Firebase console. Add to `scripts/README.md` and create bd issue as deploy gate.
- **Feature flag** — none. Logging always on (no-op only in Vitest).
- **Backfill** — none. Forward-only.
- **Rollout order:**
  1. PR 1: helper + route wiring + unit tests.
  2. PR 2: admin API + per-route test.
  3. PR 3: admin UI (global page + per-user tab).

## Risks

| Risk | Mitigation |
|---|---|
| Firestore write latency adds ~30-80ms per scan | Acceptable vs ~2-4s scan duration; revisit only if p95 worsens |
| Steady-state doc count: 20 scans/day × N users × 30d | 1000 users ≈ 600k docs; ~$0.30/mo storage, within budget |
| TTL not enabled manually post-deploy | Add to deploy checklist + bd issue; without it, collection grows unbounded |
| Firestore write fails | `logScanAttempt` swallows the error (try/catch), scan still succeeds |
| Sensitive query exposure via admin API | `hasRole(ctx, "admin")` guard, paged 200 max |

## Open questions

- Pre-existing route-level tests? (Plan should confirm before deciding to extend vs. add new.)
- Firestore composite index requirements — confirm during implementation when running first query.
