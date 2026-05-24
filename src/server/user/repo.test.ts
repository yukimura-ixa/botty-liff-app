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
