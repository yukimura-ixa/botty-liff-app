<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: botty-liff-app

School recycling rewards system. LINE LIFF webview. Students scan plastic bottles → AI detects → earns points. Teachers/council/admin approve, adjust, audit.

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
- `/profile/role-request` — request council/teacher
- `/teacher` `/teacher/student` — teacher dashboard, KPIs, sheets export
- `/approver` — staff QR rotating 30s (council/teacher/admin)
- `/admin` — users, role requests, point adjust approval, audit
- `/api/v1/*` — backend routes (Node runtime), bearer = Firebase ID token

## Roles
`student` → `council` → `teacher` → `admin`. Guard in `src/server/lib/role-guard.ts`. Admins set manually in Firestore (never via API).

## Domain quirks
- Scan flow: upload image → AI detect class → award base + streak bonus → optional approver QR confirm (`pendingId`).
- Approver QR: HMAC over `STAFF_QR_SECRET`, 30-second slots, 15-min sessions. See `src/server/approver/token.ts`.
- Teacher point adjustments: ≤±10 immediate, ±11–50 needs admin approval (dual-approval). `TEACHER_IMMEDIATE_CAP` / `TEACHER_REQUEST_CAP` in `src/lib/api.ts`.
- Role requests: students only, 7-day cooldown after denial, one pending at a time.
- Storage: migrated GCS → Vercel Blob (commit `ef2da57`). `httpsUrl()` in `src/server/scan/storage.ts:19` still resolves legacy `gs://` rows.
- Firebase Admin needs `GCP_SERVICE_ACCOUNT_JSON` + `GCP_PROJECT` (Firestore auth, not GCS).

## Env vars
| Var | Use |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob writes |
| `GCP_SERVICE_ACCOUNT_JSON` | Firebase Admin + Sheets |
| `GCP_PROJECT` | Firebase project id |
| `STAFF_QR_SECRET` | Approver QR HMAC |
| `NEXT_PUBLIC_LIFF_ID` | LINE LIFF init |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client config |
| `LINE_CHANNEL_ID` | LINE token verify |

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
