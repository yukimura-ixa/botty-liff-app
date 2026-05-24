# Admin User CRUD on `/admin` Users Tab

**Date:** 2026-05-24
**Status:** Draft — awaiting plan
**Related:** `src/app/admin/page.tsx`, `src/app/api/v1/admin/users/[uid]/route.ts`, `src/server/user/repo.ts`

## Problem

Admins currently can only **change a user's role** on the `/admin` page. There is no way to:

1. Correct a typo in `fullName`.
2. Reassign a student to a different `classGrade` / `classRoom` (e.g. after class restructuring).
3. Adjust `totalPoints` directly (e.g. data correction, year-end reset to zero).
4. Deactivate a user without hard-deleting them (e.g. graduated student, lost LINE account).

These tasks today require direct Firestore edits, which bypass audit logging and risk corruption.

## Goals

- Admin can edit a user's `fullName`, `classGrade`, `classRoom`, `totalPoints`, and `status` via the `/admin` page.
- Every edit is audit-logged in a new `userEdits` Firestore collection.
- Soft-delete via `status="inactive"` flip is reversible.
- Hard delete is **out of scope** (avoid orphaned `scans` / `roleChanges` references).
- Existing role-change endpoint is untouched (separate concern, separate audit collection).

## Non-Goals

- Bulk operations.
- Editing teacher or admin profiles (their classKey/totalPoints are not meaningful; role flips handled by existing routes).
- Hard delete of user docs or Firebase Auth records.
- Editing `lineUserId` / `email` (LINE-bound identity fields).
- Per-field permission scoping (e.g. council editing fullName only) — admin-only for now.
- Notifications to edited users.

## Section 1 — Architecture

Three changes:

**1.1 New `PATCH` endpoint** on the existing route file at `src/app/api/v1/admin/users/[uid]/route.ts`.
- Admin-only via `hasRole(ctx, "admin")`.
- Body: partial `{ fullName?: string; classGrade?: number; classRoom?: number; totalPoints?: number; status?: "active" | "inactive" }`.
- Server-side validation of each field. At least one field required.
- Single Firestore transaction: read target, reject if target role ∈ {teacher, admin}, compute diff, write profile update + audit doc atomically.
- Cache busts: `user:<uid>` always; `classes` if classKey changed; `leaderboard` if `totalPoints` or `status` changed.

**1.2 New `userEdits` Firestore collection.**
- Schema:
  ```
  userEdits/{editId}
    targetUid:  string
    byUid:      string
    changes:    Array<{ field: string, oldValue: unknown, newValue: unknown }>
    createdAt:  Timestamp
  ```
- Lazy-created on first write. No migration needed.

**1.3 Inline expand-row UI on `/admin` users tab.**
- Each row gains a "▾ แก้ไข" toggle button. Click → form expands beneath the row.
- Form: 5 inputs (fullName, classGrade, classRoom, totalPoints, status). Save + Cancel + (potential) Confirm modal for destructive changes.
- Existing role-change action remains a separate inline control on the same row.

**1.4 Admin tile on `/home`.**
- New tile in the home page action grid: label `"จัดการระบบ"`, href `/admin`, emoji `⚙️`, background `t.ink` (or similar dark theme tone).
- Visible only when `role === "admin"` (mirroring the existing `isStaff` / `isTeacherOrAdmin` conditional spread pattern in `src/app/home/page.tsx`).
- No new state; reuses the existing `role` value already in scope.

## Section 2 — Components & Data Flow

### 2.1 Files touched

| File | Change |
|---|---|
| `src/app/api/v1/admin/users/[uid]/route.ts` | Add `PATCH` handler alongside existing `GET`. |
| `src/server/user/repo.ts` | Add `updateUserProfile(targetUid, actorUid, patch)` — validated tx + audit doc write. |
| `src/server/user/repo.test.ts` (new) | Unit tests covering validation, noop, audit-doc shape, multi-field patch. |
| `src/lib/api.ts` | Add `adminUpdateUser(uid, patch)` client wrapper + `UserPatch` type. |
| `src/app/admin/page.tsx` | Inline expand form on users tab; confirm modal for destructive changes; toast on success/noop/error. |
| `src/app/home/page.tsx` | Admin-only tile linking to `/admin` (added via conditional spread mirroring `isTeacherOrAdmin` pattern). |

### 2.2 Firestore layout (new path only)

```
userEdits/{editId}
  targetUid:  "abc123"
  byUid:      "admin-uid"
  changes:    [{ field: "fullName", oldValue: "John", newValue: "Jonathan" }, ...]
  createdAt:  Timestamp(2026-05-24T...)
```

`classKey` derivation when `classGrade` or `classRoom` changes: re-compute from the new values using the project's existing format (`<grade>/<room>` or whatever `formatClassKey` produces). Read existing `classKey` format from `src/lib/api.ts` `formatClassKey` and `src/server/user/repo.ts` onboarding logic.

### 2.3 Validation rules (server-side, in route handler)

