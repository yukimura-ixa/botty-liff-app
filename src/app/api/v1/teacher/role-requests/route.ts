import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonNoStore } from "@/server/lib/http";
import { listPendingRoleRequests } from "@/server/roleRequests/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "teacher")) return jsonError(403, "forbidden");

  try {
    const all = await listPendingRoleRequests();
    const requests = all.filter((r) => r.requestedRole === "council");
    return jsonNoStore({ requests });
  } catch (err) {
    console.error("teacher role-requests list failed", err);
    return jsonError(500, "failed");
  }
}
