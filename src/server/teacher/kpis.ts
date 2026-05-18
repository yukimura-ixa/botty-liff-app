import { fbFirestore } from "@/server/lib/firebase";
import { bangkokDate } from "@/server/scan/time";
import { co2KgFromScans } from "@/server/lib/co2";

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
  let totalScans = 0;
  for (const d of studentSnap.docs) {
    const data = d.data();
    totalPoints += typeof data.totalPoints === "number" ? data.totalPoints : 0;
    totalScans += typeof data.totalScans === "number" ? data.totalScans : 0;
  }
  const today = bangkokDate(new Date());
  let bottlesToday = 0;
  try {
    const todaySnap = await fs.collection("scans").where("localDate", "==", today).select("uid").get();
    bottlesToday = todaySnap.size;
  } catch { /* non-fatal */ }
  return {
    studentCount: studentSnap.size,
    bottlesToday,
    totalPoints,
    co2KgReduced: co2KgFromScans(totalScans),
  };
}
