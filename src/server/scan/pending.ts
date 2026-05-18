import { fbFirestore } from "@/server/lib/firebase";
import type { PendingDoc } from "./build";

export const PENDING_COL = "pendingScans";
export const PENDING_STATUS_AWAITING = "awaiting_bin" as const;
export const PENDING_STATUS_CONFIRMED = "confirmed" as const;

export class PendingError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const ERR_PENDING_NOT_FOUND = new PendingError(404, "pending not found");
export const ERR_PENDING_EXPIRED = new PendingError(410, "pending expired");
export const ERR_PENDING_WRONG_USER = new PendingError(403, "pending uid mismatch");
export const ERR_PENDING_ALREADY_CONFIRMED = new PendingError(400, "pending already confirmed");

export async function createPending(id: string, doc: PendingDoc): Promise<void> {
  await fbFirestore().collection(PENDING_COL).doc(id).set(doc);
}

export type OutstandingPending = { id: string; expiresAt: Date };

export async function hasOutstandingPending(uid: string): Promise<OutstandingPending | null> {
  const snap = await fbFirestore().collection(PENDING_COL)
    .where("uid", "==", uid)
    .where("status", "==", PENDING_STATUS_AWAITING)
    .where("expiresAt", ">", new Date())
    .limit(1)
    .get();
  const d = snap.docs[0];
  if (!d) return null;
  const data = d.data();
  const expiresAt = (data.expiresAt as { toDate?: () => Date })?.toDate?.() ?? data.expiresAt;
  return { id: d.id, expiresAt };
}
