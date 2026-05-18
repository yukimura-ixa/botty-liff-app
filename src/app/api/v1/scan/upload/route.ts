import { NextRequest } from "next/server";
import { ulid } from "ulidx";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getUser } from "@/server/user/repo";
import { bangkokDate } from "@/server/scan/time";
import { computeStreak } from "@/server/scan/streak";
import { rankForPoints } from "@/server/scan/rank";
import { calculatePoints, DEFAULT_POINTS_CONFIG } from "@/server/scan/points";
import { imageHash } from "@/server/scan/hash";
import { detect, detectorConfigFromEnv } from "@/server/scan/detect";
import { uploadScanImage } from "@/server/scan/storage";
import { buildPendingDoc, PENDING_TTL_MS } from "@/server/scan/build";
import { createPending, hasOutstandingPending } from "@/server/scan/pending";
import { awardScan } from "@/server/scan/award";
import { isDuplicateScan } from "@/server/scan/repo";
import { bustLeaderboardCaches } from "@/server/lib/leaderboard-cache-bus";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const COOLDOWN_MS = 60_000;
const DAILY_LIMIT = 20;
type Mode = "off" | "log" | "enforce";

function mode(): Mode {
  const m = (process.env.BIN_CONFIRM_MODE ?? "log") as Mode;
  return m === "off" || m === "enforce" ? m : "log";
}

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }

  let form: FormData;
  try { form = await req.formData(); }
  catch { return jsonError(400, "invalid multipart"); }

  const file = form.get("image");
  if (!(file instanceof Blob)) return jsonError(400, "missing image");
  if (file.size > MAX_IMAGE_BYTES) return jsonError(413, "image too large");

  const buf = Buffer.from(await file.arrayBuffer());
  const clientConf = Number(form.get("clientConfidence") ?? 0) || 0;
  const localDate = bangkokDate(new Date());

  const prof = await getUser(ctx.uid);
  if (!prof) return jsonError(404, "profile");

  if (prof.lastScanAt) {
    const last = prof.lastScanAt instanceof Date ? prof.lastScanAt : new Date(prof.lastScanAt as unknown as string);
    const wait = COOLDOWN_MS - (Date.now() - last.getTime());
    if (wait > 0) {
      return new Response(JSON.stringify({ error: "cooldown", retryAfter: Math.ceil(wait / 1000) }), {
        status: 429, headers: { "Content-Type": "application/json" },
      });
    }
  }
  if (prof.dailyScanDate === localDate && (prof.dailyScans ?? 0) >= DAILY_LIMIT) {
    return new Response(JSON.stringify({ error: "daily_limit", limit: DAILY_LIMIT }), {
      status: 429, headers: { "Content-Type": "application/json" },
    });
  }

  const hash = imageHash(buf);
  if (await isDuplicateScan(ctx.uid, hash)) return jsonError(409, "duplicate scan");

  let det;
  try { det = await detect(detectorConfigFromEnv(), buf); }
  catch (err) {
    console.error("detector error", ctx.uid, err);
    return jsonError(500, "detector error");
  }
  if (!det.accepted) {
    return new Response(JSON.stringify({ error: "not a PET bottle", confidence: det.confidence }), {
      status: 422, headers: { "Content-Type": "application/json" },
    });
  }

  const scanId = ulid();
  let gcsPath: string;
  try { gcsPath = await uploadScanImage(ctx.uid, scanId, buf); }
  catch (err) {
    console.error("gcs upload error", ctx.uid, err);
    return jsonError(500, "storage");
  }
  const capturedAt = new Date();
  const pendingId = ulid();
  const m = mode();

  if (m !== "off") {
    const outstanding = await hasOutstandingPending(ctx.uid);
    if (outstanding) {
      const expiresInSec = Math.max(0, Math.ceil((outstanding.expiresAt.getTime() - Date.now()) / 1000));
      return new Response(JSON.stringify({ error: "pending_exists", pendingId: outstanding.id, expiresInSec }), {
        status: 409, headers: { "Content-Type": "application/json" },
      });
    }
  }

  const newStreak = computeStreak(prof.streakDays ?? 0, prof.lastScanLocalDate ?? "", localDate);
  const isFirstOfDay = prof.dailyScanDate !== localDate;
  const newDaily = isFirstOfDay ? 1 : (prof.dailyScans ?? 0) + 1;
  const pt = calculatePoints(DEFAULT_POINTS_CONFIG, newStreak, isFirstOfDay);
  const newTotal = (prof.totalPoints ?? 0) + pt.total;
  const newRank = rankForPoints(newTotal);

  const awardArgs = {
    uid: ctx.uid,
    classKey: prof.classKey ?? "",
    detectedClass: det.class,
    itemCount: det.itemCount,
    basePoints: pt.basePoints,
    streakBonus: pt.streakBonus,
    totalPoints: pt.total,
    confidence: det.confidence,
    clientConf,
    imagePath: gcsPath,
    imageHash: hash,
    capturedAt,
    localDate,
    scanId,
    newStreak,
    newDaily,
    newRank,
  };

  if (m === "off" || m === "log") {
    await awardScan(awardArgs);
    bustLeaderboardCaches();
  }

  if (m === "log" || m === "enforce") {
    await createPending(pendingId, buildPendingDoc({
      uid: ctx.uid,
      classKey: prof.classKey ?? "",
      scanId,
      detectedClass: det.class,
      itemCount: det.itemCount,
      confidence: det.confidence,
      basePoints: pt.basePoints,
      streakBonus: pt.streakBonus,
      totalPoints: pt.total,
      isFirstOfDay,
      localDate,
      streakDays: newStreak,
      newDailyCount: newDaily,
      newTotalPoints: newTotal,
      newRank,
      prevRank: prof.rank ?? "ต้นกล้า",
      imagePath: gcsPath,
      imageHash: hash,
      capturedAt,
    })).catch((err) => console.error("pending create failed", err));
  }

  if (m === "off") {
    return jsonOk({
      scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
      basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
      newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
    });
  }
  if (m === "log") {
    return jsonOk({
      pendingId, expiresInSec: Math.floor(PENDING_TTL_MS / 1000),
      scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
      basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
      newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
    });
  }
  return jsonOk({
    pendingId, expiresInSec: Math.floor(PENDING_TTL_MS / 1000),
    detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
  });
}
