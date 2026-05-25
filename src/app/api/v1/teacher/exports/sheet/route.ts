import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { fbFirestore } from "@/server/lib/firebase";
import { getUser } from "@/server/user/repo";
import { exportSheet, cacheKeyFor, getCachedSheet, setCachedSheet, type AdjustmentRow } from "@/server/teacher/sheets/exporter";
import type { ScanRow } from "@/server/teacher/sheets/rows";
import { bangkokDate } from "@/server/scan/time";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  classKey?: string;
  from: string;
  to: string;
  groupBy?: "scan" | "student" | "class";
  columns?: string[];
  includeAdjustments?: boolean;
  includeImageLinks?: boolean;
  reuseSheet?: boolean;
};

function isoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  // Treat as Asia/Bangkok midnight UTC offset
  const d = new Date(`${s}T00:00:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function strOf(v: unknown): string { return typeof v === "string" ? v : ""; }
function intOf(v: unknown): number { return typeof v === "number" ? v : 0; }
function floatOf(v: unknown): number { return typeof v === "number" ? v : 0; }
function dateOf(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  }
  return new Date(0);
}

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "teacher")) return jsonError(403, "forbidden");
  let body: Body;
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (!body.from || !body.to) return jsonError(400, "from and to required");

  const groupBy: Body["groupBy"] = body.groupBy ?? "scan";
  if (!["scan", "student", "class"].includes(groupBy)) return jsonError(400, `invalid groupBy: ${groupBy}`);

  const fromTime = isoDate(body.from);
  const toTime = isoDate(body.to);
  if (!fromTime || !toTime) return jsonError(400, "invalid date");
  if (toTime.getTime() < fromTime.getTime()) return jsonError(400, "to must be on or after from");
  const MAX_RANGE_MS = 90 * 86_400_000;
  if (toTime.getTime() - fromTime.getTime() > MAX_RANGE_MS) return jsonError(400, "date range exceeds 90 days");
  const toExclusive = new Date(toTime.getTime() + 86_400_000);

  const SCAN_LIMIT = 10_000;
  const fs = fbFirestore();
  let scanQuery = fs.collection("scans")
    .where("localDate", ">=", body.from)
    .where("localDate", "<=", body.to)
    .orderBy("localDate", "asc")
    .limit(SCAN_LIMIT);
  if (body.classKey) {
    scanQuery = fs.collection("scans")
      .where("classKey", "==", body.classKey)
      .where("localDate", ">=", body.from)
      .where("localDate", "<=", body.to)
      .orderBy("localDate", "asc")
      .limit(SCAN_LIMIT);
  }

  const scanSnap = await scanQuery.get();
  const uidSet = new Set<string>();
  for (const d of scanSnap.docs) {
    const uid = strOf(d.data().uid);
    if (uid) uidSet.add(uid);
  }

  let adjSnap = null as null | Awaited<ReturnType<typeof scanQuery.get>>;
  if (body.includeAdjustments) {
    try {
      adjSnap = await fs.collection("adjustments")
        .where("createdAt", ">=", fromTime)
        .where("createdAt", "<", toExclusive)
        .orderBy("createdAt", "asc")
        .get();
      for (const d of adjSnap.docs) {
        const data = d.data();
        if (data.targetUID) uidSet.add(strOf(data.targetUID));
        if (data.teacherUID) uidSet.add(strOf(data.teacherUID));
      }
    } catch (err) { console.error("adjustments query failed", err); }
  }

  // Fetch profiles in parallel for uid resolution
  const profileMap = new Map<string, { fullName: string; streakDays: number; classKey: string }>();
  const uids = Array.from(uidSet);
  const profiles = await Promise.all(uids.map((u) => getUser(u)));
  for (let i = 0; i < uids.length; i++) {
    const p = profiles[i];
    if (p) profileMap.set(uids[i], { fullName: p.fullName, streakDays: p.streakDays, classKey: p.classKey ?? "" });
  }

  const rows: ScanRow[] = scanSnap.docs.map((d) => {
    const data = d.data();
    const uid = strOf(data.uid);
    const pi = profileMap.get(uid);
    return {
      uid,
      localDate: strOf(data.localDate),
      capturedAt: dateOf(data.capturedAt),
      fullName: pi?.fullName ?? "",
      classKey: strOf(data.classKey),
      detectedClass: strOf(data.detectedClass),
      itemCount: intOf(data.itemCount),
      basePoints: intOf(data.basePoints),
      streakBonus: intOf(data.streakBonus),
      totalPoints: intOf(data.totalPoints),
      confidence: floatOf(data.confidence),
      imagePath: strOf(data.imagePath),
      imageURL: body.includeImageLinks ? strOf(data.imagePath) : "",
      streakDays: pi?.streakDays ?? 0,
    };
  });

  const adjustments: AdjustmentRow[] = [];
  for (const d of adjSnap?.docs ?? []) {
    const data = d.data();
    const targetUid = strOf(data.targetUID);
    if (body.classKey) {
      const targetClass = profileMap.get(targetUid)?.classKey ?? "";
      if (targetClass !== body.classKey) continue;
    }
    adjustments.push({
      createdAt: dateOf(data.createdAt),
      targetName: profileMap.get(targetUid)?.fullName ?? "",
      teacherName: profileMap.get(strOf(data.teacherUID))?.fullName ?? "",
      delta: intOf(data.delta),
      reason: strOf(data.reason),
    });
  }

  const reuse = body.reuseSheet !== false;
  const month = bangkokDate(new Date()).slice(0, 7);
  const key = cacheKeyFor(ctx.uid, month);
  const existing = reuse ? getCachedSheet(key) ?? null : null;

  const title = `Botty Export ${body.from}–${body.to}`;
  try {
    const { url, sheetId } = await exportSheet({
      title,
      rows,
      adjustments,
      existingId: existing,
      opts: {
        groupBy,
        columns: body.columns ?? [],
        includeAdjustments: !!body.includeAdjustments,
        includeImageLinks: !!body.includeImageLinks,
      },
    });
    setCachedSheet(key, sheetId);
    return jsonOk({ url });
  } catch (err) {
    console.error("sheet export failed", err);
    return jsonError(500, "export failed");
  }
}
