import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { listClasses } from "@/server/classes/repo";

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
    const classes = await listClasses();
    return jsonOk({ classes });
  } catch (err) {
    console.error("classes list failed", err);
    return jsonError(500, "failed to list classes");
  }
}
