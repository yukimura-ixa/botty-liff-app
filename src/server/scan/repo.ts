import { fbFirestore } from "@/server/lib/firebase";
import type { Timestamp } from "firebase-admin/firestore";

export type ScanHistoryEntry = {
  scanId: string;
  detectedClass: string;
  confidence: number;
  itemCount: number;
  totalPoints: number;
  capturedAt: string;
};

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function isDuplicateScan(uid: string, hash: string): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);
  const snap = await fbFirestore().collection("scans")
    .where("uid", "==", uid)
    .where("imageHash", "==", hash)
    .where("capturedAt", ">=", since)
    .limit(1)
    .get();
  return !snap.empty;
}

function isoOf(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as Timestamp).toDate === "function") {
    return (v as Timestamp).toDate().toISOString();
  }
  if (typeof v === "string") return v;
  return "";
}

function intOf(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function strOf(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function listMyScans(uid: string, limit: number, cursor: string | null): Promise<{ scans: ScanHistoryEntry[]; nextCursor: string | null }> {
  const fs = fbFirestore();
  let q = fs.collection("scans")
    .where("uid", "==", uid)
    .orderBy("capturedAt", "desc")
    .limit(limit + 1);
  if (cursor) {
    const cursorSnap = await fs.collection("scans").doc(cursor).get();
    if (cursorSnap.exists) q = q.startAfter(cursorSnap);
  }
  const snap = await q.get();
  const entries: ScanHistoryEntry[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      scanId: d.id,
      detectedClass: strOf(data.detectedClass),
      confidence: typeof data.confidence === "number" ? data.confidence : 0,
      itemCount: intOf(data.itemCount),
      totalPoints: intOf(data.totalPoints),
      capturedAt: isoOf(data.capturedAt),
    };
  });
  let nextCursor: string | null = null;
  let trimmed = entries;
  if (entries.length > limit) {
    nextCursor = entries[limit].scanId;
    trimmed = entries.slice(0, limit);
  }
  return { scans: trimmed, nextCursor };
}
