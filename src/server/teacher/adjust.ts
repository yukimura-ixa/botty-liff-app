import { fbFirestore } from "@/server/lib/firebase";
import { FieldValue } from "firebase-admin/firestore";

export async function adjustPoints(targetUid: string, teacherUid: string, delta: number, reason: string): Promise<void> {
  const fs = fbFirestore();
  const userRef = fs.collection("users").doc(targetUid);
  const auditRef = fs.collection("adjustments").doc();
  await fs.runTransaction(async (tx) => {
    tx.update(userRef, {
      totalPoints: FieldValue.increment(delta),
      updatedAt: new Date(),
    });
    tx.set(auditRef, {
      targetUID: targetUid,
      teacherUID: teacherUid,
      delta,
      reason,
      createdAt: new Date(),
    });
  });
}
