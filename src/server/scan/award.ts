import { fbFirestore } from "@/server/lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { buildScanDoc, type ScanDocInput } from "./build";
import { bust } from "@/server/lib/cache-bus";

type AwardFromScanInput = ScanDocInput & {
  scanId: string;
  newStreak: number;
  newDaily: number;
  newRank: string;
};

export async function awardScan(i: AwardFromScanInput): Promise<void> {
  const fs = fbFirestore();
  const scanRef = fs.collection("scans").doc(i.scanId);
  const userRef = fs.collection("users").doc(i.uid);
  const classRef = fs.collection("classes").doc(i.classKey.replace(/\//g, "-"));
  const goalRef = fs.collection("schoolGoal").doc("current");

  await fs.runTransaction(async (tx) => {
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
  });
  bust(`user:${i.uid}`);
  bust("classes");
}
