export type ClassEntry = {
  classKey: string;
  totalPoints: number;
  studentCount: number;
};

export function sortByPoints(entries: ClassEntry[]): ClassEntry[] {
  return [...entries].sort((a, b) => b.totalPoints - a.totalPoints);
}
