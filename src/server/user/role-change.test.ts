import { describe, it, expect, vi, beforeEach } from "vitest";

declare global {
  // eslint-disable-next-line no-var
  var __fsMockRoleChange: ReturnType<typeof makeFsMock> | undefined;
}

type TxOp = { kind: "get" | "set" | "update"; refKey: string; data?: unknown };

vi.mock("@/server/lib/firebase", () => ({
  fbFirestore: () => globalThis.__fsMockRoleChange,
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
  globalThis.__fsMockRoleChange = undefined;
});

async function importMod() {
  return await import("./role-change");
}

describe("changeRoleAsTeacher", () => {
  it("rejects self change", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "student" });
    const mod = await importMod();
    await expect(mod.changeRoleAsTeacher("u1", "u1", "council")).rejects.toThrow("self");
  });

  it("rejects newRole = teacher", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "student" });
    const mod = await importMod();
    await expect(
      mod.changeRoleAsTeacher("u1", "u2", "teacher" as never),
    ).rejects.toThrow("invalid");
  });

  it("rejects newRole = admin", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "student" });
    const mod = await importMod();
    await expect(
      mod.changeRoleAsTeacher("u1", "u2", "admin" as never),
    ).rejects.toThrow("invalid");
  });

  it("rejects when target is teacher", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "teacher" });
    const mod = await importMod();
    await expect(
      mod.changeRoleAsTeacher("u1", "u2", "council"),
    ).rejects.toThrow("forbidden_target");
  });

  it("rejects when target is admin", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "admin" });
    const mod = await importMod();
    await expect(
      mod.changeRoleAsTeacher("u1", "u2", "council"),
    ).rejects.toThrow("forbidden_target");
  });

  it("rejects when target not found", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: false });
    const mod = await importMod();
    await expect(
      mod.changeRoleAsTeacher("u1", "u2", "council"),
    ).rejects.toThrow("not_found");
  });

  it("returns noop when target.role === newRole", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "council" });
    const mod = await importMod();
    const r = await mod.changeRoleAsTeacher("u1", "u2", "council");
    expect(r.noop).toBe(true);
    const ops = globalThis.__fsMockRoleChange!.__ops;
    expect(ops.some((o) => o.kind === "update")).toBe(false);
    expect(ops.some((o) => o.kind === "set")).toBe(false);
  });

  it("promotes student -> council, writes update + audit doc", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "student" });
    const mod = await importMod();
    const r = await mod.changeRoleAsTeacher("u1", "u2", "council");
    expect(r.noop).toBeUndefined();
    expect(r.roleChangeId).toBeTruthy();
    const ops = globalThis.__fsMockRoleChange!.__ops;
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
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "council" });
    const mod = await importMod();
    const r = await mod.changeRoleAsTeacher("u1", "u2", "student");
    expect(r.roleChangeId).toBeTruthy();
    const ops = globalThis.__fsMockRoleChange!.__ops;
    const upd = ops.find((o) => o.kind === "update" && o.refKey === "users/u1");
    expect((upd!.data as { role: string }).role).toBe("student");
  });
});
