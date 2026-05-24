# Teacher Promote-to-Council + Non-Student Scan Without Points — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers (and admins) flip a user between `student` and `council` roles via a dedicated endpoint, and prevent non-student scans from awarding points, advancing streaks, or affecting the leaderboard.

**Architecture:** A new `changeRoleAsTeacher()` server function wraps the existing transactional role-change logic with tighter bounds (student↔council only, teacher/admin targets forbidden). A new `POST /api/v1/teacher/students/[uid]/role` route exposes it. The scan-upload route branches on the caller's role: students follow the existing award flow; non-students take a lightweight preview path (detector + image upload + audit scan doc, no profile mutation, no pending). Leaderboard exclusion is already enforced by the existing `role == "student"` query filter and needs no change.

**Tech Stack:** Next.js 16 App Router, Firebase Admin (Firestore + Auth custom claims), Vercel Blob, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-24-teacher-promote-council-no-points-design.md`

---

## File Map

| File | Purpose |
|---|---|
| `src/server/user/role-change.ts` | Add `changeRoleAsTeacher()` + new `RoleChangeError` variants. |
| `src/server/user/role-change.test.ts` (new) | Unit tests for the new wrapper. |
| `src/app/api/v1/teacher/students/[uid]/role/route.ts` (new) | POST handler for teacher-driven role flips. |
| `src/server/scan/preview.ts` (new) | `recordPreviewScan()` — writes a single `scans/<id>` doc with `awarded:false, preview:true`, no profile/leaderboard mutation. |
| `src/app/api/v1/scan/upload/route.ts` | Branch on `prof.role`: student → existing flow; else → preview path. |
| `src/lib/api.ts` | Add `teacherChangeStudentRole()` client wrapper. |
| `src/app/teacher/student/page.tsx` | Add role-change panel (badge + select + confirm). |
| `src/app/scan/page.tsx` | Show preview banner when response has `preview: true`. |

---

## Task 1 — `changeRoleAsTeacher` server function (TDD)

**Files:**
- Modify: `src/server/user/role-change.ts`
- Create: `src/server/user/role-change.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/server/user/role-change.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

declare global {
  // eslint-disable-next-line no-var
  var __fsMock: ReturnType<typeof makeFsMock> | undefined;
}

type TxOp = { kind: "get" | "set" | "update"; refKey: string; data?: unknown };

vi.mock("@/server/lib/firebase", () => ({
  fbFirestore: () => globalThis.__fsMock,
  fbAuth: () => ({ setCustomUserClaims: async () => undefined }),
}));

vi.mock("@/server/lib/cache-bus", () => ({
  bust: () => undefined,
}));

