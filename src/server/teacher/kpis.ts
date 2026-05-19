import { fbFirestore } from "@/server/lib/firebase";
import { AggregateField } from "firebase-admin/firestore";
import { bangkokDate } from "@/server/scan/time";
import { co2KgFromBottles } from "@/server/lib/co2";

export type Kpis = {
  studentCount: number;
  bottlesToday: number;
  totalPoints: number;
  co2KgReduced: number;
};

export async function getKPIs(): Promise<Kpis> {
  const fs = fbFirestore();
  const studentSnap = await fs.collection("users")
    .where("role", "==", "student")
    .select("totalPoints", "totalScans")
    .get();
  let totalPoints = 0;
  for (const d of studentSnap.docs) {
    const data = d.data();
    totalPoints += typeof data.totalPoints === "number" ? data.totalPoints : 0;
  }
  const today = bangkokDate(new Date());
  let bottlesToday = 0;
  try {
    const todaySnap = await fs.collection("scans").where("localDate", "==", today).select("itemCount").get();
    for (const d of todaySnap.docs) {
      const n = (d.data() as { itemCount?: number }).itemCount;
      bottlesToday += typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 1;
    }
  } catch { /* non-fatal */ }

  let totalBottles = 0;
  try {
    const agg = await fs.collection("scans").aggregate({ s: AggregateField.sum("itemCount") }).get();
    const v = agg.data().s;
    totalBottles = typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
  } catch { /* non-fatal */ }

  return {
    studentCount: studentSnap.size,
    bottlesToday,
    totalPoints,
    co2KgReduced: co2KgFromBottles(totalBottles),
  };
}
