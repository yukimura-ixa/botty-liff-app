import { NextRequest } from "next/server";
import { verifyBearerTokenWithFreshRole, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonNoStore } from "@/server/lib/http";
import { changeRole } from "@/server/user/role-change";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  let ctx;
  try { ctx = await verifyBearerTokenWithFreshRole(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");
  const { uid } = await params;
  if (!uid || uid.length > 128 || !/^[A-Za-z0-9_:-]+$/.test(uid)) {
    return jsonError(400, "invalid uid");
  }

  let body: { role?: string; reason?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (!body.role) return jsonError(400, "role required");
  if (body.role !== "student") return jsonError(400, "role must be student");
  const reason = (body.reason ?? "").toString().trim();
  if (reason.length > 200) return jsonError(400, "reason max 200");

  try {
    const r = await changeRole(uid, ctx.uid, "student", reason);
    if (!r.claimUpdateOk) {
      return jsonNoStore({ ok: true, roleChangeId: r.roleChangeId, warning: "claim update failed; user must re-login after retry" });
    }
    return jsonNoStore({ ok: true, roleChangeId: r.roleChangeId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    if (msg === "self") return jsonError(400, "cannot change own role");
    if (msg === "invalid") return jsonError(400, "role must be student");
    if (msg === "not_found") return jsonError(404, "user not found");
    if (msg === "demote_admin") return jsonError(403, "cannot demote admin");
    console.error("change role failed", err);
    return jsonError(500, "internal");
  }
}
