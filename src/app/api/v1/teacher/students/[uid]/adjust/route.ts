import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { adjustPoints, AdjustError } from "@/server/teacher/adjust";
import { bustLeaderboardCaches } from "@/server/lib/leaderboard-cache-bus";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "teacher")) return jsonError(403, "forbidden");
  const { uid } = await params;
  let body: { delta?: number; reason?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (typeof body.delta !== "number" || body.delta === 0) return jsonError(400, "delta required (non-zero)");
  if (!body.reason || typeof body.reason !== "string") return jsonError(400, "reason required");
  try {
    await adjustPoints(uid, ctx.uid, body.delta, body.reason);
    bustLeaderboardCaches();
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof AdjustError) return jsonError(err.status, err.message);
    console.error("adjust failed", err);
    return jsonError(500, "adjust failed");
  }
}
