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
import { detect, detectorConfigFromEnv } from "@/server/scan/detect";
import { uploadScanImage } from "@/server/scan/storage";
import { buildPendingDoc, PENDING_TTL_MS } from "@/server/scan/build";
import { createPending, hasOutstandingPending } from "@/server/scan/pending";
import { awardScan } from "@/server/scan/award";
import { isDuplicateScan } from "@/server/scan/repo";
import { recordPreviewScan } from "@/server/scan/preview";
import { bustLeaderboardCaches } from "@/server/lib/leaderboard-cache-bus";
import { ipScanLimiter, clientIp, rateLimitResponse } from "@/server/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 4 * 1024;
const COOLDOWN_MS = 60_000;
const DAILY_LIMIT = 20;

function sniffImageMime(buf: Buffer): "image/jpeg" | "image/png" | null {
  if (buf.length < 8) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";
  return null;
}
type Mode = "off" | "log" | "enforce";

function mode(): Mode {
  // Default: enforce — students earn points only after staff QR scan.
  // Matches src/app/api/v1/scan/confirm/route.ts mode() default.
  const m = (process.env.BIN_CONFIRM_MODE ?? "enforce") as Mode;
  return m === "off" || m === "log" ? m : "enforce";
}

export async function POST(req: NextRequest) {
  const ipCheck = ipScanLimiter.take(clientIp(req));
  if (!ipCheck.ok) return rateLimitResponse(ipCheck.retryAfterSec);

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
  if (file.size === 0) return jsonError(400, "empty image");
  if (file.size < MIN_IMAGE_BYTES) return jsonError(400, "image too small");
  if (file.size > MAX_IMAGE_BYTES) return jsonError(413, "image too large");

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return jsonError(400, "empty image");
  if (!sniffImageMime(buf)) return jsonError(400, "unsupported image format (need JPEG or PNG)");
  const clientConf = Number(form.get("clientConfidence") ?? 0) || 0;
  const localDate = bangkokDate(new Date());

  const prof = await getUser(ctx.uid);
  if (!prof) return jsonError(404, "profile");
  const SCAN_ELIGIBLE_ROLES = new Set(["student", "council", "teacher", "admin"]);
  if (!SCAN_ELIGIBLE_ROLES.has(prof.role) || prof.status !== "active") {
    console.warn("[scan/upload] 403 not eligible", { uid: ctx.uid, role: prof.role, status: prof.status });
    return jsonError(403, "not eligible");
  }

  if (prof.role !== "student") {
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
    let imageUrl: string;
    try { imageUrl = await uploadScanImage(ctx.uid, scanId, buf); }
    catch (err) {
      console.error("blob upload error", ctx.uid, err);
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
      console.error("preview scan write failed", ctx.uid, err);
      return jsonError(500, "preview write");
    }

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
  let phash: string | undefined;
  try {
    phash = await perceptualHash(buf);
  } catch (err) {
    console.error("phash failed", ctx.uid, err);
  }
  const dup = await isDuplicateScan(ctx.uid, hash, phash);
  if (dup.dup) {
    return new Response(
      JSON.stringify({ error: "duplicate scan", reason: dup.reason }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }
  const phashBkt = phash ? phashBucket(phash) : undefined;

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
  let imageUrl: string;
  try { imageUrl = await uploadScanImage(ctx.uid, scanId, buf); }
  catch (err) {
    console.error("blob upload error", ctx.uid, err);
    return jsonError(500, "storage");
  }
  const capturedAt = new Date();
  const pendingId = ulid();

  const newStreak = computeStreak(prof.streakDays ?? 0, prof.lastScanLocalDate ?? "", localDate);
  const isFirstOfDay = prof.dailyScanDate !== localDate;
  const newDaily = isFirstOfDay ? 1 : (prof.dailyScans ?? 0) + 1;
  const pt = calculatePoints(DEFAULT_POINTS_CONFIG, newStreak, isFirstOfDay, det.itemCount);
  const rawItems = Number.isFinite(det.itemCount) ? Math.floor(det.itemCount) : 1;
  const pointedItems = Math.min(DEFAULT_POINTS_CONFIG.maxItemsPerScan, Math.max(1, rawItems));
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
    imagePath: imageUrl,
    imageHash: hash,
    phash,
    phashBucket: phashBkt,
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
    try {
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
        imagePath: imageUrl,
        imageHash: hash,
        phash,
        phashBucket: phashBkt,
        capturedAt,
      }));
    } catch (err) {
      console.error("pending create failed", err);
      if (m === "enforce") return jsonError(500, "pending create failed");
    }
  }

  if (m === "off") {
    return jsonOk({
      scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
      pointedItems,
      basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
      newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
      annotatedImage: det.annotatedImage,
    });
  }
  if (m === "log") {
    return jsonOk({
      pendingId, expiresInSec: Math.floor(PENDING_TTL_MS / 1000),
      scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
      pointedItems,
      basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
      newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
      annotatedImage: det.annotatedImage,
    });
  }
  return jsonOk({
    pendingId, expiresInSec: Math.floor(PENDING_TTL_MS / 1000),
    scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
    pointedItems,
    basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
    newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
    awarded: false,
    annotatedImage: det.annotatedImage,
  });
}
