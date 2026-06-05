import { fbFirestore } from "@/server/lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { bust } from "@/server/lib/cache-bus";
import { findVariant } from "./catalog";
import { canBuy, type BuyDenyCode } from "./purchase";
import { unlockedAchievements } from "./achievements";
import { unclaimedMilestones, milestonePayout } from "./goal-milestones";

export type BuyResult =
  | { ok: true; coins: number; ownedTrees: string[] }
  | { ok: false; code: BuyDenyCode | "unknown_item" };

/** Atomically spend coins and grant a tree. */
export async function buyTree(uid: string, itemId: string, goalPct: number): Promise<BuyResult> {
  const item = findVariant(itemId);
  if (!item) return { ok: false, code: "unknown_item" };
  const fs = fbFirestore();
  const ref = fs.collection("users").doc(uid);

  const result = await fs.runTransaction<BuyResult>(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const wallet = {
      coins: typeof d.coins === "number" ? d.coins : 0,
      ownedTrees: Array.isArray(d.ownedTrees) ? (d.ownedTrees as string[]) : ["oak"],
    };
    const unlocked = unlockedAchievements(
      { totalPoints: (d.totalPoints as number) ?? 0, streakDays: (d.streakDays as number) ?? 0 },
      goalPct,
    );
    const verdict = canBuy(item, wallet, unlocked);
    if (!verdict.ok) return { ok: false, code: verdict.code };
    const coins = wallet.coins - item.priceCoins;
    tx.update(ref, {
      coins,
      ownedTrees: FieldValue.arrayUnion(item.id),
      updatedAt: new Date(),
    });
    return { ok: true, coins, ownedTrees: [...wallet.ownedTrees, item.id] };
  });

  if (result.ok) bust(`user:${uid}`);
  return result;
}

export type HeadlineResult = { ok: true } | { ok: false; code: "not_owned" };

/** Set the headline tree; must already be owned. */
export async function setHeadline(uid: string, itemId: string): Promise<HeadlineResult> {
  const fs = fbFirestore();
  const ref = fs.collection("users").doc(uid);
  const result = await fs.runTransaction<HeadlineResult>(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const owned = Array.isArray(d.ownedTrees) ? (d.ownedTrees as string[]) : ["oak"];
    if (!owned.includes(itemId)) return { ok: false, code: "not_owned" };
    tx.update(ref, { headlineTree: itemId, updatedAt: new Date() });
    return { ok: true };
  });
  if (result.ok) bust(`user:${uid}`);
  return result;
}

/**
 * Grant any unclaimed school-goal milestone coins for this user. Idempotent.
 * Returns coins granted (0 if none). Called lazily on /me read.
 */
export async function claimGoalMilestones(
  uid: string,
  current: number,
  target: number,
): Promise<number> {
  const fs = fbFirestore();
  const ref = fs.collection("users").doc(uid);
  const granted = await fs.runTransaction<number>(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const claimed = Array.isArray(d.claimedGoalMilestones)
      ? (d.claimedGoalMilestones as number[])
      : [];
    const due = unclaimedMilestones(current, target, claimed);
    if (!due.length) return 0;
    const payout = milestonePayout(due);
    tx.update(ref, {
      coins: FieldValue.increment(payout),
      coinsLifetime: FieldValue.increment(payout),
      claimedGoalMilestones: FieldValue.arrayUnion(...due),
      updatedAt: new Date(),
    });
    return payout;
  });
  if (granted > 0) bust(`user:${uid}`);
  return granted;
}
