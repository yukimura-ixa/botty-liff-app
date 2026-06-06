import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getSchoolGoal } from "@/server/school/repo";
import { buyItem } from "@/server/shop/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  let body: { itemId?: unknown };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (typeof body.itemId !== "string") return jsonError(400, "itemId required");

  const goal = await getSchoolGoal();
  const goalPct = goal.targetBottles > 0
    ? (goal.currentBottles / goal.targetBottles) * 100
    : 0;

  const result = await buyItem(ctx.uid, body.itemId, goalPct);
  if (!result.ok) {
    const status = result.code === "unknown_item" ? 404
      : result.code === "insufficient_coins" ? 402
      : 409;
    return jsonError(status, result.code);
  }
  return jsonOk({
    coins: result.coins,
    ownedTrees: result.ownedTrees,
    ownedDecorations: result.ownedDecorations,
  });
}
