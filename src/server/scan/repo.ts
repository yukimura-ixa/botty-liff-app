import { fbFirestore } from "@/server/lib/firebase";
import type { Timestamp } from "firebase-admin/firestore";
import { hammingDistance, phashBucket } from "./hash";
import { PENDING_COL, PENDING_STATUS_AWAITING } from "./pending";

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
  | {
      dup: true;
      reason: "sha256" | "phash_same_user" | "phash_global" | "pending_sha256" | "pending_phash";
      existingScanId?: string;
    };

export async function isDuplicateScan(
  uid: string,
  sha256: string,
  phash?: string,
): Promise<DuplicateResult> {
  const fs = fbFirestore();
  const now = new Date();
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

  // In-flight pendings (enforce/log mode): a scan isn't written to `scans` until
  // the staff-QR confirm, so without this check two students could submit the
  // same photo concurrently and both confirm for a double award. Only OTHER
  // users' pendings count here — a same-user retry is handled by the
  // hasOutstandingPending guard (which preserves the pending resume info).
  const pendingShaSnap = await fs.collection(PENDING_COL)
    .where("imageHash", "==", sha256)
    .where("status", "==", PENDING_STATUS_AWAITING)
    .where("expiresAt", ">", now)
    .limit(5)
    .get();
  for (const d of pendingShaSnap.docs) {
    if (d.get("uid") === uid) continue;
    return { dup: true, reason: "pending_sha256", existingScanId: scanIdOf(d) };
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

  // pHash match against OTHER users' in-flight pendings (see pending_sha256 note).
  // Bounded by the short pending TTL, so the candidate set stays tiny.
  const pendingPhashSnap = await fs.collection(PENDING_COL)
    .where("phashBucket", "==", bucket)
    .where("status", "==", PENDING_STATUS_AWAITING)
    .where("expiresAt", ">", now)
    .limit(50)
    .get();
  for (const d of pendingPhashSnap.docs) {
    if (d.get("uid") === uid) continue;
    const other = d.get("phash");
    if (typeof other === "string" && other.length === phash.length) {
      if (hammingDistance(other, phash) <= PHASH_THRESHOLD) {
        return { dup: true, reason: "pending_phash", existingScanId: scanIdOf(d) };
      }
    }
  }

  return { dup: false };
}

// pendingScans docs store the client scanId; fall back to the doc id.
function scanIdOf(d: FirebaseFirestore.QueryDocumentSnapshot): string {
  const s = d.get("scanId");
  return typeof s === "string" && s.length > 0 ? s : d.id;
}

export type StoredScan = {
  uid: string;
  detectedClass: string;
  confidence: number;
  itemCount: number;
  basePoints: number;
  streakBonus: number;
  totalPoints: number;
};

/** Read a previously-awarded scan by id for idempotent replay. Null if not found. */
export async function getStoredScan(scanId: string): Promise<StoredScan | null> {
  const fs = fbFirestore();
  const snap = await fs.collection("scans").doc(scanId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    uid: strOf(d.uid),
    detectedClass: strOf(d.detectedClass),
    confidence: typeof d.confidence === "number" ? d.confidence : 0,
    itemCount: intOf(d.itemCount),
    basePoints: intOf(d.basePoints),
    streakBonus: intOf(d.streakBonus),
    totalPoints: intOf(d.totalPoints),
  };
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
