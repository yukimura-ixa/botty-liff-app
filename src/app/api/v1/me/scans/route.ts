import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOkCached } from "@/server/lib/http";
import { listMyScans } from "@/server/scan/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? Math.floor(limitRaw) : 20;
  const cursor = url.searchParams.get("cursor");

  try {
    const r = await listMyScans(ctx.uid, limit, cursor);
    return jsonOkCached(r, { maxAge: 15, swr: 60 });
  } catch (err) {
    console.error("scan history failed", err);
    return jsonError(500, "query");
  }
}
