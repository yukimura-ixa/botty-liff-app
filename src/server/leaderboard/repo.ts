import { fbFirestore } from "@/server/lib/firebase";

export type Scope = "school" | "class" | "grade";

type ProfileRow = {
  uid: string;
  fullName: string;
  classKey: string;
  classGrade: number;
  rank: string;
  totalPoints: number;
  totalScans: number;
  streakDays: number;
};

async function getCallerClassMeta(uid: string): Promise<{ classKey: string; classGrade: number }> {
  const doc = await fbFirestore().collection("users").doc(uid).get();
  const data = doc.data() ?? {};
  return {
    classKey: typeof data.classKey === "string" ? data.classKey : "",
    classGrade: typeof data.classGrade === "number" ? data.classGrade : 0,
  };
}

export async function queryLeaderboard(scope: Scope, callerUid: string): Promise<ProfileRow[]> {
  const col = fbFirestore().collection("users");
  const base = col.where("role", "==", "student");
  let q;
  if (scope === "class") {
    const { classKey } = await getCallerClassMeta(callerUid);
    if (!classKey) return [];
    q = base.where("classKey", "==", classKey).orderBy("totalPoints", "desc").limit(100);
  } else if (scope === "grade") {
    const { classGrade } = await getCallerClassMeta(callerUid);
    if (!classGrade) return [];
    q = base.where("classGrade", "==", classGrade).orderBy("totalPoints", "desc").limit(100);
  } else {
    q = base.orderBy("totalPoints", "desc").limit(100);
  }
  const snap = await q.get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      uid: d.id,
      fullName: typeof x.fullName === "string" ? x.fullName : "",
      classKey: typeof x.classKey === "string" ? x.classKey : "",
      classGrade: typeof x.classGrade === "number" ? x.classGrade : 0,
      rank: typeof x.rank === "string" ? x.rank : "",
      totalPoints: typeof x.totalPoints === "number" ? x.totalPoints : 0,
      totalScans: typeof x.totalScans === "number" ? x.totalScans : 0,
      streakDays: typeof x.streakDays === "number" ? x.streakDays : 0,
    };
  });
}
