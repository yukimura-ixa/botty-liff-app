import { fbFirestore, fbAuth } from "@/server/lib/firebase";
import type { Timestamp } from "firebase-admin/firestore";
import { defaultPendingProfile, classKey, type Profile } from "./helpers";

const COL = "users";

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
  return p;
}

export async function getUser(uid: string): Promise<Profile | null> {
  const snap = await fbFirestore().collection(COL).doc(uid).get();
  if (!snap.exists) return null;
  return coerceProfile(snap.data() ?? {});
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
