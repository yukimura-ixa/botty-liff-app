import { Storage } from "@google-cloud/storage";

let storageSingleton: Storage | null = null;

function gcs(): Storage {
  if (storageSingleton) return storageSingleton;
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT_JSON missing");
  const credentials = JSON.parse(raw);
  storageSingleton = new Storage({ credentials, projectId: process.env.GCP_PROJECT });
  return storageSingleton;
}

export async function uploadScanImage(uid: string, scanId: string, bytes: Buffer): Promise<string> {
  const bucket = process.env.GCS_BUCKET;
  if (!bucket) throw new Error("GCS_BUCKET missing");
  const path = `scans/${uid}/${scanId}.jpg`;
  await gcs().bucket(bucket).file(path).save(bytes, {
    contentType: "image/jpeg",
    resumable: false,
  });
  return `gs://${bucket}/${path}`;
}

export function httpsUrl(gcsPath: string): string {
  const bucket = process.env.GCS_BUCKET ?? "";
  const path = gcsPath.replace(`gs://${bucket}/`, "");
  return `https://storage.googleapis.com/${bucket}/${path}`;
}
