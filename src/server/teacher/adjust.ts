import { fbFirestore } from "@/server/lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { rankForPoints } from "@/server/scan/rank";
import { bust } from "@/server/lib/cache-bus";

export class AdjustError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Teacher may apply small adjustments directly. Anything larger requires
// admin approval via the adjustmentRequests workflow.
export const TEACHER_IMMEDIATE_CAP = 10;
export const TEACHER_REQUEST_CAP = 50;
// Backwards-compat re-export for any caller still referencing TEACHER_ADJUST_CAP.
export const TEACHER_ADJUST_CAP = TEACHER_REQUEST_CAP;

export function adjustBucket(delta: number): "small" | "medium" | "large" {
  const abs = Math.abs(delta);
  if (abs <= TEACHER_IMMEDIATE_CAP) return "small";
  if (abs <= TEACHER_REQUEST_CAP) return "medium";
  return "large";
}

export type AdjustOptions = {
  // Maximum |delta| permitted by this call. Teacher direct path uses the
  // immediate cap; admin-approved requests pass the larger request cap.
  maxAbsDelta?: number;
  // Optional audit context: where the adjustment originated.
  source?: "teacher_immediate" | "admin_approved";
  approvedRequestId?: string;
  approverUid?: string;
};

export async function adjustPoints(
  targetUid: string,
  teacherUid: string,
  delta: number,
  reason: string,
  opts: AdjustOptions = {},
): Promise<void> {
  if (!Number.isInteger(delta)) throw new AdjustError(400, "delta must be integer");
  if (delta === 0) throw new AdjustError(400, "delta must be non-zero");
  const cap = opts.maxAbsDelta ?? TEACHER_IMMEDIATE_CAP;
  if (Math.abs(delta) > cap) {
    throw new AdjustError(400, `delta_exceeds_cap (|delta| > ${cap})`);
  }
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
      bucket: adjustBucket(delta),
      source: opts.source ?? "teacher_immediate",
      ...(opts.approvedRequestId ? { approvedRequestId: opts.approvedRequestId } : {}),
      ...(opts.approverUid ? { approverUid: opts.approverUid } : {}),
      createdAt: new Date(),
    });
  });
  bust(`user:${targetUid}`);
}
