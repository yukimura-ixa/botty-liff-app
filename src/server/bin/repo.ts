import { fbFirestore } from "@/server/lib/firebase";
import { ulid } from "ulidx";
import type { Timestamp } from "firebase-admin/firestore";

export type Bin = {
  id: string;
  label: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

function isoOf(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as Timestamp).toDate === "function") {
    return (v as Timestamp).toDate().toISOString();
  }
  return typeof v === "string" ? v : "";
}

export async function createBin(actorUid: string, label: string): Promise<Bin> {
  const fs = fbFirestore();
  const id = ulid();
  const now = new Date();
  await fs.collection("bins").doc(id).set({
    label, active: true, createdBy: actorUid, createdAt: now, updatedAt: now,
  });
  return { id, label, active: true, createdBy: actorUid, createdAt: now.toISOString(), updatedAt: now.toISOString() };
}

export async function listBins(activeOnly: boolean): Promise<Bin[]> {
  const fs = fbFirestore();
  let q = fs.collection("bins").orderBy("createdAt", "desc").limit(200);
  if (activeOnly) q = fs.collection("bins").where("active", "==", true).orderBy("createdAt", "desc").limit(200);
  const snap = await q.get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      label: typeof data.label === "string" ? data.label : "",
      active: !!data.active,
      createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
      createdAt: isoOf(data.createdAt),
      updatedAt: isoOf(data.updatedAt),
    };
  });
}

export async function getBin(id: string): Promise<Bin | null> {
  const snap = await fbFirestore().collection("bins").doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return {
    id, label: typeof data.label === "string" ? data.label : "",
    active: !!data.active,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
    createdAt: isoOf(data.createdAt),
    updatedAt: isoOf(data.updatedAt),
  };
}

export class BinError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function patchBin(id: string, patch: { label?: string; active?: boolean }): Promise<void> {
  if (typeof patch.label === "string" && (patch.label.length === 0 || patch.label.length > 80)) {
    throw new BinError(400, "label must be 1..80 chars");
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.label === "string") updates.label = patch.label;
  if (typeof patch.active === "boolean") updates.active = patch.active;
  const ref = fbFirestore().collection("bins").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new BinError(404, "bin not found");
  await ref.update(updates);
}
