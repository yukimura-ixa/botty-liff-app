import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { createBin, listBins } from "@/server/bin/repo";
import { signBinToken } from "@/server/scan/bin-token";
import { renderQrPng } from "@/server/bin/qr";

export const runtime = "nodejs";
export const maxDuration = 15;

function binSecret(): Buffer {
  const s = Buffer.from(process.env.BIN_HMAC_SECRET ?? "");
  if (s.length < 16) throw new Error("server misconfigured");
  return s;
}

export async function POST(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");
  let body: { label?: string };
  try { body = await req.json(); }
  catch { return jsonError(400, "invalid json"); }
  if (!body.label || body.label.length > 80) return jsonError(400, "label required (max 80)");
  try {
    const bin = await createBin(ctx.uid, body.label);
    const token = signBinToken(binSecret(), bin.id);
    const png = await renderQrPng(token);
    return jsonOk({ binId: bin.id, label: bin.label, qrPngBase64: png.toString("base64") });
  } catch (err) {
    console.error("create bin failed", err);
    return jsonError(500, "write");
  }
}

export async function GET(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");
  const activeOnly = new URL(req.url).searchParams.get("active") === "true";
  try {
    const bins = await listBins(activeOnly);
    return jsonOk({ bins });
  } catch (err) {
    console.error("bins list failed", err);
    return jsonError(500, "list");
  }
}
