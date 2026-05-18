import QRCode from "qrcode";

export async function renderQrPng(payload: string): Promise<Buffer> {
  return await QRCode.toBuffer(payload, { type: "png", errorCorrectionLevel: "M", width: 512 });
}
