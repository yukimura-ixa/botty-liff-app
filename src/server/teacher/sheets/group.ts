import type { ScanRow } from "./rows";

export type StudentGroup = { uid: string; fullName: string; classKey: string; scans: number; totalPoints: number };
export type ClassGroup = { classKey: string; scans: number; totalPoints: number };

export function groupByStudent(rows: ScanRow[]): StudentGroup[] {
  const acc = new Map<string, StudentGroup>();
  for (const r of rows) {
    const g = acc.get(r.uid) ?? { uid: r.uid, fullName: r.fullName, classKey: r.classKey, scans: 0, totalPoints: 0 };
    g.scans += 1;
    g.totalPoints += r.totalPoints;
    acc.set(r.uid, g);
  }
  return Array.from(acc.values());
}

export function groupByClass(rows: ScanRow[]): ClassGroup[] {
  const acc = new Map<string, ClassGroup>();
  for (const r of rows) {
    const g = acc.get(r.classKey) ?? { classKey: r.classKey, scans: 0, totalPoints: 0 };
    g.scans += 1;
    g.totalPoints += r.totalPoints;
    acc.set(r.classKey, g);
  }
  return Array.from(acc.values());
}
