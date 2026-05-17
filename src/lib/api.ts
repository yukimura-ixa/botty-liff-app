// API client for the Go backend at /v1

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/v1'

// Format internal classKey (e.g. "4-3") to Thai display ("ม.4/3"). Legacy "4/3" also handled.
export function formatClassKey(key?: string | null): string {
  if (!key) return ''
  const m = key.match(/^(\d+)[-/](\d+)$/)
  if (!m) return key
  return `ม.${m[1]}/${m[2]}`
}

export class ApiError extends Error {
  status: number
  code?: string
  data?: Record<string, unknown>
  constructor(status: number, message: string, code?: string, data?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.data = data
    this.name = 'ApiError'
  }
}

async function getFreshToken(): Promise<string> {
  if (typeof window === 'undefined') return ''
  const cached = sessionStorage.getItem('firebaseIdToken')
  if (cached) return cached
  const { auth } = await import('./firebase')
  await auth.authStateReady()
  if (!auth.currentUser) return ''
  const t = await auth.currentUser.getIdToken()
  sessionStorage.setItem('firebaseIdToken', t)
  return t
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const idToken = await getFreshToken()
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
  const headers = new Headers(init?.headers)
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (idToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${idToken}`)
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  })
  if (!res.ok) {
    const body = await res.text()
    let msg = body || res.statusText
    let code: string | undefined
    let data: Record<string, unknown> | undefined
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>
      data = parsed
      if (typeof parsed.error === 'string') {
        msg = parsed.error
        code = parsed.error
      }
    } catch { /* not JSON */ }
    throw new ApiError(res.status, msg, code, data)
  }
  return res.json() as Promise<T>
}

// ── Auth ──────────────────────────────────────────────────────
export function authLine(idToken: string) {
  return request<{ customToken: string; role: string; onboarded: boolean }>(
    '/auth/line',
    { method: 'POST', body: JSON.stringify({ idToken }) },
  )
}

// ── Student ───────────────────────────────────────────────────
export interface StudentProfile {
  uid: string; lineUserId: string; role: string
  fullName: string
  classGrade: number; classRoom: number; classKey: string
  totalPoints: number; totalScans: number; rank: string
  streakDays: number; lastScanLocalDate: string
  status: string
}

export function getMe() {
  return request<StudentProfile>('/me')
}

export function onboard(payload: { fullName: string; studentId: string; grade: number; room: number; consent: boolean }) {
  return request<StudentProfile>('/me/onboard', { method: 'POST', body: JSON.stringify(payload) })
}

export interface ScanResult {
  scanId: string
  detectedClass: string
  confidence: number
  itemCount: number
  basePoints: number
  streakBonus: number
  totalPoints: number
  newTotalPoints: number
  streakDays: number
  newRank: string
  prevRank: string
}

export function uploadScan(image: File, clientConfidence?: number) {
  const fd = new FormData()
  fd.append('image', image)
  if (typeof clientConfidence === 'number') {
    fd.append('clientConfidence', String(clientConfidence))
  }
  return request<ScanResult>('/scan/upload', {
    method: 'POST',
    body: fd,
  })
}

export interface ScanHistoryEntry {
  scanId: string
  detectedClass: string
  confidence: number
  itemCount: number
  totalPoints: number
  capturedAt: string
}

export function getMyScans(limit = 20, cursor?: string) {
  const qs = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) }).toString()
  return request<{ scans: ScanHistoryEntry[]; nextCursor?: string }>(`/me/scans?${qs}`)
}

export interface LeaderboardEntry {
  uid: string; fullName: string; classKey: string
  rank: string; points: number; scans: number; streakDays: number
}
export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  myRank: number
  myEntry: LeaderboardEntry | null
}

export function getLeaderboard(scope: 'class' | 'grade' | 'school', period: 'week' | 'month' | 'all') {
  return request<LeaderboardResponse>(`/leaderboard?scope=${scope}&period=${period}`)
}

export interface SchoolGoal {
  targetBottles: number; currentBottles: number
  startsAt: string; endsAt: string
}

export function getSchoolGoal() {
  return request<SchoolGoal>('/school/goal')
}

// ── Teacher ───────────────────────────────────────────────────
export interface TeacherKPIs {
  studentCount: number; bottlesToday: number
  totalPoints: number; co2KgReduced: number
}

export function getTeacherKPIs() {
  return request<TeacherKPIs>('/teacher/kpis')
}

export function getStudents(params: { classKey?: string; q?: string; cursor?: string }) {
  const qs = new URLSearchParams(params as Record<string, string>).toString()
  return request<{ students: StudentProfile[]; nextCursor?: string }>(`/teacher/students?${qs}`)
}

interface TeacherStudentResponse {
  profile: StudentProfile
  series7: number[]
}

export async function getStudent(uid: string): Promise<StudentProfile & { sevenDaySeries: number[] }> {
  const raw = await request<TeacherStudentResponse>(`/teacher/students/${uid}`)
  return {
    ...raw.profile,
    sevenDaySeries: raw.series7 ?? [],
  }
}

export type SheetsExportBody = {
  classKey?: string;
  from: string;
  to: string;
  groupBy?: 'scan' | 'student' | 'class';
  columns?: string[];
  includeAdjustments?: boolean;
  includeImageLinks?: boolean;
  reuseSheet?: boolean;
};

export function exportToSheets(body: SheetsExportBody): Promise<{ url: string }> {
  return request('/teacher/exports/sheet', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ── Forest ────────────────────────────────────────────────────
export interface ClassEntry {
  classKey: string
  totalPoints: number
  studentCount: number
}

export interface ForestStagesConfig {
  thresholds: [number, number, number]
}

export function getClasses() {
  return request<{ classes: ClassEntry[] }>('/classes')
}

export function getForestStages(): Promise<ForestStagesConfig> {
  return request<ForestStagesConfig>('/config/forest-stages')
    .catch(() => ({ thresholds: [1000, 2500, 5000] as [number, number, number] }))
}

export function updateForestStages(thresholds: [number, number, number]) {
  return request<ForestStagesConfig>('/teacher/config/forest-stages', {
    method: 'PUT',
    body: JSON.stringify({ thresholds }),
  })
}

// ── Admin ─────────────────────────────────────────────────────
export type UserRow = {
  uid: string;
  fullName: string;
  classKey: string;
  role: 'student' | 'teacher' | 'admin';
  totalPoints: number;
};

export type RoleChange = {
  id: string;
  targetUid: string;
  byUid: string;
  fromRole: string;
  toRole: string;
  reason: string;
  createdAt: string;
};

export function adminListUsers(opts: {
  role?: string; q?: string; cursor?: string; limit?: number;
}): Promise<{ users: UserRow[]; nextCursor: string }> {
  const p = new URLSearchParams();
  if (opts.role) p.set('role', opts.role);
  if (opts.q) p.set('q', opts.q);
  if (opts.cursor) p.set('cursor', opts.cursor);
  if (opts.limit) p.set('limit', String(opts.limit));
  return request(`/admin/users?${p}`);
}

export function adminChangeRole(uid: string, role: 'student' | 'teacher', reason: string) {
  return request<{ ok: boolean; roleChangeId: string; warning?: string }>(
    `/admin/users/${encodeURIComponent(uid)}/role`,
    { method: 'POST', body: JSON.stringify({ role, reason }) },
  );
}

export function adminListRoleChanges(targetUid?: string): Promise<{ changes: RoleChange[] }> {
  const p = new URLSearchParams();
  if (targetUid) p.set('targetUid', targetUid);
  return request(`/admin/role-changes?${p}`);
}
