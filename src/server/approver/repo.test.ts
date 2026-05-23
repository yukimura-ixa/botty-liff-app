import { describe, it, expect, vi, beforeEach } from "vitest";

declare global {
  // eslint-disable-next-line no-var
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
  slotExists: boolean;
  studentExists: boolean;
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
          if (ref.__path.endsWith("/slots/0")) {
            return { exists: opts.slotExists };
          }
          if (ref.__path.includes("/students/")) {
            return { exists: opts.studentExists };
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

describe("claimSlot per-(student, session) cap", () => {
  it("rejects with student_already_awarded when student doc exists", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() + 60_000) },
      slotExists: false,
      studentExists: true,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("student_already_awarded");
    const ops = globalThis.__fsMock!.__ops as TxOp[];
    expect(ops.find((o) => o.kind === "set" && o.refKey.endsWith("/slots/0"))).toBeUndefined();
    expect(ops.find((o) => o.kind === "set" && o.refKey.endsWith("/students/student1"))).toBeUndefined();
  });

  it("rejects with slot_used when slot doc exists", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() + 60_000) },
      slotExists: true,
      studentExists: false,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("slot_used");
  });

  it("writes both slot and student docs on success", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() + 60_000) },
      slotExists: false,
      studentExists: false,
    });
    const { claimSlot } = await importRepo();
    const result = await claimSlot("sess1", 0, "student1", "scan1");
    expect(result.staffUid).toBe("staff1");
    const ops = globalThis.__fsMock!.__ops as TxOp[];
    expect(ops.find((o) => o.kind === "set" && o.refKey.endsWith("/slots/0"))).toBeTruthy();
    expect(ops.find((o) => o.kind === "set" && o.refKey.endsWith("/students/student1"))).toBeTruthy();
    expect(ops.find((o) => o.kind === "update" && o.refKey === "approverSessions/sess1")).toBeTruthy();
  });

  it("rejects with session_not_found when session missing", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: false,
      slotExists: false,
      studentExists: false,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("session_not_found");
  });

  it("rejects with session_ended when endedAt is set", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
      slotExists: false,
      studentExists: false,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("session_ended");
  });

  it("rejects with session_expired when past expiresAt", async () => {
    globalThis.__fsMock = makeFsMock({
      sessionExists: true,
      sessionData: { staffUid: "staff1", endedAt: null, expiresAt: new Date(Date.now() - 1_000) },
      slotExists: false,
      studentExists: false,
    });
    const { claimSlot } = await importRepo();
    await expect(claimSlot("sess1", 0, "student1", "scan1")).rejects.toThrow("session_expired");
  });
});
