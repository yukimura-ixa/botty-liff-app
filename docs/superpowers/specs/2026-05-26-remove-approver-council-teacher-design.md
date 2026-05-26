# Remove Approver QR, Council & Teacher Roles — Design

**Date:** 2026-05-26
**Status:** Approved (pending spec review)

## Motivation

User feedback: the approver QR flow is bad UX. Students must scan a bottle, then
get a rotating staff QR scanned at the bin before points are awarded. The
council and teacher roles exist largely to operate that flow and a teacher
dashboard. We are simplifying the role model to **`student → admin`** only and
awarding scan points immediately.

## Decisions (locked)

1. **Teacher features → admin.** Admin absorbs the teacher dashboard, KPIs,
   Google Sheets export, point adjustments, and student management.
2. **Scan award → immediate.** Points are awarded on upload. Keep existing abuse
   guards (duplicate-image hash, 60s cooldown, daily limit 20, IP rate limit).
3. **Role-request feature → deleted entirely.** Nothing left to request.
4. **Existing council/teacher accounts → downgraded to student** via a one-time
   standalone script.
5. **Teacher routes → re-guard in place (Approach A).** Keep `/teacher/*` and
   `/api/v1/teacher/*` paths; flip guards to admin-only. Admin already satisfies
   the `teacher` guard, so logic change is minimal. Route names staying
   "teacher" is accepted cosmetic debt.

## Final role model

`student → admin`.

- `Role` type becomes `"student" | "admin"` everywhere.
- Admins are still set manually in Firestore (never via API).
- Admin is the only non-student role; it retains all former teacher powers.

---

## Workstream 1 — Remove approver QR system

**Delete:**
- `src/app/approver/layout.tsx`, `src/app/approver/page.tsx`
- `src/app/api/v1/approver/sessions/route.ts`
- `src/app/api/v1/approver/sessions/[id]/end/route.ts`
- `src/server/approver/mint.ts`, `repo.ts`, `repo.test.ts`, `token.ts`, `token.test.ts`
- `src/app/api/v1/scan/confirm/route.ts`
- `src/server/scan/pending.ts` (and its consumers)

**Modify `src/app/api/v1/scan/upload/route.ts`:**
- Remove `BIN_CONFIRM_MODE` `mode()` logic and the `log`/`enforce` branches.
- Always award on upload for students (the existing `mode === "off"` path:
  `awardScan(awardArgs)` + `bustLeaderboardCaches()`).
- Drop pending creation (`createPending`, `buildPendingDoc`, `hasOutstandingPending`,
  `PENDING_TTL_MS`) and `pendingId`/`expiresInSec` from the response.
- Keep abuse guards: `ipScanLimiter`, `COOLDOWN_MS` (60s), `DAILY_LIMIT` (20),
  `isDuplicateScan`.
- Response shape collapses to the former `off`-mode JSON (no `pendingId`,
  `awarded: true`).

**Modify `src/server/scan/build.ts`:** remove pending-doc construction
(`buildPendingDoc`, `PendingDoc`, `PENDING_TTL_MS`) if not used elsewhere; keep
any award-doc helpers still referenced.

**Client (`src/app/scan/page.tsx`):** remove the confirm/QR-scan step and any
`pendingId`/approver-token handling; show points immediately from the upload
response.

**Env vars:** remove `STAFF_QR_SECRET` and `BIN_CONFIRM_MODE` from docs
(`AGENTS.md` env table) and any `.env` references. Note in handoff to remove
from Vercel.

**Firestore:** approver-session and pending collections become orphaned. Leave
existing data; no new writes. Remove related entries from
`firestore.indexes.json` if present.

---

## Workstream 2 — Remove council & teacher roles

**Type/guard changes:**
- `src/server/lib/auth.ts`: `AuthContext["role"]` → `"student" | "admin"`.
- `src/server/lib/role-guard.ts`: delete `ApproverRole` and `canApprove`.
  `hasRole(ctx, "admin")` collapses to `ctx.role === "admin"`. Remove the
  `"teacher"` arm (teacher routes will require admin).