| Field | Rule |
|---|---|
| `fullName` | `typeof === "string"`, trim, length 1..80, reject empty after trim |
| `classGrade` | `Number.isInteger`, 0..13 (0 = unassigned) |
| `classRoom` | `Number.isInteger`, 0..99 |
| `totalPoints` | `Number.isInteger`, 0..1_000_000 |
| `status` | lowercase-trim, ∈ {`active`, `inactive`} |
| (patch overall) | at least one field present; reject empty patch |

Validation lives in the route handler. `updateUserProfile` assumes the patch is pre-validated and focuses on diff + tx.

### 2.4 PATCH data flow

```
1. verifyBearerTokenWithFreshRole → 401 if invalid.
2. hasRole(ctx, "admin") → 403 if not.
3. uid regex check (matches teacher endpoint's pattern: /^[A-Za-z0-9_-]{1,128}$/) → 400 invalid uid.
4. Parse body. 400 on invalid JSON or empty patch.
5. Per-field validate → 400 on first violation with specific error string.
6. updateUserProfile(uid, ctx.uid, validatedPatch):
   a. self check (uid === ctx.uid) → throw "self".
   b. fs.runTransaction:
      - read users/<uid> → throw "not_found".
      - if target.role ∈ {teacher, admin} → throw "forbidden_target".
      - compute diff: changes = [{ field, oldValue, newValue }] for fields where newValue !== oldValue.
      - if changes.length === 0 → mark noop, return.
      - compute classKey if grade/room in changes.
      - tx.update users/<uid> with patched fields + updatedAt + maybe classKey.
      - tx.set userEdits/<editId> with { targetUid, byUid: actorUid, changes, createdAt }.
   c. if noop → return { noop: true }.
   d. bust caches (user:<uid> always; classes if classKey changed; leaderboard if totalPoints/status changed).
   e. return { editId, changes }.
7. Map errors:
   - "self" → 400 cannot edit own profile
   - "not_found" → 404 user not found
   - "forbidden_target" → 403 cannot edit teacher or admin profile
   - other → 500 internal
8. On success → 200 { ok: true, editId, changes } or { ok: true, noop: true }.
```

### 2.5 UI data flow

```
1. Admin opens /admin → users tab. List shows existing rows.
2. Admin clicks "▾ แก้ไข" on row → row expands below with form prefilled from row data.
3. Admin edits any subset of fields. Save button disabled while form clean (all values === current).
4. On Save click:
   a. Check destructive conditions:
      - status flipping active → inactive
      - totalPoints decreasing by >50% OR setting from non-zero to 0
   b. If destructive → confirm modal with Thai text naming the field(s) and old → new.
   c. On confirm (or non-destructive): POST adminUpdateUser(uid, patch).
5. On 200 success: collapse row, refetch user list, toast "บันทึกแล้ว".
6. On noop: collapse row, toast "ไม่มีการเปลี่ยนแปลง".
7. On 4xx/5xx: inline error message under form. Form stays open with values preserved.
```

Inactive users render with muted styling + "(ไม่ใช้งาน)" badge.

### 2.6 Backward compatibility

- No schema migration. Existing user docs continue working.
- `userEdits` collection lazy-created.
- Existing role-change route and audit path (`roleChanges` collection) untouched.
- Existing teacher point-adjust path (`adjustments` collection) untouched.

## Section 3 — Errors, Rate Limits, UX

### 3.1 Error map

| Condition | HTTP | Body |
|---|---|---|
| Missing / invalid bearer | 401 | `unauthorized` |
| Not admin | 403 | `forbidden` |
| `uid` empty or fails `^[A-Za-z0-9_-]{1,128}$` | 400 | `invalid uid` |
| Invalid JSON body | 400 | `invalid json` |
| Empty patch (no editable fields) | 400 | `no fields` |
| `fullName` not string / empty after trim / >80 chars | 400 | `invalid fullName` |
| `classGrade` not integer 0..13 | 400 | `invalid classGrade` |
| `classRoom` not integer 0..99 | 400 | `invalid classRoom` |
| `totalPoints` not integer 0..1_000_000 | 400 | `invalid totalPoints` |
| `status` not in {active, inactive} | 400 | `invalid status` |
| Self edit (target uid === actor uid) | 400 | `cannot edit own profile` |
| Target user not found | 404 | `user not found` |
| Target role ∈ {teacher, admin} | 403 | `cannot edit teacher or admin profile` |
| All fields unchanged (noop) | 200 | `{ ok: true, noop: true }` |
| Internal/Firestore error | 500 | `internal` (raw error logged server-side only) |
| Success | 200 | `{ ok: true, editId, changes }` |

### 3.2 Rate limits

No per-IP or per-actor limit beyond the global limiter. Admin role gate is sufficient; admin edits are low-volume and high-trust.

### 3.3 UI behavior

- Inline expand form prefills current values; Save disabled while form pristine.
- Destructive confirm modal triggers on:
  - `status` flipping `active → inactive`
  - `totalPoints` decreasing by >50% of current value
  - `totalPoints` going to 0 from any non-zero value
- Modal text in Thai, names each field and shows old → new.
- Toast on success: `"บันทึกแล้ว"`.
- Toast on noop: `"ไม่มีการเปลี่ยนแปลง"`.
- Inline error message on failure with Thai-translated reason.
- Inactive users muted in list + "(ไม่ใช้งาน)" badge.

