import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOkCached } from "@/server/lib/http";
import { getForestStages } from "@/server/forestconfig/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  try {
    await verifyBearerToken(req);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  const cfg = await getForestStages();
  return jsonOkCached(cfg, { maxAge: 300, swr: 600 });
}
