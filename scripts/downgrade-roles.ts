// scripts/downgrade-roles.ts
// Downgrade all council/teacher users to student. Existing admins untouched.
// Credentials (first that resolves wins):
//   - GCP_SERVICE_ACCOUNT_JSON  (inline JSON, as in production)
//   - GCP_SERVICE_ACCOUNT_FILE  (path to a key file)
//   - ./service-account.json    (local key file, gitignored)
// projectId: GCP_PROJECT, else `project_id` from the key.
// Usage:
//   npx tsx scripts/downgrade-roles.ts            # dry-run (default)
//   npx tsx scripts/downgrade-roles.ts --apply    # write changes
import { readFileSync, existsSync } from "node:fs";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const APPLY = process.argv.includes("--apply");

function init() {
  if (getApps().length) return;
  let raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    // Fall back to a key file so the script works locally without exporting
    // the whole JSON into an env var.
    const filePath = process.env.GCP_SERVICE_ACCOUNT_FILE ?? "service-account.json";
    if (!existsSync(filePath)) {
      throw new Error(
        `no credentials: set GCP_SERVICE_ACCOUNT_JSON, GCP_SERVICE_ACCOUNT_FILE, or place ${filePath} in cwd`,
      );
    }
    raw = readFileSync(filePath, "utf8");
  }
  raw = raw.trim();
  // Strip surrounding quotes if present (matches project's firebase.ts pattern)
  if (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"'))
  ) {
    raw = raw.slice(1, -1);
  }
  const svc = JSON.parse(raw);
  // Unescape literal \n in private_key (matches project's firebase.ts pattern)
  if (typeof svc.private_key === "string" && svc.private_key.includes("\\n")) {
    svc.private_key = svc.private_key.replace(/\\n/g, "\n");
  }
  const projectId = process.env.GCP_PROJECT ?? svc.project_id;
  if (!projectId) throw new Error("GCP_PROJECT missing (and no project_id in key)");
  initializeApp({ credential: cert(svc), projectId });
}

async function main() {
  init();
  console.log(`project=${getApps()[0]?.options.projectId} apply=${APPLY}`);
  const db = getFirestore();
  const auth = getAuth();
  const snap = await db
    .collection("users")
    .where("role", "in", ["council", "teacher"])
    .get();

  console.log(`Found ${snap.size} council/teacher user(s). apply=${APPLY}`);
  let changed = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const from = doc.get("role");
    console.log(`- ${doc.id}: ${from} -> student`);
    if (!APPLY) continue;
    await doc.ref.update({ role: "student", updatedAt: new Date() });
    try {
      await auth.setCustomUserClaims(doc.id, { role: "student" });
      changed++;
    } catch (e) {
      failed++;
      console.error(`  claim update failed for ${doc.id}`, e);
    }
  }
  console.log(
    APPLY
      ? `Done. Updated ${changed} user(s), ${failed} claim failure(s).`
      : "Dry-run only. Re-run with --apply to write."
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
