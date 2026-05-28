// src/app/api/v1/admin/scan-logs/route.ts
import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { listScanAttempts, countScanAttemptsByOutcome, type ScanLogQuery } from "@/server/scan/log-repo";
import type { ScanOutcome } from "@/server/scan/log";

export const runtime = "nodejs";

const ALLOWED: ScanOutcome[] = [
  "awarded", "preview", "replay",
  "denied_cooldown", "denied_daily_cap",
  "denied_dup_hash", "denied_dup_phash",
  "rejected_not_pet",
];

export async function GET(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");

  const sp = req.nextUrl.searchParams;
  const q: ScanLogQuery = {
    from: parseDate(sp.get("from")),
    to: parseDate(sp.get("to")),
    outcomes: parseOutcomes(sp.get("outcome")),
    uid: sp.get("uid") || undefined,
    classKey: sp.get("classKey") || undefined,
    scanId: sp.get("scanId") || undefined,
    cursor: sp.get("cursor") || null,
    limit: parseLimit(sp.get("limit")),
  };

  const [list, aggregates] = await Promise.all([
    listScanAttempts(q),
    countScanAttemptsByOutcome({ from: q.from, to: q.to, uid: q.uid, classKey: q.classKey }),
  ]);
  return jsonOk({
    rows: list.rows.map((r) => ({ ...r, at: r.at.toISOString() })),
    nextCursor: list.nextCursor,
    aggregates,
  });
}

function parseDate(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function parseLimit(v: string | null): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.min(200, Math.max(1, Math.floor(n)));
}
function parseOutcomes(v: string | null): ScanOutcome[] | undefined {
  if (!v) return undefined;
  const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
  const filtered = parts.filter((p): p is ScanOutcome => (ALLOWED as string[]).includes(p));
  return filtered.length ? filtered : undefined;
}
