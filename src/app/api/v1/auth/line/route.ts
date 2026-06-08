import { NextRequest } from "next/server";
import { verifyLineIdToken } from "@/server/lib/line";
import { fbAuth } from "@/server/lib/firebase";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getUser } from "@/server/user/repo";
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
  // No user doc is created here. A brand-new LINE user gets a custom token and
  // onboarded=false, which routes them to /onboard; the Firestore doc is written
  // only when they submit onboarding. This avoids accumulating blank-name,
  // pending_onboard "ghost" accounts for anyone who opens the app and bounces.
  const prof = await getUser(uid);
  const role = prof?.role ?? "student";
  const onboarded = prof?.status === "active";

  const customToken = await fbAuth().createCustomToken(uid, { role });
  return jsonOk({ customToken, role, onboarded });
}
