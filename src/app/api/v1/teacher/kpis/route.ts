import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getKPIs } from "@/server/teacher/kpis";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "teacher")) return jsonError(403, "forbidden");
  try {
    const kpis = await getKPIs();
    return jsonOk(kpis);
  } catch (err) {
    console.error("kpis failed", err);
    return jsonError(500, "kpi query");
  }
}
