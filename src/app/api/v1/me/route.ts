import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { ensureAdminRole, getUser, isAdminSeed } from "@/server/user/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await verifyBearerToken(req);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (isAdminSeed(ctx.uid)) {
    await ensureAdminRole(ctx.uid).catch((err) =>
      console.error("admin bootstrap failed", ctx.uid, err),
    );
  }
  const prof = await getUser(ctx.uid);
  if (!prof) return jsonError(404, "not found");
  return jsonOk(prof);
}
