// API client for the Go backend at /v1

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const idToken =
    typeof window !== 'undefined' ? (sessionStorage.getItem('firebaseIdToken') ?? '') : '';
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────
export function authLine(idToken: string) {
  return request<{ customToken: string; role: string; onboarded: boolean }>(
    '/auth/line',
    { method: 'POST', body: JSON.stringify({ idToken }) },
  );
}

// ── Student ───────────────────────────────────────────────────
export interface StudentProfile {
  uid: string; lineUserId: string; role: string;
  fullName: string; nickname: string;
  classGrade: number; classRoom: number; classKey: string;
  totalPoints: number; totalScans: number; rank: string;
  streakDays: number; lastScanLocalDate: string;
  status: string;
}

export function getMe() {
  return request<StudentProfile>('/me');
}

export function onboard(payload: { fullName: string; nickname: string; grade: number; room: number; consent: boolean }) {
  return request<StudentProfile>('/me/onboard', { method: 'POST', body: JSON.stringify(payload) });
}

export interface ScanResult {
  material: string; sizeMl: number;
  basePoints: number; streakBonus: number; totalPoints: number;
  confidence: number; capturedAt: string;
  newTotals: { totalPoints: number; totalScans: number; streakDays: number };
}

export function uploadScan(image: File, clientConfidence: number) {
  const fd = new FormData();
  fd.append('image', image);
  fd.append('clientConfidence', String(clientConfidence));
  return request<ScanResult>('/scan/upload', {
    method: 'POST',
    body: fd,
    headers: {},  // let browser set Content-Type for multipart
  });
}

export interface LeaderboardEntry {
  uid: string; fullName: string; nickname: string; classKey: string;
  rank: string; points: number; scans: number;
}
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  myRank: number; myEntry: LeaderboardEntry;
}

export function getLeaderboard(scope: 'class' | 'grade' | 'school', period: 'week' | 'month' | 'all') {
  return request<LeaderboardResponse>(`/leaderboard?scope=${scope}&period=${period}`);
}

export interface SchoolGoal {
  targetBottles: number; currentBottles: number;
  startsAt: string; endsAt: string;
}

export function getSchoolGoal() {
  return request<SchoolGoal>('/school/goal');
}

// ── Teacher ───────────────────────────────────────────────────
export interface TeacherKPIs {
  studentCount: number; bottlesToday: number;
  totalPoints: number; co2KgReduced: number;
}

export function getTeacherKPIs() {
  return request<TeacherKPIs>('/teacher/kpis');
}

export function getStudents(params: { classKey?: string; q?: string; cursor?: string }) {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request<{ students: StudentProfile[]; nextCursor?: string }>(`/teacher/students?${qs}`);
}

export function getStudent(uid: string) {
  return request<StudentProfile & { sevenDaySeries: number[] }>(`/teacher/students/${uid}`);
}

export function exportToSheets(payload: { classKey?: string; from: string; to: string }) {
  return request<{ url: string }>('/teacher/exports/sheet', {
    method: 'POST', body: JSON.stringify(payload),
  });
}
