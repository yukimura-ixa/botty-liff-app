# Teacher-Promote-to-Council + Non-Student Scan Without Points

**Date:** 2026-05-24
**Status:** Draft — awaiting plan
**Related:** `src/server/user/role-change.ts`, `src/app/api/v1/admin/users/[uid]/role/route.ts`, `src/app/api/v1/scan/upload/route.ts`, `src/server/leaderboard/repo.ts`

## Problem

Two related gaps in the current role model:

1. **Promotion bottleneck.** Only `admin` can promote a student to `council` (via `/api/v1/admin/users/[uid]/role`). Teachers — who actually know their students — must escalate through admin. This slows day-to-day class management.

2. **Council can earn scan points.** Today the scan upload route includes `council`, `teacher`, and `admin` in `SCAN_ELIGIBLE_ROLES`, so promoted council members continue accumulating points by scanning. This violates the intent that council members **review** students' scans rather than compete with them. Existing council users with accumulated points create a mixed-signal leaderboard.

## Goals

- Teacher (and admin) can flip a user between `student` and `council` without admin involvement.
- Promotion to `teacher` or `admin` remains admin-only.
- After promotion, council/teacher/admin scans run the detector but do **not** award points, advance streaks, or affect leaderboard.
- Existing council/teacher points stay on profile (no destructive migration); leaderboard already filters `role == "student"`, so they auto-disappear from rankings.
- No new env vars, no schema migrations.

## Non-Goals

- Class-scoped teacher authority (any teacher can promote any student — flagged in §6 as follow-up if needed).
- Demoting teacher or admin (still admin-only via existing route).
- Zeroing historical council points or revoking past awards.
- Notifications to promoted users.
- "Council badge" UI on leaderboard.

## Section 1 — Architecture

Three changes, two server + one UI:

**1.1 Teacher-callable role change endpoint**
- New: `POST /api/v1/teacher/students/[uid]/role` with body `{ role: "student" | "council" }`.
- Guard: actor must be `teacher` or `admin`; target's current role must be `student` or `council`; new role must be `student` or `council`. Self-change blocked.
- Reuses `changeRole()` transactional core via a new wrapper `changeRoleAsTeacher()` that enforces the narrower bounds. Passes `reason = ""`.
- Existing `/api/v1/admin/users/[uid]/role` route is untouched and still required for student↔teacher flips.

**1.2 Scan upload: branch on role**
- Inside `POST /api/v1/scan/upload`, after `getUser(ctx.uid)`:
  - `prof.role === "student"`: existing path (cooldown → daily → dup → detect → award/pending → leaderboard bust).
  - else (`council`/`teacher`/`admin`): **preview path** — IP rate limiter + active status only, detector runs, image uploaded for audit, a scan doc is written with `points: 0, awarded: false, preview: true`, no pending, no profile mutation, no leaderboard bust.
- `canApprove()` is unchanged; council still authorized to confirm pending scans.

**1.3 Leaderboard**
- No code change. `queryLeaderboard()` already filters `where("role", "==", "student")`. Promoted council users disappear from rankings automatically; their `totalPoints` value is preserved on the profile document but never queried.

**1.4 Promote UI on `/teacher/student`**
- Add a role-change panel: current role badge + dropdown (`student` / `council`) + submit button + confirm modal.
- No reason field.
- Calls the new teacher endpoint via `src/lib/api.ts` wrapper.

## Section 2 — Components & Data Flow

### 2.1 Files touched

| File | Change |
|---|---|
| `src/server/user/role-change.ts` | Add `changeRoleAsTeacher(targetUid, actorUid, newRole)`. Reuses tx logic but enforces newRole ∈ {student, council} and target.role ∈ {student, council}. Empty reason. |
| `src/server/user/role-change.test.ts` (new) | Unit tests for the new wrapper (mock Firestore tx). |
| `src/app/api/v1/teacher/students/[uid]/role/route.ts` (new) | POST handler. Auth, role guard, body validation, calls `changeRoleAsTeacher`. Error mapping mirrors admin route. |
| `src/app/api/v1/scan/upload/route.ts` | Branch on `prof.role`. Non-student path skips cooldown/daily/dup/pending, calls new `recordPreviewScan()`. |
| `src/server/scan/repo.ts` | Add `recordPreviewScan({ uid, scanId, imageUrl, detectedClass, confidence, itemCount, capturedAt })`. Writes scans doc with `points:0, awarded:false, preview:true`. No profile/leaderboard mutation. |
| `src/app/teacher/student/page.tsx` | Role-change panel UI. |
| `src/lib/api.ts` | New client wrapper `teacherChangeStudentRole(uid, role)`. |

