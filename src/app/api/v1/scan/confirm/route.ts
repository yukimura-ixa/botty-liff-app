import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { fbFirestore } from "@/server/lib/firebase";
import { verifySlotToken } from "@/server/approver/token";
import { claimSlot } from "@/server/approver/repo";
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
  // Default switched to enforce: students earn points only after staff QR scan.
  const m = (process.env.BIN_CONFIRM_MODE ?? "enforce") as Mode;
  return m === "off" || m === "log" ? m : "enforce";
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

  let body: { pendingId?: string; approverToken?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (!body.pendingId || !body.approverToken) return jsonError(400, "pendingId and approverToken required");

  const secret = Buffer.from(process.env.STAFF_QR_SECRET ?? "");
  if (secret.length < 16) return jsonError(500, "server misconfigured");

  let claims;
  try { claims = verifySlotToken(secret, body.approverToken); }
  catch { return jsonError(400, "invalid approver token"); }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec < claims.validFrom) return jsonError(400, "approver token not yet valid");
  if (nowSec > claims.validUntil) return jsonError(400, "approver token expired");

  // Pre-validate the pending BEFORE claiming a slot, so a stale/expired/foreign
  // pending doesn't burn an approver slot and lock the student out of the session.
  // The authoritative transaction below re-checks under lock.
  {
    const snap = await fbFirestore().collection(PENDING_COL).doc(body.pendingId!).get();
    if (!snap.exists) return jsonError(ERR_PENDING_NOT_FOUND.status, ERR_PENDING_NOT_FOUND.message);
    const p = snap.data() as { uid?: string; status?: string; awarded?: boolean; expiresAt?: { toDate?: () => Date } | Date };
    if (p.uid !== ctx.uid) return jsonError(ERR_PENDING_WRONG_USER.status, ERR_PENDING_WRONG_USER.message);
    const alreadyConfirmed = p.status === PENDING_STATUS_CONFIRMED;
    if (alreadyConfirmed && p.awarded === true) return jsonError(ERR_PENDING_ALREADY_CONFIRMED.status, ERR_PENDING_ALREADY_CONFIRMED.message);
    if (!alreadyConfirmed && p.status !== PENDING_STATUS_AWAITING) return jsonError(ERR_PENDING_ALREADY_CONFIRMED.status, ERR_PENDING_ALREADY_CONFIRMED.message);
    if (!alreadyConfirmed && p.expiresAt) {
      const exp = (p.expiresAt as { toDate?: () => Date }).toDate?.() ?? (p.expiresAt as Date);
      if (Date.now() > exp.getTime()) return jsonError(ERR_PENDING_EXPIRED.status, ERR_PENDING_EXPIRED.message);
    }
  }

  let staffUid: string;
  try {
    const r = await claimSlot(claims.sessionId, claims.slot, ctx.uid, body.pendingId);
    staffUid = r.staffUid;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "claim failed";
    if (msg === "session_not_found") return jsonError(400, "approver session not found");
    if (msg === "session_ended") return jsonError(400, "approver session ended");
    if (msg === "session_expired") return jsonError(400, "approver session expired");
    if (msg === "slot_used") return jsonError(409, "QR ถูกใช้ไปแล้ว ขอ QR ใหม่จากเจ้าหน้าที่");
    if (msg === "student_already_awarded") return jsonError(409, "คุณได้รับคะแนนจากรอบนี้แล้ว ขอ QR ใหม่จากเจ้าหน้าที่ในรอบถัดไป");
    console.error("claim slot failed", e);
    return jsonError(500, "claim failed");
  }

  const fs = fbFirestore();
  let pendingForAward: PendingDoc | null = null;
  try {
    await fs.runTransaction(async (tx) => {
      const ref = fs.collection(PENDING_COL).doc(body.pendingId!);
      const snap = await tx.get(ref);
      if (!snap.exists) throw ERR_PENDING_NOT_FOUND;
      const p = snap.data() as Omit<PendingDoc, "status"> & { status: string; expiresAt: { toDate?: () => Date } | Date; awarded?: boolean };
      if (p.uid !== ctx.uid) throw ERR_PENDING_WRONG_USER;
      const alreadyConfirmed = p.status === PENDING_STATUS_CONFIRMED;
      if (alreadyConfirmed && p.awarded === true) throw ERR_PENDING_ALREADY_CONFIRMED;
      if (!alreadyConfirmed && p.status !== PENDING_STATUS_AWAITING) throw ERR_PENDING_ALREADY_CONFIRMED;
      const expiresAt = "toDate" in p.expiresAt && typeof p.expiresAt.toDate === "function"
        ? p.expiresAt.toDate()
        : (p.expiresAt as Date);
      if (!alreadyConfirmed && Date.now() > expiresAt.getTime()) throw ERR_PENDING_EXPIRED;

      const rawCaptured = p.capturedAt as unknown;
      const capturedAt =
        rawCaptured instanceof Date
          ? rawCaptured
          : (rawCaptured && typeof rawCaptured === "object" && "toDate" in rawCaptured && typeof (rawCaptured as { toDate: () => Date }).toDate === "function"
              ? (rawCaptured as { toDate: () => Date }).toDate()
              : new Date(rawCaptured as string));
      pendingForAward = {
        ...p,
        status: PENDING_STATUS_AWAITING,
        expiresAt,
        capturedAt,
      };

      if (!alreadyConfirmed) {
        tx.update(ref, {
          status: PENDING_STATUS_CONFIRMED,
          approverUid: staffUid,
          approverSessionId: claims.sessionId,
          approverSlot: claims.slot,
          confirmedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (e) {
    if (e instanceof PendingError) return jsonError(e.status, e.message);
    console.error("confirm tx failed", e);
    return jsonError(500, "confirm failed");
  }

  if (mode() === "enforce" && pendingForAward !== null) {
    try { await awardFromPending(ctx.uid, pendingForAward, body.pendingId!); }
    catch (err) {
      console.error("award from pending failed", err);
      return jsonError(500, "award failed");
    }
    bustLeaderboardCaches();
  }
  return jsonOk({ ok: true, approverUid: staffUid, sessionId: claims.sessionId });
}
