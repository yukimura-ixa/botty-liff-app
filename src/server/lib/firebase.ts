import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let appSingleton: App | null = null;

export function firebaseApp(): App {
  if (appSingleton) return appSingleton;
  const existing = getApps();
  if (existing.length > 0) {
    console.log("[firebase] reusing existing app, count=", existing.length, "options=", JSON.stringify(existing[0]?.options));
    appSingleton = existing[0];
    return appSingleton;
  }
  let raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT_JSON missing");
  raw = raw.trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    raw = raw.slice(1, -1);
  }
  const projectId = process.env.GCP_PROJECT;
  if (!projectId) throw new Error("GCP_PROJECT missing");
  const svc = JSON.parse(raw);
  if (typeof svc.private_key === "string" && svc.private_key.includes("\\n")) {
    svc.private_key = svc.private_key.replace(/\\n/g, "\n");
  }
  console.log("[firebase] init cert app project=", projectId, "svc.project_id=", svc.project_id, "client_email=", svc.client_email, "pk_len=", (svc.private_key || "").length, "pk_starts_ok=", (svc.private_key || "").startsWith("-----BEGIN PRIVATE KEY-----\n"));
  appSingleton = initializeApp({
    credential: cert(svc),
    projectId,
  });
  return appSingleton;
}

export function fbAuth(): Auth {
  return getAuth(firebaseApp());
}

export function fbFirestore(): Firestore {
  return getFirestore(firebaseApp());
}
