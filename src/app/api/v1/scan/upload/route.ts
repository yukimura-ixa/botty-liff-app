import { NextRequest } from "next/server";
import { ulid } from "ulidx";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getUser } from "@/server/user/repo";
import { bangkokDate } from "@/server/scan/time";
import { computeStreak } from "@/server/scan/streak";
import { rankForPoints } from "@/server/scan/rank";
import { calculatePoints, DEFAULT_POINTS_CONFIG } from "@/server/scan/points";
import { imageHash, perceptualHash, phashBucket } from "@/server/scan/hash";
import { detect, detectorConfigFromEnv, type DetectResult } from "@/server/scan/detect";
import { uploadScanImage } from "@/server/scan/storage";
import { awardScan } from "@/server/scan/award";
import { isDuplicateScan, getStoredScan, type StoredScan } from "@/server/scan/repo";
import { isValidScanId } from "@/server/scan/scan-id";
import { recordPreviewScan } from "@/server/scan/preview";
import { bustLeaderboardCaches } from "@/server/lib/leaderboard-cache-bus";
import { ipScanLimiter, clientIp, rateLimitResponse } from "@/server/lib/rate-limit";
import { logScanAttempt, logScanEvent } from "@/server/scan/log";
import { coinReward } from "@/server/shop/earn";
import { createPending, hasOutstandingPending } from "@/server/scan/pending";
import { buildPendingDoc, PENDING_TTL_MS } from "@/server/scan/build";
import { cooldownMs, remainingBottles } from "@/server/scan/cooldown";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 4 * 1024;

type ConfirmMode = "off" | "log" | "enforce";
function confirmMode(): ConfirmMode {
  const m = (process.env.BIN_CONFIRM_MODE ?? "enforce") as ConfirmMode;
  return m === "off" || m === "log" ? m : "enforce";
}

function sniffImageMime(buf: Buffer): "image/jpeg" | "image/png" | null {
  if (buf.length < 8) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";
  return null;
}

// Replay of an already-awarded scan (slow-network retry / concurrent double-submit).
// Points are NOT re-awarded; "new" totals/rank reflect the user's current profile,
// and rank-up is suppressed (prev === new). annotatedImage is not persisted, so omit.
function replayResult(scanId: string, s: StoredScan, prof: { totalPoints?: number; streakDays?: number; rank?: string }) {
  const pointedItems = Math.min(
    DEFAULT_POINTS_CONFIG.maxItemsPerScan,
    Math.max(1, Number.isFinite(s.itemCount) ? Math.floor(s.itemCount) : 1),
  );
  const rank = prof.rank ?? "ต้นกล้า";
  return {
    scanId,
    detectedClass: s.detectedClass,
    confidence: s.confidence,
    itemCount: s.itemCount,
    pointedItems,
    basePoints: s.basePoints,
    streakBonus: s.streakBonus,
    totalPoints: s.totalPoints,
    newTotalPoints: prof.totalPoints ?? 0,
    streakDays: prof.streakDays ?? 0,
    prevRank: rank,
    newRank: rank,
    awarded: true,
  };
}

// Log a rejected_not_pet attempt with diagnostics. For a no_match rejection
// det.confidence/class are empty, so fall back to the model's top guess
// (observedClass/observedConfidence) — that makes a class-label config mismatch
// (model emits "pet-bottle" while ROBOFLOW_BOTTLE_CLASS expects "PET Bottle")
// visible in the Scan Logs UI instead of looking like a genuine rejection.
// Shared by the preview (non-student) and student paths so both stay diagnosable.
async function logRejectedNotPet(args: {
  scanId: string;
  uid: string;
  classKey: string;
  localDate: string;
  clientConf: number;
  det: DetectResult;
}): Promise<void> {
  const { det } = args;
  await logScanAttempt({
    scanId: args.scanId, uid: args.uid, classKey: args.classKey,
    outcome: "rejected_not_pet",
    at: new Date(), localDate: args.localDate,
    confidence: det.confidence || det.observedConfidence,
    clientConf: args.clientConf,
    itemCount: det.itemCount, detectedClass: det.class || det.observedClass,
    rejectReason: det.rejectReason,
  });
}

