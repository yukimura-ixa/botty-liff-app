import { cache } from "react";
import { fbFirestore, fbAuth } from "@/server/lib/firebase";
import type { Timestamp } from "firebase-admin/firestore";
import { defaultPendingProfile, classKey, type Profile } from "./helpers";
import { TtlCache } from "@/server/leaderboard/cache";
import { registerBuster, bust } from "@/server/lib/cache-bus";

const COL = "users";

const userCache = new TtlCache<Profile>(60_000, 1000);
registerBuster("user", (uid: string) => {
  if (uid) userCache.delete(uid);
  else userCache.bust();
});

function dateOf(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as Timestamp).toDate === "function") {
    return (v as Timestamp).toDate();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

function coerceProfile(raw: Record<string, unknown>): Profile {
  const p = { ...raw } as Profile;
  const createdAt = dateOf(raw.createdAt);
  const updatedAt = dateOf(raw.updatedAt);
  const lastScanAt = dateOf(raw.lastScanAt);
  if (createdAt) p.createdAt = createdAt;
  if (updatedAt) p.updatedAt = updatedAt;
  if (lastScanAt) p.lastScanAt = lastScanAt; else delete p.lastScanAt;
  p.coins = typeof raw.coins === "number" ? raw.coins : 0;
  p.coinsLifetime = typeof raw.coinsLifetime === "number" ? raw.coinsLifetime : 0;
  p.ownedTrees = Array.isArray(raw.ownedTrees) && raw.ownedTrees.length
    ? (raw.ownedTrees as string[])
    : ["oak"];
  p.ownedDecorations = Array.isArray(raw.ownedDecorations)
    ? (raw.ownedDecorations as string[])
    : [];
  p.headlineTree = typeof raw.headlineTree === "string" && raw.headlineTree
    ? raw.headlineTree
    : "oak";
  p.claimedGoalMilestones = Array.isArray(raw.claimedGoalMilestones)
    ? (raw.claimedGoalMilestones as number[])
    : [];
  return p;
}

async function readUserFromStore(uid: string): Promise<Profile | null> {
  const cached = userCache.get(uid);
  if (cached) return cached;
  const snap = await fbFirestore().collection(COL).doc(uid).get();
  if (!snap.exists) return null;
  const profile = coerceProfile(snap.data() ?? {});
  userCache.set(uid, profile);
  return profile;
}

export const getUser = cache(readUserFromStore);

export type UserPatch = {
  fullName?: string;
  classGrade?: number;
  classRoom?: number;
  totalPoints?: number;
  status?: "active" | "inactive";
};

export type UserEditChange = { field: string; oldValue: unknown; newValue: unknown };

export async function updateUserProfile(
  targetUid: string,
  actorUid: string,
  patch: UserPatch,
): Promise<{ editId?: string; changes?: UserEditChange[]; noop?: true }> {
  if (targetUid === actorUid) throw new Error("self");

  const fs = fbFirestore();
  const userRef = fs.collection("users").doc(targetUid);
  const editId = crypto.randomUUID();
  const editRef = fs.collection("userEdits").doc(editId);

  let noop = false;
  let computedChanges: UserEditChange[] = [];

  await fs.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error("not_found");
    const prof = snap.data() ?? {};
    const role = typeof prof.role === "string" ? prof.role : "student";
    if (role === "admin") throw new Error("forbidden_target");

    const updates: Record<string, unknown> = {};
    const diffs: UserEditChange[] = [];

    if (patch.fullName !== undefined && patch.fullName !== prof.fullName) {
      updates.fullName = patch.fullName;
      diffs.push({ field: "fullName", oldValue: prof.fullName, newValue: patch.fullName });
    }
    if (patch.classGrade !== undefined && patch.classGrade !== prof.classGrade) {
      updates.classGrade = patch.classGrade;
      diffs.push({ field: "classGrade", oldValue: prof.classGrade, newValue: patch.classGrade });
    }
    if (patch.classRoom !== undefined && patch.classRoom !== prof.classRoom) {
      updates.classRoom = patch.classRoom;
      diffs.push({ field: "classRoom", oldValue: prof.classRoom, newValue: patch.classRoom });
    }
    if ("classGrade" in updates || "classRoom" in updates) {
      const newGrade = (updates.classGrade as number | undefined) ?? (prof.classGrade as number | undefined) ?? 0;
      const newRoom = (updates.classRoom as number | undefined) ?? (prof.classRoom as number | undefined) ?? 0;
      const newKey = `${newGrade}-${newRoom}`;
      if (newKey !== prof.classKey) {
        updates.classKey = newKey;
        diffs.push({ field: "classKey", oldValue: prof.classKey, newValue: newKey });
      }
    }
    if (patch.totalPoints !== undefined && patch.totalPoints !== prof.totalPoints) {
      updates.totalPoints = patch.totalPoints;
      diffs.push({ field: "totalPoints", oldValue: prof.totalPoints, newValue: patch.totalPoints });
    }
    if (patch.status !== undefined && patch.status !== prof.status) {
      updates.status = patch.status;
      diffs.push({ field: "status", oldValue: prof.status, newValue: patch.status });
    }

    if (diffs.length === 0) {
      noop = true;
      return;
    }

    updates.updatedAt = new Date();
    tx.update(userRef, updates);
    tx.set(editRef, {
      targetUid,
      byUid: actorUid,
      changes: diffs,
      createdAt: new Date(),
    });
    computedChanges = diffs;
  });

  if (noop) return { noop: true };

  bust(`user:${targetUid}`);
  if (computedChanges.some((c) => c.field === "classGrade" || c.field === "classRoom" || c.field === "classKey")) {
    bust("classes");
  }
  if (computedChanges.some((c) => c.field === "totalPoints" || c.field === "status")) {
    bust("leaderboard");
  }
  return { editId, changes: computedChanges };
}


