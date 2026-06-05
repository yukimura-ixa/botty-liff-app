import { fbFirestore } from "@/server/lib/firebase";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { buildScanDoc, type ScanDocInput, type PendingDoc } from "./build";
import { PENDING_COL } from "./pending";
import { bust } from "@/server/lib/cache-bus";

type AwardFromScanInput = ScanDocInput & {
  scanId: string;
  newStreak: number;
  newDaily: number;
  newRank: string;
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

/**
 * Awards points from a confirmed pending scan (staff-QR confirm flow). Idempotent
 * on the pending doc's `awarded` flag so a double-confirm can't double-award.
 */
export async function awardFromPending(uid: string, p: PendingDoc, pendingId: string): Promise<void> {
  const fs = fbFirestore();
  const pendingRef: DocumentReference = fs.collection(PENDING_COL).doc(pendingId);
  const scanRef = fs.collection("scans").doc(p.scanId);
  const userRef = fs.collection("users").doc(uid);
  const classRef = fs.collection("classes").doc(p.classKey.replace(/\//g, "-"));
  const goalRef = fs.collection("schoolGoal").doc("current");

  await fs.runTransaction(async (tx) => {
    const psnap = await tx.get(pendingRef);
    if (!psnap.exists) throw new Error("pending gone");
    const pdata = psnap.data() as { awarded?: boolean };
    if (pdata.awarded === true) return;

    tx.set(scanRef, buildScanDoc({
      uid,
      classKey: p.classKey,
      detectedClass: p.detectedClass,
      itemCount: p.itemCount,
      basePoints: p.basePoints,
      streakBonus: p.streakBonus,
      totalPoints: p.totalPoints,
      confidence: p.confidence,
      clientConf: 0,
      imagePath: p.imagePath,
      imageHash: p.imageHash,
      phash: p.phash,
      phashBucket: p.phashBucket,
      capturedAt: p.capturedAt,
      localDate: p.localDate,
    }));
    tx.update(userRef, {
      totalPoints: FieldValue.increment(p.totalPoints),
      totalScans: FieldValue.increment(1),
      streakDays: p.streakDays,
      lastScanLocalDate: p.localDate,
      lastScanAt: p.capturedAt,
      dailyScans: p.newDailyCount,
      dailyScanDate: p.localDate,
      rank: p.newRank,
      updatedAt: new Date(),
    });
    tx.set(classRef, {
      totalPoints: FieldValue.increment(p.totalPoints),
      totalScans: FieldValue.increment(1),
    }, { merge: true });
    tx.set(goalRef, {
      currentBottles: FieldValue.increment(1),
    }, { merge: true });
    tx.update(pendingRef, { awarded: true, awardedAt: FieldValue.serverTimestamp() });
  });
  bust(`user:${uid}`);
  bust("classes");
}
