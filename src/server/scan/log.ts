import { writeScanAttempt } from "./log-repo";

export type ScanOutcome =
  | "awarded"
  | "pending"
  | "preview"
  | "replay"
  | "denied_cooldown"
  | "denied_daily_cap"
  | "denied_dup_hash"
  | "denied_dup_phash"
  | "rejected_not_pet";

export type StdoutOnlyOutcome =
  | "ip_rate"
  | "auth"
  | "bad_request"
  | "bad_image"
  | "no_profile"
  | "not_eligible"
  | "error_detector"
  | "error_storage"
  | "error_preview"
  | "error_award_race";

export interface ScanAttemptLog {
  scanId: string;
  uid: string;
  classKey: string;
  outcome: ScanOutcome;
  at: Date;
  localDate: string;
  basePoints?: number;
  streakBonus?: number;
  totalPoints?: number;
  itemCount?: number;
  detectedClass?: string;
  confidence?: number;
  clientConf?: number;
  dupReason?: "hash" | "phash";
  // For rejected_not_pet: why it was rejected. "no_match" = no accepted class
  // matched (detectedClass carries the model's top guess); "low_conf" = a PET
  // bottle was found but below the accept threshold.
  rejectReason?: "no_match" | "low_conf";
  // Probability (0..1) the scan image is a 2D reproduction (screen/print/photo-of-
  // photo) rather than a real bottle, from the spoof classifier. Soft-launch:
  // logged for audit only, never gates the scan. undefined when the workflow emits
  // no spoof output. See src/server/scan/detect.ts parseSpoofScore.
  spoofScore?: number;
}

export interface StdoutEventCtx {
  scanId?: string;
  uid?: string;
  reason?: string;
  err?: unknown;
}

export async function logScanAttempt(input: ScanAttemptLog): Promise<void> {
  if (process.env.VITEST) return;
  const payload: Record<string, unknown> = {
    tag: "scan",
    outcome: input.outcome,
    scanId: input.scanId,
    uid: input.uid,
    classKey: input.classKey,
    at: input.at.toISOString(),
    localDate: input.localDate,
  };
  const optKeys: (keyof ScanAttemptLog)[] = [
    "basePoints", "streakBonus", "totalPoints",
    "itemCount", "detectedClass", "confidence", "clientConf",
    "dupReason", "rejectReason",
  ];
  for (const k of optKeys) {
    const v = input[k];
    if (v !== undefined) payload[k] = v;
  }
  console.log(JSON.stringify(payload));
  try {
    await writeScanAttempt(input);
  } catch (err) {
    console.error("scanAttempts write failed", {
      scanId: input.scanId,
      uid: input.uid,
      outcome: input.outcome,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export function logScanEvent(outcome: StdoutOnlyOutcome, ctx: StdoutEventCtx = {}): void {
  if (process.env.VITEST) return;
  const payload: Record<string, unknown> = {
    tag: "scan",
    outcome,
    at: new Date().toISOString(),
  };
  if (ctx.scanId) payload.scanId = ctx.scanId;
  if (ctx.uid) payload.uid = ctx.uid;
  if (ctx.reason) payload.reason = ctx.reason;
  if (ctx.err !== undefined) {
    const e = ctx.err;
    if (e instanceof Error) {
      payload.errMessage = e.message;
      payload.errStack = e.stack ?? "";
    } else {
      payload.errMessage = String(e);
    }
  }
  console.log(JSON.stringify(payload));
}
