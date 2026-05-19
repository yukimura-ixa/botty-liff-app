import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { getBin } from "@/server/bin/repo";
import { signBinToken } from "@/server/scan/bin-token";
import { renderQrPng } from "@/server/bin/qr";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");
  const { id } = await params;
  const bin = await getBin(id);
  if (!bin) return jsonError(404, "not found");
  const secret = Buffer.from(process.env.BIN_HMAC_SECRET ?? "");
  if (secret.length < 16) return jsonError(500, "server misconfigured");
  const token = signBinToken(secret, id);
  const png = await renderQrPng(token);
  return jsonOk({ binId: id, label: bin.label, qrPngBase64: png.toString("base64") });
}
