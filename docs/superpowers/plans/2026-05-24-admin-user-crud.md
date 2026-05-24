# Admin User CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit `fullName`, `classGrade`, `classRoom`, `totalPoints`, and `status` for student/council users from the `/admin` page, with every edit audit-logged to a new `userEdits` Firestore collection, plus add an admin-only `/admin` tile on the `/home` page.

**Architecture:** A new server function `updateUserProfile(targetUid, actorUid, patch)` runs validation-light tx against `users/<uid>`, computes a diff, writes the profile update + an atomic `userEdits` audit doc, and busts caches. A new `PATCH` handler on the existing `/api/v1/admin/users/[uid]` route validates the body and calls into it. The admin page gains an inline expand-row form with confirm modal for destructive changes; the home page gets an admin-gated tile.

**Tech Stack:** Next.js 16 App Router, Firebase Admin (Firestore tx + custom claims), Vitest. Inline `style={{}}` UI matching project convention.

**Spec:** `docs/superpowers/specs/2026-05-24-admin-user-crud-design.md`

---

## File Map

| File | Purpose |
|---|---|
| `src/server/user/repo.ts` | Add `updateUserProfile(targetUid, actorUid, patch)` — pure tx + audit, no validation. |
| `src/server/user/repo.test.ts` (new) | Unit tests for `updateUserProfile`. |
| `src/app/api/v1/admin/users/[uid]/route.ts` | Add `PATCH` handler alongside existing dynamic route (currently only has nested `/role`). |
| `src/lib/api.ts` | Add `adminUpdateUser(uid, patch)` client wrapper + `UserPatch` type. |
| `src/app/admin/page.tsx` | Add inline expand-row edit form on users tab + confirm modal for destructive ops + inactive badge. |
| `src/app/home/page.tsx` | Add admin-gated `/admin` tile in action grid. |

---

## Task 1 — `updateUserProfile` server function (TDD)