## Section 4 — Testing

### 4.1 Unit tests (`src/server/user/repo.test.ts`, new)

Tests for `updateUserProfile`:

- Rejects self-edit (`targetUid === actorUid`) → `"self"`.
- Rejects target with role = `teacher` → `"forbidden_target"`.
- Rejects target with role = `admin` → `"forbidden_target"`.
- Rejects target not found → `"not_found"`.
- Noop when patch matches existing values → returns `{ noop: true }`, no `tx.update` or `tx.set`.
- Updates `fullName` only → tx.update payload has `{ fullName, updatedAt }`; audit doc `changes` array length === 1 with correct old/new values.
- Updates `classGrade` + `classRoom` → tx.update includes computed `classKey`; audit logs both diffs.
- Updates `totalPoints` → audit captures `oldValue` + `newValue` correctly.
- Updates `status` flip → audit captures old → new.
- Multi-field patch → single tx with all updates; audit doc contains all diffs in one record.

Mock pattern follows `src/server/approver/repo.test.ts` and `src/server/user/role-change.test.ts` (globalThis fixture + `vi.mock("@/server/lib/firebase")`).

### 4.2 Manual / integration

- Admin edits a student's `fullName` → list row reflects change; `/admin` audit tab shows new userEdits entry.
- Admin sets `totalPoints = 0` for a student with non-zero points → confirm modal appears → on confirm, leaderboard refresh re-orders correctly.
- Admin flips student status `active → inactive` → user blocked from re-login (verify the existing auth path checks status); leaderboard excludes if any status filter is in place.
- Admin flips status `inactive → active` → user can log in normally.
- Admin tries to edit a teacher via direct API call → 403 with `cannot edit teacher or admin profile`.
- Admin tries to edit own profile via direct API call → 400 with `cannot edit own profile`.
- Empty patch via direct API → 400 `no fields`.
- Concurrent edits by two admins on the same user → Firestore tx serialises; both writes captured in `userEdits` in commit order.
- New audit entries appear chronologically on `/admin` audit tab.

### 4.3 Not tested

- Firestore repo internals beyond pure function unit tests (project policy).
- UI components (project policy: manual only).

## Section 5 — Threat / Failure Model

- **Admin abuse:** any admin can edit any non-teacher/non-admin user. Mitigation: `userEdits` audit log records every change with `byUid`. Out-of-scope: multi-admin approval (consider as follow-up if abuse appears).
- **Concurrent edits:** Firestore transactions retry on conflict. Closure-captured `changes` array is rebuilt on each retry via re-read.
- **Stale form data:** if admin edits a user whose values just changed (by another admin), the diff is computed against current Firestore state on commit. Old values shown in form may not match audit "oldValue" — acceptable risk; the audit is authoritative.
- **Status flip race:** admin sets `inactive`, target user is mid-request. Existing auth middleware re-fetches `prof.status` per request, so target's in-flight request may still complete but subsequent requests will be blocked. Acceptable.
- **totalPoints monotonicity:** awarded scans use `FieldValue.increment(...)`. An admin set-to-N override happens via `tx.update({ totalPoints: N })` which overrides the increment. If an in-flight `awardScan` tx commits before the admin tx, the admin's chosen N still wins. Race window is short and admin-driven, so acceptable.
- **classKey drift:** if `classGrade` or `classRoom` changes without re-computing `classKey`, leaderboard / class queries break. Handled: the repo recomputes `classKey` whenever either field is in the patch.

## Section 6 — Follow-ups (Out of Scope)

- Hard delete with cascade cleanup of `scans`, `roleChanges`, `userEdits`, Firebase Auth.
- Bulk operations (CSV import, multi-select reset for year-end).
- Per-field role-scoping (e.g. teacher can edit fullName only).
- Edit history view on `/teacher/student` (currently audit is admin-only on `/admin`).
- Email/LINE notification to edited user.
- Editing `lineUserId` / `email` (auth-bound).
- Editing teacher/admin profile fields if a use case emerges.

## Section 7 — Acceptance Criteria

- `PATCH /api/v1/admin/users/[uid]` exists; returns 200 with `editId` and `changes` for valid patches; returns proper 400/403/404 for invalid input; returns `{ noop: true }` on unchanged patch.
- Inline expand form on `/admin` users tab supports editing `fullName`, `classGrade`, `classRoom`, `totalPoints`, `status`.
- Confirm modal triggers on destructive changes (status to inactive, totalPoints big-drop / zero).
- `userEdits` Firestore collection captures every successful edit with `targetUid`, `byUid`, `changes`, `createdAt`.
- Inactive users visually distinguished in admin list with muted styling + "(ไม่ใช้งาน)" badge.
- Admin-only `"จัดการระบบ"` tile rendered on `/home` only when `role === "admin"`; links to `/admin`.
- All existing tests pass. New `src/server/user/repo.test.ts` covers the unit-test list in §4.1.
- `npx tsc --noEmit` clean.
- No new lint errors introduced (baseline: 12 pre-existing errors after teacher-promote branch merge).
