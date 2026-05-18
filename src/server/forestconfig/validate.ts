export type ForestConfig = { thresholds: [number, number, number] };

export const DEFAULT_THRESHOLDS: [number, number, number] = [25, 75, 175];

export function validThresholds(v: unknown): v is [number, number, number] {
  if (!Array.isArray(v)) return false;
  if (v.length !== 3) return false;
  return v.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
}

export function pickConfig(raw: unknown): ForestConfig {
  if (raw && typeof raw === "object" && "thresholds" in raw) {
    const t = (raw as { thresholds: unknown }).thresholds;
    if (validThresholds(t)) return { thresholds: t };
  }
  return { thresholds: DEFAULT_THRESHOLDS };
}