**Files:**
- Modify: `src/server/user/repo.ts`
- Create: `src/server/user/repo.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/server/user/repo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

declare global {
  // eslint-disable-next-line no-var
  var __fsMockRepo: ReturnType<typeof makeFsMock> | undefined;
}

type TxOp = { kind: "get" | "set" | "update"; refKey: string; data?: unknown };

vi.mock("@/server/lib/firebase", () => ({
  fbFirestore: () => globalThis.__fsMockRepo,
  fbAuth: () => ({ setCustomUserClaims: async () => undefined }),
}));

vi.mock("@/server/lib/cache-bus", () => ({
  bust: () => undefined,
  registerBuster: () => undefined,
}));

function makeFsMock(opts: { targetExists: boolean; targetData?: Record<string, unknown> }) {
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
            data: () => opts.targetData ?? {},
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
  globalThis.__fsMockRepo = undefined;
});

async function importMod() {
  return await import("./repo");
}

describe("updateUserProfile", () => {
  it("rejects self edit", async () => {
    globalThis.__fsMockRepo = makeFsMock({
      targetExists: true,
      targetData: { role: "student", fullName: "A" },
    });
    const mod = await importMod();
    await expect(
      mod.updateUserProfile("u1", "u1", { fullName: "B" }),
    ).rejects.toThrow("self");
  });

  it("rejects when target is teacher", async () => {
    globalThis.__fsMockRepo = makeFsMock({
      targetExists: true,
      targetData: { role: "teacher", fullName: "T" },
    });
    const mod = await importMod();
    await expect(
      mod.updateUserProfile("u1", "u2", { fullName: "B" }),
    ).rejects.toThrow("forbidden_target");
  });

  it("rejects when target is admin", async () => {
    globalThis.__fsMockRepo = makeFsMock({
      targetExists: true,
      targetData: { role: "admin", fullName: "A" },
    });
    const mod = await importMod();
    await expect(
      mod.updateUserProfile("u1", "u2", { fullName: "B" }),
    ).rejects.toThrow("forbidden_target");
  });

  it("rejects when target not found", async () => {
    globalThis.__fsMockRepo = makeFsMock({ targetExists: false });
    const mod = await importMod();
    await expect(
      mod.updateUserProfile("u1", "u2", { fullName: "B" }),
    ).rejects.toThrow("not_found");
  });

  it("returns noop when patch matches existing values", async () => {
    globalThis.__fsMockRepo = makeFsMock({
      targetExists: true,
      targetData: { role: "student", fullName: "A", classGrade: 5, classRoom: 1, totalPoints: 10, status: "active", classKey: "5-1" },
    });
    const mod = await importMod();
    const r = await mod.updateUserProfile("u1", "u2", { fullName: "A", classGrade: 5, classRoom: 1, totalPoints: 10, status: "active" });
    expect(r.noop).toBe(true);
    const ops = globalThis.__fsMockRepo!.__ops;
    expect(ops.some((o) => o.kind === "update")).toBe(false);
    expect(ops.some((o) => o.kind === "set")).toBe(false);
  });

  it("updates fullName only, writes one-diff audit doc", async () => {
    globalThis.__fsMockRepo = makeFsMock({
      targetExists: true,
      targetData: { role: "student", fullName: "Old", classGrade: 5, classRoom: 1, totalPoints: 10, status: "active", classKey: "5-1" },
    });
    const mod = await importMod();
    const r = await mod.updateUserProfile("u1", "u2", { fullName: "New" });
    expect(r.noop).toBeUndefined();
    expect(r.editId).toBeTruthy();
    const ops = globalThis.__fsMockRepo!.__ops;
    const upd = ops.find((o) => o.kind === "update" && o.refKey === "users/u1");
    expect((upd!.data as { fullName: string }).fullName).toBe("New");
    const set = ops.find((o) => o.kind === "set" && o.refKey.startsWith("userEdits/"));
    expect(set).toBeTruthy();
    const setData = set!.data as { changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>; targetUid: string; byUid: string };
    expect(setData.changes).toHaveLength(1);
    expect(setData.changes[0]).toEqual({ field: "fullName", oldValue: "Old", newValue: "New" });
    expect(setData.targetUid).toBe("u1");
    expect(setData.byUid).toBe("u2");
  });

  it("updates classGrade + classRoom, recomputes classKey, logs both diffs", async () => {
    globalThis.__fsMockRepo = makeFsMock({
      targetExists: true,
      targetData: { role: "student", fullName: "A", classGrade: 5, classRoom: 1, totalPoints: 10, status: "active", classKey: "5-1" },
    });
    const mod = await importMod();
    await mod.updateUserProfile("u1", "u2", { classGrade: 6, classRoom: 2 });
    const ops = globalThis.__fsMockRepo!.__ops;
    const upd = ops.find((o) => o.kind === "update" && o.refKey === "users/u1");
    const updData = upd!.data as { classGrade: number; classRoom: number; classKey: string };
    expect(updData.classGrade).toBe(6);
    expect(updData.classRoom).toBe(2);
    expect(updData.classKey).toBe("6-2");
    const set = ops.find((o) => o.kind === "set" && o.refKey.startsWith("userEdits/"));
    const changes = (set!.data as { changes: Array<{ field: string }> }).changes;
    const fields = changes.map((c) => c.field).sort();
    expect(fields).toEqual(["classGrade", "classKey", "classRoom"]);
  });

  it("updates totalPoints, audit captures old + new", async () => {
    globalThis.__fsMockRepo = makeFsMock({
      targetExists: true,
      targetData: { role: "student", fullName: "A", classGrade: 5, classRoom: 1, totalPoints: 10, status: "active", classKey: "5-1" },
    });
    const mod = await importMod();
    await mod.updateUserProfile("u1", "u2", { totalPoints: 0 });
    const ops = globalThis.__fsMockRepo!.__ops;
    const set = ops.find((o) => o.kind === "set" && o.refKey.startsWith("userEdits/"));
    const changes = (set!.data as { changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> }).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ field: "totalPoints", oldValue: 10, newValue: 0 });
  });

  it("updates status flip, audit captures old + new", async () => {
    globalThis.__fsMockRepo = makeFsMock({
      targetExists: true,
      targetData: { role: "student", fullName: "A", classGrade: 5, classRoom: 1, totalPoints: 10, status: "active", classKey: "5-1" },
    });
    const mod = await importMod();
    await mod.updateUserProfile("u1", "u2", { status: "inactive" });
    const ops = globalThis.__fsMockRepo!.__ops;
    const set = ops.find((o) => o.kind === "set" && o.refKey.startsWith("userEdits/"));
    const changes = (set!.data as { changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> }).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ field: "status", oldValue: "active", newValue: "inactive" });
  });

  it("multi-field patch produces one audit doc with all diffs", async () => {
    globalThis.__fsMockRepo = makeFsMock({
      targetExists: true,
      targetData: { role: "student", fullName: "Old", classGrade: 5, classRoom: 1, totalPoints: 10, status: "active", classKey: "5-1" },
    });
    const mod = await importMod();
    await mod.updateUserProfile("u1", "u2", { fullName: "New", totalPoints: 20, status: "inactive" });
    const ops = globalThis.__fsMockRepo!.__ops;
    const setDocs = ops.filter((o) => o.kind === "set" && o.refKey.startsWith("userEdits/"));
    expect(setDocs).toHaveLength(1);
    const changes = (setDocs[0].data as { changes: Array<{ field: string }> }).changes;
    const fields = changes.map((c) => c.field).sort();
    expect(fields).toEqual(["fullName", "status", "totalPoints"]);
  });
});
```

