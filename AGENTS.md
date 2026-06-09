<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: botty-liff-app

School recycling rewards system. LINE LIFF webview. Students scan plastic bottles → AI detects → points are awarded (instantly, or after a staff-QR confirm when `BIN_CONFIRM_MODE=enforce`, the default — see Domain quirks). Council/admin staff run the approval QR; admins adjust, approve large adjustments, and audit.

## Stack
- Next.js 16 App Router (React 19, Turbopack)
- Firebase Auth (custom token from LINE idToken) + Firestore
- LINE LIFF SDK (`@line/liff`)
- Vercel Blob (scan images) — public store
- Google Sheets API (teacher exports)
- Vitest

## Commands
```bash
npm run dev          # next dev (Turbopack)
npm run build        # next build
npm test             # vitest run
npm run test:watch
npm run lint
npx tsc --noEmit     # typecheck
vercel env pull      # sync .env.local from Vercel
```

## Routes (`src/app/`)
- `/` LINE login bootstrap → `/onboard` if new, else `/home`
- `/home` `/scan` `/history` `/leaderboard` `/profile` — student
- `/teacher` `/teacher/student` — dashboard, KPIs, sheets export, student point adjust (admin-only; paths kept under `/teacher`)
- `/admin` — users, point adjust approval, audit (admin-only)
- `/api/v1/*` — backend routes (Node runtime), bearer = Firebase ID token

## Roles
`student` → `council` → `admin` (type `AuthContext["role"]` in `src/server/lib/auth.ts`). Two guards in `src/server/lib/role-guard.ts`: `hasRole(ctx, "admin")` for admin-only endpoints, and `canApprove(role)` (`council` **or** `admin`) for the staff-QR approve flow. `admin` is set manually in Firestore (never via API, `changeRole` refuses to assign/demote it). `council` IS assignable via API by admins — `changeRole` in `src/server/user/role-change.ts` accepts `student`/`council`. Admin absorbs all former teacher powers; the `teacher` role was removed (paths kept under `/teacher`, admin-only). `scripts/downgrade-roles.ts` is a migration *tool* that downgrades any `council`/`teacher` accounts to `student` — run it only if you intend to retire the council role; it does not reflect current state (council is live).

## Domain quirks
- Scan flow: upload image → AI detect class → build a **pending** award. Whether points land immediately or need a staff-QR confirm depends on `BIN_CONFIRM_MODE` (`src/app/api/v1/scan/confirm/route.ts`): `off` = legacy instant award; `log` = award instantly but record; `enforce` (**the default**) = points/coins stay locked until the student scans a staff member's rotating QR. Staff/council open `/approver` to run a 5-min session of 30s-rotating QR slots (`src/server/approver/*`); each slot is single-use (one student per QR). Abuse guards: duplicate-image hash, 60s cooldown, daily limit 20, IP rate limit.
- Point adjustments: ≤±10 immediate, ±11–50 needs admin approval (dual-approval). `TEACHER_IMMEDIATE_CAP` / `TEACHER_REQUEST_CAP` in `src/lib/api.ts`.
- Storage: migrated GCS → Vercel Blob (commit `ef2da57`). `httpsUrl()` in `src/server/scan/storage.ts:19` still resolves legacy `gs://` rows.
- Firebase Admin needs `GCP_SERVICE_ACCOUNT_JSON` + `GCP_PROJECT` (Firestore auth, not GCS).

## Env vars
| Var | Use |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob writes |
| `GCP_SERVICE_ACCOUNT_JSON` | Firebase Admin + Sheets |
| `GCP_PROJECT` | Firebase project id |
| `NEXT_PUBLIC_LIFF_ID` | LINE LIFF init |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client config |
| `LINE_CHANNEL_ID` | LINE token verify |
| `STAFF_QR_SECRET` | HMAC secret for staff-QR slot tokens. Required when `BIN_CONFIRM_MODE` ≠ `off` — session route throws without it; confirm route 500s if < 16 bytes. |
| `BIN_CONFIRM_MODE` | `off` / `log` / `enforce` (default `enforce`). Gates whether scan points need a staff-QR confirm. |

