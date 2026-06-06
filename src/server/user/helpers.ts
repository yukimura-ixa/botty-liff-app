import type { PlacedDecoration } from "@/lib/garden";

export type Profile = {
  uid: string;
  lineUserId: string;
  role: "student" | "admin";
  fullName: string;
  studentId: string;
  classGrade: number;
  classRoom: number;
  classKey: string;
  totalPoints: number;
  totalScans: number;
  rank: string;
  streakDays: number;
  lastScanAt?: Date;
  lastScanLocalDate: string;
  dailyScans: number;
  dailyBottles: number;
  dailyScanDate: string;
  coins: number;
  coinsLifetime: number;
  ownedTrees: string[];
  ownedDecorations: string[];
  displayedDecorations: string[];
  decorationLayout: PlacedDecoration[];
  headlineTree: string;
  ownedTerrains: string[];
  activeTerrain: string;
  claimedGoalMilestones: number[];
  status: "pending_onboard" | "active" | "inactive";
  consent: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function classKey(grade: number, room: number): string {
  return `${grade}-${room}`;
}

export function defaultPendingProfile(lineUserId: string, now: Date): Profile {
  return {
    uid: `line:${lineUserId}`,
    lineUserId,
    role: "student",
    fullName: "",
    studentId: "",
    classGrade: 0,
    classRoom: 0,
    classKey: "",
    totalPoints: 0,
    totalScans: 0,
    rank: "",
    streakDays: 0,
    lastScanLocalDate: "",
    dailyScans: 0,
    dailyBottles: 0,
    dailyScanDate: "",
    coins: 0,
    coinsLifetime: 0,
    ownedTrees: ["oak"],
    ownedDecorations: [],
    displayedDecorations: [],
    decorationLayout: [],
    headlineTree: "oak",
    ownedTerrains: ["grass"],
    activeTerrain: "grass",
    claimedGoalMilestones: [],
    status: "pending_onboard",
    consent: false,
    createdAt: now,
    updatedAt: now,
  };
}
