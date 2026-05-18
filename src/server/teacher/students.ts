import { fbFirestore } from "@/server/lib/firebase";
import { bangkokDate } from "@/server/scan/time";

export async function sevenDaySeries(uid: string): Promise<number[]> {
  const fs = fbFirestore();
  const today = new Date();
  const days: number[] = new Array(7).fill(0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const localDate = bangkokDate(d);
    try {
      const snap = await fs.collection("scans")
        .where("uid", "==", uid)
        .where("localDate", "==", localDate)
        .select("totalPoints")
        .get();
      let pts = 0;
      for (const doc of snap.docs) {
        const tp = doc.data().totalPoints;
        pts += typeof tp === "number" ? tp : 0;
      }
      days[6 - i] = pts;
    } catch { /* leave 0 */ }
  }
  return days;
}
