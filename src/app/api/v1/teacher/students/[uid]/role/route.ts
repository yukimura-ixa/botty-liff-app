import { NextRequest } from "next/server";
import { verifyBearerTokenWithFreshRole, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonNoStore } from "@/server/lib/http";
import { changeRoleAsTeacher, type TeacherAssignableRole } from "@/server/user/role-change";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  let body: { role?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  const roleVal = (body.role ?? "").toString().trim().toLowerCase();
  if (!roleVal) return jsonError(400, "role required");
  if (roleVal !== "student" && roleVal !== "council") {
    return jsonError(400, "role must be student or council");
  }

  try {
    const r = await changeRoleAsTeacher(uid, ctx.uid, roleVal as TeacherAssignableRole);
    if (r.noop) return jsonNoStore({ ok: true, noop: true });
    if (!r.claimUpdateOk) {
      return jsonNoStore({
        ok: true,
        roleChangeId: r.roleChangeId,
        warning: "claim update failed; user must re-login after retry",
      });
    }
    return jsonNoStore({ ok: true, roleChangeId: r.roleChangeId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    if (msg === "self") return jsonError(400, "cannot change own role");
    if (msg === "invalid") return jsonError(400, "role must be student or council");
    if (msg === "not_found") return jsonError(404, "user not found");
    if (msg === "forbidden_target") return jsonError(403, "cannot change teacher or admin role");
    console.error("teacher change role failed", err);
    return jsonError(500, "internal");
  }
}
