export type Profile = {
  uid: string;
  lineUserId: string;
  role: "student" | "council" | "teacher" | "admin";
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
  dailyScanDate: string;
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
    dailyScanDate: "",
    status: "pending_onboard",
    consent: false,
    createdAt: now,
    updatedAt: now,
  };
}
