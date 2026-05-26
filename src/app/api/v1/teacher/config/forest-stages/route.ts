import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { validThresholds, type ForestConfig } from "@/server/forestconfig/validate";
import { updateForestStages } from "@/server/forestconfig/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function PUT(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");
  let body: unknown;
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (!body || typeof body !== "object" || !("thresholds" in body)) {
    return jsonError(400, "thresholds must be array of exactly 3 numbers");
  }
  const t = (body as { thresholds: unknown }).thresholds;
  if (!validThresholds(t)) return jsonError(400, "thresholds must be array of exactly 3 numbers");
  await updateForestStages(t);
  const cfg: ForestConfig = { thresholds: t };
  return jsonOk(cfg);
}