export async function POST(req: NextRequest) {
  const ipCheck = ipScanLimiter.take(clientIp(req));
  if (!ipCheck.ok) {
    logScanEvent("ip_rate", { reason: `retryAfter=${ipCheck.retryAfterSec}` });
    return rateLimitResponse(ipCheck.retryAfterSec);
  }

  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) {
      logScanEvent("auth", { reason: `${e.status} ${e.message}` });
      return jsonError(e.status, e.message);
    }
    logScanEvent("auth", { err: e });
    return jsonError(500, "auth");
  }

  let form: FormData;
  try { form = await req.formData(); }
  catch {
    logScanEvent("bad_request", { uid: ctx.uid, reason: "invalid multipart" });
    return jsonError(400, "invalid multipart");
  }

  const file = form.get("image");
  if (!(file instanceof Blob)) {
    logScanEvent("bad_image", { uid: ctx.uid, reason: "missing image" });
    return jsonError(400, "missing image");
  }
  if (file.size === 0) {
    logScanEvent("bad_image", { uid: ctx.uid, reason: "empty image" });
    return jsonError(400, "empty image");
  }
  if (file.size < MIN_IMAGE_BYTES) {
    logScanEvent("bad_image", { uid: ctx.uid, reason: "image too small" });
    return jsonError(400, "image too small");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    logScanEvent("bad_image", { uid: ctx.uid, reason: "image too large" });
    return jsonError(413, "image too large");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    logScanEvent("bad_image", { uid: ctx.uid, reason: "empty buffer" });
    return jsonError(400, "empty image");
  }
  if (!sniffImageMime(buf)) {
    logScanEvent("bad_image", { uid: ctx.uid, reason: "unsupported image format" });
    return jsonError(400, "unsupported image format (need JPEG or PNG)");
  }
  const clientConf = Number(form.get("clientConfidence") ?? 0) || 0;
  // Client-generated idempotency key (one per captured photo). Falls back to a
  // server ulid for older clients that don't send one.
  const formScanId = form.get("scanId");
  const scanId = isValidScanId(formScanId) ? formScanId : ulid();
  const localDate = bangkokDate(new Date());

  const prof = await getUser(ctx.uid);
  if (!prof) {
    logScanEvent("no_profile", { uid: ctx.uid, scanId });
    return jsonError(404, "profile");
  }
  const SCAN_ELIGIBLE_ROLES = new Set(["student", "admin"]);
  if (!SCAN_ELIGIBLE_ROLES.has(prof.role) || prof.status !== "active") {
    logScanEvent("not_eligible", {
      uid: ctx.uid,
      scanId,
      reason: `role=${prof.role} status=${prof.status}`,
    });
    return jsonError(403, "not eligible");
  }

  if (prof.role !== "student") {
    let det;
    try { det = await detect(detectorConfigFromEnv(), buf); }
    catch (err) {
      logScanEvent("error_detector", { uid: ctx.uid, scanId, err });
      return jsonError(500, "detector error");
    }
    if (!det.accepted) {
      await logRejectedNotPet({ scanId, uid: ctx.uid, classKey: prof.classKey ?? "", localDate, clientConf, det });
      return new Response(JSON.stringify({ error: "not a PET bottle", confidence: det.confidence }), {
        status: 422, headers: { "Content-Type": "application/json" },
      });
    }
    let imageUrl: string;
    try { imageUrl = await uploadScanImage(ctx.uid, scanId, buf); }
    catch (err) {
      logScanEvent("error_storage", { uid: ctx.uid, scanId, err });
      return jsonError(500, "storage");
    }
    const capturedAt = new Date();
    const hash = imageHash(buf);
    let phash: string | undefined;
    try { phash = await perceptualHash(buf); } catch { /* best-effort */ }
    const phashBkt = phash ? phashBucket(phash) : undefined;
    const rawItems = Number.isFinite(det.itemCount) ? Math.floor(det.itemCount) : 1;
    const pointedItems = Math.min(DEFAULT_POINTS_CONFIG.maxItemsPerScan, Math.max(1, rawItems));

    try {
      await recordPreviewScan({
        uid: ctx.uid,
        scanId,
        classKey: prof.classKey ?? "",
        detectedClass: det.class,
        itemCount: det.itemCount,
        confidence: det.confidence,
        clientConf,
        imagePath: imageUrl,
        imageHash: hash,
        phash,
        phashBucket: phashBkt,
        capturedAt,
        localDate,
      });
    } catch (err) {
      logScanEvent("error_preview", { uid: ctx.uid, scanId, err });
      return jsonError(500, "preview write");
    }

    await logScanAttempt({
      scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
      outcome: "preview",
      at: capturedAt, localDate,
      itemCount: det.itemCount, detectedClass: det.class,
      confidence: det.confidence, clientConf,
    });
    return jsonOk({
      scanId,
      detectedClass: det.class,
      confidence: det.confidence,
      itemCount: det.itemCount,
      pointedItems,
      basePoints: 0,
      streakBonus: 0,
      totalPoints: 0,
      newTotalPoints: prof.totalPoints ?? 0,
      streakDays: prof.streakDays ?? 0,
      prevRank: prof.rank ?? "ต้นกล้า",
      newRank: prof.rank ?? "ต้นกล้า",
      awarded: false,
      preview: true,
      annotatedImage: det.annotatedImage,
    });
  }

  // Idempotent replay: same captured photo resubmitted (slow-network retry).
  // Checked before cooldown so a retry of a scan that already succeeded returns
  // its result instead of a confusing 429, and skips the detector + upload cost.
  const prior = await getStoredScan(scanId);
  if (prior) {
    if (prior.uid !== ctx.uid) return jsonError(409, "duplicate scan");
    await logScanAttempt({
      scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
      outcome: "replay",
      at: new Date(), localDate,
      basePoints: prior.basePoints, streakBonus: prior.streakBonus, totalPoints: prior.totalPoints,
      itemCount: prior.itemCount, detectedClass: prior.detectedClass, confidence: prior.confidence,
    });
    return jsonOk(replayResult(scanId, prior, prof));
  }

  const sameDay = prof.dailyScanDate === localDate;
  const scansToday = sameDay ? (prof.dailyScans ?? 0) : 0;
  const bottlesToday = sameDay ? (prof.dailyBottles ?? 0) : 0;

  if (prof.lastScanAt) {
    const last = prof.lastScanAt instanceof Date ? prof.lastScanAt : new Date(prof.lastScanAt as unknown as string);
    const wait = cooldownMs(scansToday) - (Date.now() - last.getTime());
    if (wait > 0) {
      await logScanAttempt({
        scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
        outcome: "denied_cooldown",
        at: new Date(), localDate,
      });
      return new Response(JSON.stringify({ error: "cooldown", retryAfter: Math.ceil(wait / 1000) }), {
        status: 429, headers: { "Content-Type": "application/json" },
      });
    }
  }
  if (remainingBottles(bottlesToday) <= 0) {
    await logScanAttempt({
      scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
      outcome: "denied_daily_cap",
      at: new Date(), localDate,
    });
    return new Response(JSON.stringify({ error: "daily_limit", limit: 10 }), {
      status: 429, headers: { "Content-Type": "application/json" },
    });
  }

  const hash = imageHash(buf);
  let phash: string | undefined;
  try {
    phash = await perceptualHash(buf);
  } catch (err) {
    console.error("phash failed", ctx.uid, err);
  }
  const dup = await isDuplicateScan(ctx.uid, hash, phash);
  if (dup.dup) {
    const dupReason: "hash" | "phash" =
      dup.reason === "sha256" || dup.reason === "pending_sha256" ? "hash" : "phash";
    await logScanAttempt({
      scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
      outcome: dupReason === "hash" ? "denied_dup_hash" : "denied_dup_phash",
      at: new Date(), localDate,
      dupReason,
    });
    return new Response(
      JSON.stringify({ error: "duplicate scan", reason: dup.reason }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }
  const phashBkt = phash ? phashBucket(phash) : undefined;

  // Staff-QR confirm flow: one outstanding pending scan at a time. Blocks a second
  // upload while the student still owes a QR confirm for the previous one.
  const cmode = confirmMode();
  if (cmode !== "off") {
    const outstanding = await hasOutstandingPending(ctx.uid);
    if (outstanding) {
      const expiresInSec = Math.max(0, Math.ceil((outstanding.expiresAt.getTime() - Date.now()) / 1000));
      return new Response(JSON.stringify({ error: "pending_exists", pendingId: outstanding.id, expiresInSec }), {
        status: 409, headers: { "Content-Type": "application/json" },
      });
    }
  }

  let det;
  try { det = await detect(detectorConfigFromEnv(), buf); }
  catch (err) {
    logScanEvent("error_detector", { uid: ctx.uid, scanId, err });
    return jsonError(500, "detector error");
  }
  if (!det.accepted) {
    await logRejectedNotPet({ scanId, uid: ctx.uid, classKey: prof.classKey ?? "", localDate, clientConf, det });
    return new Response(JSON.stringify({ error: "not a PET bottle", confidence: det.confidence }), {
      status: 422, headers: { "Content-Type": "application/json" },
    });
  }

  let imageUrl: string;
  try { imageUrl = await uploadScanImage(ctx.uid, scanId, buf); }
  catch (err) {
    logScanEvent("error_storage", { uid: ctx.uid, scanId, err });
    return jsonError(500, "storage");
  }
  const capturedAt = new Date();

  const newStreak = computeStreak(prof.streakDays ?? 0, prof.lastScanLocalDate ?? "", localDate);
  const isFirstOfDay = prof.dailyScanDate !== localDate;
  const newDaily = isFirstOfDay ? 1 : (prof.dailyScans ?? 0) + 1;
  const rawItems = Number.isFinite(det.itemCount) ? Math.floor(det.itemCount) : 1;
  // Award at most the bottles still allowed today (cap-to-remainder).
  const allowedItems = Math.min(
    DEFAULT_POINTS_CONFIG.maxItemsPerScan,
    remainingBottles(bottlesToday),
    Math.max(1, rawItems),
  );
  const pt = calculatePoints(DEFAULT_POINTS_CONFIG, newStreak, isFirstOfDay, allowedItems);
  const pointedItems = allowedItems;
  const newDailyBottles = bottlesToday + allowedItems;
  const newTotal = (prof.totalPoints ?? 0) + pt.total;
  const newRank = rankForPoints(newTotal);
  const coins = coinReward(newStreak, newDaily);

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
    imagePath: imageUrl,
    imageHash: hash,
    phash,
    phashBucket: phashBkt,
    capturedAt,
    localDate,
    scanId,
    newStreak,
    newDaily,
    newDailyBottles,
    newRank,
    coinReward: coins,
  };

  // off / log: award immediately (log also shadows a pending doc below).
  if (cmode === "off" || cmode === "log") {
    const { awarded } = await awardScan(awardArgs);
    if (!awarded) {
      // A concurrent submit of the same scanId won the race; replay its result.
      const prior2 = await getStoredScan(scanId);
      if (prior2 && prior2.uid === ctx.uid) return jsonOk(replayResult(scanId, prior2, prof));
      logScanEvent("error_award_race", { uid: ctx.uid, scanId });
      return jsonError(409, "duplicate scan");
    }
    bustLeaderboardCaches();
    await logScanAttempt({
      scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
      outcome: "awarded",
      at: capturedAt, localDate,
      basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
      itemCount: det.itemCount, detectedClass: det.class,
      confidence: det.confidence, clientConf,
    });
  }

  // log / enforce: stage a pending scan that the staff-QR confirm will award.
  let pendingId: string | undefined;
  if (cmode === "log" || cmode === "enforce") {
    pendingId = ulid();
    try {
      await createPending(pendingId, buildPendingDoc({
        uid: ctx.uid, classKey: prof.classKey ?? "", scanId,
        detectedClass: det.class, itemCount: det.itemCount, confidence: det.confidence,
        basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
        coinReward: coins, isFirstOfDay, localDate, streakDays: newStreak,
        newDailyCount: newDaily, dailyBottles: newDailyBottles, newTotalPoints: newTotal, newRank,
        prevRank: prof.rank ?? "ต้นกล้า", imagePath: imageUrl, imageHash: hash,
        phash, phashBucket: phashBkt, capturedAt,
      }));
    } catch (err) {
      console.error("pending create failed", ctx.uid, scanId, err);
      if (cmode === "enforce") return jsonError(500, "pending create failed");
      pendingId = undefined;
    }
    if (cmode === "enforce" && pendingId) {
      await logScanAttempt({
        scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
        outcome: "pending",
        at: capturedAt, localDate,
        basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
        itemCount: det.itemCount, detectedClass: det.class,
        confidence: det.confidence, clientConf,
      });
    }
  }

  const expiresInSec = Math.floor(PENDING_TTL_MS / 1000);
  const base = {
    scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
    pointedItems,
    basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
    newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
    annotatedImage: det.annotatedImage,
  };
  if (cmode === "off") return jsonOk({ ...base, awarded: true });
  if (cmode === "log") return jsonOk({ ...base, awarded: true, pendingId, expiresInSec });
  // enforce: points await the staff-QR confirm.
  return jsonOk({ ...base, awarded: false, pendingId, expiresInSec });
}
