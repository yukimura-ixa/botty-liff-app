// src/server/scan/log-repo.ts
import { fbFirestore } from "@/server/lib/firebase";
import type { Timestamp } from "firebase-admin/firestore";
import type { ScanAttemptLog, ScanOutcome } from "./log";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function writeScanAttempt(input: ScanAttemptLog): Promise<void> {
  const fs = fbFirestore();
  const expiresAt = new Date(input.at.getTime() + TTL_MS);
  const doc: Record<string, unknown> = {
    scanId: input.scanId,
    uid: input.uid,
    classKey: input.classKey,
    outcome: input.outcome,
    at: input.at,
    localDate: input.localDate,
    expiresAt,
  };
  const optKeys: (keyof ScanAttemptLog)[] = [
    "basePoints", "streakBonus", "totalPoints",
    "itemCount", "detectedClass", "confidence", "clientConf",
    "dupReason",
  ];
  for (const k of optKeys) {
    const v = input[k];
    if (v !== undefined) doc[k] = v;
  }
  await fs.collection("scanAttempts").add(doc);
}

export interface ScanLogQuery {
  from?: Date;
  to?: Date;
  outcomes?: ScanOutcome[];
  uid?: string;
  classKey?: string;
  scanId?: string;
  cursor?: string | null;
  limit?: number;
}

export interface ScanLogRow extends ScanAttemptLog {
  id: string;
}

export async function listScanAttempts(q: ScanLogQuery): Promise<{ rows: ScanLogRow[]; nextCursor: string | null }> {
  const fs = fbFirestore();
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  let ref = fs.collection("scanAttempts").orderBy("at", "desc").limit(limit + 1);
  if (q.uid) ref = ref.where("uid", "==", q.uid) as typeof ref;
  if (q.classKey) ref = ref.where("classKey", "==", q.classKey) as typeof ref;
  if (q.scanId) ref = ref.where("scanId", "==", q.scanId) as typeof ref;
  if (q.outcomes && q.outcomes.length === 1) {
    ref = ref.where("outcome", "==", q.outcomes[0]) as typeof ref;
  } else if (q.outcomes && q.outcomes.length > 1 && q.outcomes.length <= 10) {
    ref = ref.where("outcome", "in", q.outcomes) as typeof ref;
  }
  if (q.from) ref = ref.where("at", ">=", q.from) as typeof ref;
  if (q.to) ref = ref.where("at", "<=", q.to) as typeof ref;
  if (q.cursor) {
    const c = await fs.collection("scanAttempts").doc(q.cursor).get();
    if (c.exists) ref = ref.startAfter(c) as typeof ref;
  }
  const snap = await ref.get();
  const docs = snap.docs;
  const trimmed = docs.slice(0, limit);
  const nextCursor = docs.length > limit ? trimmed[trimmed.length - 1]!.id : null;
  return {
    rows: trimmed.map((d) => toRow(d.id, d.data())),
    nextCursor,
  };
}

const ALL_OUTCOMES: ScanOutcome[] = [
  "awarded", "pending", "preview", "replay",
  "denied_cooldown", "denied_daily_cap",
  "denied_dup_hash", "denied_dup_phash",
  "rejected_not_pet",
];

// Returns a count per outcome within the uid/classKey/date scope. By design this
// IGNORES q.outcomes: the result is the full breakdown that powers the UI chips,
// so it must stay stable while the user toggles which outcomes the table shows.
// (botty-ax0 — confirmed intentional, not a bug.)

export async function countScanAttemptsByOutcome(q: ScanLogQuery): Promise<Record<ScanOutcome, number>> {
  const fs = fbFirestore();
  const results = await Promise.all(
    ALL_OUTCOMES.map(async (outcome) => {
      let ref: FirebaseFirestore.Query = fs.collection("scanAttempts").where("outcome", "==", outcome);
      if (q.uid) ref = ref.where("uid", "==", q.uid);
      if (q.classKey) ref = ref.where("classKey", "==", q.classKey);
      if (q.from) ref = ref.where("at", ">=", q.from);
      if (q.to) ref = ref.where("at", "<=", q.to);
      const snap = await ref.count().get();
      return [outcome, snap.data().count] as const;
    }),
  );
  const counts: Record<ScanOutcome, number> = {
    awarded: 0, pending: 0, preview: 0, replay: 0,
    denied_cooldown: 0, denied_daily_cap: 0,
    denied_dup_hash: 0, denied_dup_phash: 0,
    rejected_not_pet: 0,
  };
  for (const [outcome, n] of results) counts[outcome] = n;
  return counts;
}

function toRow(id: string, d: FirebaseFirestore.DocumentData): ScanLogRow {
  return {
    id,
    scanId: strOf(d.scanId),
    uid: strOf(d.uid),
    classKey: strOf(d.classKey),
    outcome: d.outcome as ScanOutcome,
    at: tsToDate(d.at),
    localDate: strOf(d.localDate),
    basePoints: numOpt(d.basePoints),
    streakBonus: numOpt(d.streakBonus),
    totalPoints: numOpt(d.totalPoints),
    itemCount: numOpt(d.itemCount),
    detectedClass: strOpt(d.detectedClass),
    confidence: numOpt(d.confidence),
    clientConf: numOpt(d.clientConf),
    dupReason: d.dupReason === "hash" || d.dupReason === "phash" ? d.dupReason : undefined,
  };
}

function tsToDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (v && typeof v === "object" && "toDate" in v && typeof (v as Timestamp).toDate === "function") {
    return (v as Timestamp).toDate();
  }
  return new Date(0);
}
function strOf(v: unknown): string { return typeof v === "string" ? v : ""; }
function strOpt(v: unknown): string | undefined { return typeof v === "string" ? v : undefined; }
function numOpt(v: unknown): number | undefined { return typeof v === "number" ? v : undefined; }
