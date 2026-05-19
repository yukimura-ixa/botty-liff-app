import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { listRoleChanges } from "@/server/user/role-changes";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? Math.floor(limitRaw) : 50;
  const targetUid = url.searchParams.get("targetUid");
  try {
    const changes = await listRoleChanges(targetUid, limit);
    return jsonOk({ changes });
  } catch (err) {
    console.error("role-changes query failed", err);
    return jsonError(500, "query");
  }
}
