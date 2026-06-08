import { fbFirestore } from "@/server/lib/firebase";
import { PENDING_TTL_MS } from "./build";

export const RESERVATION_COL = "scanReservations";

export type ReservationDoc = { uid: string; expiresAt: Date };

/**
 * Pure decision for the atomic imageHash reservation. A reservation is grantable
 * when there is no existing one, it has expired (`expiresAt <= now`), or it is
 * already held by the same uid (idempotent retry). Otherwise another user holds
 * a live reservation for the same image, so the caller is a duplicate.
 */
export function reservationDecision(
  existing: ReservationDoc | null,
  uid: string,
  now: Date,
): "reserve" | "blocked" {
  if (!existing) return "reserve";
  if (existing.expiresAt.getTime() <= now.getTime()) return "reserve";
  if (existing.uid === uid) return "reserve";
  return "blocked";
}

function readExpiresAt(data: FirebaseFirestore.DocumentData): Date {
  const raw = data.expiresAt as { toDate?: () => Date } | Date | undefined;
  if (raw && typeof (raw as { toDate?: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate();
  }
  return (raw as Date) ?? new Date(0);
}

/**
 * Atomically reserve the exact-image (sha256) slot for `uid`. Closes the
 * read-then-write dedup race: two concurrent same-image uploads from different
 * users both transact on `scanReservations/{sha256}`, so exactly one wins and
 * the other is reported blocked (the loser's transaction re-runs and sees the
 * winner's write). A query-based check cannot do this — Firestore transactions
 * only conflict on documents actually read/written, so the reservation must be
 * keyed on a deterministic doc id (= the sha256 hash).
 *
 * The reservation lives for PENDING_TTL_MS (the in-flight pending window) and is
 * purged by a Firestore TTL policy on `expiresAt`. Once a scan is awarded, the
 * scans-doc sha256 dedup and pHash checks take over, exactly as before.
 */
export async function reserveImageHash(
  uid: string,
  sha256: string,
  now: Date = new Date(),
): Promise<{ reserved: boolean; holderUid?: string }> {
  const ref = fbFirestore().collection(RESERVATION_COL).doc(sha256);
  return fbFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing: ReservationDoc | null = snap.exists
      ? { uid: snap.get("uid") as string, expiresAt: readExpiresAt(snap.data()!) }
      : null;
    if (reservationDecision(existing, uid, now) === "blocked") {
      return { reserved: false, holderUid: existing!.uid };
    }
    tx.set(ref, { uid, expiresAt: new Date(now.getTime() + PENDING_TTL_MS), createdAt: now });
    return { reserved: true };
  });
}

/**
 * Best-effort release of a reservation held by `uid` — called on non-awarding
 * exit paths (rejected detection, detector/storage error) so a failed scan does
 * not hold the slot for the full TTL. Swallows errors; the TTL is the backstop.
 */
export async function releaseImageHash(sha256: string, uid: string): Promise<void> {
  const ref = fbFirestore().collection(RESERVATION_COL).doc(sha256);
  try {
    await fbFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.get("uid") === uid) tx.delete(ref);
    });
  } catch (err) {
    console.error("reservation release failed", uid, err);
  }
}
