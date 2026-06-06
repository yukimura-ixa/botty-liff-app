// Per-day scan throttle: cooldown grows exponentially with the number of scans
// already awarded today, capped at 4h. Daily allowance is counted in bottles.

export const COOLDOWN_BASE_MS = 60_000;        // 60s
export const COOLDOWN_MAX_MS = 14_400_000;     // 4h
export const DAILY_BOTTLE_LIMIT = 10;

/** Required gap before the next scan: min(60s * 2^scansToday, 4h). */
export function cooldownMs(scansToday: number): number {
  const n = Math.max(0, Math.floor(scansToday));
  // 60s * 2^18 already exceeds 4h; short-circuit so the shift can't overflow.
  if (n >= 18) return COOLDOWN_MAX_MS;
  return Math.min(COOLDOWN_BASE_MS * 2 ** n, COOLDOWN_MAX_MS);
}

/** Bottles a student may still earn today (>= 0). */
export function remainingBottles(bottlesToday: number): number {
  return Math.max(0, DAILY_BOTTLE_LIMIT - Math.max(0, Math.floor(bottlesToday)));
}
