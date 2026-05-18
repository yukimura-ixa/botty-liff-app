import { fbFirestore } from "@/server/lib/firebase";

export type SchoolGoal = {
  targetBottles: number;
  currentBottles: number;
  startsAt: string;
  endsAt: string;
};

const EMPTY: SchoolGoal = { targetBottles: 0, currentBottles: 0, startsAt: "", endsAt: "" };

function toIso(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return ((v as { toDate: () => Date }).toDate()).toISOString();
  }
  if (typeof v === "string") return v;
  return "";
}

export async function getSchoolGoal(): Promise<SchoolGoal> {
  const doc = await fbFirestore().collection("schoolGoal").doc("current").get();
  if (!doc.exists) return EMPTY;
  const data = doc.data() ?? {};
  return {
    targetBottles: typeof data.targetBottles === "number" ? data.targetBottles : 0,
    currentBottles: typeof data.currentBottles === "number" ? data.currentBottles : 0,
    startsAt: toIso(data.startsAt),
    endsAt: toIso(data.endsAt),
  };
}
