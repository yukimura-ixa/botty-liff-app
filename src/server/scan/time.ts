export function bangkokDate(now: Date): string {
  const ms = now.getTime() + 7 * 60 * 60 * 1000;
  const shifted = new Date(ms);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
