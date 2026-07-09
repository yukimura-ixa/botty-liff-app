import { describe, it, expect, beforeEach, vi } from "vitest";

// Capture every scanAttempts doc handed to .add() so we can assert the persisted shape.
const added: Record<string, unknown>[] = [];

vi.mock("@/server/lib/firebase", () => ({
  fbFirestore: () => ({
    collection: () => ({
      add: async (d: Record<string, unknown>) => { added.push(d); return { id: "x" }; },
    }),
  }),
}));

import { writeScanAttempt } from "./log-repo";
import type { ScanAttemptLog } from "./log";

const base: ScanAttemptLog = {
  scanId: "s1",
  uid: "u1",
  classKey: "m/1",
  outcome: "pending",
  at: new Date("2026-06-06T00:00:00Z"),
  localDate: "2026-06-06",
};

beforeEach(() => { added.length = 0; });

describe("writeScanAttempt — spoofScore", () => {
  it("persists spoofScore when present", async () => {
    await writeScanAttempt({ ...base, spoofScore: 0.93 });
    expect(added).toHaveLength(1);
    expect(added[0].spoofScore).toBe(0.93);
  });

  it("persists a zero spoofScore (0 is a real probability, not 'missing')", async () => {
    await writeScanAttempt({ ...base, spoofScore: 0 });
    expect(added[0].spoofScore).toBe(0);
  });

  it("omits spoofScore from the doc when undefined", async () => {
    await writeScanAttempt({ ...base });
    expect("spoofScore" in added[0]).toBe(false);
  });

  it("always writes the core + expiresAt fields", async () => {
    await writeScanAttempt({ ...base });
    expect(added[0]).toMatchObject({
      scanId: "s1", uid: "u1", classKey: "m/1", outcome: "pending", localDate: "2026-06-06",
    });
    expect(added[0].expiresAt).toBeInstanceOf(Date);
  });
});
