// Read-only ops report: predict Vercel Blob Advanced Operations (put count)
// from scanAttempts outcomes.
//
// Each accepted scan triggers exactly one Blob put() (the only Advanced
// Operation this app makes — no copy()/list()). put fires only on outcomes
// awarded | pending | preview; all other outcomes return before upload.
//
// Uses Firestore .count() aggregation, so it's cheap and safe against prod.
// Reads GCP_SERVICE_ACCOUNT_JSON + GCP_PROJECT from .env.local.
//
//   node scripts/count-scan-ops.mjs [days]   (default 30 = scanAttempts TTL window)
import { readFileSync } from "node:fs";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// minimal .env.local loader (only the two keys we need)
function envFromFile() {
  const txt = readFileSync(".env.local", "utf8");
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = envFromFile();
const svc = JSON.parse(env.GCP_SERVICE_ACCOUNT_JSON);
const projectId = env.GCP_PROJECT || svc.project_id;
if (!getApps().length) initializeApp({ credential: cert(svc), projectId });
const fs = getFirestore();

const days = Number(process.argv[2] || 30);
const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const OUTCOMES = [
  "awarded", "pending", "preview", "replay",
  "denied_cooldown", "denied_daily_cap",
  "denied_dup_hash", "denied_dup_phash", "rejected_not_pet",
];
const PUT_OUTCOMES = new Set(["awarded", "pending", "preview"]);

const counts = {};
await Promise.all(OUTCOMES.map(async (o) => {
  const snap = await fs.collection("scanAttempts")
    .where("outcome", "==", o)
    .where("at", ">=", from)
    .count().get();
  counts[o] = snap.data().count;
}));

const total = Object.values(counts).reduce((a, b) => a + b, 0);
const puts = OUTCOMES.filter((o) => PUT_OUTCOMES.has(o)).reduce((a, o) => a + counts[o], 0);

console.log(`\nscanAttempts last ${days}d (since ${from.toISOString().slice(0, 10)}) — project ${projectId}\n`);
for (const o of OUTCOMES) {
  const put = PUT_OUTCOMES.has(o) ? "  <- put" : "";
  console.log(`  ${o.padEnd(18)} ${String(counts[o]).padStart(7)}${put}`);
}
console.log(`  ${"TOTAL".padEnd(18)} ${String(total).padStart(7)}`);
console.log(`\n  predicted puts (advanced ops from scans) = ${puts}`);
console.log(`  put rate = ${total ? ((puts / total) * 100).toFixed(1) : 0}% of all attempts`);
console.log(`  per-day avg puts = ${(puts / days).toFixed(1)}\n`);
process.exit(0);
