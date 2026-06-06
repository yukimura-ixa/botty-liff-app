import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { setDisplayedDecorations } from "@/server/garden/display-repo";

export const runtime = "nodejs";
export const maxDuration = 10;

// Set which owned decorations are placed on the student's garden plot.
export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }

  let body: { decorations?: unknown };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }

  const result = await setDisplayedDecorations(ctx.uid, body.decorations);
  if (!result.ok) {
    const status = result.code === "not_owned" ? 409 : 400;
    return jsonError(status, result.code);
  }
  return jsonOk({ displayedDecorations: result.displayedDecorations });
}
