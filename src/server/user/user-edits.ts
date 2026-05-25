import { fbFirestore } from "@/server/lib/firebase";
import type { Timestamp } from "firebase-admin/firestore";

export type UserEditChange = { field: string; oldValue: unknown; newValue: unknown };

export type UserEdit = {
  id: string;
  targetUid: string;
  byUid: string;
  changes: UserEditChange[];
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

function coerceChanges(v: unknown): UserEditChange[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      field: typeof c.field === "string" ? c.field : "",
      oldValue: c.oldValue,
      newValue: c.newValue,
    }));
}

export async function listUserEdits(targetUid: string | null, limit: number): Promise<UserEdit[]> {
  const fs = fbFirestore();
  let q = fs.collection("userEdits").orderBy("createdAt", "desc").limit(limit);
  if (targetUid) q = fs.collection("userEdits").where("targetUid", "==", targetUid).orderBy("createdAt", "desc").limit(limit);
  const snap = await q.get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      targetUid: typeof data.targetUid === "string" ? data.targetUid : "",
      byUid: typeof data.byUid === "string" ? data.byUid : "",
      changes: coerceChanges(data.changes),
      createdAt: isoOf(data.createdAt),
    };
  });
}
