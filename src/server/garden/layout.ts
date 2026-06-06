// Pure validation for a garden decoration LAYOUT: the positioned items a student
// wants on their plot. Each id must be a deduped subset of what they own, within
// the slot limit; x/y are clamped to [0,1]. Storage-free for direct unit tests.
import type { PlacedDecoration } from "@/lib/garden";

export type LayoutDenyCode = "too_many" | "not_owned" | "duplicate" | "bad_input";
export type LayoutCheck =
  | { ok: true; layout: PlacedDecoration[] }
  | { ok: false; code: LayoutDenyCode };

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function validLayout(owned: string[], layout: unknown, limit: number): LayoutCheck {
  if (!Array.isArray(layout)) return { ok: false, code: "bad_input" };
  const out: PlacedDecoration[] = [];
  for (const entry of layout) {
    if (
      !entry || typeof entry !== "object" ||
      typeof (entry as { id?: unknown }).id !== "string" ||
      !Number.isFinite((entry as { x?: unknown }).x) ||
      !Number.isFinite((entry as { y?: unknown }).y)
    ) {
      return { ok: false, code: "bad_input" };
    }
    const e = entry as { id: string; x: number; y: number };
    out.push({ id: e.id, x: clamp01(e.x), y: clamp01(e.y) });
  }
  if (out.length > limit) return { ok: false, code: "too_many" };
  const ids = out.map((p) => p.id);
  if (new Set(ids).size !== ids.length) return { ok: false, code: "duplicate" };
  const ownedSet = new Set(owned);
  if (!ids.every((id) => ownedSet.has(id))) return { ok: false, code: "not_owned" };
  return { ok: true, layout: out };
}
