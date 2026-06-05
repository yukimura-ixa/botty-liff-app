import { fbFirestore } from "@/server/lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { SESSION_DURATION_MS } from "./mint";

const COLLECTION = "approverSessions";

export type ApproverSession = {
  id: string;
  staffUid: string;
  startedAtMs: number;
  expiresAtMs: number;
  endedAtMs: number | null;
  awardsCount: number;
};

function tsToMs(v: unknown): number {
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: () => number }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (v instanceof Date) return v.getTime();
  return 0;
}

function rowFromDoc(id: string, data: Record<string, unknown>): ApproverSession {
  const startedAtMs = tsToMs(data.startedAt);
  const expiresAtMs = tsToMs(data.expiresAt);
  const endedAtMs = data.endedAt ? tsToMs(data.endedAt) : null;
  const awardsCount = typeof data.awardsCount === "number" ? data.awardsCount : 0;
  return {
    id,
    staffUid: String(data.staffUid ?? ""),
    startedAtMs,
    expiresAtMs,
    endedAtMs,
    awardsCount,
  };
}

export async function createSession(staffUid: string): Promise<ApproverSession> {
  const fs = fbFirestore();
  const ref = fs.collection(COLLECTION).doc();
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + SESSION_DURATION_MS);
  await ref.set({
    staffUid,
    startedAt,
    expiresAt,
    endedAt: null,
    awardsCount: 0,
  });
  return {
    id: ref.id,
    staffUid,
    startedAtMs: startedAt.getTime(),
    expiresAtMs: expiresAt.getTime(),
    endedAtMs: null,
    awardsCount: 0,
  };
}

export async function getSession(id: string): Promise<ApproverSession | null> {
  const snap = await fbFirestore().collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return rowFromDoc(snap.id, snap.data() ?? {});
}

export async function endSession(id: string, actorUid: string): Promise<void> {
  const fs = fbFirestore();
  const ref = fs.collection(COLLECTION).doc(id);
  await fs.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not_found");
    const data = snap.data() ?? {};
    if (data.staffUid !== actorUid) throw new Error("forbidden");
    if (data.endedAt) return;
    tx.update(ref, { endedAt: new Date() });
  });
}

export type ClaimError =
  | "session_not_found"
  | "session_ended"
  | "session_expired"
  | "slot_used"
  | "student_already_awarded";

export async function claimSlot(sessionId: string, slot: number, studentUid: string, scanId: string): Promise<{ staffUid: string }> {
  const fs = fbFirestore();
  const sessionRef = fs.collection(COLLECTION).doc(sessionId);
  const slotRef = sessionRef.collection("slots").doc(String(slot));
  const studentRef = sessionRef.collection("students").doc(studentUid);
  return fs.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new Error("session_not_found");
    const data = sessionSnap.data() ?? {};
    if (data.endedAt) throw new Error("session_ended");
    const expiresMs = tsToMs(data.expiresAt);
    if (expiresMs && Date.now() > expiresMs) throw new Error("session_expired");

    const slotSnap = await tx.get(slotRef);
    if (slotSnap.exists) throw new Error("slot_used");

    const studentSnap = await tx.get(studentRef);
    if (studentSnap.exists) throw new Error("student_already_awarded");

    const now = new Date();
    tx.set(slotRef, {
      usedBy: studentUid,
      usedAt: now,
      scanId,
    });
    tx.set(studentRef, {
      awardedAt: now,
      slot,
      scanId,
    });
    tx.update(sessionRef, { awardsCount: FieldValue.increment(1) });

    return { staffUid: String(data.staffUid ?? "") };
  });
}
