// Shared garden constants + pure layout math (client + server safe — no imports).

// How many decorations a student may place on their garden plot at once.
export const GARDEN_DECORATION_SLOTS = 8;

export type PlacedDecoration = { id: string; x: number; y: number };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

// Default fractional position for the i-th placed decoration: rows of 4,
// spread across the lower garden. Deterministic, always within [0,1].
export function defaultSlot(i: number): { x: number; y: number } {
  const idx = Math.max(0, Math.floor(i));
  const col = idx % 4;
  const rowN = Math.floor(idx / 4);
  const x = (col + 0.5) / 4;            // 0.125, 0.375, 0.625, 0.875
  const y = clamp01(0.45 + rowN * 0.25); // 0.45, 0.70, 0.95...
  return { x, y };
}

// Auto-grid layout for a list of decoration ids (back-fill + tray-add default).
export function defaultLayout(ids: string[]): PlacedDecoration[] {
  return ids.map((id, i) => ({ id, ...defaultSlot(i) }));
}

// Map a pointer's client coords within a rect to a clamped [0,1] fraction.
export function clientToFraction(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  return { x: clamp01(x), y: clamp01(y) };
}
