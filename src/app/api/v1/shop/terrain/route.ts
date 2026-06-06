import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { setActiveTerrain } from "@/server/shop/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  let body: { terrainId?: unknown };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (typeof body.terrainId !== "string") return jsonError(400, "terrainId required");

  const result = await setActiveTerrain(ctx.uid, body.terrainId);
  if (!result.ok) return jsonError(409, result.code);
  return jsonOk({ activeTerrain: body.terrainId });
}