## Layout
- `src/app/` — routes, API handlers
- `src/server/` — domain logic, repos (Firestore), pure functions + tests
- `src/lib/api.ts` — client API wrapper (typed, throws `ApiError`)
- `src/lib/firebase.ts` — client SDK (`auth.signInWithCustomToken`)
- `src/lib/theme.ts` — colors + rank tiers
- `src/components/shared/` — `BottomNav`, `DesktopBlock`

## Testing
Pure functions live under `src/server/**/*.ts` with co-located `*.test.ts`. Firestore repos not unit-tested; verified manually + integration through routes.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->

## Post-deploy: scanAttempts indexes + TTL

Two manual console/CLI steps after deploying scan attempt logging. Both are
ops actions an agent cannot perform from code — a human must run them.

### 1. Deploy composite indexes (required, or the Scan Logs UI 500s)

`scanAttempts` needs composite indexes for the filter combos the Scan Logs UI
sends (e.g. teacher tab issues `outcome==` + `uid==` + `at`-range). They live in
`firestore.indexes.json`. Deploy them:

```bash
firebase deploy --only firestore:indexes
```

If an exotic admin filter combo still 500s, Firestore's error returns a console
link that creates the exact missing index — add it to `firestore.indexes.json`.

### 2. Enable Firestore TTL (requires Blaze)

Decision (botty-2yh): project upgraded to **Blaze** so TTL can run. TTL and
Cloud Functions are unavailable on the Spark free tier. On Blaze the free daily
allowances (20K writes, 50K reads, 1 GiB) still apply, so 30-day retention costs
~pennies/month at expected volume.

1. Open the Firebase console → Firestore → TTL.
2. Add a policy on collection `scanAttempts`, field `expiresAt`.
3. Status should turn "Active" within ~24h.

`expiresAt` is already written by `writeScanAttempt` (`src/server/scan/log-repo.ts`).
Without this step the collection grows unbounded — and on Spark the 20K writes/day
free cap is the binding wall (logging burns one write per scan attempt).

### 3. Enable Firestore TTL on `scanReservations` (requires Blaze)

The atomic scan-dedup reservation (botty-cnr) writes one
`scanReservations/{sha256}` doc per distinct upload hash, each with a 5-min
`expiresAt`. The TTL `fieldOverride` is in `firestore.indexes.json` (deploy via
step 1's `firebase deploy --only firestore:indexes`), but the TTL **policy**
must be enabled in the console:

1. Firebase console → Firestore → TTL.
2. Add a policy on collection `scanReservations`, field `expiresAt`.
3. Status turns "Active" within ~24h.

Without it the collection grows unbounded. The reservation is read by doc id
only (no composite index needed). `expiresAt` is written by `reserveImageHash`
(`src/server/scan/reservation.ts`).

### 4. Enable Firestore TTL on `pendingSlots` (requires Blaze)

The "one outstanding pending per user" lock writes one `pendingSlots/{uid}` doc
when a student stages a pending scan (enforce mode), each with a `PENDING_TTL_MS`
`expiresAt`. It closes the same-user double-pending race that `hasOutstandingPending`
(read-then-write) left open. The doc is normally deleted when the pending is
confirmed (confirm route) or on a non-awarding upload exit, so TTL is just the
backstop for abandoned pendings. The TTL `fieldOverride` is in
`firestore.indexes.json` (deploy via step 1), but the TTL **policy** must be
enabled in the console:

1. Firebase console → Firestore → TTL.
2. Add a policy on collection `pendingSlots`, field `expiresAt`.
3. Status turns "Active" within ~24h.

Read by doc id only (no composite index needed). `expiresAt` is written by
`reservePendingSlot` (`src/server/scan/reservation.ts`).

