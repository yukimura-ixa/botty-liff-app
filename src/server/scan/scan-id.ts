// ULID: 26 chars, Crockford base32 (excludes I, L, O, U). Case-insensitive but
// generators emit uppercase. We accept uppercase only to keep doc ids canonical.
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Validate a client-supplied scanId used as the Firestore doc id / idempotency key. */
export function isValidScanId(id: unknown): id is string {
  return typeof id === "string" && ULID_RE.test(id);
}
