import { NextRequest } from "next/server";
import { verifyBearerTokenWithFreshRole, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonNoStore } from "@/server/lib/http";
import { createAdjustRequest, AdjustRequestError } from "@/server/teacher/adjust-requests";

export const runtime = "nodejs";
export const maxDuration = 10;

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
  if (typeof body.delta !== "number" || !Number.isInteger(body.delta) || body.delta === 0) {
    return jsonError(400, "delta required (non-zero integer)");
  }
  if (!body.reason || typeof body.reason !== "string") return jsonError(400, "reason required");

  try {
    const id = await createAdjustRequest(uid, ctx.uid, body.delta, body.reason);
    return jsonNoStore({ ok: true, id });
  } catch (err) {
    if (err instanceof AdjustRequestError) return jsonError(err.status, err.message);
    console.error("adjust request create failed", err);
    return jsonError(500, "failed");
  }
}
