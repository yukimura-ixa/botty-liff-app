import { NextRequest } from "next/server";
import { verifyBearerTokenWithFreshRole, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonNoStore } from "@/server/lib/http";
import { decideAdjustRequest, AdjustRequestError } from "@/server/teacher/adjust-requests";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try { ctx = await verifyBearerTokenWithFreshRole(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");
  const { id } = await params;

  let body: { approve?: boolean; reason?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (typeof body.approve !== "boolean") return jsonError(400, "approve required");
  const reason = (body.reason ?? "").toString().trim();
  if (reason.length > 200) return jsonError(400, "reason max 200");

  try {
    await decideAdjustRequest(id, ctx.uid, body.approve, reason || undefined);
    return jsonNoStore({ ok: true });
  } catch (err) {
    if (err instanceof AdjustRequestError) return jsonError(err.status, err.message);
    console.error("adjustment-request decide failed", err);
    return jsonError(500, "failed");
  }
}
