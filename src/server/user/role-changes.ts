import { fbFirestore } from "@/server/lib/firebase";
import type { Timestamp } from "firebase-admin/firestore";

export type RoleChange = {
  id: string;
  targetUid: string;
  byUid: string;
  fromRole: string;
  toRole: string;
  reason: string;
  createdAt: string;
};

function isoOf(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as Timestamp).toDate === "function") {
    return (v as Timestamp).toDate().toISOString();
  }
  return typeof v === "string" ? v : "";
}

export async function listRoleChanges(targetUid: string | null, limit: number): Promise<RoleChange[]> {
  const fs = fbFirestore();
  let q = fs.collection("roleChanges").orderBy("createdAt", "desc").limit(limit);
  if (targetUid) q = fs.collection("roleChanges").where("targetUid", "==", targetUid).orderBy("createdAt", "desc").limit(limit);
  const snap = await q.get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      targetUid: typeof data.targetUid === "string" ? data.targetUid : "",
      byUid: typeof data.byUid === "string" ? data.byUid : "",
      fromRole: typeof data.fromRole === "string" ? data.fromRole : "",
      toRole: typeof data.toRole === "string" ? data.toRole : "",
      reason: typeof data.reason === "string" ? data.reason : "",
      createdAt: isoOf(data.createdAt),
    };
  });
}
