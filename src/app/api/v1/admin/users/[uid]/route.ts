import { NextRequest } from "next/server";
import { verifyBearerTokenWithFreshRole, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonNoStore } from "@/server/lib/http";
import { updateUserProfile, type UserPatch } from "@/server/user/repo";

export const runtime = "nodejs";
export const maxDuration = 30;

const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function validatePatch(body: Record<string, unknown>): { patch?: UserPatch; error?: string } {
  const patch: UserPatch = {};
  if (body.fullName !== undefined) {
    if (typeof body.fullName !== "string") return { error: "invalid fullName" };
    const trimmed = body.fullName.trim();
    if (trimmed.length < 1 || trimmed.length > 80) return { error: "invalid fullName" };
    patch.fullName = trimmed;
  }
  if (body.classGrade !== undefined) {
    const n = Number(body.classGrade);
    if (!Number.isInteger(n) || n < 0 || n > 13) return { error: "invalid classGrade" };
    patch.classGrade = n;
  }
  if (body.classRoom !== undefined) {
    const n = Number(body.classRoom);
    if (!Number.isInteger(n) || n < 0 || n > 99) return { error: "invalid classRoom" };
    patch.classRoom = n;
  }
  if (body.totalPoints !== undefined) {
    const n = Number(body.totalPoints);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return { error: "invalid totalPoints" };
    patch.totalPoints = n;
  }
  if (body.status !== undefined) {
    if (typeof body.status !== "string") return { error: "invalid status" };
    const s = body.status.trim().toLowerCase();
    if (s !== "active" && s !== "inactive") return { error: "invalid status" };
    patch.status = s;
  }
  if (Object.keys(patch).length === 0) return { error: "no fields" };
  return { patch };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  let ctx;
  try { ctx = await verifyBearerTokenWithFreshRole(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");

  const { uid } = await params;
  if (!uid || !UID_RE.test(uid)) return jsonError(400, "invalid uid");

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return jsonError(400, "invalid json"); }

  const v = validatePatch(body);
  if (!v.patch) return jsonError(400, v.error ?? "invalid");

  try {
    const r = await updateUserProfile(uid, ctx.uid, v.patch);
    if (r.noop) return jsonNoStore({ ok: true, noop: true });
    return jsonNoStore({ ok: true, editId: r.editId, changes: r.changes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    if (msg === "self") return jsonError(400, "cannot edit own profile");
    if (msg === "not_found") return jsonError(404, "user not found");
    if (msg === "forbidden_target") return jsonError(403, "cannot edit teacher or admin profile");
    console.error("admin update user failed", err);
    return jsonError(500, "internal");
  }
}
