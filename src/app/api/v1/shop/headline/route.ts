import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { setHeadline } from "@/server/shop/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  let body: { itemId?: unknown };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (typeof body.itemId !== "string") return jsonError(400, "itemId required");

  const result = await setHeadline(ctx.uid, body.itemId);
  if (!result.ok) return jsonError(409, result.code);
  return jsonOk({ headlineTree: body.itemId });
}
