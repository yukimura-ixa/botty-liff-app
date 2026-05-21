import { fbFirestore } from "@/server/lib/firebase";

export type AdjustmentRow = {
  id: string;
  targetUid: string;
  teacherUid: string;
  delta: number;
  reason: string;
  bucket: "small" | "medium" | "large" | "unknown";
  source: "teacher_immediate" | "admin_approved" | "unknown";
  approvedRequestId?: string;
  approverUid?: string;
  createdAt: string;
};

function isoOf(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return "";
}

function rowFromDoc(id: string, d: Record<string, unknown>): AdjustmentRow {
  return {
    id,
    targetUid: String(d.targetUID ?? d.targetUid ?? ""),
    teacherUid: String(d.teacherUID ?? d.teacherUid ?? ""),
    delta: typeof d.delta === "number" ? d.delta : 0,
    reason: typeof d.reason === "string" ? d.reason : "",
    bucket: (typeof d.bucket === "string" ? d.bucket : "unknown") as AdjustmentRow["bucket"],
    source: (typeof d.source === "string" ? d.source : "unknown") as AdjustmentRow["source"],
    approvedRequestId: typeof d.approvedRequestId === "string" ? d.approvedRequestId : undefined,
    approverUid: typeof d.approverUid === "string" ? d.approverUid : undefined,
    createdAt: isoOf(d.createdAt),
  };
}

export type ListAdjustmentsOpts = {
  targetUid?: string;
  teacherUid?: string;
  limit?: number;
};

export async function listAdjustments(opts: ListAdjustmentsOpts): Promise<AdjustmentRow[]> {
  const fs = fbFirestore();
  const limit = Math.max(1, Math.min(200, opts.limit ?? 50));
  let q: FirebaseFirestore.Query = fs.collection("adjustments");
  if (opts.targetUid) q = q.where("targetUID", "==", opts.targetUid);
  if (opts.teacherUid) q = q.where("teacherUID", "==", opts.teacherUid);
  q = q.orderBy("createdAt", "desc").limit(limit);
  const snap = await q.get();
  return snap.docs.map((d) => rowFromDoc(d.id, d.data() ?? {}));
}