export type DeleteUserResult = { ok: true; authDeleted: boolean; editId: string };

export async function deleteUser(targetUid: string, actorUid: string): Promise<DeleteUserResult> {
  if (targetUid === actorUid) throw new Error("self");

  const fs = fbFirestore();
  const userRef = fs.collection("users").doc(targetUid);
  const editId = crypto.randomUUID();
  const editRef = fs.collection("userEdits").doc(editId);

  let snapshot: Record<string, unknown> | null = null;

  await fs.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error("not_found");
    const prof = snap.data() ?? {};
    const role = typeof prof.role === "string" ? prof.role : "student";
    if (role !== "student") throw new Error("forbidden_target");
    snapshot = {
      fullName: prof.fullName ?? "",
      role,
      classKey: prof.classKey ?? "",
      totalPoints: prof.totalPoints ?? 0,
      status: prof.status ?? "active",
    };
    tx.delete(userRef);
    tx.set(editRef, {
      targetUid,
      byUid: actorUid,
      changes: [{ field: "_deleted", oldValue: snapshot, newValue: null }],
      createdAt: new Date(),
    });
  });

  bust(`user:${targetUid}`);
  bust("classes");
  bust("leaderboard");

  let authDeleted = false;
  try {
    await fbAuth().deleteUser(targetUid);
    authDeleted = true;
  } catch (err) {
    console.error("fbAuth deleteUser failed", targetUid, err);
  }

  return { ok: true, authDeleted, editId };
}

export async function createPending(lineUserId: string): Promise<Profile> {
  const p = defaultPendingProfile(lineUserId, new Date());
  await fbFirestore().collection(COL).doc(p.uid).set(p);
  return p;
}

export type OnboardInput = {
  fullName: string;
  studentId: string;
  grade: number;
  room: number;
  consent: boolean;
};

export async function onboard(uid: string, input: OnboardInput): Promise<void> {
  await fbFirestore().collection(COL).doc(uid).update({
    fullName: input.fullName,
    studentId: input.studentId,
    classGrade: input.grade,
    classRoom: input.room,
    classKey: classKey(input.grade, input.room),
    consent: input.consent,
    status: "active",
    rank: "ต้นกล้า",
    updatedAt: new Date(),
  });
  bust(`user:${uid}`);
}

export function isAdminSeed(uid: string): boolean {
  const raw = process.env.ADMIN_UIDS ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean).includes(uid);
}

export async function ensureAdminRole(uid: string): Promise<void> {
  if (!isAdminSeed(uid)) return;
  const p = await getUser(uid);
  if (!p || p.role === "admin") return;
  await fbFirestore().collection(COL).doc(uid).update({
    role: "admin",
    updatedAt: new Date(),
  });
  await fbAuth().setCustomUserClaims(uid, { role: "admin" });
  bust(`user:${uid}`);
}
