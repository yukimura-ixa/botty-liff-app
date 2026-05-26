import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOkCached } from "@/server/lib/http";
import { listStudents } from "@/server/user/list";

export const runtime = "nodejs";
export const maxDuration = 15;

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
    const r = await listStudents({
      classKey: url.searchParams.get("classKey") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      limit,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });
    return jsonOkCached(r, { maxAge: 30, swr: 120 });
  } catch (err) {
    console.error("students list failed", err);
    return jsonError(500, "list");
  }
}
