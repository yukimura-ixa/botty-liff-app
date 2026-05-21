import { fbFirestore } from "@/server/lib/firebase";
import { adjustPoints, AdjustError, TEACHER_REQUEST_CAP } from "./adjust";
import { bust } from "@/server/lib/cache-bus";
import { bustLeaderboardCaches } from "@/server/lib/leaderboard-cache-bus";

const COL = "adjustmentRequests";

export type AdjustRequestStatus = "pending" | "approved" | "rejected";

export type AdjustRequestRow = {
  id: string;
  targetUid: string;
  teacherUid: string;
  delta: number;
  reason: string;
  status: AdjustRequestStatus;
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decidedReason?: string;
};

export class AdjustRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isoOf(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return "";
}

function rowFromDoc(id: string, data: Record<string, unknown>): AdjustRequestRow {
  return {
    id,
    targetUid: String(data.targetUid ?? ""),
    teacherUid: String(data.teacherUid ?? ""),
    delta: typeof data.delta === "number" ? data.delta : 0,
    reason: typeof data.reason === "string" ? data.reason : "",
    status: (data.status as AdjustRequestStatus) ?? "pending",
    createdAt: isoOf(data.createdAt),
    decidedBy: typeof data.decidedBy === "string" ? data.decidedBy : undefined,
    decidedAt: data.decidedAt ? isoOf(data.decidedAt) : undefined,
    decidedReason: typeof data.decidedReason === "string" ? data.decidedReason : undefined,
  };
}

export async function createAdjustRequest(
  targetUid: string,
  teacherUid: string,
  delta: number,
  reason: string,
): Promise<string> {
  if (!Number.isInteger(delta) || delta === 0) throw new AdjustRequestError(400, "delta must be non-zero integer");
  if (Math.abs(delta) > TEACHER_REQUEST_CAP) throw new AdjustRequestError(400, `delta_exceeds_cap (|delta| > ${TEACHER_REQUEST_CAP})`);
  if (!reason || reason.length > 200) throw new AdjustRequestError(400, "reason required (max 200)");
  const fs = fbFirestore();
  const targetSnap = await fs.collection("users").doc(targetUid).get();
  if (!targetSnap.exists) throw new AdjustRequestError(404, "target not found");
  const ref = fs.collection(COL).doc();
  await ref.set({
    targetUid,
    teacherUid,
    delta,
    reason,
    status: "pending" as AdjustRequestStatus,
    createdAt: new Date(),
  });
  return ref.id;
}

export async function listPendingAdjustRequests(limit = 50): Promise<AdjustRequestRow[]> {
  const fs = fbFirestore();
  const snap = await fs.collection(COL)
    .where("status", "==", "pending")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => rowFromDoc(d.id, d.data() ?? {}));
}

export async function decideAdjustRequest(
  id: string,
  adminUid: string,
  approve: boolean,
  decisionReason?: string,
): Promise<void> {
  const fs = fbFirestore();
  const ref = fs.collection(COL).doc(id);
  const reqRow = await fs.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AdjustRequestError(404, "not found");
    const data = snap.data() ?? {};
    if (data.status !== "pending") throw new AdjustRequestError(409, "already decided");
    if (data.teacherUid === adminUid) throw new AdjustRequestError(400, "cannot decide own request");
    tx.update(ref, {
      status: approve ? "approved" : "rejected",
      decidedBy: adminUid,
      decidedAt: new Date(),
      ...(decisionReason ? { decidedReason: decisionReason } : {}),
    });
    return rowFromDoc(snap.id, data);
  });

  if (!approve) return;

  try {
    await adjustPoints(reqRow.targetUid, reqRow.teacherUid, reqRow.delta, reqRow.reason, {
      maxAbsDelta: TEACHER_REQUEST_CAP,
      source: "admin_approved",
      approvedRequestId: id,
      approverUid: adminUid,
    });
  } catch (e) {
    // Roll back status — keep audit trail by marking as failed.
    await ref.update({
      status: "rejected",
      decidedReason: `auto-rejected (apply failed): ${e instanceof Error ? e.message : String(e)}`,
    });
    if (e instanceof AdjustError) throw new AdjustRequestError(e.status, e.message);
    throw e;
  }
  bust(`user:${reqRow.targetUid}`);
  bustLeaderboardCaches();
}