### 2.2 Firestore layout

No new collections.

- `users/<uid>` — existing. `role` field flips. `totalPoints` etc. preserved.
- `roleChanges/<id>` — existing collection records every flip via the same shape: `{ targetUid, byUid, fromRole, toRole, reason: "", createdAt }`. Teacher actions land here alongside admin actions.
- `scans/<scanId>` — existing collection. Preview scans add `preview: true` and `awarded: false`, with `points: 0`.

### 2.3 Data flow — teacher promote

```
1. Teacher opens /teacher/student?uid=X, picks "council", confirms.
2. UI calls POST /api/v1/teacher/students/X/role { role: "council" }.
3. Route handler:
   a. verifyBearerTokenWithFreshRole → 401 if invalid.
   b. hasRole(ctx, "teacher") false → 403.
   c. Body validation: role ∈ {student, council} else 400.
   d. changeRoleAsTeacher(X, ctx.uid, "council"):
       - self check (X === ctx.uid) → "self"
       - bounds check (newRole, target.role) → "invalid" / "forbidden_target"
       - tx: read users/X, write updated role + roleChanges doc.
       - cache bust: user:X, classes, leaderboard.
       - setCustomUserClaims(X, { role: "council" }) — best-effort.
4. Response: { ok: true, roleChangeId } or { ok: true, noop: true } if already at target role.
5. UI refetches student detail, updates role badge.
```

### 2.4 Data flow — non-student scan

```
1. Council/teacher/admin uploads image to /api/v1/scan/upload.
2. ipScanLimiter check → 429 if over.
3. verifyBearerToken → ctx.
4. Form / file validation (unchanged: size, mime sniff).
5. getUser(ctx.uid). Reject if !active.
6. Branch on prof.role:
   - "student": existing flow.
   - else (preview path):
       a. detect(...) → if not accepted, return 422.
       b. uploadScanImage to Blob.
       c. recordPreviewScan({ ... }) — writes scans/<id> { points:0, awarded:false, preview:true, ... }.
       d. Return 200: { scanId, detectedClass, confidence, itemCount, basePoints:0, streakBonus:0, totalPoints:0, awarded:false, preview:true, annotatedImage }.
```

### 2.5 Backward compat

- Existing council/teacher profiles retain `totalPoints`, `totalScans`, `streakDays`. Leaderboard excludes them already.
- Old `awarded: true` scan docs from council activity remain in the user's `/history` view (per-user query, no filter on `awarded`/`preview`). Acceptable: historical scans show as awarded.
- No migration script.

## Section 3 — Errors, Rate Limits, UX

### 3.1 Error map for `POST /api/v1/teacher/students/[uid]/role`

| Condition | HTTP | Body |
|---|---|---|
| missing / invalid bearer | 401 | `unauthorized` |
| not teacher/admin | 403 | `forbidden` |
| target == self | 400 | `cannot change own role` |
| body.role missing or ∉ {student, council} | 400 | `role must be student or council` |
| target not found | 404 | `user not found` |
| target.role ∈ {teacher, admin} | 403 | `cannot change teacher or admin role` |
| target.role === body.role | 200 | `{ ok: true, noop: true }` |
| setCustomUserClaims fail | 200 + warning | `{ ok: true, roleChangeId, warning: "claim update failed; user must re-login after retry" }` |
| other | 500 | `failed` |

Noop returns 200 to keep the endpoint idempotent and avoid client-side race handling.

### 3.2 Scan upload rate limits

| Check | Student | Non-student |
|---|---|---|
| `ipScanLimiter` | applied | applied |
| `prof.status === "active"` | applied | applied |
| cooldown (60s) | applied | **skipped** |
| daily limit (20) | applied | **skipped** |
| duplicate hash | applied | **skipped** |
| outstanding pending | applied | **skipped** |
| detector | applied | applied |
| image upload | applied | applied |

