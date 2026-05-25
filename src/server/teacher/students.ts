import { fbFirestore } from "@/server/lib/firebase";
import { bangkokDate } from "@/server/scan/time";

export async function sevenDaySeries(uid: string): Promise<number[]> {
  const fs = fbFirestore();
  const today = new Date();
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    dates.push(bangkokDate(new Date(today.getTime() - i * 86_400_000)));
  }
  try {
    const snap = await fs.collection("scans")
      .where("uid", "==", uid)
      .where("localDate", "in", dates)
      .select("totalPoints", "localDate")
      .get();
    const sums = new Map<string, number>();
    for (const doc of snap.docs) {
      const data = doc.data();
      const date = typeof data.localDate === "string" ? data.localDate : "";
      const pts = typeof data.totalPoints === "number" ? data.totalPoints : 0;
      sums.set(date, (sums.get(date) ?? 0) + pts);
    }
    return dates.map((d) => sums.get(d) ?? 0);
  } catch {
    return new Array(7).fill(0);
  }
}
