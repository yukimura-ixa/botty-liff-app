import { describe, it, expect, vi, beforeEach } from "vitest";

declare global {
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

describe("changeRole", () => {
  it("rejects self change", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "student" });
    const mod = await importMod();
    await expect(mod.changeRole("u1", "u1", "student", "r")).rejects.toThrow("self");
  });

  it("rejects newRole !== student", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "student" });
    const mod = await importMod();
    await expect(
      mod.changeRole("u1", "u2", "admin" as never, "r"),
    ).rejects.toThrow("invalid");
  });

  it("rejects demoting an admin", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "admin" });
    const mod = await importMod();
    await expect(
      mod.changeRole("u1", "u2", "student", "r"),
    ).rejects.toThrow("demote_admin");
  });

  it("rejects when target not found", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: false });
    const mod = await importMod();
    await expect(
      mod.changeRole("u1", "u2", "student", "r"),
    ).rejects.toThrow("not_found");
  });

  it("demotes to student, writes update + audit doc", async () => {
    globalThis.__fsMockRoleChange = makeFsMock({ targetExists: true, targetRole: "council" });
    const mod = await importMod();
    await mod.changeRole("u1", "u2", "student", "cleanup");
    const ops = globalThis.__fsMockRoleChange!.__ops;
    const upd = ops.find((o) => o.kind === "update" && o.refKey === "users/u1");
    expect(upd).toBeTruthy();
    expect((upd!.data as { role: string }).role).toBe("student");
    const set = ops.find((o) => o.kind === "set" && o.refKey.startsWith("roleChanges/"));
    expect(set).toBeTruthy();
    expect((set!.data as { fromRole: string; toRole: string; reason: string }).fromRole).toBe("council");
    expect((set!.data as { fromRole: string; toRole: string; reason: string }).toRole).toBe("student");
    expect((set!.data as { reason: string }).reason).toBe("cleanup");
  });
});
