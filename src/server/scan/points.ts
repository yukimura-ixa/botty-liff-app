export type PointsConfig = {
  basePoints: number;
  streakMultiplier: number;
  streakCap: number;
};

export type PointsResult = {
  basePoints: number;
  streakBonus: number;
  total: number;
};

export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  basePoints: 1,
  streakMultiplier: 0.5,
  streakCap: 10,
};

export function calculatePoints(cfg: PointsConfig, streakDays: number, isFirstOfDay: boolean, itemCount: number = 1): PointsResult {
  const items = Math.max(1, Math.floor(itemCount));
  const base = cfg.basePoints * items;
  if (!isFirstOfDay) return { basePoints: base, streakBonus: 0, total: base };
  const capped = Math.min(Math.max(streakDays, 0), cfg.streakCap);
  const bonus = Math.floor(capped * cfg.streakMultiplier);
  return { basePoints: base, streakBonus: bonus, total: base + bonus };
}
