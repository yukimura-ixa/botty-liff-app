export type PointsConfig = {
  basePoints: number;
  maxItemsPerScan: number;
};

export type PointsResult = {
  basePoints: number;
  streakBonus: number; // retained for response/UI shape; always 0 (streak bonus removed)
  total: number;
};

export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  basePoints: 1,
  maxItemsPerScan: 10,
};

// 1 accepted bottle = 1 point. The streak/daily points bonus has been removed;
// `streakDays` and `isFirstOfDay` are still accepted for call-site compatibility
// but no longer affect the points awarded.
export function calculatePoints(
  cfg: PointsConfig,
  _streakDays: number,
  _isFirstOfDay: boolean,
  itemCount: number = 1,
): PointsResult {
  const raw = Number.isFinite(itemCount) ? Math.floor(itemCount) : 1;
  const items = Math.min(cfg.maxItemsPerScan, Math.max(1, raw));
  const base = cfg.basePoints * items;
  return { basePoints: base, streakBonus: 0, total: base };
}
