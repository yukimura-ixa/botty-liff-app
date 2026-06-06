import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { setDecorationLayout } from "@/server/garden/layout-repo";

export const runtime = "nodejs";
export const maxDuration = 10;

// Set the positioned decoration layout on the student's garden plot.
export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  let body: { layout?: unknown };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }

  const result = await setDecorationLayout(ctx.uid, body.layout);
  if (!result.ok) {
    const status = result.code === "not_owned" ? 409 : 400;
    return jsonError(status, result.code);
  }
  return jsonOk({ decorationLayout: result.decorationLayout });
}
