import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { TtlCache } from "@/server/leaderboard/cache";
import { buildEntries, type BuildResult } from "@/server/leaderboard/build";
import { queryLeaderboard, type Scope } from "@/server/leaderboard/repo";
import { registerLeaderboardCacheBuster } from "@/server/lib/leaderboard-cache-bus";

export const runtime = "nodejs";
export const maxDuration = 10;

type CachedResponse = BuildResult & { scope: Scope; period: string; fetchedAt: string };

const cache = new TtlCache<CachedResponse>(30_000);
registerLeaderboardCacheBuster(() => cache.bust());

function parseScope(raw: string | null): Scope {
  return raw === "class" || raw === "grade" ? raw : "school";
}

export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await verifyBearerToken(req);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  const url = new URL(req.url);
  const scope = parseScope(url.searchParams.get("scope"));
  const period = url.searchParams.get("period") ?? "week";

  const cacheKey = `${scope}:${ctx.uid}`;
  const hit = cache.get(cacheKey);
  if (hit) return jsonOk(hit);

  try {
    const rows = await queryLeaderboard(scope, ctx.uid);
    const built = buildEntries(rows, ctx.uid);
    const body: CachedResponse = { ...built, scope, period, fetchedAt: new Date().toISOString() };
    cache.set(cacheKey, body);
    return jsonOk(body);
  } catch (err) {
    console.error("leaderboard query failed", scope, err);
    return jsonError(500, "leaderboard query");
  }
}
