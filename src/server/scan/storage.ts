import { put } from "@vercel/blob";

export async function uploadScanImage(uid: string, scanId: string, bytes: Buffer): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN missing");
  const path = `scans/${uid}/${scanId}.jpg`;
  const blob = await put(path, bytes, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false,
    allowOverwrite: false,
    token,
  });
  return blob.url;
}

export function httpsUrl(storedPath: string): string {
  if (storedPath.startsWith("http://") || storedPath.startsWith("https://")) return storedPath;
  if (storedPath.startsWith("gs://")) {
    const stripped = storedPath.slice("gs://".length);
    const slash = stripped.indexOf("/");
    if (slash === -1) return storedPath;
    const bucket = stripped.slice(0, slash);
    const path = stripped.slice(slash + 1);
    return `https://storage.googleapis.com/${bucket}/${path}`;
  }
  return storedPath;
}
