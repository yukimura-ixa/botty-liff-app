import { put, del } from "@vercel/blob";

export const MAX_BLOB_BYTES = 5 * 1024 * 1024;

export async function uploadScanImage(uid: string, scanId: string, bytes: Buffer): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN missing");
  if (bytes.length === 0) throw new Error("empty image");
  if (bytes.length > MAX_BLOB_BYTES) throw new Error("image too large");
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

export async function deleteScanImage(blobUrl: string): Promise<void> {
  if (!blobUrl) return;
  if (!blobUrl.startsWith("https://")) return;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN missing");
  await del(blobUrl, { token });
}
