import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { canApprove } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { endSession } from "@/server/approver/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!canApprove(ctx.role)) return jsonError(403, "forbidden");

  const { id } = await params;
  try {
    await endSession(id, ctx.uid);
    return jsonOk({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    if (msg === "not_found") return jsonError(404, "session not found");
    if (msg === "forbidden") return jsonError(403, "not session owner");
    console.error("approver session end failed", err);
    return jsonError(500, msg);
  }
}
