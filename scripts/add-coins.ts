// scripts/add-coins.ts
// Grant coins to a user (increments coins + coinsLifetime). Accepts a raw LINE
// userId (auto-prefixed with `line:`) or a full uid (`line:...` / `dev:...`).
//
// Credentials: same resolution as seed-dev.ts (GCP_SERVICE_ACCOUNT_JSON,
// GCP_SERVICE_ACCOUNT_FILE, or ./service-account.json).
//
// Usage:
//   npx tsx scripts/add-coins.ts <uid> [amount]          # dry-run
//   npx tsx scripts/add-coins.ts <uid> [amount] --apply  # write
//   amount defaults to 5000.
import { readFileSync, existsSync } from "node:fs";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const args = process.argv.slice(2).filter((a) => a !== "--apply");
const APPLY = process.argv.includes("--apply");
const rawUid = args[0];
const amount = args[1] ? Number(args[1]) : 5000;

if (!rawUid) throw new Error("usage: add-coins.ts <uid> [amount] [--apply]");
if (!Number.isFinite(amount)) throw new Error(`bad amount: ${args[1]}`);

// Bare LINE ids start with "U"; full uids already carry a `line:`/`dev:` prefix.
const uid = rawUid.includes(":") ? rawUid : `line:${rawUid}`;

function loadCredential() {
  let raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    const filePath = process.env.GCP_SERVICE_ACCOUNT_FILE ?? "service-account.json";
    if (!existsSync(filePath)) {
      throw new Error(
        `no credentials: set GCP_SERVICE_ACCOUNT_JSON, GCP_SERVICE_ACCOUNT_FILE, or place ${filePath} in cwd`,
      );
    }
    raw = readFileSync(filePath, "utf8");
  }
  raw = raw.trim();
  if (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"'))
  ) {
    raw = raw.slice(1, -1);
  }
  const svc = JSON.parse(raw);
  if (typeof svc.private_key === "string" && svc.private_key.includes("\\n")) {
    svc.private_key = svc.private_key.replace(/\\n/g, "\n");
  }
  return svc;
}

async function main() {
  const svc = loadCredential();
  const projectId = process.env.GCP_PROJECT ?? svc.project_id;
  if (!projectId) throw new Error("GCP_PROJECT missing (and no project_id in key)");
  if (!getApps().length) initializeApp({ credential: cert(svc), projectId });
  const db = getFirestore();

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`no user doc: ${uid}`);
  const before = (snap.get("coins") as number) ?? 0;

  console.log(`project=${projectId} uid=${uid} coins=${before} +${amount} -> ${before + amount} apply=${APPLY}`);

  if (!APPLY) {
    console.log("Dry-run only. Re-run with --apply to write.");
    return;
  }

  await ref.update({
    coins: FieldValue.increment(amount),
    coinsLifetime: FieldValue.increment(amount),
    updatedAt: new Date(),
  });
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
