import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getUser } from "@/server/user/repo";
import { sevenDaySeries } from "@/server/teacher/students";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "teacher")) return jsonError(403, "forbidden");
  const { uid } = await params;
  const prof = await getUser(uid);
  if (!prof) return jsonError(404, "not found");
  const series = await sevenDaySeries(uid).catch(() => [] as number[]);
  return jsonOk({ profile: prof, series7: series });
}
