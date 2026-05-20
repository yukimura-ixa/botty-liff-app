import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { changeRole, type AssignableRole } from "@/server/user/role-change";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");
  const { uid } = await params;

  let body: { role?: string; reason?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (!body.role || !body.reason || body.reason.length > 200) return jsonError(400, "role and reason required (reason max 200)");

  try {
    const r = await changeRole(uid, ctx.uid, body.role as AssignableRole, body.reason);
    if (!r.claimUpdateOk) {
      return jsonOk({ ok: true, roleChangeId: r.roleChangeId, warning: "claim update failed; user must re-login after retry" });
    }
    return jsonOk({ ok: true, roleChangeId: r.roleChangeId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    if (msg === "self") return jsonError(400, "cannot change own role");
    if (msg === "invalid") return jsonError(400, "role must be student, council, or teacher");
    if (msg === "not_found") return jsonError(404, "user not found");
    if (msg === "demote_admin") return jsonError(403, "cannot demote admin");
    console.error("change role failed", err);
    return jsonError(500, msg);
  }
}
