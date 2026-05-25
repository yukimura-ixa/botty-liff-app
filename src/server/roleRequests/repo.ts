import { fbFirestore } from "@/server/lib/firebase";
import { changeRole, type AssignableRole } from "@/server/user/role-change";

export type RoleRequestStatus = "pending" | "approved" | "denied";

export type RoleRequest = {
  id: string;
  uid: string;
  requestedRole: AssignableRole;
  reason: string;
  status: RoleRequestStatus;
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decidedReason?: string;
};

const COLLECTION = "roleRequests";
const COOLDOWN_DAYS = 7;

function toIso(v: unknown): string {
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  return "";
}

function rowFromDoc(id: string, data: Record<string, unknown>): RoleRequest {
  return {
    id,
    uid: String(data.uid ?? ""),
    requestedRole: (data.requestedRole as AssignableRole) ?? "student",
    reason: String(data.reason ?? ""),
    status: (data.status as RoleRequestStatus) ?? "pending",
    createdAt: toIso(data.createdAt),
    decidedBy: data.decidedBy ? String(data.decidedBy) : undefined,
    decidedAt: data.decidedAt ? toIso(data.decidedAt) : undefined,
    decidedReason: data.decidedReason ? String(data.decidedReason) : undefined,
  };
}

export type CreateError = "pending_exists" | "cooldown" | "invalid_role";

export async function createRoleRequest(uid: string, requestedRole: AssignableRole, reason: string): Promise<{ id: string }> {
  if (requestedRole !== "council" && requestedRole !== "teacher") throw new Error("invalid_role");
  const fs = fbFirestore();
  const col = fs.collection(COLLECTION);
  const ref = col.doc();
  await fs.runTransaction(async (tx) => {
    const pendingSnap = await tx.get(col.where("uid", "==", uid).where("status", "==", "pending").limit(1));
    if (!pendingSnap.empty) throw new Error("pending_exists");

    const deniedSnap = await tx.get(col.where("uid", "==", uid).where("status", "==", "denied").orderBy("decidedAt", "desc").limit(1));
    if (!deniedSnap.empty) {
      const last = deniedSnap.docs[0].data();
      const decidedAt = last.decidedAt && typeof (last.decidedAt as { toDate?: () => Date }).toDate === "function"
        ? (last.decidedAt as { toDate: () => Date }).toDate()
        : null;
      if (decidedAt) {
        const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
        if (Date.now() - decidedAt.getTime() < cooldownMs) throw new Error("cooldown");
      }
    }

    tx.set(ref, {
      uid,
      requestedRole,
      reason,
      status: "pending",
      createdAt: new Date(),
    });
  });
  return { id: ref.id };
}

export async function getLatestRoleRequestForUser(uid: string): Promise<RoleRequest | null> {
  const fs = fbFirestore();
  const snap = await fs.collection(COLLECTION).where("uid", "==", uid).orderBy("createdAt", "desc").limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return rowFromDoc(d.id, d.data() ?? {});
}

export async function listPendingRoleRequests(): Promise<RoleRequest[]> {
  const fs = fbFirestore();
  const snap = await fs.collection(COLLECTION).where("status", "==", "pending").orderBy("createdAt", "asc").limit(200).get();
  return snap.docs.map((d) => rowFromDoc(d.id, d.data() ?? {}));
}

export type DecideError = "not_found" | "not_pending" | "self";

export async function decideRoleRequest(requestId: string, actorUid: string, approve: boolean, decidedReason?: string): Promise<{ requestedRole?: AssignableRole; uid?: string }> {
  const fs = fbFirestore();
  const ref = fs.collection(COLLECTION).doc(requestId);

  const decision = await fs.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not_found");
    const data = snap.data() ?? {};
    if (data.status !== "pending") throw new Error("not_pending");
    if (data.uid === actorUid) throw new Error("self");
    tx.update(ref, {
      status: approve ? "approved" : "denied",
      decidedBy: actorUid,
      decidedAt: new Date(),
      decidedReason: decidedReason ?? "",
    });
    return { uid: String(data.uid), requestedRole: data.requestedRole as AssignableRole };
  });

  if (approve) {
    await changeRole(decision.uid, actorUid, decision.requestedRole, decidedReason || `approved request ${requestId}`);
  }
  return decision;
}
