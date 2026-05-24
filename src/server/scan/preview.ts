import { fbFirestore } from "@/server/lib/firebase";

export type PreviewScanInput = {
  uid: string;
  scanId: string;
  classKey: string;
  detectedClass: string;
  itemCount: number;
  confidence: number;
  clientConf: number;
  imagePath: string;
  imageHash: string;
  phash?: string;
  phashBucket?: string;
  capturedAt: Date;
  localDate: string;
};

export async function recordPreviewScan(i: PreviewScanInput): Promise<void> {
  const fs = fbFirestore();
  const scanRef = fs.collection("scans").doc(i.scanId);
  const doc: Record<string, unknown> = {
    uid: i.uid,
    classKey: i.classKey,
    detectedClass: i.detectedClass,
    itemCount: i.itemCount,
    basePoints: 0,
    streakBonus: 0,
    totalPoints: 0,
    confidence: i.confidence,
    clientConf: i.clientConf,
    imagePath: i.imagePath,
    imageHash: i.imageHash,
    phash: i.phash,
    phashBucket: i.phashBucket,
    capturedAt: i.capturedAt,
    localDate: i.localDate,
    awarded: false,
    preview: true,
  };
  for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];
  await scanRef.set(doc);
}
