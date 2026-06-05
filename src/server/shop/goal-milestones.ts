// School-goal coin milestones. Pure. Granted lazily per-user on /me read to
// avoid a fan-out write across all students when the goal crosses a threshold.
export const MILESTONE_COINS: Record<number, number> = { 25: 20, 50: 40, 100: 100 };
const TIERS = [25, 50, 100] as const;

/** Milestones reached by current/target that the user has not yet claimed. */
export function unclaimedMilestones(
  current: number,
  target: number,
  claimed: number[],
): number[] {
  if (!target || target <= 0) return [];
  const pct = (current / target) * 100;
  return TIERS.filter((t) => pct >= t && !claimed.includes(t));
}

/** Total coins owed for a set of milestones. */
export function milestonePayout(milestones: number[]): number {
  return milestones.reduce((sum, m) => sum + (MILESTONE_COINS[m] ?? 0), 0);
}
