import { fbFirestore } from "@/server/lib/firebase";
import { sortByPoints, type ClassEntry } from "./sort";

function intOf(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

export async function listClasses(): Promise<ClassEntry[]> {
  const snap = await fbFirestore().collection("classes").get();
  const rows: ClassEntry[] = snap.docs.map((d) => {
    const data = d.data() ?? {};
    return {
      classKey: d.id,
      totalPoints: intOf(data.totalPoints),
      studentCount: intOf(data.studentCount),
    };
  });
  return sortByPoints(rows);
}
