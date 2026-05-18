export const PENDING_TTL_MS = 90_000;
export const PENDING_STATUS_AWAITING = "awaiting_bin" as const;

export type ScanDocInput = {
  uid: string;
  classKey: string;
  detectedClass: string;
  itemCount: number;
  basePoints: number;
  streakBonus: number;
  totalPoints: number;
  confidence: number;
  clientConf: number;
  imagePath: string;
  imageHash: string;
  capturedAt: Date;
  localDate: string;
};

export function buildScanDoc(i: ScanDocInput) {
  return { ...i };
}

export type PendingDocInput = {
  uid: string;
  classKey: string;
  scanId: string;
  detectedClass: string;
  itemCount: number;
  confidence: number;
  basePoints: number;
  streakBonus: number;
  totalPoints: number;
  isFirstOfDay: boolean;
  localDate: string;
  streakDays: number;
  newDailyCount: number;
  newTotalPoints: number;
  newRank: string;
  prevRank: string;
  imagePath: string;
  imageHash: string;
  capturedAt: Date;
};

export type PendingDoc = PendingDocInput & {
  expiresAt: Date;
  status: typeof PENDING_STATUS_AWAITING;
};

export function buildPendingDoc(i: PendingDocInput): PendingDoc {
  return {
    ...i,
    expiresAt: new Date(i.capturedAt.getTime() + PENDING_TTL_MS),
    status: PENDING_STATUS_AWAITING,
  };
}
