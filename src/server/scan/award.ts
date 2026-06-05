import { fbFirestore } from "@/server/lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { buildScanDoc, type ScanDocInput } from "./build";
import { bust } from "@/server/lib/cache-bus";

type AwardFromScanInput = ScanDocInput & {
  scanId: string;
  newStreak: number;
  newDaily: number;
  newRank: string;
  coinReward: number;
};

/**
 * Awards a scan transactionally. Idempotent on scanId: if a scan doc with this
 * id already exists (a retried/concurrent submit of the same captured photo),
 * no points are awarded and `awarded: false` is returned. Returns `awarded: true`
 * only for the first commit, so callers can distinguish a fresh award from a replay.
 */
export async function awardScan(i: AwardFromScanInput): Promise<{ awarded: boolean }> {
  const fs = fbFirestore();
  const scanRef = fs.collection("scans").doc(i.scanId);
  const userRef = fs.collection("users").doc(i.uid);
  const classRef = fs.collection("classes").doc(i.classKey.replace(/\//g, "-"));
  const goalRef = fs.collection("schoolGoal").doc("current");

  const awarded = await fs.runTransaction(async (tx) => {
    // Read first so concurrent submits of the same scanId serialize: the loser
    // re-runs the txn, sees the doc, and skips the duplicate award.
    const existing = await tx.get(scanRef);
    if (existing.exists) return false;
    tx.set(scanRef, buildScanDoc(i));
    tx.update(userRef, {
      totalPoints: FieldValue.increment(i.totalPoints),
      coins: FieldValue.increment(i.coinReward),
      coinsLifetime: FieldValue.increment(i.coinReward),
      totalScans: FieldValue.increment(1),
      streakDays: i.newStreak,
      lastScanLocalDate: i.localDate,
      lastScanAt: i.capturedAt,
      dailyScans: i.newDaily,
      dailyScanDate: i.localDate,
      rank: i.newRank,
      updatedAt: new Date(),
    });
    tx.set(classRef, {
      totalPoints: FieldValue.increment(i.totalPoints),
      totalScans: FieldValue.increment(1),
    }, { merge: true });
    tx.set(goalRef, {
      currentBottles: FieldValue.increment(1),
    }, { merge: true });
    return true;
  });
  if (awarded) {
    bust(`user:${i.uid}`);
    bust("classes");
  }
  return { awarded };
}
