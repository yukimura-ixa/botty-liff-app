import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { createRoleRequest, getLatestRoleRequestForUser } from "@/server/roleRequests/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  try {
    const latest = await getLatestRoleRequestForUser(ctx.uid);
    return jsonOk({ request: latest });
  } catch (err) {
    console.error("role-request get failed", err);
    return jsonError(500, "failed");
  }
}

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (ctx.role !== "student") return jsonError(403, "only students may request role");

  let body: { requestedRole?: string; reason?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }

  const requestedRole = body.requestedRole;
  const reason = (body.reason ?? "").toString().trim();
  if (requestedRole !== "council" && requestedRole !== "teacher") {
    return jsonError(400, "requestedRole must be council or teacher");
  }
  if (reason.length > 300) return jsonError(400, "reason max 300 chars");

  try {
    const r = await createRoleRequest(ctx.uid, requestedRole, reason);
    return jsonOk({ id: r.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    if (msg === "pending_exists") return jsonError(409, "request already pending");
    if (msg === "cooldown") return jsonError(429, "cooldown after denial; try again in 7 days");
    if (msg === "invalid_role") return jsonError(400, "invalid role");
    console.error("role-request create failed", err);
    return jsonError(500, "failed");
  }
}
