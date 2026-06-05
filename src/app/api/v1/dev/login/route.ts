import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/server/lib/http";
import { fbAuth } from "@/server/lib/firebase";
import { findDevAccount } from "@/server/dev/accounts";

export const runtime = "nodejs";
export const maxDuration = 10;

// DEV-ONLY. Mints a Firebase custom token for a seeded dev account so you can
// sign in as any role locally without a LINE login. Hard-disabled in production.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return jsonError(404, "not found");

  let body: { uid?: unknown };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (typeof body.uid !== "string") return jsonError(400, "uid required");

  const acct = findDevAccount(body.uid);
  if (!acct) return jsonError(404, "unknown dev account");

  // The role claim is what verifyBearerToken reads; the seeded Firestore doc
  // carries the same role so fresh-role checks on privileged routes pass too.
  const customToken = await fbAuth().createCustomToken(acct.uid, { role: acct.role });
  return jsonOk({ customToken, role: acct.role });
}
