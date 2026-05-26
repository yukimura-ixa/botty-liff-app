# Remove Approver QR, Council & Teacher Roles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the role model to `student → admin`, award scan points immediately on upload, and delete the approver-QR and role-request subsystems.

**Architecture:** Remove the `pending`/`confirm` scan gate so `scan/upload` awards directly (the pre-existing `mode === "off"` path). Delete approver routes/server/nav. Reduce the `Role` union to two members and re-guard former teacher routes admin-only (admin already satisfies the teacher guard, so logic is near-unchanged). Delete the role-request feature end-to-end. Migrate existing council/teacher accounts to student with a standalone script.

**Tech Stack:** Next.js 16 App Router (Node runtime routes), TypeScript, Firebase Admin (Firestore + Auth custom claims), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-26-remove-approver-council-teacher-design.md`

---

## Execution ordering note

TypeScript will not compile until every `"council"`/`"teacher"` literal is removed AND every deleted module's importers are updated. Tasks are ordered so the **first green `tsc`/`build` is expected only at the end of Phase 4**. Commit after each task regardless (per-task commits keep the diff reviewable); run `npx tsc --noEmit` at the checkpoints called out in the plan, not after every task. Each task lists its own verification.

## File map

**Delete:**
- `src/app/approver/layout.tsx`, `src/app/approver/page.tsx`
- `src/app/api/v1/approver/sessions/route.ts`, `src/app/api/v1/approver/sessions/[id]/end/route.ts`
- `src/server/approver/mint.ts`, `repo.ts`, `repo.test.ts`, `token.ts`, `token.test.ts`
- `src/app/api/v1/scan/confirm/route.ts`
- `src/server/scan/pending.ts`
- `src/server/roleRequests/repo.ts`
- `src/app/profile/role-request/page.tsx`
- `src/app/api/v1/me/role-requests/route.ts`
- `src/app/api/v1/teacher/role-requests/route.ts`, `src/app/api/v1/teacher/role-requests/[id]/decide/route.ts`
- `src/app/api/v1/admin/role-requests/route.ts`, `src/app/api/v1/admin/role-requests/[id]/decide/route.ts`
- `src/app/teacher/role-requests/page.tsx`

**Create:**
- `scripts/downgrade-roles.ts`

**Modify:**
- `src/app/api/v1/scan/upload/route.ts` — award immediately, drop pending
- `src/server/scan/build.ts` — drop pending-doc helpers
- `src/app/scan/page.tsx` — drop confirm/QR step
- `src/server/lib/auth.ts` — `Role` union → `student|admin|unknown`
- `src/server/lib/role-guard.ts` — drop `ApproverRole`/`canApprove`, simplify `hasRole`
- `src/server/lib/role-guard.test.ts`
- `src/components/shared/RoleGate.tsx` — `Role` union
- `src/components/shared/BottomNav.tsx` — drop staff/QR nav
- `src/server/user/role-change.ts` + `role-change.test.ts`
- `src/server/user/admin-filter.ts` + `admin-filter.test.ts`
- `src/server/user/helpers.ts`, `src/server/user/repo.ts` + `repo.test.ts`
- `src/app/api/v1/admin/users/[uid]/role/route.ts`
- `src/app/api/v1/teacher/**` route guards (teacher → admin)
- `src/lib/api.ts` — drop role-request + confirm client fns
- `src/app/admin/page.tsx`, `src/app/profile/page.tsx`, `src/app/home/page.tsx`, `src/app/teacher/page.tsx`
- `firestore.indexes.json` — drop roleRequests indexes
- `AGENTS.md` — env table + domain quirks

---

## Phase 0 — Migration script (independent)

### Task 1: Standalone downgrade script

**Files:**
- Create: `scripts/downgrade-roles.ts`

This script is plain Node run with `npx tsx`, reusing the project's Firebase Admin
init pattern. Check `src/server/lib/firebase.ts` for how `GCP_SERVICE_ACCOUNT_JSON`
+ `GCP_PROJECT` are consumed and mirror it. Dry-run is the default; pass `--apply`
to write.

- [ ] **Step 1: Read the Firebase Admin init pattern**

Run: read `src/server/lib/firebase.ts` (the `fbFirestore`/`fbAuth` init). Reuse the
same credential parsing (`JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON)`,
`projectId: process.env.GCP_PROJECT`).

- [ ] **Step 2: Write the script**

```ts
// scripts/downgrade-roles.ts
// Downgrade all council/teacher users to student. Existing admins untouched.
// Usage:
//   npx tsx scripts/downgrade-roles.ts            # dry-run (default)
//   npx tsx scripts/downgrade-roles.ts --apply    # write changes
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const APPLY = process.argv.includes("--apply");

function init() {
  if (getApps().length) return;
  const sa = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON ?? "{}");
  initializeApp({ credential: cert(sa), projectId: process.env.GCP_PROJECT });
}

async function main() {
  init();
  const db = getFirestore();
  const auth = getAuth();
  const snap = await db
    .collection("users")
    .where("role", "in", ["council", "teacher"])
    .get();

  console.log(`Found ${snap.size} council/teacher user(s). apply=${APPLY}`);
  let changed = 0;
  for (const doc of snap.docs) {
    const from = doc.get("role");
    console.log(`- ${doc.id}: ${from} -> student`);
    if (!APPLY) continue;
    await doc.ref.update({ role: "student", updatedAt: new Date() });
    try {
      await auth.setCustomUserClaims(doc.id, { role: "student" });
    } catch (e) {
      console.error(`  claim update failed for ${doc.id}`, e);
    }
    changed++;
  }
  console.log(APPLY ? `Done. Updated ${changed} user(s).` : "Dry-run only. Re-run with --apply to write.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit scripts/downgrade-roles.ts` (or rely on the full `tsc` at the
Phase-4 checkpoint). Expected: no errors. Do NOT run the script now — it touches
production data and runs after deploy.

- [ ] **Step 4: Commit**

```bash
git add scripts/downgrade-roles.ts
git commit -m "feat(scripts): add council/teacher -> student downgrade migration"
```

---

## Phase 1 — Scan awards immediately

### Task 2: Rewrite `scan/upload` to award on upload

**Files:**
- Modify: `src/app/api/v1/scan/upload/route.ts`

Remove the `mode()` machinery and the pending/outstanding branches. Students award
immediately (former `m === "off"` path). Keep IP limiter, cooldown, daily limit,
duplicate check. The non-student branch (admin preview, no points) stays.

- [ ] **Step 1: Remove pending imports**

Delete these import lines:
```ts
import { buildPendingDoc, PENDING_TTL_MS } from "@/server/scan/build";
import { createPending, hasOutstandingPending } from "@/server/scan/pending";
```
Change the `build` import to keep only what's still used:
```ts
// (no import from "@/server/scan/build" needed in upload if buildScanDoc is unused here)
```
Keep `import { awardScan } from "@/server/scan/award";`.

- [ ] **Step 2: Delete the `Mode`/`mode()` block**

Remove the `type Mode = ...` declaration and the entire `function mode(): Mode { ... }`
(lines defining the env-driven mode). No replacement.

- [ ] **Step 3: Remove the outstanding-pending guard**

Delete the block:
```ts
const m = mode();
if (m !== "off") {
  const outstanding = await hasOutstandingPending(ctx.uid);
  if (outstanding) {
    const expiresInSec = Math.max(0, Math.ceil((outstanding.expiresAt.getTime() - Date.now()) / 1000));
    return new Response(JSON.stringify({ error: "pending_exists", pendingId: outstanding.id, expiresInSec }), {
      status: 409, headers: { "Content-Type": "application/json" },
    });
  }
}
```

- [ ] **Step 4: Replace the award + response tail**

Find the block starting `const pendingId = ulid();` through the end of the function
(the three `if (m === ...)` returns). Replace the award/return section so it always
awards and returns the former `off`-mode shape:

```ts
  // (delete the `const pendingId = ulid();` line)

  const newStreak = computeStreak(prof.streakDays ?? 0, prof.lastScanLocalDate ?? "", localDate);
  const isFirstOfDay = prof.dailyScanDate !== localDate;
  const newDaily = isFirstOfDay ? 1 : (prof.dailyScans ?? 0) + 1;
  const pt = calculatePoints(DEFAULT_POINTS_CONFIG, newStreak, isFirstOfDay, det.itemCount);
  const rawItems = Number.isFinite(det.itemCount) ? Math.floor(det.itemCount) : 1;
  const pointedItems = Math.min(DEFAULT_POINTS_CONFIG.maxItemsPerScan, Math.max(1, rawItems));
  const newTotal = (prof.totalPoints ?? 0) + pt.total;
  const newRank = rankForPoints(newTotal);

  await awardScan({
    uid: ctx.uid,
    classKey: prof.classKey ?? "",
    detectedClass: det.class,
    itemCount: det.itemCount,
    basePoints: pt.basePoints,
    streakBonus: pt.streakBonus,
    totalPoints: pt.total,
    confidence: det.confidence,
    clientConf,
    imagePath: imageUrl,
    imageHash: hash,
    phash,
    phashBucket: phashBkt,
    capturedAt,
    localDate,
    scanId,
    newStreak,
    newDaily,
    newRank,
  });
  bustLeaderboardCaches();

  return jsonOk({
    scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
    pointedItems,
    basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
    newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
    awarded: true,
    annotatedImage: det.annotatedImage,
  });
```
(Keep the existing `awardArgs` object if you prefer — just ensure a single
`awardScan(...)` + `bustLeaderboardCaches()` + one `jsonOk` with `awarded: true`.)

- [ ] **Step 5: Verify the route typechecks in isolation**

Run: `npx tsc --noEmit` — expect remaining errors ONLY from not-yet-deleted modules
(`confirm/route.ts` still imports pending). The upload route itself should report no
errors. (Full green comes at the Phase-4 checkpoint.)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/scan/upload/route.ts
git commit -m "feat(scan): award points immediately on upload, drop QR-confirm gate"
```

### Task 3: Delete the confirm route and pending module

**Files:**
- Delete: `src/app/api/v1/scan/confirm/route.ts`
- Delete: `src/server/scan/pending.ts`
- Modify: `src/server/scan/build.ts`

- [ ] **Step 1: Delete the files**

```bash
git rm src/app/api/v1/scan/confirm/route.ts src/server/scan/pending.ts
```

- [ ] **Step 2: Strip pending helpers from `build.ts`**

In `src/server/scan/build.ts` delete `PENDING_TTL_MS`, `PENDING_STATUS_AWAITING`,
`PendingDocInput`, `PendingDoc`, and `buildPendingDoc`. Keep `ScanDocInput`,
`buildScanDoc`. Resulting file is only the scan-doc builder.

- [ ] **Step 3: Confirm no stragglers import pending/buildPendingDoc**

Run: `grep -rn "scan/pending\|buildPendingDoc\|PendingDoc\|PENDING_TTL_MS\|PENDING_STATUS" src/`
Expected: no matches (the deleted confirm route was the only other consumer). If any
appear, remove them.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(scan): delete confirm route and pending-scan module"
```

### Task 4: Drop the QR-confirm step from the scan client

**Files:**
- Modify: `src/app/scan/page.tsx`

The upload response no longer returns `pendingId`; it returns `awarded: true` with
points. Remove the confirm/QR-scan UI state and the `confirmScan` call.

- [ ] **Step 1: Inspect the current confirm flow**

Run: `grep -n "pendingId\|confirmScan\|approverToken\|QR\|qr" src/app/scan/page.tsx`
to locate the confirm state machine (a post-upload step that asks the student to get
a staff QR scanned).

- [ ] **Step 2: Remove the confirm step**

Delete the `confirmScan` import and any state/UI branch that waits for `pendingId` /
prompts for the staff QR. After a successful upload, render the points-awarded result
directly from the upload response (`totalPoints`, `newTotalPoints`, `newRank`,
`streakDays`, `annotatedImage`). Remove `pendingId`/`expiresInSec` handling.

- [ ] **Step 3: Verify**

Run: `grep -n "pendingId\|confirmScan\|approverToken" src/app/scan/page.tsx`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat(scan): show points immediately, remove staff-QR confirm step"
```

---

## Phase 2 — Delete approver subsystem

### Task 5: Delete approver routes, server, tests

**Files:**
- Delete: `src/app/approver/layout.tsx`, `src/app/approver/page.tsx`
- Delete: `src/app/api/v1/approver/sessions/route.ts`, `src/app/api/v1/approver/sessions/[id]/end/route.ts`
- Delete: `src/server/approver/mint.ts`, `repo.ts`, `repo.test.ts`, `token.ts`, `token.test.ts`

- [ ] **Step 1: Delete**

```bash
git rm -r src/app/approver src/app/api/v1/approver src/server/approver
```

- [ ] **Step 2: Find stragglers**

Run: `grep -rn "server/approver\|/approver\|verifySlotToken\|claimSlot\|approverToken\|STAFF_QR_SECRET" src/`
Expected matches only in `src/lib/api.ts` (approver session client fns + `confirmScan`)
and `src/components/shared/BottomNav.tsx` (handled in Tasks 6 & later). Note them.

- [ ] **Step 3: Remove approver/confirm client fns from `api.ts`**

In `src/lib/api.ts` delete `confirmScan`, `startApproverSession`,
`endApproverSession`, and the `ApproverSessionResponse` type (and the `pendingId?`
field on the upload response type if present and unused elsewhere — verify with grep
first). Keep everything else.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(approver): delete approver QR routes, server, and client functions"
```

### Task 6: Remove staff/QR navigation

**Files:**
- Modify: `src/components/shared/BottomNav.tsx`

- [ ] **Step 1: Replace staff nav with admin-only entry**

Delete the `staffItems` array and the `QrIcon` button entry (`href: '/approver'`).
Rename `isStaffRole` → `isAdmin` returning `r === 'admin'`. Admins should get the
student nav; the admin dashboard is reached via the profile/home link (Task 12), so
admins can simply use `studentItems`:

```tsx
function isAdmin(r: string | null): boolean {
  return r === 'admin';
}
```
Then in the component, both roles use `studentItems` (drop the `staffItems` branch).
If you want an admin-only nav entry instead, add an item to a copied array pointing at
`/admin` — but the simplest correct change is: everyone uses `studentItems`. Remove the
now-unused `staffItems` and `QrIcon`.

- [ ] **Step 2: Verify**

Run: `grep -n "staffItems\|QrIcon\|/approver\|isStaffRole" src/components/shared/BottomNav.tsx`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/BottomNav.tsx
git commit -m "feat(nav): remove staff QR button from bottom nav"
```

---

## Phase 3 — Collapse role model to student|admin

### Task 7: Narrow the `Role` unions

**Files:**
- Modify: `src/server/lib/auth.ts`
- Modify: `src/components/shared/RoleGate.tsx`
- Modify: `src/server/lib/role-guard.ts`
- Modify: `src/server/lib/role-guard.test.ts`

- [ ] **Step 1: `auth.ts` — narrow the union**

Change:
```ts
role: "student" | "council" | "teacher" | "admin" | "unknown";
```
to:
```ts
role: "student" | "admin" | "unknown";
```

- [ ] **Step 2: `RoleGate.tsx` — narrow the exported `Role`**

Change `export type Role = "student" | "council" | "teacher" | "admin";` to
`export type Role = "student" | "admin";`.

- [ ] **Step 3: `role-guard.ts` — simplify**

Replace the file body with:
```ts
import type { AuthContext } from "./auth";

export type Role = AuthContext["role"];

export function hasRole(ctx: AuthContext, required: "admin"): boolean {
  return ctx.role === "admin";
}
```
(Delete `ApproverRole` and `canApprove`. `hasRole` now only takes `"admin"`.)

- [ ] **Step 4: Update `role-guard.test.ts`**

Rewrite the test to cover the two-role model: `hasRole` returns true only for admin,
false for student/unknown; assert `canApprove`/`ApproverRole` no longer exist (remove
those test cases). Example:
```ts
import { describe, it, expect } from "vitest";
import { hasRole } from "./role-guard";

describe("hasRole", () => {
  it("grants admin", () => {
    expect(hasRole({ uid: "x", role: "admin" }, "admin")).toBe(true);
  });
  it("denies student", () => {
    expect(hasRole({ uid: "x", role: "student" }, "admin")).toBe(false);
  });
  it("denies unknown", () => {
    expect(hasRole({ uid: "x", role: "unknown" }, "admin")).toBe(false);
  });
});
```

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/auth.ts src/components/shared/RoleGate.tsx src/server/lib/role-guard.ts src/server/lib/role-guard.test.ts
git commit -m "refactor(roles): narrow Role union to student|admin, simplify guards"
```

### Task 8: Re-guard former teacher API routes to admin

**Files:**
- Modify: every route under `src/app/api/v1/teacher/**` that calls `hasRole(ctx, "teacher")` or `canApprove(...)`

Routes: `config/forest-stages`, `exports/sheet`, `kpis`, `students`,
`students/[uid]`, `students/[uid]/adjust`, `students/[uid]/adjust/request`,
`students/[uid]/role`. (`role-requests` routes are deleted in Phase 4 — skip them.)

- [ ] **Step 1: Find the guard calls**

Run: `grep -rn "hasRole\|canApprove" src/app/api/v1/teacher`
Note each call site.

- [ ] **Step 2: Change each `hasRole(ctx, "teacher")` to `hasRole(ctx, "admin")`**

For every match, the required role becomes `"admin"`. Replace any `canApprove(ctx.role)`
guard with `hasRole(ctx, "admin")` and remove the now-dead `canApprove` import.
Behavior is unchanged for admins (who already passed the teacher guard).

- [ ] **Step 3: Verify no teacher/council role literals remain in these routes**

Run: `grep -rn "\"teacher\"\|\"council\"\|canApprove" src/app/api/v1/teacher`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/teacher
git commit -m "refactor(teacher-routes): require admin role (council/teacher removed)"
```

### Task 9: Simplify role-change logic

**Files:**
- Modify: `src/server/user/role-change.ts`
- Modify: `src/server/user/role-change.test.ts`

With only student/admin, there are no API-assignable intermediate roles. The admin
user-role route (Task 10) should only set student/admin, and admin is set manually.
`changeRoleAsTeacher` is obsolete (its only callers were teacher role routes / role
requests). Confirm callers before deleting.

- [ ] **Step 1: Confirm callers of `changeRoleAsTeacher`**

Run: `grep -rn "changeRoleAsTeacher" src/`
Expected callers: only `teacher/students/[uid]/role/route.ts` and tests. If so, this
function and that route's promote/demote behavior need a decision: the spec keeps
`students/[uid]/role` re-guarded to admin (Task 8). Since the only assignable roles are
student/admin now and admin is manual-only, **this route can no longer assign
council/teacher**. Update it in Step 3.

- [ ] **Step 2: Simplify `changeRole`**

In `role-change.ts`:
- `AssignableRole` → `"student"` (admin is manual-only; demotion-to-student is the only
  API role change left). Or keep `"student" | "admin"` if you want admin-promote via
  API — but spec says admins are set manually, so use `"student"`.
- Update the validation guard: `if (newRole !== "student") throw new Error("invalid");`
- Delete the `if (newRole === "teacher") { ... }` class-reset block.
- Delete `TeacherAssignableRole` and the entire `changeRoleAsTeacher` function.

- [ ] **Step 3: Update the teacher students role route**

In `src/app/api/v1/teacher/students/[uid]/role/route.ts`, replace any
`changeRoleAsTeacher(...)` call with `changeRole(targetUid, actorUid, "student", reason)`
(demote-to-student only), or return 410/remove the endpoint if it served only
council promotion. Pick demote-to-student to preserve a working "remove staff" action.
Remove council/teacher from any request-body validation.

- [ ] **Step 4: Rewrite `role-change.test.ts`**

Remove all `changeRoleAsTeacher` tests and council/teacher promotion cases. Keep/adjust
`changeRole` tests: rejects self, rejects non-student target value, rejects demoting
admin (`demote_admin`), demotes to student writes audit doc. Example assertions:
```ts
it("rejects newRole other than student", async () => {
  await expect(mod.changeRole("u1", "u2", "council" as never, "r")).rejects.toThrow("invalid");
});
```

- [ ] **Step 5: Run the role-change tests**

Run: `npx vitest run src/server/user/role-change.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/user/role-change.ts src/server/user/role-change.test.ts src/app/api/v1/teacher/students/[uid]/role/route.ts
git commit -m "refactor(roles): role-change only demotes to student; drop teacher promotion"
```

### Task 10: Clean remaining role literals in user module + admin role route

**Files:**
- Modify: `src/server/user/admin-filter.ts` + `admin-filter.test.ts`
- Modify: `src/server/user/helpers.ts`
- Modify: `src/server/user/repo.ts` + `repo.test.ts`
- Modify: `src/app/api/v1/admin/users/[uid]/role/route.ts`

- [ ] **Step 1: Narrow role unions**

In `admin-filter.ts` (line ~7) and `helpers.ts` (line ~4) change
`role: "student" | "council" | "teacher" | "admin";` → `role: "student" | "admin";`.

- [ ] **Step 2: Fix `repo.ts` role guards**

`repo.ts:82` `if (role === "teacher" || role === "admin") throw new Error("forbidden_target");`
→ `if (role === "admin") throw new Error("forbidden_target");`
`repo.ts:163` `if (role !== "student" && role !== "council") throw new Error("forbidden_target");`
→ adjust to the two-role model. Read the surrounding function first
(`find_symbol` on the enclosing function) to pick the correct condition — likely
`if (role !== "student") throw new Error("forbidden_target");`.

- [ ] **Step 3: Update admin role route**

In `src/app/api/v1/admin/users/[uid]/role/route.ts`, restrict the accepted
`role` body value to `"student"` (admin is manual-only per spec). Reject anything else
with 400. Remove council/teacher from validation.

- [ ] **Step 4: Update `admin-filter.test.ts` and `repo.test.ts`**

Replace `"teacher"`/`"council"` fixtures with `"student"`/`"admin"`. In
`admin-filter.test.ts` lines ~15/33 swap the teacher mocks. In `repo.test.ts` line ~69-72
("rejects when target is teacher") change the fixture to `role: "admin"` and rename the
test to "rejects when target is admin".

- [ ] **Step 5: Run the user tests**

Run: `npx vitest run src/server/user`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/user src/app/api/v1/admin/users/[uid]/role/route.ts
git commit -m "refactor(roles): purge council/teacher from user module + admin role route"
```

### Task 11: Fix scan-eligible roles

**Files:**
- Modify: `src/app/api/v1/scan/upload/route.ts`

- [ ] **Step 1: Narrow the eligible set**

Change:
```ts
const SCAN_ELIGIBLE_ROLES = new Set(["student", "council", "teacher", "admin"]);
```
to:
```ts
const SCAN_ELIGIBLE_ROLES = new Set(["student", "admin"]);
```
The `if (prof.role !== "student")` preview branch already covers admin (preview, no
points) — leave it.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/v1/scan/upload/route.ts
git commit -m "refactor(scan): scan-eligible roles are student and admin only"
```

---

## Phase 4 — Delete role-request feature

### Task 12: Delete role-request routes, pages, server, client, indexes

**Files:**
- Delete: `src/server/roleRequests/repo.ts`
- Delete: `src/app/profile/role-request/page.tsx`
- Delete: `src/app/api/v1/me/role-requests/route.ts`
- Delete: `src/app/api/v1/teacher/role-requests/route.ts`, `src/app/api/v1/teacher/role-requests/[id]/decide/route.ts`
- Delete: `src/app/api/v1/admin/role-requests/route.ts`, `src/app/api/v1/admin/role-requests/[id]/decide/route.ts`
- Delete: `src/app/teacher/role-requests/page.tsx`
- Modify: `src/lib/api.ts`, `src/app/admin/page.tsx`, `src/app/profile/page.tsx`, `src/app/home/page.tsx`, `src/app/teacher/page.tsx`
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Delete the files**

```bash
git rm src/server/roleRequests/repo.ts \
  src/app/profile/role-request/page.tsx \
  src/app/api/v1/me/role-requests/route.ts \
  src/app/api/v1/teacher/role-requests/route.ts \
  "src/app/api/v1/teacher/role-requests/[id]/decide/route.ts" \
  src/app/api/v1/admin/role-requests/route.ts \
  "src/app/api/v1/admin/role-requests/[id]/decide/route.ts" \
  src/app/teacher/role-requests/page.tsx
```

- [ ] **Step 2: Strip role-request client fns from `api.ts`**

Delete `teacherListRoleRequests`, `teacherDecideRoleRequest`, `getMyRoleRequest`,
`createRoleRequest`, `adminListRoleRequests`, `adminDecideRoleRequest`, and the
`RoleRequest` / `RoleRequestStatus` types.

- [ ] **Step 3: Remove role-request UI from pages**

For each of `admin/page.tsx`, `profile/page.tsx`, `home/page.tsx`, `teacher/page.tsx`:
run `grep -n "RoleRequest\|role-request\|roleRequest\|createRoleRequest\|getMyRoleRequest" <file>`
and remove the importing lines, the request review section/links, and any
council/teacher request CTA. The profile page loses its "request council/teacher"
entry point; the admin and teacher dashboards lose their role-request review panels.

- [ ] **Step 4: Remove roleRequests indexes**

In `firestore.indexes.json` delete any composite index whose `collectionGroup` is
`roleRequests`.

- [ ] **Step 5: Find any straggler references**

Run: `grep -rn "roleRequest\|role-request\|RoleRequest" src/ firestore.indexes.json`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(role-request): delete role-request feature end-to-end"
```

### Task 13: Add admin dashboard entry point (nav replacement)

**Files:**
- Modify: `src/app/profile/page.tsx` (or `src/app/home/page.tsx`)

Since the QR primary nav button is gone (Task 6), admins need a link to the dashboard.

- [ ] **Step 1: Inspect how role-conditional UI is currently rendered**

Run: `grep -n "role\|sessionStorage.getItem('role')\|admin" src/app/profile/page.tsx`
to find the existing role check pattern.

- [ ] **Step 2: Add an admin-only link**

Where the profile renders role-specific actions, add (for `role === "admin"`) links to
`/admin` and `/teacher` (the dashboard). Match the existing list-item/button styling on
the page — do not introduce a new component. If a staff link already existed pointing at
`/teacher` or `/approver`, repoint it: drop `/approver`, keep `/admin` + `/teacher`.

- [ ] **Step 3: Verify**

Run: `grep -n "/approver" src/app/profile/page.tsx src/app/home/page.tsx`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add src/app/profile/page.tsx src/app/home/page.tsx
git commit -m "feat(admin): add dashboard entry point in profile (replaces QR nav)"
```

---

## Phase 5 — Checkpoint, docs, gates

### Task 14: Full typecheck + targeted fixups

**Files:** any with leftover references

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (zero errors). This is the first point the whole tree must compile.

- [ ] **Step 2: Hunt remaining literals**

Run: `grep -rn "\"council\"\|\"teacher\"\|'council'\|'teacher'\|canApprove\|ApproverRole\|isStaffRole\|BIN_CONFIRM_MODE\|STAFF_QR_SECRET" src/`
Expected: no matches. Fix any that remain (respecting their context), re-run `tsc`.

- [ ] **Step 3: Commit (if fixups were needed)**

```bash
git add -A
git commit -m "fix: remove final council/teacher/approver references"
```

### Task 15: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Edit the docs**

- Roles section: change `student → council → teacher → admin` to `student → admin`.
- Domain quirks: delete the approver-QR bullet, the teacher point-adjustment
  council/teacher wording (keep the ±10/±11–50 dual-approval, now admin-operated),
  and the role-requests bullet.
- Env vars table: remove `STAFF_QR_SECRET`. Note `BIN_CONFIRM_MODE` is gone.
- Routes list: remove `/approver`, `/profile/role-request`; note `/teacher` is
  admin-only now.

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for student|admin roles, no approver/role-request"
```

### Task 16: Full quality gates

- [ ] **Step 1: Tests**

Run: `npm test`
Expected: PASS (no approver/role-request test files remain; role-guard, role-change,
admin-filter, repo tests green).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean (no unused imports from deleted modules).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success — no route references deleted modules.

- [ ] **Step 4: Final commit if anything changed**

```bash
git add -A
git commit -m "chore: quality-gate fixups for role/approver removal"
```

---

## Post-implementation (manual, not a code task)

1. Deploy.
2. Run the migration: `vercel env pull` then
   `npx tsx scripts/downgrade-roles.ts` (dry-run) → review → `--apply`.
3. Remove `STAFF_QR_SECRET` and `BIN_CONFIRM_MODE` from Vercel project env.
4. Optional later cleanup: delete orphaned Firestore collections `pendingScans` and
   the approver-session collection (out of scope for this plan).
