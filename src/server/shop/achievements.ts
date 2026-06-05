// Achievement gates derived live from profile + school-goal state. No storage.
export type AchievementId = "rank_forest" | "streak_7" | "goal_half";

const FOREST_POINTS = 1600; // 🌳 ป่าไม้ threshold (see RANKS in src/lib/theme.ts)

/**
 * @param p profile fields that drive gates
 * @param goalPct current school-goal completion percentage (0-100+)
 */
export function unlockedAchievements(
  p: { totalPoints: number; streakDays: number },
  goalPct: number,
): Set<AchievementId> {
  const out = new Set<AchievementId>();
  if (p.totalPoints >= FOREST_POINTS) out.add("rank_forest");
  if (p.streakDays >= 7) out.add("streak_7");
  if (goalPct >= 50) out.add("goal_half");
  return out;
}
