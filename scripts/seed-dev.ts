// scripts/seed-dev.ts
// Seed the Firestore project with rich local-dev data: 1 admin + ~20 students
// across 4 classes (with points, coins, owned trees, streaks), matching class
// aggregates, a few recent scans (so teacher KPIs / history render), and a
// school-goal bump to ~28% (lets you test the 25% milestone grant).
//
// Idempotent: deterministic doc ids, safe to re-run.
//
// Credentials (first that resolves wins): GCP_SERVICE_ACCOUNT_JSON,
// GCP_SERVICE_ACCOUNT_FILE, or ./service-account.json. projectId from
// GCP_PROJECT else the key's project_id.
//
// Usage:
//   npx tsx scripts/seed-dev.ts            # dry-run (counts only)
//   npx tsx scripts/seed-dev.ts --apply    # write
import { readFileSync, existsSync } from "node:fs";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { DEV_ACCOUNTS } from "../src/server/dev/accounts";

const APPLY = process.argv.includes("--apply");

// Mirror of RANKS in src/lib/theme.ts (kept inline so this script has no
// cross-module alias dependencies under tsx).
const RANK_THRESHOLDS: Array<{ min: number; name: string }> = [
  { min: 2500, name: "ผืนป่า" },
  { min: 1600, name: "ป่าไม้" },
  { min: 1000, name: "ต้นไม้" },
  { min: 0, name: "ต้นกล้า" },
];
function rankForPoints(pts: number): string {
  for (const r of RANK_THRESHOLDS) if (pts >= r.min) return r.name;
  return "ต้นกล้า";
}
function bangkokDate(d: Date): string {
  // en-CA gives YYYY-MM-DD
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}
function classKeyOf(grade: number, room: number): string {
  return `${grade}-${room}`;
}
function totalScansFor(points: number): number {
  return Math.max(1, Math.round(points / 12));
}

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
  const now = new Date();
  const today = bangkokDate(now);

  console.log(`project=${projectId} apply=${APPLY} accounts=${DEV_ACCOUNTS.length}`);

  // Class aggregates accumulated as we walk students.
  const classAgg = new Map<string, { totalPoints: number; totalScans: number }>();
  const scanWrites: Array<{ id: string; data: Record<string, unknown> }> = [];

  const userWrites = DEV_ACCOUNTS.map((a) => {
    const classKey = a.role === "student" ? classKeyOf(a.classGrade, a.classRoom) : "";
    const totalScans = a.role === "student" ? totalScansFor(a.totalPoints) : 0;
    if (a.role === "student") {
      const agg = classAgg.get(classKey) ?? { totalPoints: 0, totalScans: 0 };
      agg.totalPoints += a.totalPoints;
      agg.totalScans += totalScans;
      classAgg.set(classKey, agg);
    }
    const profile: Record<string, unknown> = {
      uid: a.uid,
      lineUserId: a.uid.replace(/^dev:/, ""),
      role: a.role,
      fullName: a.fullName,
      studentId: a.studentId,
      classGrade: a.classGrade,
      classRoom: a.classRoom,
      classKey,
      totalPoints: a.totalPoints,
      totalScans,
      rank: a.role === "student" ? rankForPoints(a.totalPoints) : "",
      streakDays: a.streakDays,
      lastScanLocalDate: a.role === "student" ? today : "",
      dailyScans: 0,
      dailyScanDate: "",
      coins: a.coins,
      coinsLifetime: a.coins,
      ownedTrees: a.ownedTrees,
      headlineTree: a.headlineTree,
      ownedDecorations: a.ownedDecorations,
      displayedDecorations: [],
      claimedGoalMilestones: [],
      status: "active",
      consent: true,
      createdAt: now,
      updatedAt: now,
    };
    return { uid: a.uid, profile };
  });

  // A few recent scans for the first 6 students so teacher KPIs (bottlesToday)
  // and the history page have content. Dated today.
  const students = DEV_ACCOUNTS.filter((a) => a.role === "student").slice(0, 6);
  for (const s of students) {
    const classKey = classKeyOf(s.classGrade, s.classRoom);
    for (let n = 0; n < 3; n++) {
      scanWrites.push({
        id: `dev-${s.uid.replace(/^dev:/, "")}-${n}`,
        data: {
          uid: s.uid,
          classKey,
          detectedClass: "PET",
          itemCount: 1,
          basePoints: 10,
          streakBonus: n,
          totalPoints: 10 + n,
          confidence: 0.95,
          clientConf: 0.9,
          imagePath: "",
          imageHash: `devhash-${s.uid}-${n}`,
          capturedAt: new Date(now.getTime() - n * 3600_000),
          localDate: today,
        },
      });
    }
  }

  console.log(`- users: ${userWrites.length}`);
  console.log(`- classes: ${classAgg.size} (${[...classAgg.keys()].join(", ")})`);
  console.log(`- scans: ${scanWrites.length}`);
  console.log(`- schoolGoal.currentBottles -> 280 (merge)`);

  if (!APPLY) {
    console.log("Dry-run only. Re-run with --apply to write.");
    return;
  }

  const batch = db.batch();
  for (const u of userWrites) batch.set(db.collection("users").doc(u.uid), u.profile);
  for (const [classKey, agg] of classAgg) {
    batch.set(db.collection("classes").doc(classKey), agg, { merge: true });
  }
  for (const s of scanWrites) batch.set(db.collection("scans").doc(s.id), s.data);
  batch.set(
    db.collection("schoolGoal").doc("current"),
    { currentBottles: 280 },
    { merge: true },
  );
  await batch.commit();
  console.log("Done. Seeded dev data.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