function makeFsMock(opts: { targetExists: boolean; targetRole?: string }) {
  const ops: TxOp[] = [];
  const refFor = (path: string) => ({ __path: path });
  const fs = {
    collection: (name: string) => ({
      doc: (id?: string) => refFor(`${name}/${id ?? "auto"}`),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const tx = {
        get: async (ref: { __path: string }) => {
          ops.push({ kind: "get", refKey: ref.__path });
          return {
            exists: opts.targetExists,
            data: () => ({ role: opts.targetRole ?? "student" }),
          };
        },
        set: (ref: { __path: string }, data: unknown) => {
          ops.push({ kind: "set", refKey: ref.__path, data });
        },
        update: (ref: { __path: string }, data: unknown) => {
          ops.push({ kind: "update", refKey: ref.__path, data });
        },
      };
      return fn(tx);
    },
    __ops: ops,
  };
  return fs;
}

beforeEach(() => {
  globalThis.__fsMock = undefined;
});

async function importMod() {
  return await import("./role-change");
}

describe("changeRoleAsTeacher", () => {
  it("rejects self change", async () => {
    globalThis.__fsMock = makeFsMock({ targetExists: true, targetRole: "student" });
    const mod = await importMod();
    await expect(mod.changeRoleAsTeacher("u1", "u1", "council")).rejects.toThrow("self");
  });

  it("rejects newRole = teacher", async () => {
    globalThis.__fsMock = makeFsMock({ targetExists: true, targetRole: "student" });
    const mod = await importMod();
    await expect(
      mod.changeRoleAsTeacher("u1", "u2", "teacher" as never),
    ).rejects.toThrow("invalid");
  });

  it("rejects newRole = admin", async () => {
    globalThis.__fsMock = makeFsMock({ targetExists: true, targetRole: "student" });
    const mod = await importMod();
    await expect(
      mod.changeRoleAsTeacher("u1", "u2", "admin" as never),
    ).rejects.toThrow("invalid");
  });

  it("rejects when target is teacher", async () => {
    globalThis.__fsMock = makeFsMock({ targetExists: true, targetRole: "teacher" });
    const mod = await importMod();
    await expect(
      mod.changeRoleAsTeacher("u1", "u2", "council"),
    ).rejects.toThrow("forbidden_target");
  });

  it("rejects when target is admin", async () => {
    globalThis.__fsMock = makeFsMock({ targetExists: true, targetRole: "admin" });
    const mod = await importMod();
    await expect(
      mod.changeRoleAsTeacher("u1", "u2", "council"),
    ).rejects.toThrow("forbidden_target");
  });

  it("rejects when target not found", async () => {
    globalThis.__fsMock = makeFsMock({ targetExists: false });
    const mod = await importMod();
    await expect(
      mod.changeRoleAsTeacher("u1", "u2", "council"),
    ).rejects.toThrow("not_found");
  });

  it("returns noop when target.role === newRole", async () => {
    globalThis.__fsMock = makeFsMock({ targetExists: true, targetRole: "council" });
    const mod = await importMod();
    const r = await mod.changeRoleAsTeacher("u1", "u2", "council");
    expect(r.noop).toBe(true);
    const ops = globalThis.__fsMock!.__ops;
    expect(ops.some((o) => o.kind === "update")).toBe(false);
    expect(ops.some((o) => o.kind === "set")).toBe(false);
  });

  it("promotes student -> council, writes update + audit doc", async () => {
    globalThis.__fsMock = makeFsMock({ targetExists: true, targetRole: "student" });
    const mod = await importMod();
    const r = await mod.changeRoleAsTeacher("u1", "u2", "council");
    expect(r.noop).toBeUndefined();
    expect(r.roleChangeId).toBeTruthy();
    const ops = globalThis.__fsMock!.__ops;
    const upd = ops.find((o) => o.kind === "update" && o.refKey === "users/u1");
    expect(upd).toBeTruthy();
    expect((upd!.data as { role: string }).role).toBe("council");
    const set = ops.find((o) => o.kind === "set" && o.refKey.startsWith("roleChanges/"));
    expect(set).toBeTruthy();
    expect((set!.data as { fromRole: string; toRole: string; reason: string }).fromRole).toBe("student");
    expect((set!.data as { fromRole: string; toRole: string; reason: string }).toRole).toBe("council");
    expect((set!.data as { reason: string }).reason).toBe("");
  });

  it("demotes council -> student", async () => {
    globalThis.__fsMock = makeFsMock({ targetExists: true, targetRole: "council" });
    const mod = await importMod();
    const r = await mod.changeRoleAsTeacher("u1", "u2", "student");
    expect(r.roleChangeId).toBeTruthy();
    const ops = globalThis.__fsMock!.__ops;
    const upd = ops.find((o) => o.kind === "update" && o.refKey === "users/u1");
    expect((upd!.data as { role: string }).role).toBe("student");
  });
});
```

- [ ] **Step 2: Run test to confirm failures**

Run: `npm test -- src/server/user/role-change.test.ts`
Expected: FAIL — `changeRoleAsTeacher` not exported.

- [ ] **Step 3: Implement `changeRoleAsTeacher`**

Edit `src/server/user/role-change.ts`. Replace the entire file with:

```ts
import { fbFirestore, fbAuth } from "@/server/lib/firebase";
import { bust } from "@/server/lib/cache-bus";

export type RoleChangeError =
  | "self"
  | "invalid"
  | "not_found"
  | "demote_admin"
  | "forbidden_target";

export type AssignableRole = "student" | "council" | "teacher";
export type TeacherAssignableRole = "student" | "council";

export async function changeRole(
  targetUid: string,
  actorUid: string,
  newRole: AssignableRole,
  reason: string,
): Promise<{ roleChangeId: string; claimUpdateOk: boolean }> {
  if (targetUid === actorUid) throw new Error("self");
  if (newRole !== "student" && newRole !== "council" && newRole !== "teacher") throw new Error("invalid");
  const fs = fbFirestore();
  const userRef = fs.collection("users").doc(targetUid);
  const changeRef = fs.collection("roleChanges").doc();
  await fs.runTransaction(async (tx) => {
    const profSnap = await tx.get(userRef);
    if (!profSnap.exists) throw new Error("not_found");
    const prof = profSnap.data() ?? {};
    if (prof.role === "admin") throw new Error("demote_admin");
    const fromRole = typeof prof.role === "string" ? prof.role : "student";
    const updates: Record<string, unknown> = { role: newRole, updatedAt: new Date() };
    if (newRole === "teacher") {
      updates.classGrade = 0;
      updates.classRoom = 0;
      updates.classKey = "";
    }
    tx.update(userRef, updates);
    tx.set(changeRef, {
      targetUid, byUid: actorUid, fromRole, toRole: newRole, reason, createdAt: new Date(),
    });
  });

  bust(`user:${targetUid}`);
  bust("classes");
  bust("leaderboard");

  let claimUpdateOk = false;
  try {
    await fbAuth().setCustomUserClaims(targetUid, { role: newRole });
    claimUpdateOk = true;
  } catch (err) {
    console.error("setCustomUserClaims failed", targetUid, err);
  }
  return { roleChangeId: changeRef.id, claimUpdateOk };
}

export async function changeRoleAsTeacher(
  targetUid: string,
  actorUid: string,
  newRole: TeacherAssignableRole,
): Promise<{ roleChangeId?: string; claimUpdateOk?: boolean; noop?: true }> {
  if (targetUid === actorUid) throw new Error("self");
  if (newRole !== "student" && newRole !== "council") throw new Error("invalid");

  const fs = fbFirestore();
  const userRef = fs.collection("users").doc(targetUid);
  const changeRef = fs.collection("roleChanges").doc();

  let noop = false;
  let fromRole = "student";

  await fs.runTransaction(async (tx) => {
    const profSnap = await tx.get(userRef);
    if (!profSnap.exists) throw new Error("not_found");
    const prof = profSnap.data() ?? {};
    const current = typeof prof.role === "string" ? prof.role : "student";
    if (current === "teacher" || current === "admin") throw new Error("forbidden_target");
    if (current === newRole) {
      noop = true;
      return;
    }
    fromRole = current;
    tx.update(userRef, { role: newRole, updatedAt: new Date() });
    tx.set(changeRef, {
      targetUid, byUid: actorUid, fromRole, toRole: newRole, reason: "", createdAt: new Date(),
    });
  });

  if (noop) return { noop: true };

  bust(`user:${targetUid}`);
  bust("classes");
  bust("leaderboard");

  let claimUpdateOk = false;
  try {
    await fbAuth().setCustomUserClaims(targetUid, { role: newRole });
    claimUpdateOk = true;
  } catch (err) {
    console.error("setCustomUserClaims failed", targetUid, err);
  }
  return { roleChangeId: changeRef.id, claimUpdateOk };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- src/server/user/role-change.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/user/role-change.ts src/server/user/role-change.test.ts
git commit -m "feat(user): add changeRoleAsTeacher for student<->council flips"
```

---

## Task 2 — Teacher role-change POST endpoint

**Files:**
- Create: `src/app/api/v1/teacher/students/[uid]/role/route.ts`

- [ ] **Step 1: Look up the existing admin route for reference**

Read `src/app/api/v1/admin/users/[uid]/role/route.ts` to copy auth + response shape.

- [ ] **Step 2: Write the new route**

Create `src/app/api/v1/teacher/students/[uid]/role/route.ts`:

```ts
import { NextRequest } from "next/server";
import { verifyBearerTokenWithFreshRole, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonNoStore } from "@/server/lib/http";
import { changeRoleAsTeacher, type TeacherAssignableRole } from "@/server/user/role-change";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  let ctx;
  try { ctx = await verifyBearerTokenWithFreshRole(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "teacher")) return jsonError(403, "forbidden");
  const { uid } = await params;

  let body: { role?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (!body.role) return jsonError(400, "role required");
  if (body.role !== "student" && body.role !== "council") {
    return jsonError(400, "role must be student or council");
  }

  try {
    const r = await changeRoleAsTeacher(uid, ctx.uid, body.role as TeacherAssignableRole);
    if (r.noop) return jsonNoStore({ ok: true, noop: true });
    if (!r.claimUpdateOk) {
      return jsonNoStore({
        ok: true,
        roleChangeId: r.roleChangeId,
        warning: "claim update failed; user must re-login after retry",
      });
    }
    return jsonNoStore({ ok: true, roleChangeId: r.roleChangeId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    if (msg === "self") return jsonError(400, "cannot change own role");
    if (msg === "invalid") return jsonError(400, "role must be student or council");
    if (msg === "not_found") return jsonError(404, "user not found");
    if (msg === "forbidden_target") return jsonError(403, "cannot change teacher or admin role");
    console.error("teacher change role failed", err);
    return jsonError(500, msg);
  }
}
```

- [ ] **Step 3: Verify imports resolve**

Run: `npx tsc --noEmit`
Expected: no errors. If `verifyBearerTokenWithFreshRole`, `AuthError`, `jsonError`, `jsonNoStore`, or `hasRole` paths differ from the admin route, mirror exactly what `src/app/api/v1/admin/users/[uid]/role/route.ts` imports.

- [ ] **Step 4: Manual smoke (deferred to Task 8 — full e2e)**

Skip runtime test here; route auth requires a real Firebase token. Covered in Task 8.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/v1/teacher/students/[uid]/role/route.ts"
git commit -m "feat(api): teacher endpoint to flip student<->council"
```

---

## Task 3 — `recordPreviewScan` helper

**Files:**
- Create: `src/server/scan/preview.ts`

- [ ] **Step 1: Write the helper**

Create `src/server/scan/preview.ts`:

```ts
import { fbFirestore } from "@/server/lib/firebase";

export type PreviewScanInput = {
  uid: string;
  scanId: string;
  classKey: string;
  detectedClass: string;
  itemCount: number;
  confidence: number;
  clientConf: number;
  imagePath: string;
  imageHash: string;
  phash?: string;
  phashBucket?: string;
  capturedAt: Date;
  localDate: string;
};

export async function recordPreviewScan(i: PreviewScanInput): Promise<void> {
  const fs = fbFirestore();
  const scanRef = fs.collection("scans").doc(i.scanId);
  const doc: Record<string, unknown> = {
    uid: i.uid,
    classKey: i.classKey,
    detectedClass: i.detectedClass,
    itemCount: i.itemCount,
    basePoints: 0,
    streakBonus: 0,
    totalPoints: 0,
    confidence: i.confidence,
    clientConf: i.clientConf,
    imagePath: i.imagePath,
    imageHash: i.imageHash,
    phash: i.phash,
    phashBucket: i.phashBucket,
    capturedAt: i.capturedAt,
    localDate: i.localDate,
    awarded: false,
    preview: true,
  };
  for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];
  await scanRef.set(doc);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/scan/preview.ts
git commit -m "feat(scan): add recordPreviewScan for non-student audit docs"
```

---

## Task 4 — Branch scan/upload on role

**Files:**
- Modify: `src/app/api/v1/scan/upload/route.ts`

- [ ] **Step 1: Read the current route body**

Open `src/app/api/v1/scan/upload/route.ts`. The current `POST` handler runs cooldown → daily → dup → mode → detect → award/pending. We will branch at the role gate.

- [ ] **Step 2: Add the import**

At the top of the file (with other imports), add:

```ts
import { recordPreviewScan } from "@/server/scan/preview";
```

- [ ] **Step 3: Replace the body of the `POST` handler**

Use Serena's `replace_symbol_body` (or `Edit` since this is a route file, but Serena is preferred per `CLAUDE.md`). Replace the `POST` function body so that after the `prof` fetch + active/role-allow gate, non-student callers take a preview path.

Find this block in the existing handler:

```ts
  const prof = await getUser(ctx.uid);
  if (!prof) return jsonError(404, "profile");
  const SCAN_ELIGIBLE_ROLES = new Set(["student", "council", "teacher", "admin"]);
  if (!SCAN_ELIGIBLE_ROLES.has(prof.role) || prof.status !== "active") {
    console.warn("[scan/upload] 403 not eligible", { uid: ctx.uid, role: prof.role, status: prof.status });
    return jsonError(403, "not eligible");
  }
```

Immediately after that block (before the existing `if (prof.lastScanAt) { ... }` cooldown check), insert the non-student preview branch:

```ts
  if (prof.role !== "student") {
    let det;
    try { det = await detect(detectorConfigFromEnv(), buf); }
    catch (err) {
      console.error("detector error", ctx.uid, err);
      return jsonError(500, "detector error");
    }
    if (!det.accepted) {
      return new Response(JSON.stringify({ error: "not a PET bottle", confidence: det.confidence }), {
        status: 422, headers: { "Content-Type": "application/json" },
      });
    }
    const scanId = ulid();
    let imageUrl: string;
    try { imageUrl = await uploadScanImage(ctx.uid, scanId, buf); }
    catch (err) {
      console.error("blob upload error", ctx.uid, err);
      return jsonError(500, "storage");
    }
    const capturedAt = new Date();
    const hash = imageHash(buf);
    let phash: string | undefined;
    try { phash = await perceptualHash(buf); } catch { /* best-effort */ }
    const phashBkt = phash ? phashBucket(phash) : undefined;
    const rawItems = Number.isFinite(det.itemCount) ? Math.floor(det.itemCount) : 1;
    const pointedItems = Math.min(DEFAULT_POINTS_CONFIG.maxItemsPerScan, Math.max(1, rawItems));

    try {
      await recordPreviewScan({
        uid: ctx.uid,
        scanId,
        classKey: prof.classKey ?? "",
        detectedClass: det.class,
        itemCount: det.itemCount,
        confidence: det.confidence,
        clientConf,
        imagePath: imageUrl,
        imageHash: hash,
        phash,
        phashBucket: phashBkt,
        capturedAt,
        localDate,
      });
    } catch (err) {
      console.error("preview scan write failed", ctx.uid, err);
      return jsonError(500, "preview write");
    }

    return jsonOk({
      scanId,
      detectedClass: det.class,
      confidence: det.confidence,
      itemCount: det.itemCount,
      pointedItems,
      basePoints: 0,
      streakBonus: 0,
      totalPoints: 0,
      newTotalPoints: prof.totalPoints ?? 0,
      streakDays: prof.streakDays ?? 0,
      prevRank: prof.rank ?? "ต้นกล้า",
      newRank: prof.rank ?? "ต้นกล้า",
      awarded: false,
      preview: true,
      annotatedImage: det.annotatedImage,
    });
  }
```

The student path (`if (prof.lastScanAt) { ... }` and everything below) remains unchanged.

- [ ] **Step 4: Verify the route compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS — existing tests don't cover this route; the change should not regress unit tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/scan/upload/route.ts
git commit -m "feat(scan): non-student upload takes preview path, no points awarded"
```

---

## Task 5 — Client API wrapper

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add the wrapper near `adminChangeRole`**

Append after the existing `adminChangeRole` function (around line 277):

```ts
export function teacherChangeStudentRole(uid: string, role: 'student' | 'council') {
  return request<{ ok: boolean; roleChangeId?: string; noop?: boolean; warning?: string }>(
    `/teacher/students/${encodeURIComponent(uid)}/role`,
    { method: 'POST', body: JSON.stringify({ role }) },
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(api-client): teacherChangeStudentRole wrapper"
```

---

## Task 6 — Promote panel UI on `/teacher/student`

**Files:**
- Modify: `src/app/teacher/student/page.tsx`

- [ ] **Step 1: Read the page to find a placement spot**

Open `src/app/teacher/student/page.tsx`. Locate `TeacherProfileContent` — the function that renders the student detail. Find where the stats grid + AdjustModal trigger live; the new panel goes between the stat grid and the existing adjust action so it is visible above existing controls.

- [ ] **Step 2: Add the import**

At the top, add:

```ts
import { teacherChangeStudentRole } from '@/lib/api';
```

- [ ] **Step 3: Add the panel component inside `TeacherProfileContent`**

Inside `TeacherProfileContent`, near the other `useState` calls, add:

```tsx
const [roleBusy, setRoleBusy] = useState(false);
const [pendingRole, setPendingRole] = useState<'student' | 'council'>(
  (student.role as 'student' | 'council') ?? 'student',
);
const [confirmRoleOpen, setConfirmRoleOpen] = useState(false);

async function submitRoleChange() {
  setRoleBusy(true);
  try {
    const r = await teacherChangeStudentRole(student.uid, pendingRole);
    if (r.warning) {
      alert(`เปลี่ยนแล้ว แต่ผู้ใช้ต้องล็อกอินใหม่`);
    } else if (r.noop) {
      // no-op, do nothing
    } else {
      alert(`เปลี่ยนเป็น ${pendingRole === 'council' ? 'สภานักเรียน' : 'นักเรียน'} แล้ว`);
    }
    await load();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed';
    alert(`ผิดพลาด: ${msg}`);
  } finally {
    setRoleBusy(false);
    setConfirmRoleOpen(false);
  }
}
```

(If `load()` is not in scope in the existing component, use whatever existing refetch function the page already has — e.g. mutating SWR key, calling `getStudent` again, or `router.refresh()`. The existing `AdjustModal` flow shows the established pattern; match it.)

Then render the panel block. Place it after the stat grid and before the existing adjust controls:

```tsx
{student.role !== 'teacher' && student.role !== 'admin' && (
  <section className="rounded-2xl bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-semibold text-neutral-700">บทบาท</h3>
    <div className="mb-3 text-xs text-neutral-500">
      ปัจจุบัน: <span className="font-medium text-neutral-800">
        {student.role === 'council' ? 'สภานักเรียน' : 'นักเรียน'}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <select
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        value={pendingRole}
        onChange={(e) => setPendingRole(e.target.value as 'student' | 'council')}
        disabled={roleBusy}
      >
        <option value="student">นักเรียน</option>
        <option value="council">สภานักเรียน</option>
      </select>
      <button
        type="button"
        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => setConfirmRoleOpen(true)}
        disabled={roleBusy || pendingRole === student.role}
      >
        เปลี่ยนบทบาท
      </button>
    </div>
  </section>
)}

{confirmRoleOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
      <h4 className="mb-2 text-base font-semibold">ยืนยันการเปลี่ยนบทบาท</h4>
      <p className="mb-4 text-sm text-neutral-600">
        เปลี่ยน {student.fullName} เป็น{' '}
        <span className="font-medium">
          {pendingRole === 'council' ? 'สภานักเรียน' : 'นักเรียน'}
        </span>?
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-sm"
          onClick={() => setConfirmRoleOpen(false)}
          disabled={roleBusy}
        >
          ยกเลิก
        </button>
        <button
          type="button"
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={submitRoleChange}
          disabled={roleBusy}
        >
          {roleBusy ? 'กำลังเปลี่ยน...' : 'ยืนยัน'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Confirm `StudentProfile` exposes `role` field**

In `src/lib/api.ts`, locate the `StudentProfile` interface. If it does not include `role: string`, add `role?: 'student' | 'council' | 'teacher' | 'admin';` so the panel can read it. If the field already exists, no change.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If a missing field error appears, address it as in Step 4.

- [ ] **Step 6: Run dev server and visually verify**

Run: `npm run dev`
- Open `/teacher/student?uid=<a-test-student-uid>` (or whatever the existing query param is — match the page's current navigation pattern).
- Confirm: panel renders for a student, hidden for a teacher.
- Cannot test full flow without real Firebase login here — covered in Task 8.

Stop dev server with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add src/app/teacher/student/page.tsx src/lib/api.ts
git commit -m "feat(teacher/ui): role-change panel on student detail page"
```

---

## Task 7 — Preview banner on `/scan` page

**Files:**
- Modify: `src/app/scan/page.tsx`

- [ ] **Step 1: Locate the result-render block**

Open `src/app/scan/page.tsx`. Find where the scan response (`result`) is rendered after a successful upload — specifically the section showing `basePoints`, `streakBonus`, `totalPoints`, and `pointedItems`.

- [ ] **Step 2: Show preview banner when `result.preview === true`**

Add the banner above the points display:

```tsx
{result?.preview && (
  <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
    โหมดทดสอบ — ไม่ได้รับคะแนน
  </div>
)}
```

Gate the points/streak/rank-up display so they hide when `result.preview === true`. Wrap the existing points block in:

```tsx
{!result?.preview && (
  // existing points / streak / rank UI
)}
```

If the existing `ScanResult` type in `src/lib/api.ts` lacks a `preview?: boolean` field, add it.

- [ ] **Step 3: Update `ScanResult` interface if needed**

In `src/lib/api.ts`, find `interface ScanResult`. If it doesn't include `preview`, add:

```ts
preview?: boolean;
awarded?: boolean;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/scan/page.tsx src/lib/api.ts
git commit -m "feat(scan/ui): preview banner + hide points when preview=true"
```

---

## Task 8 — Manual end-to-end verification

**Pre-reqs:** Dev or staging deploy with real Firebase + Blob credentials, a test teacher account, a test student account, a test council account.

- [ ] **Step 1: Teacher promotes student → council**

1. Log in as teacher.
2. Open `/teacher/student?uid=<student-uid>`.
3. Promote to council. Expect alert "เปลี่ยนเป็น สภานักเรียน แล้ว".
4. Student logs out + back in. Their role custom claim is now `council`.
5. Council user opens `/home` — UI shows council role.

- [ ] **Step 2: Teacher demotes council → student**

Same page, set back to student. Verify alert + re-login flips claim.

- [ ] **Step 3: Self-change rejected**

Teacher attempts to set their own role via the panel (panel should be hidden for teachers, but try direct API: `POST /api/v1/teacher/students/<teacher-self-uid>/role`). Expect 403 (target is teacher, not student/council).

- [ ] **Step 4: Promote a teacher → 403**

`POST /api/v1/teacher/students/<another-teacher-uid>/role { role: "council" }`. Expect 403 `cannot change teacher or admin role`.

- [ ] **Step 5: Promote with invalid role → 400**

`POST .../role { role: "teacher" }` as a teacher. Expect 400 `role must be student or council`.

- [ ] **Step 6: Council scans bottle → no points**

1. Log in as a council user (one promoted in Step 1, or pre-existing).
2. Upload a bottle photo to `/scan`.
3. Expect response: `awarded: false, preview: true, basePoints: 0`.
4. UI shows "โหมดทดสอบ — ไม่ได้รับคะแนน" banner.
5. Profile `totalPoints` unchanged after scan.
6. Leaderboard does not show this user.

- [ ] **Step 7: Student scans bottle → points awarded**

1. Log in as student.
2. Upload bottle photo. Expect normal point award + streak/pending flow (regression check).

- [ ] **Step 8: Existing council with legacy points**

1. Identify a council user whose profile has non-zero `totalPoints` (set manually in Firestore if needed).
2. Confirm: profile screen shows points; leaderboard does NOT list them.

- [ ] **Step 9: Admin role flow regression**

1. Admin promotes a student → teacher via `/admin` panel. Expect success (unchanged path).

- [ ] **Step 10: Close out**

If all pass:

```bash
bd ready
bd close <issue-id-if-tracked> --reason="teacher promote + non-student preview live"
git push
```

---

## Spec Coverage Self-Review

| Spec section | Task |
|---|---|
| §1.1 Teacher endpoint | Task 2 |
| §1.2 Scan branch on role | Task 4 |
| §1.3 Leaderboard (no code change) | Verified: no task needed |
| §1.4 Promote UI | Task 6 |
| §2.1 Files touched | All tasks |
| §2.2 Firestore layout (no new collections) | Tasks 1, 3 |
| §2.3 Promote data flow | Task 2 |
| §2.4 Preview data flow | Tasks 3, 4 |
| §2.5 Backward compat (legacy points preserved) | Task 8 Step 8 |
| §3.1 Error map for teacher endpoint | Task 2 |
| §3.2 Rate limits for non-student | Task 4 (skips cooldown/daily/dup/pending; keeps `ipScanLimiter` already at top of POST) |
| §3.3 Scan UI banner | Task 7 |
| §3.4 Teacher UI panel | Task 6 |
| §4.1 Unit tests | Task 1 |
| §4.2 Manual / integration | Task 8 |
| §7 Acceptance criteria | All tasks + Task 8 |
