import { fbFirestore } from "@/server/lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { rankForPoints } from "@/server/scan/rank";

export class AdjustError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function adjustPoints(targetUid: string, teacherUid: string, delta: number, reason: string): Promise<void> {
  const fs = fbFirestore();
  const userRef = fs.collection("users").doc(targetUid);
  const auditRef = fs.collection("adjustments").doc();
  await fs.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new AdjustError(404, "target not found");
    const data = snap.data() as { role?: string; totalPoints?: number };
    if (data.role !== "student") throw new AdjustError(400, "target is not a student");
    const current = typeof data.totalPoints === "number" ? data.totalPoints : 0;
    const next = current + delta;
    tx.update(userRef, {
      totalPoints: FieldValue.increment(delta),
      rank: rankForPoints(next),
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
