// Pure validation for a garden decoration-display selection: the list a student
// wants placed on their plot. Must be a deduped subset of what they own, within
// the slot limit. Kept storage-free so it can be unit-tested directly.

export type DisplayDenyCode = "too_many" | "not_owned" | "duplicate" | "bad_input";
export type DisplayCheck =
  | { ok: true; list: string[] }
  | { ok: false; code: DisplayDenyCode };

export function validDisplaySelection(
  owned: string[],
  list: unknown,
  limit: number,
): DisplayCheck {
  if (!Array.isArray(list) || !list.every((x) => typeof x === "string")) {
    return { ok: false, code: "bad_input" };
  }
  const sel = list as string[];
  if (sel.length > limit) return { ok: false, code: "too_many" };
  if (new Set(sel).size !== sel.length) return { ok: false, code: "duplicate" };
  const ownedSet = new Set(owned);
  if (!sel.every((id) => ownedSet.has(id))) return { ok: false, code: "not_owned" };
  return { ok: true, list: sel };
}
