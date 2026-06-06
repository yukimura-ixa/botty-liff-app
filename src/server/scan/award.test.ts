import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture every tx.update payload so we can assert coins are awarded.
const updates: Record<string, unknown>[] = [];
const sets: Record<string, unknown>[] = [];

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: (n: number) => ({ __inc: n }),
    serverTimestamp: () => ({ __ts: true }),
  },
}));

vi.mock("@/server/lib/firebase", () => ({
  fbFirestore: () => ({
    collection: () => ({ doc: () => ({ id: "ref" }) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        // pending doc exists and is not yet awarded
        get: async () => ({ exists: true, data: () => ({ awarded: false }) }),
        set: (_ref: unknown, data: Record<string, unknown>) => { sets.push(data); },
        update: (_ref: unknown, data: Record<string, unknown>) => { updates.push(data); },
      }),
  }),
}));

vi.mock("@/server/lib/cache-bus", () => ({ bust: () => {} }));

import { awardFromPending } from "./award";
import type { PendingDoc } from "./build";

const pending = {
  uid: "u1", classKey: "m1/1", scanId: "s1", detectedClass: "PET", itemCount: 2,
  confidence: 0.9, basePoints: 2, streakBonus: 0, totalPoints: 2, coinReward: 7,
  isFirstOfDay: true, localDate: "2026-06-06", streakDays: 1, newDailyCount: 1,
  newTotalPoints: 2, newRank: "ต้นกล้า", prevRank: "ต้นกล้า", imagePath: "u",
  imageHash: "h", capturedAt: new Date("2026-06-06T00:00:00Z"),
  expiresAt: new Date("2026-06-06T00:05:00Z"), status: "awaiting_bin",
} as unknown as PendingDoc;

beforeEach(() => { updates.length = 0; sets.length = 0; });

describe("awardFromPending", () => {
  it("increments coins and coinsLifetime from coinReward", async () => {
    await awardFromPending("u1", pending, "pend1");
    const userUpdate = updates.find((d) => "coins" in d);
    expect(userUpdate).toBeTruthy();
    expect(userUpdate!.coins).toEqual({ __inc: 7 });
    expect(userUpdate!.coinsLifetime).toEqual({ __inc: 7 });
    expect(userUpdate!.totalPoints).toEqual({ __inc: 2 });
  });

  it("marks the pending doc awarded (idempotency flag)", async () => {
    await awardFromPending("u1", pending, "pend1");
    const flag = updates.find((d) => d.awarded === true);
    expect(flag).toBeTruthy();
  });
});
