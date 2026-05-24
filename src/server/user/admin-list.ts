import { fbFirestore } from "@/server/lib/firebase";
import { filterAndSortProfiles, type AdminProfile } from "./admin-filter";

export type ListInput = { role: string; q: string; limit: number; cursor?: string };

export async function listAdminUsers(input: ListInput): Promise<{ users: AdminProfile[]; nextCursor: string | null }> {
  const fs = fbFirestore();
  const fetchCap = 500;
  const col = fs.collection("users");
  let q = input.role ? col.where("role", "==", input.role).limit(fetchCap) : col.limit(fetchCap);
  if (input.cursor) {
    const snap = await col.doc(input.cursor).get();
    if (snap.exists) q = q.startAfter(snap);
  }
  const snap = await q.get();
  const raw: AdminProfile[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      fullName: typeof data.fullName === "string" ? data.fullName : "",
      classKey: typeof data.classKey === "string" ? data.classKey : "",
      classGrade: typeof data.classGrade === "number" ? data.classGrade : 0,
      classRoom: typeof data.classRoom === "number" ? data.classRoom : 0,
      role: (data.role ?? "student") as AdminProfile["role"],
      totalPoints: typeof data.totalPoints === "number" ? data.totalPoints : 0,
      status: typeof data.status === "string" ? data.status : "active",
    };
  });
  const filtered = filterAndSortProfiles(raw, input.role, input.q);
  const trimmed = filtered.slice(0, input.limit);
  const nextCursor = filtered.length > input.limit && trimmed.length > 0 ? trimmed[trimmed.length - 1].uid : null;
  return { users: trimmed, nextCursor };
}
