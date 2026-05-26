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
