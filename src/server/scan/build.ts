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
  phash?: string;
  phashBucket?: string;
  capturedAt: Date;
  localDate: string;
};

export function buildScanDoc(i: ScanDocInput) {
  const doc: Record<string, unknown> = { ...i };
  for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];
  return doc;
}

export const PENDING_TTL_MS = 300_000; // 5 min — student window to scan staff QR
export const PENDING_STATUS_AWAITING = "awaiting_bin" as const;

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
  coinReward: number;
  isFirstOfDay: boolean;
  localDate: string;
  streakDays: number;
  newDailyCount: number;
  newTotalPoints: number;
  newRank: string;
  prevRank: string;
  imagePath: string;
  imageHash: string;
  phash?: string;
  phashBucket?: string;
  capturedAt: Date;
};

export type PendingDoc = PendingDocInput & {
  expiresAt: Date;
  status: typeof PENDING_STATUS_AWAITING;
};

export function buildPendingDoc(i: PendingDocInput): PendingDoc {
  const doc = {
    ...i,
    expiresAt: new Date(i.capturedAt.getTime() + PENDING_TTL_MS),
    status: PENDING_STATUS_AWAITING,
  } as PendingDoc & Record<string, unknown>;
  for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];
  return doc;
}
