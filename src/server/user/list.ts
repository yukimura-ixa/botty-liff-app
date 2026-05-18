import { fbFirestore } from "@/server/lib/firebase";
import type { Profile } from "./helpers";

function containsCI(s: string, sub: string): boolean {
  if (!sub) return true;
  return s.toLowerCase().includes(sub.toLowerCase());
}

export async function listStudents(filter: { classKey?: string; q?: string; limit: number; cursor?: string }): Promise<{ students: Profile[]; nextCursor: string | null }> {
  const fs = fbFirestore();
  const fetchCap = 500;
  let q = fs.collection("users").where("role", "==", "student");
  if (filter.classKey) q = q.where("classKey", "==", filter.classKey);
  q = q.orderBy("totalPoints", "desc").limit(fetchCap);
  if (filter.cursor) {
    const cursorSnap = await fs.collection("users").doc(filter.cursor).get();
    if (cursorSnap.exists) q = q.startAfter(cursorSnap);
  }
  const snap = await q.get();
  const all = snap.docs.map((d) => ({ ...(d.data() as Profile), uid: d.id }));
  const filtered = filter.q ? all.filter((p) => containsCI(p.fullName, filter.q!) || containsCI(p.classKey, filter.q!)) : all;
  const trimmed = filtered.slice(0, filter.limit);
  const nextCursor = filtered.length > filter.limit && trimmed.length > 0 ? trimmed[trimmed.length - 1].uid : null;
  return { students: trimmed, nextCursor };
}