- `src/components/shared/RoleGate.tsx`: `Role` → `"student" | "admin"`.
- `src/server/lib/role-guard.test.ts`: update for the two-role model.

**Teacher API routes (re-guard, keep working):**
All under `src/app/api/v1/teacher/*` — change any `hasRole(ctx, "teacher")` (or
`canApprove`) checks to require admin. Functionally unchanged for admins.
Routes: `config/forest-stages`, `exports/sheet`, `kpis`, `students` (+ `[uid]`,
`[uid]/adjust`, `[uid]/adjust/request`, `[uid]/role`).

**Role-change logic:**
- `src/server/user/role-change.ts` + `role-change.test.ts`: remove
  council/teacher transitions; valid roles are student/admin. Promotion to admin
  is manual-only (no API path) — confirm no route still calls a
  council/teacher promotion.

**Other role references:**
- `src/server/user/admin-filter.ts` + test, `helpers.ts`, `user/repo.ts` +
  `repo.test.ts`: drop council/teacher from role unions/filters.
- `src/app/api/v1/scan/upload/route.ts`: `SCAN_ELIGIBLE_ROLES` → `{student, admin}`.
- `src/app/api/v1/admin/users/[uid]/role/route.ts`: restrict assignable roles to
  student/admin (and confirm admin-set policy).

**Navigation:**
- `src/components/shared/BottomNav.tsx`: remove `staffItems` and the QR primary
  button (→`/approver`, deleted). `isStaffRole` → `isAdmin` (admin only). Admin
  gets the student nav plus an entry to the admin/teacher dashboard (link in
  `/profile` or `/home`, matching current pattern).

**Home/profile pages:** remove council/teacher-specific UI branches in
`src/app/home/page.tsx`, `src/app/profile/page.tsx`.

---

## Workstream 3 — Remove role-request feature

**Delete:**
- `src/server/roleRequests/repo.ts`
- `src/app/profile/role-request/page.tsx`
- `src/app/api/v1/me/role-requests/route.ts`
- `src/app/api/v1/teacher/role-requests/route.ts`
- `src/app/api/v1/teacher/role-requests/[id]/decide/route.ts`
- `src/app/teacher/role-requests/page.tsx`

**Modify:**
- `src/lib/api.ts`: remove role-request client functions/types.
- `src/app/profile/page.tsx`: remove the "request council/teacher" entry point.
- `src/app/teacher/page.tsx`: remove the role-requests link/section from the
  dashboard.
- `firestore.indexes.json`: remove `roleRequests` indexes.

---

## Workstream 4 — Data migration

**`scripts/downgrade-roles.ts`** (standalone Node, Firebase Admin via
`GCP_SERVICE_ACCOUNT_JSON` + `GCP_PROJECT`):
- Query `users` where `role in ["council", "teacher"]`.
- Set `role = "student"`. Preserve points, streak, history.
- Leave `admin` users untouched.
- Idempotent, logs each change, dry-run flag (`--dry-run`) default-on for safety.
- Run manually after `vercel env pull`. Document the command in handoff.

---

## Testing & quality gates

- Update/delete affected tests: `role-guard.test.ts`, `role-change.test.ts`,
  `admin-filter.test.ts`, `user/repo.test.ts`; delete `approver/repo.test.ts`,
  `approver/token.test.ts`.
- Add/keep scan-upload coverage proving immediate award + guards still fire.
- Green gates before done: `npm test`, `npx tsc --noEmit`, `npm run build`,
  `npm run lint`.

## Out of scope

- Deleting orphaned Firestore collections (approverSessions, pending). Left as-is.
- Renaming `/teacher` paths to `/admin` (Approach B rejected).
- Any change to the points/streak formula.

## Risks

- **Anti-cheat loss:** immediate award removes physical-presence verification.
  Mitigated by existing duplicate-hash + cooldown + daily-limit guards;
  acceptable per user decision.
- **Stranded role references:** a missed `council`/`teacher` literal could break
  typecheck — caught by `tsc`. The migration script handles runtime data.
