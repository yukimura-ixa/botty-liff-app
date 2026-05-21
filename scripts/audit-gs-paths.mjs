// One-time audit/migration script for botty-96l.
// Counts scans collection rows where imagePath starts with "gs://" (legacy GCS).
// Run: node --env-file=.env.local scripts/audit-gs-paths.mjs
// Flags: --migrate (re-uploads images to Vercel Blob, updates imagePath)
//        --delete  (deletes legacy rows entirely)
// Default: dry-run count + sample.

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const keyIdx = process.argv.indexOf("--keyfile");
const keyPath = keyIdx >= 0 ? process.argv[keyIdx + 1] : process.env.GOOGLE_APPLICATION_CREDENTIALS;
let sa;
if (keyPath) {
  sa = JSON.parse(readFileSync(keyPath, "utf8"));
} else {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) { console.error("provide --keyfile <path> or set GCP_SERVICE_ACCOUNT_JSON"); process.exit(1); }
  sa = JSON.parse(raw);
}
const projectId = sa.project_id ?? process.env.GCP_PROJECT;
if (!projectId) { console.error("project_id missing in key + GCP_PROJECT unset"); process.exit(1); }

initializeApp({ credential: cert(sa), projectId });
const db = getFirestore();

const mode = process.argv.includes("--migrate") ? "migrate"
           : process.argv.includes("--delete") ? "delete"
           : "audit";

console.log(`[audit-gs-paths] mode=${mode} project=${projectId}`);

const snap = await db.collection("scans")
  .where("imagePath", ">=", "gs://")
  .where("imagePath", "<", "gs:/{")
  .get();

console.log(`found ${snap.size} scan rows with gs:// imagePath`);

if (snap.size === 0) {
  console.log("✓ zero legacy rows. Safe to drop fallback (botty-9ot).");
  process.exit(0);
}

const sample = snap.docs.slice(0, 5).map(d => ({
  id: d.id,
  uid: d.get("uid"),
  imagePath: d.get("imagePath"),
  capturedAt: d.get("capturedAt")?.toDate?.()?.toISOString() ?? null,
}));
console.log("sample (first 5):");
console.log(JSON.stringify(sample, null, 2));

if (mode === "audit") {
  console.log("\nRe-run with --migrate or --delete to act.");
  process.exit(0);
}

if (mode === "delete") {
  let n = 0;
  const batch = db.batch();
  for (const d of snap.docs) { batch.delete(d.ref); n++; }
  await batch.commit();
  console.log(`deleted ${n} rows`);
  process.exit(0);
}

if (mode === "migrate") {
  console.error("migrate mode not implemented — image bytes no longer in GCS (billing disabled).");
  console.error("Use --delete or leave rows (legacy fallback hides 403 image fetches).");
  process.exit(1);
}
