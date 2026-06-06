// Single source of truth for local dev accounts. Used by both the seed script
// (scripts/seed-dev.ts) and the dev-login route/page. These are DEV-ONLY: the
// `dev:` uid prefix keeps them clearly separate from real `line:` users, and
// the dev-login route refuses to run when NODE_ENV === "production".

export type DevRole = "student" | "admin";

export type DevAccount = {
  uid: string;
  role: DevRole;
  fullName: string;
  studentId: string;
  classGrade: number;
  classRoom: number;
  totalPoints: number;
  streakDays: number;
  coins: number;
  ownedTrees: string[];
  headlineTree: string;
  ownedDecorations: string[];
};

const STUDENT_NAMES = [
  "ก้องภพ ใจดี", "ณิชา แสงทอง", "ปุญญพัฒน์ ศรีสุข", "พิมพ์ชนก วงศ์ไทย",
  "ธนกร รักเรียน", "อาทิตยา มั่นคง", "ภูริ ทองคำ", "กัญญาณัฐ ดวงแก้ว",
  "ชยุต พูนผล", "เบญญาภา สุขใจ", "นภดล วารี", "ศิรประภา ก้าวหน้า",
  "ธีรเดช ป่าไม้", "วรินทร เขียวขจี", "พงศกร ใบเตย", "อนัญญา ดอกไม้",
  "รัชชานนท์ ภูผา", "ปัณณธร สายลม", "มนัสนันท์ ทะเล", "กิตติพศ เมฆา",
];

// 4 classes, 5 students each (20 total).
const CLASSES: Array<[number, number]> = [[4, 1], [4, 2], [5, 1], [6, 1]];
const ALL_TREES = ["oak", "pine", "sakura", "willow", "aurora"];
// Non-gated decorations (statue is gated behind rank 🌳, granted separately).
const DECORATIONS = ["rock", "flower_patch", "bush", "pond", "log_bench"];

function buildStudents(): DevAccount[] {
  return STUDENT_NAMES.map((fullName, i) => {
    const [classGrade, classRoom] = CLASSES[Math.floor(i / 5)];
    // Points span all four ranks (300..3720) so leaderboard/forest show variety.
    const totalPoints = 300 + i * 180;
    const owned = ["oak"];
    if (totalPoints >= 1600) owned.push("pine");
    if (i % 3 === 0) owned.push("sakura");
    if (totalPoints >= 2500) owned.push("aurora");
    // Vary decoration counts 0..4 (+ gated statue for forest-rank students) so
    // some gardens are empty, some exceed the 4-slot limit to test curation.
    const decos = DECORATIONS.slice(0, i % 5);
    if (totalPoints >= 1600) decos.push("statue");
    return {
      uid: `dev:s${String(i + 1).padStart(2, "0")}`,
      role: "student" as const,
      fullName,
      studentId: `D${String(i + 1).padStart(3, "0")}`,
      classGrade,
      classRoom,
      totalPoints,
      streakDays: i % 12, // some students reach the 7-day streak gate
      coins: 5000 + (i * 137) % 1500, // generous: buy any tree while testing
      ownedTrees: owned,
      headlineTree: owned[owned.length - 1], // show off their best tree
      ownedDecorations: decos,
    };
  });
}

export const DEV_ACCOUNTS: DevAccount[] = [
  {
    uid: "dev:admin",
    role: "admin",
    fullName: "แอดมิน เดฟ",
    studentId: "",
    classGrade: 0,
    classRoom: 0,
    totalPoints: 0,
    streakDays: 0,
    coins: 5000,
    ownedTrees: ["oak"],
    headlineTree: "oak",
    ownedDecorations: [],
  },
  ...buildStudents(),
];

export function findDevAccount(uid: string): DevAccount | undefined {
  return DEV_ACCOUNTS.find((a) => a.uid === uid);
}

// Exported for callers that want to validate tree ids against the catalog.
export const DEV_TREE_IDS = ALL_TREES;
