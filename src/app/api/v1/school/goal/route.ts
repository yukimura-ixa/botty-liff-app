import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getSchoolGoal } from "@/server/school/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  try {
    await verifyBearerToken(req);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  try {
    const goal = await getSchoolGoal();
    return jsonOk(goal);
  } catch (err) {
    console.error("school goal fetch failed", err);
    return jsonError(500, "goal fetch");
  }
}