- [ ] **Step 2: Run test to confirm failures**

Run: `npm test -- src/server/user/repo.test.ts`
Expected: FAIL — `updateUserProfile` not exported.

- [ ] **Step 3: Implement `updateUserProfile` in `src/server/user/repo.ts`**

Use Serena `insert_after_symbol` on the last top-level symbol in `src/server/user/repo.ts` (likely `getUser`). Insert this function:

```ts
export type UserPatch = {
  fullName?: string;
  classGrade?: number;
  classRoom?: number;
  totalPoints?: number;
  status?: "active" | "inactive";
};

export type UserEditChange = { field: string; oldValue: unknown; newValue: unknown };

export async function updateUserProfile(
  targetUid: string,
  actorUid: string,
  patch: UserPatch,
): Promise<{ editId?: string; changes?: UserEditChange[]; noop?: true }> {
  if (targetUid === actorUid) throw new Error("self");

  const fs = fbFirestore();
  const userRef = fs.collection("users").doc(targetUid);
  const editId = crypto.randomUUID();
  const editRef = fs.collection("userEdits").doc(editId);

  let noop = false;
  let computedChanges: UserEditChange[] = [];

  await fs.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error("not_found");
    const prof = snap.data() ?? {};
    const role = typeof prof.role === "string" ? prof.role : "student";
    if (role === "teacher" || role === "admin") throw new Error("forbidden_target");

    const updates: Record<string, unknown> = {};
    const diffs: UserEditChange[] = [];

    if (patch.fullName !== undefined && patch.fullName !== prof.fullName) {
      updates.fullName = patch.fullName;
      diffs.push({ field: "fullName", oldValue: prof.fullName, newValue: patch.fullName });
    }
    if (patch.classGrade !== undefined && patch.classGrade !== prof.classGrade) {
      updates.classGrade = patch.classGrade;
      diffs.push({ field: "classGrade", oldValue: prof.classGrade, newValue: patch.classGrade });
    }
    if (patch.classRoom !== undefined && patch.classRoom !== prof.classRoom) {
      updates.classRoom = patch.classRoom;
      diffs.push({ field: "classRoom", oldValue: prof.classRoom, newValue: patch.classRoom });
    }
    if ("classGrade" in updates || "classRoom" in updates) {
      const newGrade = (updates.classGrade as number | undefined) ?? (prof.classGrade as number | undefined) ?? 0;
      const newRoom = (updates.classRoom as number | undefined) ?? (prof.classRoom as number | undefined) ?? 0;
      const newKey = `${newGrade}-${newRoom}`;
      if (newKey !== prof.classKey) {
        updates.classKey = newKey;
        diffs.push({ field: "classKey", oldValue: prof.classKey, newValue: newKey });
      }
    }
    if (patch.totalPoints !== undefined && patch.totalPoints !== prof.totalPoints) {
      updates.totalPoints = patch.totalPoints;
      diffs.push({ field: "totalPoints", oldValue: prof.totalPoints, newValue: patch.totalPoints });
    }
    if (patch.status !== undefined && patch.status !== prof.status) {
      updates.status = patch.status;
      diffs.push({ field: "status", oldValue: prof.status, newValue: patch.status });
    }

    if (diffs.length === 0) {
      noop = true;
      return;
    }

    updates.updatedAt = new Date();
    tx.update(userRef, updates);
    tx.set(editRef, {
      targetUid,
      byUid: actorUid,
      changes: diffs,
      createdAt: new Date(),
    });
    computedChanges = diffs;
  });

  if (noop) return { noop: true };

  bust(`user:${targetUid}`);
  if (computedChanges.some((c) => c.field === "classGrade" || c.field === "classRoom" || c.field === "classKey")) {
    bust("classes");
  }
  if (computedChanges.some((c) => c.field === "totalPoints" || c.field === "status")) {
    bust("leaderboard");
  }
  return { editId, changes: computedChanges };
}
```

