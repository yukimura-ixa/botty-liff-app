import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { canApprove } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { createSession } from "@/server/approver/repo";
import { mintSessionTokens } from "@/server/approver/mint";

export const runtime = "nodejs";
export const maxDuration = 15;

function staffSecret(): Buffer {
  const raw = process.env.STAFF_QR_SECRET;
  if (!raw) throw new Error("STAFF_QR_SECRET not configured");
  return Buffer.from(raw, "utf8");
}

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!canApprove(ctx.role)) return jsonError(403, "forbidden");

  try {
    const session = await createSession(ctx.uid);
    const tokens = mintSessionTokens(session.id, session.startedAtMs, staffSecret());
    return jsonOk({
      sessionId: session.id,
      startedAt: new Date(session.startedAtMs).toISOString(),
      expiresAt: new Date(session.expiresAtMs).toISOString(),
      tokens,
    });
  } catch (err) {
    console.error("approver session create failed", err);
    return jsonError(500, err instanceof Error ? err.message : "failed");
  }
}
