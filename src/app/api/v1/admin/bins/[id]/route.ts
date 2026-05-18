import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { patchBin } from "@/server/bin/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");
  const { id } = await params;
  let body: { label?: string; active?: boolean };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  try {
    await patchBin(id, body);
    return jsonOk({ ok: true });
  } catch (err) {
    console.error("patch bin failed", err);
    return jsonError(500, "update");
  }
}
