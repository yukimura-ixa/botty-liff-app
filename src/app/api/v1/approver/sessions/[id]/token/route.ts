import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { canApprove } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getSession } from "@/server/approver/repo";
import { currentSlotToken } from "@/server/approver/mint";
import { staffSecret } from "@/server/approver/secret";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!canApprove(ctx.role)) return jsonError(403, "forbidden");

  const { id } = await params;
  let session;
  try { session = await getSession(id); }
  catch (err) {
    console.error("approver token fetch failed", err);
    return jsonError(500, "failed");
  }
  if (!session) return jsonError(404, "session not found");
  if (session.staffUid !== ctx.uid) return jsonError(403, "not session owner");
  if (session.endedAtMs !== null) return jsonError(410, "session ended");
  if (Date.now() > session.expiresAtMs) return jsonError(410, "session expired");

  let minted;
  try {
    minted = currentSlotToken(session.id, session.startedAtMs, staffSecret(), Date.now());
  } catch (err) {
    console.error("approver token mint failed", err);
    return jsonError(500, "server misconfigured");
  }
  return jsonOk({
    token: minted.token,
    slot: minted.slot,
    validFrom: minted.validFrom,
    validUntil: minted.validUntil,
    awardsCount: session.awardsCount,
  });
}
