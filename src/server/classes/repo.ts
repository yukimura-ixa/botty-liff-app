import { fbFirestore } from "@/server/lib/firebase";
import { sortByPoints, type ClassEntry } from "./sort";
import { TtlCache } from "@/server/leaderboard/cache";
import { registerBuster } from "@/server/lib/cache-bus";

const classesCache = new TtlCache<ClassEntry[]>(300_000, 4);
registerBuster("classes", () => classesCache.bust());

function intOf(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

export async function listClasses(): Promise<ClassEntry[]> {
  const cached = classesCache.get("all");
  if (cached) return cached;
  const snap = await fbFirestore().collection("classes").limit(500).get();
  const rows: ClassEntry[] = snap.docs.map((d) => {
    const data = d.data() ?? {};
    return {
      classKey: d.id,
      totalPoints: intOf(data.totalPoints),
      studentCount: intOf(data.studentCount),
    };
  });
  const sorted = sortByPoints(rows);
  classesCache.set("all", sorted);
  return sorted;
}
