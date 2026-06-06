import { fbFirestore } from "@/server/lib/firebase";
import { bust } from "@/server/lib/cache-bus";
import { GARDEN_DECORATION_SLOTS, type PlacedDecoration } from "@/lib/garden";
import { validLayout, type LayoutDenyCode } from "./layout";

export type LayoutResult =
  | { ok: true; decorationLayout: PlacedDecoration[] }
  | { ok: false; code: LayoutDenyCode };

/** Set the positioned decoration layout on the garden plot. Writes the
 *  authoritative `decorationLayout` and keeps `displayedDecorations` (ids) in sync. */
export async function setDecorationLayout(uid: string, layout: unknown): Promise<LayoutResult> {
  const fs = fbFirestore();
  const ref = fs.collection("users").doc(uid);

  const result = await fs.runTransaction<LayoutResult>(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const owned = Array.isArray(d.ownedDecorations) ? (d.ownedDecorations as string[]) : [];
    const verdict = validLayout(owned, layout, GARDEN_DECORATION_SLOTS);
    if (!verdict.ok) return { ok: false, code: verdict.code };
    tx.update(ref, {
      decorationLayout: verdict.layout,
      displayedDecorations: verdict.layout.map((p) => p.id),
      updatedAt: new Date(),
    });
    return { ok: true, decorationLayout: verdict.layout };
  });

  if (result.ok) bust(`user:${uid}`);
  return result;
}