Confirm `bust` and `fbFirestore` are already imported at the top of `src/server/user/repo.ts`. If not, add the imports.

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- src/server/user/repo.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/user/repo.ts src/server/user/repo.test.ts
git commit -m "feat(user): add updateUserProfile with diff-based audit"
```

---

## Task 2 — Admin PATCH endpoint

**Files:**
- Modify: `src/app/api/v1/admin/users/[uid]/route.ts`

- [ ] **Step 1: Inspect current state**

The file at `src/app/api/v1/admin/users/[uid]/route.ts` currently only re-exports nothing of its own (the `/role` sub-route is in `src/app/api/v1/admin/users/[uid]/role/route.ts`). The dynamic route at this exact path may not have a `route.ts` yet — verify with `ls "src/app/api/v1/admin/users/[uid]/"`. If the file does not exist, create it. If it exists (e.g. as a `GET` handler), add the `PATCH` alongside.

- [ ] **Step 2: Write the route**

Write `src/app/api/v1/admin/users/[uid]/route.ts`:

```ts
import { NextRequest } from "next/server";
import { verifyBearerTokenWithFreshRole, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonNoStore } from "@/server/lib/http";
import { updateUserProfile, type UserPatch } from "@/server/user/repo";

export const runtime = "nodejs";
export const maxDuration = 30;

