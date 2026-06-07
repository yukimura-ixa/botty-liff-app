// Loads the staff-QR HMAC secret, enforcing a minimum length consistently across
// every route that signs or verifies slot tokens. Throws if missing/too short.
export class StaffSecretError extends Error {}

export function staffSecret(): Buffer {
  const raw = process.env.STAFF_QR_SECRET ?? "";
  const buf = Buffer.from(raw, "utf8");
  if (buf.length < 16) throw new StaffSecretError("STAFF_QR_SECRET missing or too short");
  return buf;
}
