// API client for the Go backend at /v1

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/v1'

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
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
    try {
      const parsed = JSON.parse(body) as { error?: string }
      if (parsed.error) {
        msg = parsed.error
        code = parsed.error
      }
    } catch { /* not JSON */ }
    throw new ApiError(res.status, msg, code)
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
  fullName: string; nickname: string
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
  material: string
  sizeMl: number
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
  material: string
  sizeMl: number
  totalPoints: number
  capturedAt: string
}

export function getMyScans(limit = 20, cursor?: string) {
  const qs = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) }).toString()
  return request<{ scans: ScanHistoryEntry[]; nextCursor?: string }>(`/me/scans?${qs}`)
}

export interface LeaderboardEntry {
  uid: string; fullName: string; nickname: string; classKey: string
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

export function exportToSheets(payload: { classKey?: string; from: string; to: string }) {
  return request<{ url: string }>('/teacher/exports/sheet', {
    method: 'POST', body: JSON.stringify(payload),
  })
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
