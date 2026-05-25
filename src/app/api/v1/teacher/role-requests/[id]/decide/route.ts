import { NextRequest } from "next/server";
import { verifyBearerTokenWithFreshRole, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonNoStore } from "@/server/lib/http";
import { decideRoleRequest } from "@/server/roleRequests/repo";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try { ctx = await verifyBearerTokenWithFreshRole(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "teacher")) return jsonError(403, "forbidden");
  const { id } = await params;

  let body: { approve?: boolean; reason?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (typeof body.approve !== "boolean") return jsonError(400, "approve required");
  const reason = (body.reason ?? "").toString().trim();
  if (reason.length > 200) return jsonError(400, "reason max 200");

  try {
    await decideRoleRequest(id, ctx.uid, body.approve, reason || undefined, { allowedRoles: ["council"] });
    return jsonNoStore({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    if (msg === "not_found") return jsonError(404, "not found");
    if (msg === "not_pending") return jsonError(409, "already decided");
    if (msg === "self") return jsonError(400, "cannot decide own request");
    if (msg === "role_not_allowed") return jsonError(403, "teachers may only decide council requests");
    console.error("teacher role-request decide failed", err);
    return jsonError(500, "failed");
  }
}
