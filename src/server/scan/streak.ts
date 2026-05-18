function parseDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeStreak(currentStreak: number, lastDate: string, today: string): number {
  const last = parseDate(lastDate);
  const now = parseDate(today);
  if (!last || !now) return 1;
  const diffDays = Math.round((now.getTime() - last.getTime()) / 86_400_000);
  if (diffDays === 0) return currentStreak;
  if (diffDays === 1) return currentStreak + 1;
  return 1;
}
