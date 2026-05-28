export type ScanOutcome =
  | "awarded"
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
}

export interface StdoutEventCtx {
  scanId?: string;
  uid?: string;
  reason?: string;
  err?: unknown;
}

export async function logScanAttempt(_input: ScanAttemptLog): Promise<void> {
  throw new Error("not implemented");
}

export function logScanEvent(_outcome: StdoutOnlyOutcome, _ctx: StdoutEventCtx = {}): void {
  throw new Error("not implemented");
}
