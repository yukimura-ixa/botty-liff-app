import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonNoStore } from "@/server/lib/http";
import { listAdjustments } from "@/server/teacher/adjustments-query";

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
  try {
    const rows = await listAdjustments({
      targetUid: url.searchParams.get("targetUid") ?? undefined,
      teacherUid: url.searchParams.get("teacherUid") ?? undefined,
      limit,
    });
    return jsonNoStore({ adjustments: rows });
  } catch (err) {
    console.error("adjustments list failed", err);
    return jsonError(500, "query");
  }
}
