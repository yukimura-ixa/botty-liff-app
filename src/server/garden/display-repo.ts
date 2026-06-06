import { fbFirestore } from "@/server/lib/firebase";
import { bust } from "@/server/lib/cache-bus";
import { GARDEN_DECORATION_SLOTS } from "@/lib/garden";
import { validDisplaySelection, type DisplayDenyCode } from "./display";

export type DisplayResult =
  | { ok: true; displayedDecorations: string[] }
  | { ok: false; code: DisplayDenyCode };

/** Set which owned decorations are placed on the garden plot. */
export async function setDisplayedDecorations(
  uid: string,
  list: unknown,
): Promise<DisplayResult> {
  const fs = fbFirestore();
  const ref = fs.collection("users").doc(uid);

  const result = await fs.runTransaction<DisplayResult>(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const owned = Array.isArray(d.ownedDecorations) ? (d.ownedDecorations as string[]) : [];
    const verdict = validDisplaySelection(owned, list, GARDEN_DECORATION_SLOTS);
    if (!verdict.ok) return { ok: false, code: verdict.code };
    tx.update(ref, { displayedDecorations: verdict.list, updatedAt: new Date() });
    return { ok: true, displayedDecorations: verdict.list };
  });

  if (result.ok) bust(`user:${uid}`);
  return result;
}
