import { describe, it, expect, beforeEach, vi } from "vitest";

declare global {
  var __fsMock: ReturnType<typeof makeFsMock> | undefined;
}

type TxOp = { kind: "get" | "set" | "update"; refKey: string; data?: unknown };

vi.mock("@/server/lib/firebase", () => {
  return {
    fbFirestore: () => globalThis.__fsMock,
  };
});

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { increment: (n: number) => ({ __increment: n }) },
}));

function makeFsMock(opts: {
  sessionExists: boolean;
  sessionData?: Record<string, unknown>;
  claimExists: boolean;
}) {
  const ops: TxOp[] = [];
  const refFor = (path: string) => ({ __path: path });
  function docFn(path: string) {
    return {
      ...refFor(path),
      collection: (name: string) => ({
        doc: (id: string) => ({ ...refFor(`${path}/${name}/${id}`) }),
      }),
    };
  }
  const fs = {
    collection: (name: string) => ({
      doc: (id: string) => docFn(`${name}/${id}`),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const tx = {
        get: async (ref: { __path: string }) => {
          ops.push({ kind: "get", refKey: ref.__path });
          if (ref.__path.includes("/claims/")) {
            return { exists: opts.claimExists };
          }
          return {
            exists: opts.sessionExists,
            data: () => opts.sessionData ?? {},
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

async function importRepo() {
  return await import("./repo");
}

describe("claimSlot multi-use (once per code per student)", () => {
  it("rejects with already_claimed_code when the student already claimed this slot", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() + 60_000) },
      claimExists: true,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("already_claimed_code");
    const ops = globalThis.__fsMock!.__ops as TxOp[];
    expect(ops.find((o) => o.kind === "set" && o.refKey.endsWith("/claims/0_student1"))).toBeUndefined();
  });

  it("writes the per-(slot,uid) claim doc and increments awardsCount on success", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() + 60_000) },
      claimExists: false,
    });
    const { claimSlot } = await importRepo();
    const result = await claimSlot("sess1", 0, "student1", "scan1");
    expect(result.staffUid).toBe("staff1");
    const ops = globalThis.__fsMock!.__ops as TxOp[];
    expect(ops.find((o) => o.kind === "set" && o.refKey.endsWith("/claims/0_student1"))).toBeTruthy();
    expect(ops.find((o) => o.kind === "update" && o.refKey === "approverSessions/sess1")).toBeTruthy();
  });

  it("allows a different student to claim the same slot (no slot-level lock)", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() + 60_000) },
      claimExists: false,
    });
    const { claimSlot } = await importRepo();
    const result = await claimSlot("sess1", 0, "student2", "scan2");
    expect(result.staffUid).toBe("staff1");
    const ops = globalThis.__fsMock!.__ops as TxOp[];
    expect(ops.find((o) => o.kind === "set" && o.refKey.endsWith("/claims/0_student2"))).toBeTruthy();
  });

  it("rejects with session_not_found when session missing", async () => {
    globalThis.__fsMock = makeFsMock({ sessionExists: false, claimExists: false });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("session_not_found");
  });

  it("rejects with session_ended when endedAt is set", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
      claimExists: false,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("session_ended");
  });

  it("rejects with session_expired when past expiresAt", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() - 1_000) },
      claimExists: false,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("session_expired");
  });
});
