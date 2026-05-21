import { NextRequest } from "next/server";
import { verifyLineIdToken } from "@/server/lib/line";
import { fbAuth } from "@/server/lib/firebase";
import { jsonError, jsonOk } from "@/server/lib/http";
import { createPending, getUser } from "@/server/user/repo";
import { ipAuthLimiter, clientIp, rateLimitResponse } from "@/server/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const ipCheck = ipAuthLimiter.take(clientIp(req));
  if (!ipCheck.ok) return rateLimitResponse(ipCheck.retryAfterSec);

  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) return jsonError(500, "server misconfigured");

  let body: { idToken?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid json");
  }
  const idToken = body.idToken;
  if (!idToken) return jsonError(400, "idToken required");

  let claims;
  try {
    claims = await verifyLineIdToken(idToken, channelId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "verify failed";
    return jsonError(401, `invalid LINE token: ${msg}`);
  }

  const uid = `line:${claims.sub}`;
  let prof = await getUser(uid);
  let role = "student";
  let onboarded = false;
  if (!prof) {
    prof = await createPending(claims.sub);
  } else {
    role = prof.role;
    onboarded = prof.status === "active";
  }

  const customToken = await fbAuth().createCustomToken(uid, { role });
  return jsonOk({ customToken, role, onboarded });
}
