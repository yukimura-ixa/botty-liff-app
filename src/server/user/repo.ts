import { fbFirestore, fbAuth } from "@/server/lib/firebase";
import { defaultPendingProfile, classKey, type Profile } from "./helpers";

const COL = "users";

export async function getUser(uid: string): Promise<Profile | null> {
  const snap = await fbFirestore().collection(COL).doc(uid).get();
  if (!snap.exists) return null;
  return snap.data() as Profile;
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
}
