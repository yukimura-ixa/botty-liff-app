import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getUser, onboard } from "@/server/user/repo";

export const runtime = "nodejs";
export const maxDuration = 10;

type Body = {
  fullName?: string;
  studentId?: string;
  grade?: number;
  room?: number;
  consent?: boolean;
};

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await verifyBearerToken(req);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid json");
  }
  if (!body.fullName) return jsonError(400, "fullName required");
  if (!body.grade) return jsonError(400, "grade required");
  if (!body.room) return jsonError(400, "room required");
  if (!body.consent) return jsonError(400, "consent required");

  await onboard(ctx.uid, {
    fullName: body.fullName,
    studentId: body.studentId ?? "",
    grade: body.grade,
    room: body.room,
    consent: body.consent,
  });
  const prof = await getUser(ctx.uid);
  if (!prof) return jsonError(500, "fetch profile");
  return jsonOk(prof);
}
