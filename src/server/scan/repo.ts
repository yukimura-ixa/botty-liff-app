import { fbFirestore } from "@/server/lib/firebase";
import type { Timestamp } from "firebase-admin/firestore";
import { hammingDistance, phashBucket } from "./hash";

export type ScanHistoryEntry = {
  scanId: string;
  detectedClass: string;
  confidence: number;
  itemCount: number;
  totalPoints: number;
  capturedAt: string;
};

// Exact SHA-256 dedup window (per-user, original behavior).
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
// pHash same-user window: 30 days.
const PHASH_USER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
// pHash global window: 7 days across all users (catches passing photos around).
const PHASH_GLOBAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Hamming threshold for "same image" — typical for 64-bit aHash.
const PHASH_THRESHOLD = 6;

export type DuplicateResult =
  | { dup: false }
  | { dup: true; reason: "sha256" | "phash_same_user" | "phash_global"; existingScanId?: string };

export async function isDuplicateScan(
  uid: string,
  sha256: string,
  phash?: string,
): Promise<DuplicateResult> {
  const fs = fbFirestore();
  const sha256Since = new Date(Date.now() - DEDUP_WINDOW_MS);
  const shaSnap = await fs.collection("scans")
    .where("uid", "==", uid)
    .where("imageHash", "==", sha256)
    .where("capturedAt", ">=", sha256Since)
    .limit(1)
    .get();
  if (!shaSnap.empty) {
    return { dup: true, reason: "sha256", existingScanId: shaSnap.docs[0]!.id };
  }
  if (!phash) return { dup: false };

  const bucket = phashBucket(phash);
  const userSince = new Date(Date.now() - PHASH_USER_WINDOW_MS);
  const userSnap = await fs.collection("scans")
    .where("uid", "==", uid)
    .where("phashBucket", "==", bucket)
    .where("capturedAt", ">=", userSince)
    .limit(50)
    .get();
  for (const d of userSnap.docs) {
    const other = d.get("phash");
    if (typeof other === "string" && other.length === phash.length) {
      if (hammingDistance(other, phash) <= PHASH_THRESHOLD) {
        return { dup: true, reason: "phash_same_user", existingScanId: d.id };
      }
    }
  }

  const globalSince = new Date(Date.now() - PHASH_GLOBAL_WINDOW_MS);
  const globalSnap = await fs.collection("scans")
    .where("phashBucket", "==", bucket)
    .where("capturedAt", ">=", globalSince)
    .limit(100)
    .get();
  for (const d of globalSnap.docs) {
    if (d.get("uid") === uid) continue;
    const other = d.get("phash");
    if (typeof other === "string" && other.length === phash.length) {
      if (hammingDistance(other, phash) <= PHASH_THRESHOLD) {
        return { dup: true, reason: "phash_global", existingScanId: d.id };
      }
    }
  }
  return { dup: false };
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
    trimmed = entries.slice(0, limit);
    nextCursor = trimmed[trimmed.length - 1].scanId;
  }
  return { scans: trimmed, nextCursor };
}
