import { NextRequest } from "next/server";
import { verifyBearerTokenWithFreshRole, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonNoStore } from "@/server/lib/http";
import { adjustPoints, AdjustError, TEACHER_IMMEDIATE_CAP, TEACHER_REQUEST_CAP } from "@/server/teacher/adjust";
import { bustLeaderboardCaches } from "@/server/lib/leaderboard-cache-bus";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  let ctx;
  try { ctx = await verifyBearerTokenWithFreshRole(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");
  const { uid } = await params;
  let body: { delta?: number; reason?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (typeof body.delta !== "number" || body.delta === 0 || !Number.isInteger(body.delta)) {
    return jsonError(400, "delta required (non-zero integer)");
  }
  const abs = Math.abs(body.delta);
  if (abs > TEACHER_REQUEST_CAP) {
    return jsonError(400, `delta_exceeds_cap (|delta| > ${TEACHER_REQUEST_CAP})`);
  }
  if (abs > TEACHER_IMMEDIATE_CAP) {
    return new Response(
      JSON.stringify({
        error: "use_request",
        message: `|delta| > ${TEACHER_IMMEDIATE_CAP} requires admin approval`,
        immediateCap: TEACHER_IMMEDIATE_CAP,
        requestCap: TEACHER_REQUEST_CAP,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!body.reason || typeof body.reason !== "string") return jsonError(400, "reason required");
  if (body.reason.length > 200) return jsonError(400, "reason too long (max 200)");
  try {
    await adjustPoints(uid, ctx.uid, body.delta, body.reason);
    bustLeaderboardCaches();
    return jsonNoStore({ ok: true });
  } catch (err) {
    if (err instanceof AdjustError) return jsonError(err.status, err.message);
    console.error("adjust failed", err);
    return jsonError(500, "adjust failed");
  }
}
