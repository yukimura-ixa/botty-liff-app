// Spendable-coin rewards for scans. Pure: no IO. Tuning lives here, mirroring
// TEACHER_*_CAP in src/lib/api.ts.
export const COIN_PER_SCAN = 2;

function streakBonus(streakDays: number): number {
  if (streakDays >= 7) return 2;
  if (streakDays >= 3) return 1;
  return 0;
}

/**
 * Coins earned for one accepted scan.
 * @param newStreak the streak value after this scan
 * @param newDaily  the daily scan count after this scan (1 = first of day)
 */
export function coinReward(newStreak: number, newDaily: number): number {
  const firstOfDay = newDaily === 1 ? 1 : 0;
  return COIN_PER_SCAN + streakBonus(newStreak) + firstOfDay;
}
