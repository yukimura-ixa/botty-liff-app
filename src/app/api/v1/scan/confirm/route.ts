import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { fbFirestore } from "@/server/lib/firebase";
import { verifyBinToken } from "@/server/scan/bin-token";
import { awardFromPending } from "@/server/scan/award";
import {
  PENDING_COL, PENDING_STATUS_AWAITING, PENDING_STATUS_CONFIRMED,
  ERR_PENDING_NOT_FOUND, ERR_PENDING_EXPIRED, ERR_PENDING_WRONG_USER, ERR_PENDING_ALREADY_CONFIRMED, PendingError,
} from "@/server/scan/pending";
import { bustLeaderboardCaches } from "@/server/lib/leaderboard-cache-bus";
import type { PendingDoc } from "@/server/scan/build";

export const runtime = "nodejs";
export const maxDuration = 15;

type Mode = "off" | "log" | "enforce";
function mode(): Mode {
  const m = (process.env.BIN_CONFIRM_MODE ?? "log") as Mode;
  return m === "off" || m === "enforce" ? m : "log";
}

export async function POST(req: NextRequest) {
  if (mode() === "off") return new Response(JSON.stringify({ error: "confirm disabled" }), {
    status: 410, headers: { "Content-Type": "application/json" },
  });

  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }

  let body: { pendingId?: string; binToken?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (!body.pendingId || !body.binToken) return jsonError(400, "pendingId and binToken required");

  const secret = Buffer.from(process.env.BIN_HMAC_SECRET ?? "");
  if (secret.length < 16) return jsonError(500, "server misconfigured");

  let binId: string;
  try { binId = verifyBinToken(secret, body.binToken); }
  catch { return jsonError(400, "invalid bin token"); }

  const fs = fbFirestore();
  let pendingForAward: PendingDoc | null = null;
  try {
    await fs.runTransaction(async (tx) => {
      const ref = fs.collection(PENDING_COL).doc(body.pendingId!);
      const snap = await tx.get(ref);
      if (!snap.exists) throw ERR_PENDING_NOT_FOUND;
      const p = snap.data() as PendingDoc & { expiresAt: { toDate?: () => Date } | Date };
      if (p.uid !== ctx.uid) throw ERR_PENDING_WRONG_USER;
      if (p.status !== PENDING_STATUS_AWAITING) throw ERR_PENDING_ALREADY_CONFIRMED;
      const expiresAt = "toDate" in p.expiresAt && typeof p.expiresAt.toDate === "function"
        ? p.expiresAt.toDate()
        : (p.expiresAt as Date);
      if (Date.now() > expiresAt.getTime()) throw ERR_PENDING_EXPIRED;

      const binSnap = await tx.get(fs.collection("bins").doc(binId));
      if (!binSnap.exists) throw new PendingError(400, "bin not found");
      const bin = binSnap.data() as { active?: boolean };
      if (!bin.active) throw new PendingError(400, "bin inactive");

      pendingForAward = {
        ...p,
        expiresAt,
        capturedAt: (p.capturedAt instanceof Date ? p.capturedAt : new Date(p.capturedAt as unknown as string)),
      };

      tx.update(ref, {
        status: PENDING_STATUS_CONFIRMED,
        binId,
        confirmedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (e) {
    if (e instanceof PendingError) return jsonError(e.status, e.message);
    console.error("confirm tx failed", e);
    return jsonError(500, "confirm failed");
  }

  if (mode() === "enforce" && pendingForAward !== null) {
    try { await awardFromPending(ctx.uid, pendingForAward); }
    catch (err) {
      console.error("award from pending failed", err);
      return jsonError(500, "award failed");
    }
    bustLeaderboardCaches();
  }
  return jsonOk({ ok: true, binId });
}
