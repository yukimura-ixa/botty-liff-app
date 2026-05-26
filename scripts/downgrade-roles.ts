// scripts/downgrade-roles.ts
// Downgrade all council/teacher users to student. Existing admins untouched.
// Usage:
//   npx tsx scripts/downgrade-roles.ts            # dry-run (default)
//   npx tsx scripts/downgrade-roles.ts --apply    # write changes
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const APPLY = process.argv.includes("--apply");

function init() {
  if (getApps().length) return;
  let raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT_JSON missing");
  raw = raw.trim();
  // Strip surrounding quotes if present (matches project's firebase.ts pattern)
  if (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"'))
  ) {
    raw = raw.slice(1, -1);
  }
  const projectId = process.env.GCP_PROJECT;
  if (!projectId) throw new Error("GCP_PROJECT missing");
  const svc = JSON.parse(raw);
  // Unescape literal \n in private_key (matches project's firebase.ts pattern)
  if (typeof svc.private_key === "string" && svc.private_key.includes("\\n")) {
    svc.private_key = svc.private_key.replace(/\\n/g, "\n");
  }
  initializeApp({ credential: cert(svc), projectId });
}

async function main() {
  init();
  const db = getFirestore();
  const auth = getAuth();
  const snap = await db
    .collection("users")
    .where("role", "in", ["council", "teacher"])
    .get();

  console.log(`Found ${snap.size} council/teacher user(s). apply=${APPLY}`);
  let changed = 0;
  for (const doc of snap.docs) {
    const from = doc.get("role");
    console.log(`- ${doc.id}: ${from} -> student`);
    if (!APPLY) continue;
    await doc.ref.update({ role: "student", updatedAt: new Date() });
    try {
      await auth.setCustomUserClaims(doc.id, { role: "student" });
    } catch (e) {
      console.error(`  claim update failed for ${doc.id}`, e);
    }
    changed++;
  }
  console.log(
    APPLY
      ? `Done. Updated ${changed} user(s).`
      : "Dry-run only. Re-run with --apply to write."
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