const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function validatePatch(body: Record<string, unknown>): { patch?: UserPatch; error?: string } {
  const patch: UserPatch = {};
  if (body.fullName !== undefined) {
    if (typeof body.fullName !== "string") return { error: "invalid fullName" };
    const trimmed = body.fullName.trim();
    if (trimmed.length < 1 || trimmed.length > 80) return { error: "invalid fullName" };
    patch.fullName = trimmed;
  }
  if (body.classGrade !== undefined) {
    const n = Number(body.classGrade);
    if (!Number.isInteger(n) || n < 0 || n > 13) return { error: "invalid classGrade" };
    patch.classGrade = n;
  }
  if (body.classRoom !== undefined) {
    const n = Number(body.classRoom);
    if (!Number.isInteger(n) || n < 0 || n > 99) return { error: "invalid classRoom" };
    patch.classRoom = n;
  }
  if (body.totalPoints !== undefined) {
    const n = Number(body.totalPoints);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return { error: "invalid totalPoints" };
    patch.totalPoints = n;
  }
  if (body.status !== undefined) {
    if (typeof body.status !== "string") return { error: "invalid status" };
    const s = body.status.trim().toLowerCase();
    if (s !== "active" && s !== "inactive") return { error: "invalid status" };
    patch.status = s;
  }
  if (Object.keys(patch).length === 0) return { error: "no fields" };
  return { patch };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  let ctx;
  try { ctx = await verifyBearerTokenWithFreshRole(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");

  const { uid } = await params;
  if (!uid || !UID_RE.test(uid)) return jsonError(400, "invalid uid");

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return jsonError(400, "invalid json"); }

  const v = validatePatch(body);
  if (!v.patch) return jsonError(400, v.error ?? "invalid");

  try {
    const r = await updateUserProfile(uid, ctx.uid, v.patch);
    if (r.noop) return jsonNoStore({ ok: true, noop: true });
    return jsonNoStore({ ok: true, editId: r.editId, changes: r.changes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    if (msg === "self") return jsonError(400, "cannot edit own profile");
    if (msg === "not_found") return jsonError(404, "user not found");
    if (msg === "forbidden_target") return jsonError(403, "cannot edit teacher or admin profile");
    console.error("admin update user failed", err);
    return jsonError(500, "internal");
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If any import path is wrong, mirror the one used by `src/app/api/v1/teacher/students/[uid]/role/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/v1/admin/users/[uid]/route.ts"
git commit -m "feat(api): admin PATCH endpoint to edit user profile"
```

---

## Task 3 — Client wrapper

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add the type + wrapper**

After the existing `adminChangeRole` function in `src/lib/api.ts`, append:

```ts
export type UserPatch = {
  fullName?: string;
  classGrade?: number;
  classRoom?: number;
  totalPoints?: number;
  status?: 'active' | 'inactive';
};

export type UserEditChange = { field: string; oldValue: unknown; newValue: unknown };

export function adminUpdateUser(uid: string, patch: UserPatch) {
  return request<{ ok: boolean; noop?: boolean; editId?: string; changes?: UserEditChange[] }>(
    `/admin/users/${encodeURIComponent(uid)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(api-client): adminUpdateUser wrapper + UserPatch type"
```

---

## Task 4 — Admin tile on `/home`

**Files:**
- Modify: `src/app/home/page.tsx`

- [ ] **Step 1: Locate the action-grid tiles**

In `src/app/home/page.tsx` around line 380, the tiles are spread into an array with conditional spreads for `isStaff` and `isTeacherOrAdmin`. Find this block:

```tsx
            ...(isTeacherOrAdmin
              ? [{ href: "/teacher", emoji: "📊", label: "แดชบอร์ดครู", bg: t.ink }]
              : []),
```

- [ ] **Step 2: Insert the admin tile**

Add a new conditional spread immediately after the `isTeacherOrAdmin` spread. The block becomes:

```tsx
            ...(isTeacherOrAdmin
              ? [{ href: "/teacher", emoji: "📊", label: "แดชบอร์ดครู", bg: t.ink }]
              : []),
            ...(role === "admin"
              ? [{ href: "/admin", emoji: "⚙️", label: "จัดการระบบ", bg: t.ink }]
              : []),
```

If `t.ink` is unavailable or conflicts, use a different theme token already imported in this file (check the file's existing tile colors).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Visual check**

Run `npm run dev`, log in as an admin account, confirm the tile appears. Log in as a non-admin, confirm it does not. Stop the dev server.

This step requires a real Firebase auth + LINE LIFF context. If the implementer cannot satisfy that locally, defer the visual check to Task 8 manual e2e.

- [ ] **Step 5: Commit**

```bash
git add src/app/home/page.tsx
git commit -m "feat(home): admin-only tile linking to /admin"
```

---

## Task 5 — Inline edit form on `/admin` users tab

**Files:**
- Modify: `src/app/admin/page.tsx`

This is the largest UI task. The admin page is a large file; touch only what is necessary.

- [ ] **Step 1: Read the users-tab render section**

Open `src/app/admin/page.tsx`. Use Serena `find_symbol` for `AdminPage`. Identify:
- The users list rendering loop (a `.map()` over `users`).
- The existing `roleChip` helper.
- The state hooks at the top of `AdminPage` (look for `useState` calls).

Note these existing state names so we don't collide.

- [ ] **Step 2: Add the import**

At the top, ensure `adminUpdateUser` and `UserPatch` are imported from `@/lib/api` (alongside `adminChangeRole`, `adminListUsers`, etc.):

```ts
import {
  adminChangeRole,
  adminListUsers,
  adminUpdateUser,
  // ... existing imports
  type UserPatch,
  type UserRow,
  // ... rest
} from '@/lib/api';
```

- [ ] **Step 3: Add state inside `AdminPage`**

Find the existing `useState` calls in `AdminPage` (e.g. `setTab`, `users`, `setUsers`, etc.). Add:

```ts
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    fullName: string;
    classGrade: string;
    classRoom: string;
    totalPoints: string;
    status: 'active' | 'inactive';
  }>({ fullName: '', classGrade: '0', classRoom: '0', totalPoints: '0', status: 'active' });
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');
  const [editToast, setEditToast] = useState('');
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
```

- [ ] **Step 4: Add a helper to open the row**

Right after the state declarations, add:

```ts
  function openEdit(u: UserRow) {
    setExpandedUid(u.uid);
    setEditErr('');
    setEditToast('');
    setEditForm({
      fullName: u.fullName ?? '',
      classGrade: String((u as unknown as { classGrade?: number }).classGrade ?? 0),
      classRoom: String((u as unknown as { classRoom?: number }).classRoom ?? 0),
      totalPoints: String(u.totalPoints ?? 0),
      status: ((u as unknown as { status?: string }).status === 'inactive' ? 'inactive' : 'active'),
    });
  }
  function closeEdit() {
    setExpandedUid(null);
    setEditErr('');
    setConfirmEditOpen(false);
  }
```

(`classGrade`, `classRoom`, `status` may not be on `UserRow` today — extend `UserRow` in `src/lib/api.ts` to include them in Task 7. The cast above keeps Task 5 unblocked.)

- [ ] **Step 5: Add the submit handler**

After `closeEdit`, add:

```ts
  function isDestructive(originalPoints: number, originalStatus: string): boolean {
    const newPoints = Number(editForm.totalPoints);
    const statusDestructive = originalStatus === 'active' && editForm.status === 'inactive';
    const pointsZero = newPoints === 0 && originalPoints > 0;
    const pointsBigDrop = originalPoints > 0 && newPoints < originalPoints * 0.5;
    return statusDestructive || pointsZero || pointsBigDrop;
  }

  async function submitEdit(u: UserRow) {
    setEditBusy(true);
    setEditErr('');
    try {
      const patch: UserPatch = {};
      const newFullName = editForm.fullName.trim();
      if (newFullName !== (u.fullName ?? '')) patch.fullName = newFullName;
      const newGrade = Number(editForm.classGrade);
      if (newGrade !== (u as unknown as { classGrade?: number }).classGrade) patch.classGrade = newGrade;
      const newRoom = Number(editForm.classRoom);
      if (newRoom !== (u as unknown as { classRoom?: number }).classRoom) patch.classRoom = newRoom;
      const newPoints = Number(editForm.totalPoints);
      if (newPoints !== u.totalPoints) patch.totalPoints = newPoints;
      const origStatus = ((u as unknown as { status?: string }).status === 'inactive' ? 'inactive' : 'active');
      if (editForm.status !== origStatus) patch.status = editForm.status;

      if (Object.keys(patch).length === 0) {
        setEditToast('ไม่มีการเปลี่ยนแปลง');
        closeEdit();
        return;
      }

      const r = await adminUpdateUser(u.uid, patch);
      if (r.noop) {
        setEditToast('ไม่มีการเปลี่ยนแปลง');
      } else {
        setEditToast('บันทึกแล้ว');
      }
      closeEdit();
      // refetch users
      const list = await adminListUsers({ role: roleFilter, q: '', limit: 50 });
      setUsers(list.users);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed';
      setEditErr(msg);
    } finally {
      setEditBusy(false);
      setConfirmEditOpen(false);
    }
  }
```

(If `roleFilter` or `setUsers` names differ in the actual file, adjust to match — read the file first.)

- [ ] **Step 6: Render the expand toggle + form in the users `.map()` loop**

Find the users list render. Each user row currently renders something like:

```tsx
users.map((u) => ( <div key={u.uid}> ... </div> ))
```

Inside each row, add a toggle button (next to the existing role-change action) and conditionally render the form when `expandedUid === u.uid`:

```tsx
      {tab === 'users' && users.map((u) => {
        const isInactive = (u as unknown as { status?: string }).status === 'inactive';
        return (
          <div key={u.uid} style={{
            background: surfaceDark,
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            marginBottom: 8,
            opacity: isInactive ? 0.55 : 1,
          }}>
            {/* existing row content, e.g. name, roleChip, role-change buttons */}
            {/* ... */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px 10px' }}>
              {isInactive && (
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)',
                }}>
                  (ไม่ใช้งาน)
                </span>
              )}
              <button
                type="button"
                onClick={() => expandedUid === u.uid ? closeEdit() : openEdit(u)}
                style={{
                  marginLeft: 'auto',
                  fontSize: 11, padding: '6px 10px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'white', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {expandedUid === u.uid ? '▴ ปิด' : '▾ แก้ไข'}
              </button>
            </div>
            {expandedUid === u.uid && (
              <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                    ชื่อ-สกุล
                    <input
                      value={editForm.fullName}
                      onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                      disabled={editBusy}
                      maxLength={80}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '6px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12 }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                    สถานะ
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'active' | 'inactive' })}
                      disabled={editBusy}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '6px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12 }}
                    >
                      <option value="active">ใช้งาน</option>
                      <option value="inactive">ไม่ใช้งาน</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                    ชั้น
                    <input
                      type="number"
                      min={0} max={13}
                      value={editForm.classGrade}
                      onChange={(e) => setEditForm({ ...editForm, classGrade: e.target.value })}
                      disabled={editBusy}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '6px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12 }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                    ห้อง
                    <input
                      type="number"
                      min={0} max={99}
                      value={editForm.classRoom}
                      onChange={(e) => setEditForm({ ...editForm, classRoom: e.target.value })}
                      disabled={editBusy}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '6px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12 }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.7)', gridColumn: '1 / 3' }}>
                    คะแนนรวม
                    <input
                      type="number"
                      min={0} max={1000000}
                      value={editForm.totalPoints}
                      onChange={(e) => setEditForm({ ...editForm, totalPoints: e.target.value })}
                      disabled={editBusy}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '6px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12 }}
                    />
                  </label>
                </div>
                {editErr && (
                  <div style={{ color: '#ff7676', fontSize: 11, marginTop: 8 }}>{editErr}</div>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={closeEdit}
                    disabled={editBusy}
                    style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const origPoints = u.totalPoints ?? 0;
                      const origStatus = (u as unknown as { status?: string }).status === 'inactive' ? 'inactive' : 'active';
                      if (isDestructive(origPoints, origStatus)) {
                        setConfirmEditOpen(true);
                      } else {
                        submitEdit(u);
                      }
                    }}
                    disabled={editBusy}
                    style={{ fontSize: 11, padding: '6px 14px', borderRadius: 8, background: '#3a7755', border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'inherit', opacity: editBusy ? 0.7 : 1 }}
                  >
                    {editBusy ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                </div>
              </div>
            )}
            {expandedUid === u.uid && confirmEditOpen && (
              <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50,
              }}>
                <div style={{ background: '#1a1f2e', borderRadius: 14, padding: 20, maxWidth: 360, width: '100%' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'white' }}>
                    ยืนยันการเปลี่ยนแปลง
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 14 }}>
                    การเปลี่ยนแปลงนี้อาจส่งผลกระทบ (ลบสถานะใช้งาน หรือ ลดคะแนนเป็น 0 / มากกว่าครึ่ง). ดำเนินการต่อ?
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setConfirmEditOpen(false)}
                      disabled={editBusy}
                      style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={() => submitEdit(u)}
                      disabled={editBusy}
                      style={{ fontSize: 11, padding: '6px 14px', borderRadius: 8, background: '#b04040', border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'inherit', opacity: editBusy ? 0.7 : 1 }}
                    >
                      {editBusy ? '...' : 'ยืนยัน'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
```

This is illustrative — adapt to the file's current rendering structure. Preserve existing role-chip + role-change buttons. Add the toggle button + form panel.

- [ ] **Step 7: Add a top-of-page toast for `editToast`**

Below the existing tab nav (or wherever toasts already live), add:

```tsx
{editToast && (
  <div style={{
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: '#3a7755', color: 'white', padding: '8px 16px',
    borderRadius: 999, fontSize: 12, fontWeight: 600,
    zIndex: 100,
  }}>
    {editToast}
  </div>
)}
```

Auto-clear it after 2 seconds with a small `useEffect`:

```ts
  useEffect(() => {
    if (!editToast) return;
    const t = setTimeout(() => setEditToast(''), 2000);
    return () => clearTimeout(t);
  }, [editToast]);
```

- [ ] **Step 8: Typecheck + test**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: PASS (139 + 10 new from Task 1 = 149 tests, no regressions).

- [ ] **Step 9: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin/ui): inline edit form + destructive confirm + inactive badge"
```

---

## Task 6 — Extend `UserRow` with new fields

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/server/user/admin-list.ts` (if it returns a typed shape, ensure new fields are included).

- [ ] **Step 1: Update the type**

In `src/lib/api.ts`, change the `UserRow` type to include the fields the edit form needs:

```ts
export type UserRow = {
  uid: string;
  fullName: string;
  classKey: string;
  classGrade: number;
  classRoom: number;
  role: UserRole;
  totalPoints: number;
  status: string;
};
```

- [ ] **Step 2: Update the admin list query to return the new fields**

Open `src/server/user/admin-list.ts`. Find where the user row is built (around line 21). Ensure `classGrade`, `classRoom`, and `status` are included in the mapped output. Example shape:

```ts
return snap.docs.map((d) => {
  const data = d.data();
  return {
    uid: d.id,
    fullName: typeof data.fullName === "string" ? data.fullName : "",
    classKey: typeof data.classKey === "string" ? data.classKey : "",
    classGrade: typeof data.classGrade === "number" ? data.classGrade : 0,
    classRoom: typeof data.classRoom === "number" ? data.classRoom : 0,
    role: typeof data.role === "string" ? data.role : "student",
    totalPoints: typeof data.totalPoints === "number" ? data.totalPoints : 0,
    status: typeof data.status === "string" ? data.status : "active",
  };
});
```

Adjust to match the file's actual shape (some fields may already be present).

- [ ] **Step 3: Remove the casts in `src/app/admin/page.tsx`**

The casts added in Task 5 (e.g. `(u as unknown as { classGrade?: number }).classGrade`) can now be replaced with direct property access (`u.classGrade`). Do a find-and-replace.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/server/user/admin-list.ts src/app/admin/page.tsx
git commit -m "feat(admin/types): extend UserRow with classGrade, classRoom, status"
```

---

## Task 7 — Final integration verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — 149 tests (139 existing + 10 new).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors beyond pre-existing 12.

- [ ] **Step 4: Confirm clean working tree**

Run: `git status`
Expected: clean.

---

## Task 8 — Manual end-to-end verification

Run against `npm run dev` with real Firebase auth + LINE LIFF, or against a preview deploy.

- [ ] **Step 1: Admin tile on `/home`**

Log in as admin. Open `/home`. Confirm the `จัดการระบบ` tile appears and links to `/admin`. Log in as a non-admin. Confirm the tile is absent.

- [ ] **Step 2: Edit fullName**

On `/admin`, click "▾ แก้ไข" on a student. Change fullName. Save. Confirm: row updates, toast `บันทึกแล้ว` appears, no confirm modal (non-destructive).

- [ ] **Step 3: Edit class**

Change classGrade and classRoom. Save. Confirm: row reflects new classKey, audit tab shows entry with three diffs (classGrade, classRoom, classKey).

- [ ] **Step 4: Edit totalPoints upward**

Increase totalPoints. Save. Confirm: leaderboard reflects new value.

- [ ] **Step 5: Decrease totalPoints to 0 (destructive)**

Set totalPoints to 0 on a student with non-zero points. Save. Confirm: confirm modal appears. Cancel → form stays open. Save → confirm again → confirm. Confirm: leaderboard re-orders.

- [ ] **Step 6: Decrease totalPoints by >50% (destructive)**

Set totalPoints to less than half of current. Save. Confirm modal appears.

- [ ] **Step 7: Flip status active → inactive (destructive)**

Change status to inactive. Save. Confirm modal appears. Confirm. Confirm: user row renders muted with `(ไม่ใช้งาน)` badge. The user's next login attempt is blocked (verify the existing auth path checks status; if not, file a follow-up).

- [ ] **Step 8: Flip status inactive → active**

Re-edit. Set status to active. Save. Confirm: badge removed, login works again.

- [ ] **Step 9: Edit teacher (should be blocked)**

Open "▾ แก้ไข" on a teacher row (if any). Save any change. Confirm: inline error `cannot edit teacher or admin profile`.

- [ ] **Step 10: Edit own profile (should be blocked)**

Open "▾ แก้ไข" on the current admin's own row. Save. Confirm: inline error `cannot edit own profile`.

- [ ] **Step 11: Concurrent edits**

Two admin browser tabs. Both open edit on same student. Both change fullName, both Save. Confirm: both succeed, latest write wins, `userEdits` has two records, audit tab shows both.

- [ ] **Step 12: Close out**

```bash
git push
# create or close any bd issues
```

---

## Spec Coverage Self-Review

| Spec section | Task |
|---|---|
| §1.1 PATCH endpoint | Task 2 |
| §1.2 userEdits collection | Task 1 (writes), Task 5 (rendered later in audit tab — out of scope for this plan unless audit tab already reads from generic collection list) |
| §1.3 Inline expand-row UI | Task 5 |
| §1.4 Admin tile on /home | Task 4 |
| §2.1 Files touched | All tasks |
| §2.2 Firestore layout | Task 1 |
| §2.3 Validation rules | Task 2 |
| §2.4 PATCH data flow | Tasks 1 + 2 |
| §2.5 UI data flow | Task 5 |
| §2.6 Backward compat | Tasks 1 + 6 (no migration; lazy collection) |
| §3.1 Error map | Task 2 |
| §3.2 Rate limits | Task 2 (none added; relies on existing) |
| §3.3 UI behavior | Tasks 5 + 6 |
| §4.1 Unit tests | Task 1 |
| §4.2 Manual / integration | Task 8 |
| §5 Threat model | Implicit across Tasks 1, 2; concurrency notes in Task 8 Step 11 |
| §7 Acceptance criteria | All tasks + Task 7 + Task 8 |

### Notes on spec coverage gaps

- Spec §1.2 mentions `userEdits` visible on the existing audit tab. This plan writes the docs but does not modify the audit tab reader. If the existing `/admin` audit tab already reads `roleChanges` and `adjustments` only, surfacing `userEdits` is a follow-up — flag during code review. Filing a bd issue is appropriate if the audit reader needs an update.
