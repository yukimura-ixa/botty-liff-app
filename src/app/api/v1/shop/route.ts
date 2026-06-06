import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getUser } from "@/server/user/repo";
import { getSchoolGoal } from "@/server/school/repo";
import { ALL_ITEMS } from "@/server/shop/catalog";
import { isAvailable, seasonEndsAt } from "@/server/shop/season";
import { unlockedAchievements } from "@/server/shop/achievements";
import { itemState } from "@/server/shop/purchase";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  const prof = await getUser(ctx.uid);
  if (!prof) return jsonError(404, "not found");

  const goal = await getSchoolGoal();
  const goalPct = goal.targetBottles > 0
    ? (goal.currentBottles / goal.targetBottles) * 100
    : 0;
  const unlocked = unlockedAchievements(
    { totalPoints: prof.totalPoints, streakDays: prof.streakDays },
    goalPct,
  );
  const wallet = {
    coins: prof.coins,
    ownedTrees: prof.ownedTrees,
    ownedDecorations: prof.ownedDecorations,
    ownedTerrains: prof.ownedTerrains,
  };

  const now = Date.now();
  const items = ALL_ITEMS
    .filter((v) => isAvailable(v, now))
    .map((v) => ({
      id: v.id,
      kind: v.kind,
      name: v.name,
      priceCoins: v.priceCoins,
      gate: v.gate ?? null,
      state: itemState(v, wallet, unlocked),
      seasonal: !!v.season,
      seasonEndsAt: v.season ? seasonEndsAt(v) : null,
    }));

  return jsonOk({ coins: prof.coins, headlineTree: prof.headlineTree, activeTerrain: prof.activeTerrain, items });
}