Rationale: non-students are trusted staff; per-IP limiter is sufficient to protect Blob cost. Cooldown/daily on staff would block legitimate demo/calibration use.

### 3.3 UI — `/scan` page

- Existing component handles `awarded: false`. Add a Thai banner: `"โหมดทดสอบ — ไม่ได้รับคะแนน"` when `preview === true`.
- Hide point delta, streak progress, and rank-up animation in preview mode.

### 3.4 UI — `/teacher/student` promote panel

- Show current role as a badge.
- If `target.role` is `teacher` or `admin`: hide panel (teacher cannot edit those).
- If `target.uid === self.uid`: hide / disable.
- On success: toast `"เปลี่ยนเป็น <role> แล้ว"`, refetch student detail.
- On warning (`claimUpdateOk: false`): toast `"เปลี่ยนแล้ว แต่ผู้ใช้ต้องล็อกอินใหม่"` style notice.

## Section 4 — Testing

### 4.1 Unit (Vitest)

`src/server/user/role-change.test.ts` (new):

- `changeRoleAsTeacher` rejects `targetUid === actorUid` → `"self"`.
- Rejects `newRole = "teacher"` → `"invalid"`.
- Rejects `newRole = "admin"` → `"invalid"`.
- Rejects when `target.role === "teacher"` → `"forbidden_target"`.
- Rejects when `target.role === "admin"` → `"forbidden_target"`.
- Allows student → council. Asserts tx.update with `{ role: "council", ... }` and `roleChanges` doc with `reason: ""`, correct `fromRole`/`toRole`.
- Allows council → student. Asserts tx.update with `{ role: "student", ... }`.
- Noop when `target.role === newRole`. Asserts no writes, returns `{ noop: true }`.
- target not found → `"not_found"`.

### 4.2 Manual / integration

- Teacher promotes a student → council, then back to student. User custom claim updates; on re-login the role propagates.
- Teacher attempts to promote a teacher → 403.
- Teacher attempts to promote themselves → 400.
- Admin promotion path (`/api/v1/admin/users/[uid]/role`) still works for student↔teacher (regression).
- Council scans bottle: detection runs, response has `awarded:false, preview:true, points:0`. Profile `totalPoints` unchanged. Leaderboard unchanged.
- Council with legacy points: profile shows points; leaderboard does not list them.
- IP rate limiter still triggers on rapid non-student scans.
- Active status `inactive` blocks non-student scans (403).

### 4.3 Not tested

- Firestore repo internals (project policy: integration only).
- Leaderboard filter (existing test in `leaderboard/build.test.ts` covers shape; the `role == "student"` filter is enforced in repo query, not unit-tested per policy).

## Section 5 — Threat / Failure Model

- **Teacher abuse:** any teacher can promote/demote any student in any class. Mitigation: `roleChanges` audit log shows `byUid`. Follow-up (out of scope): class-scoped teacher authority.
- **Stale custom claim:** if `setCustomUserClaims` fails, the user keeps the old role in their ID token until next login. UI surfaces the warning. Acceptable: matches existing admin path.
- **Preview-scan Blob spam:** non-students bypass cooldown/daily. IP limiter caps burst rate. Worst case: a malicious staff burns Blob quota — auditable via `scans` docs with `preview: true`.
- **Legacy council points:** preserved on profile, hidden from leaderboard. User-visible elsewhere (e.g. own profile screen) — by design (no destructive migration).

## Section 6 — Follow-ups (Out of Scope)

- Class-scoped teacher authority (teacher can only promote students in their `classKey`).
- "Council" badge / role filter on leaderboard for transparency.
- Optional `reason` field if teachers want to log promotion context.
- Zero-out historical council points on promotion (currently preserved).
- Email/LINE notification to promoted users.

## Section 7 — Acceptance Criteria

- `POST /api/v1/teacher/students/[uid]/role` exists, returns 200 with `roleChangeId` for valid flips, 403 for non-teacher caller or teacher/admin target, 400 for invalid role / self.
- Council scan returns `awarded: false, preview: true, points: 0` and writes a `preview: true` scan doc with no profile mutation.
- Leaderboard `/api/v1/leaderboard` does not include users whose role is not `student`.
- All existing tests pass. New `role-change.test.ts` passes.
- `npx tsc --noEmit` clean.
