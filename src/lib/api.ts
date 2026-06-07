// API client for the Go backend at /v1

import type { PlacedDecoration } from '@/lib/garden'

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
  const { auth } = await import('./firebase')
  await auth.authStateReady()
  if (!auth.currentUser) return ''
  return auth.currentUser.getIdToken()
}

async function request<T>(path: string, init?: RequestInit, opts?: { timeoutMs?: number }): Promise<T> {
  const idToken = await getFreshToken()
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
  const headers = new Headers(init?.headers)
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (idToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${idToken}`)
  }

  // Abort slow requests so the UI never hangs forever on a flaky connection.
  const controller = new AbortController()
  const timer = opts?.timeoutMs
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : undefined
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    })
  } catch (e) {
    if (controller.signal.aborted) {
      throw new ApiError(0, 'request timed out', 'timeout')
    }
    throw new ApiError(0, e instanceof Error ? e.message : 'network error', 'network')
  } finally {
    if (timer) clearTimeout(timer)
  }
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
  coins?: number
  ownedTrees?: string[]
  headlineTree?: string
  ownedDecorations?: string[]
  displayedDecorations?: string[]
  decorationLayout?: PlacedDecoration[]
  ownedTerrains?: string[]
  activeTerrain?: string
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
  pointedItems: number
  basePoints: number
  streakBonus: number
  totalPoints: number
  newTotalPoints: number
  streakDays: number
  newRank: string
  prevRank: string
  annotatedImage?: string
  preview?: boolean
  awarded?: boolean
  // Staff-QR confirm flow (BIN_CONFIRM_MODE=enforce): upload returns a pending
  // scan that awards points + coins only after the student scans a staff QR.
  pendingId?: string
  expiresInSec?: number
}

// scanId is a client-generated idempotency key (one per captured photo): a retry
// of the same photo reuses it so the server replays the result instead of re-awarding.
export function uploadScan(image: File, scanId: string, clientConfidence?: number) {
  const fd = new FormData()
  fd.append('image', image)
  fd.append('scanId', scanId)
  if (typeof clientConfidence === 'number') {
    fd.append('clientConfidence', String(clientConfidence))
  }
  return request<ScanResult>('/scan/upload', {
    method: 'POST',
    body: fd,
  }, { timeoutMs: 45_000 })
}

// Confirms a pending scan with a staff-QR slot token, awarding points + coins.
export function confirmScan(pendingId: string, approverToken: string) {
  return request<{ ok: boolean; approverUid: string; sessionId: string }>('/scan/confirm', {
    method: 'POST',
    body: JSON.stringify({ pendingId, approverToken }),
  })
}

export type ApproverTokenInfo = {
  token: string
  slot: number
  validFrom: number
  validUntil: number
  awardsCount: number
}
export type ApproverSessionResponse = {
  sessionId: string
  startedAt: string
  expiresAt: string
} & ApproverTokenInfo
// Staff opens a standing approver stand; returns the current rotating token.
export function openApproverSession() {
  return request<ApproverSessionResponse>('/approver/sessions', { method: 'POST' })
}
// Fetches the current rotating token for an open stand (client polls each rotation).
export function getApproverToken(id: string) {
  return request<ApproverTokenInfo>(`/approver/sessions/${encodeURIComponent(id)}/token`, { method: 'GET' })
}
export function endApproverSession(id: string) {
  return request<{ ok: boolean }>(`/approver/sessions/${encodeURIComponent(id)}/end`, { method: 'POST' })
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

// ── Shop ──────────────────────────────────────────────────────
export type ShopItemState = 'owned' | 'locked' | 'tooPoor' | 'buyable'
export interface ShopItem {
  id: string
  kind: 'tree' | 'decoration' | 'terrain'
  name: string
  priceCoins: number
  gate: string | null
  state: ShopItemState
  seasonal?: boolean
  seasonEndsAt?: string | null
}
export interface ShopResponse {
  coins: number
  headlineTree: string
  items: ShopItem[]
}

export function getShop() {
  return request<ShopResponse>('/shop')
}

export function shopBuy(itemId: string) {
  return request<{ coins: number; ownedTrees: string[]; ownedDecorations: string[]; ownedTerrains: string[] }>('/shop/buy', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  })
}

export function setHeadlineTree(itemId: string) {
  return request<{ headlineTree: string }>('/shop/headline', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  })
}

export function setActiveTerrain(terrainId: string) {
  return request<{ activeTerrain: string }>('/shop/terrain', {
    method: 'POST',
    body: JSON.stringify({ terrainId }),
  })
}

export function setGardenDisplay(decorations: string[]) {
  return request<{ displayedDecorations: string[] }>('/garden/display', {
    method: 'POST',
    body: JSON.stringify({ decorations }),
  })
}

export function setGardenLayout(layout: PlacedDecoration[]) {
  return request<{ decorationLayout: PlacedDecoration[] }>('/garden/layout', {
    method: 'POST',
    body: JSON.stringify({ layout }),
  })
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
export type UserRole = 'student' | 'council' | 'admin';
export type AssignableRole = 'student' | 'council';

export type UserRow = {
  uid: string;
  fullName: string;
  classKey: string;
  classGrade: number;
  classRoom: number;
  role: UserRole;
  totalPoints: number;
  status: string;
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

export function adminChangeRole(uid: string, role: AssignableRole, reason?: string) {
  return request<{ ok: boolean; roleChangeId: string; warning?: string }>(
    `/admin/users/${encodeURIComponent(uid)}/role`,
    { method: 'POST', body: JSON.stringify({ role, reason }) },
  );
}

export type UserPatch = {
  fullName?: string;
  classGrade?: number;
  classRoom?: number;
  totalPoints?: number;
  status?: 'active' | 'inactive';
};

export type UserEditChange = { field: string; oldValue: unknown; newValue: unknown };

export function adminUpdateUser(uid: string, patch: UserPatch) {
  return request<{ ok: boolean; noop?: boolean; editId?: string; changes?: UserEditChange[] }>(
    `/admin/users/${encodeURIComponent(uid)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
}


export function adminDeleteUser(uid: string) {
  return request<{ ok: boolean; editId?: string; warning?: string }>(
    `/admin/users/${encodeURIComponent(uid)}`,
    { method: 'DELETE' },
  );
}

export function teacherChangeStudentRole(uid: string, role: 'student') {
  return request<{ ok: boolean; roleChangeId?: string; noop?: boolean; warning?: string }>(
    `/teacher/students/${encodeURIComponent(uid)}/role`,
    { method: 'POST', body: JSON.stringify({ role }) },
  );
}


export function adminListRoleChanges(targetUid?: string): Promise<{ changes: RoleChange[] }> {
  const p = new URLSearchParams();
  if (targetUid) p.set('targetUid', targetUid);
  return request(`/admin/role-changes?${p}`);
}


export type UserEdit = {
  id: string;
  targetUid: string;
  byUid: string;
  changes: UserEditChange[];
  createdAt: string;
};

export function adminListUserEdits(targetUid?: string): Promise<{ edits: UserEdit[] }> {
  const p = new URLSearchParams();
  if (targetUid) p.set('targetUid', targetUid);
  return request(`/admin/user-edits?${p}`);
}

// ── Adjustments + dual-approval ───────────────────────────────
export type Adjustment = {
  id: string
  targetUid: string
  teacherUid: string
  delta: number
  reason: string
  bucket: 'small' | 'medium' | 'large' | 'unknown'
  source: 'teacher_immediate' | 'admin_approved' | 'unknown'
  approvedRequestId?: string
  approverUid?: string
  createdAt: string
}

export type AdjustRequestStatus = 'pending' | 'approved' | 'rejected'
export type AdjustRequest = {
  id: string
  targetUid: string
  teacherUid: string
  delta: number
  reason: string
  status: AdjustRequestStatus
  createdAt: string
  decidedBy?: string
  decidedAt?: string
  decidedReason?: string
}

export function adminListAdjustments(opts: { targetUid?: string; teacherUid?: string; limit?: number } = {}) {
  const p = new URLSearchParams()
  if (opts.targetUid) p.set('targetUid', opts.targetUid)
  if (opts.teacherUid) p.set('teacherUid', opts.teacherUid)
  if (opts.limit) p.set('limit', String(opts.limit))
  return request<{ adjustments: Adjustment[] }>(`/admin/adjustments?${p}`)
}

export function adminListAdjustRequests() {
  return request<{ requests: AdjustRequest[] }>('/admin/adjustment-requests')
}

export function adminDecideAdjustRequest(id: string, approve: boolean, reason?: string) {
  return request<{ ok: boolean }>(`/admin/adjustment-requests/${encodeURIComponent(id)}/decide`, {
    method: 'POST',
    body: JSON.stringify({ approve, reason }),
  })
}

export function teacherCreateAdjustRequest(uid: string, delta: number, reason: string) {
  return request<{ ok: boolean; id: string }>(
    `/teacher/students/${encodeURIComponent(uid)}/adjust/request`,
    { method: 'POST', body: JSON.stringify({ delta, reason }) },
  )
}

export function teacherAdjustPoints(uid: string, delta: number, reason: string) {
  return request<{ ok: boolean }>(
    `/teacher/students/${encodeURIComponent(uid)}/adjust`,
    { method: 'POST', body: JSON.stringify({ delta, reason }) },
  )
}

export const TEACHER_IMMEDIATE_CAP = 10
export const TEACHER_REQUEST_CAP = 50

// ── Scan logs (admin) ─────────────────────────────────────────
export type AdminScanLogOutcome =
  | "awarded" | "preview" | "replay"
  | "denied_cooldown" | "denied_daily_cap"
  | "denied_dup_hash" | "denied_dup_phash"
  | "rejected_not_pet";

export interface AdminScanLogRow {
  id: string;
  scanId: string;
  uid: string;
  classKey: string;
  outcome: AdminScanLogOutcome;
  at: string;
  localDate: string;
  basePoints?: number;
  streakBonus?: number;
  totalPoints?: number;
  itemCount?: number;
  detectedClass?: string;
  confidence?: number;
  clientConf?: number;
  dupReason?: "hash" | "phash";
}

export interface AdminScanLogResponse {
  rows: AdminScanLogRow[];
  nextCursor: string | null;
  aggregates: Record<AdminScanLogOutcome, number>;
}

export interface AdminScanLogQuery {
  from?: string;
  to?: string;
  outcome?: AdminScanLogOutcome[];
  uid?: string;
  classKey?: string;
  scanId?: string;
  cursor?: string | null;
  limit?: number;
}

export async function adminListScanLogs(q: AdminScanLogQuery): Promise<AdminScanLogResponse> {
  const sp = new URLSearchParams();
  if (q.from) sp.set("from", q.from);
  if (q.to) sp.set("to", q.to);
  if (q.outcome && q.outcome.length) sp.set("outcome", q.outcome.join(","));
  if (q.uid) sp.set("uid", q.uid);
  if (q.classKey) sp.set("classKey", q.classKey);
  if (q.scanId) sp.set("scanId", q.scanId);
  if (q.cursor) sp.set("cursor", q.cursor);
  if (q.limit) sp.set("limit", String(q.limit));
  return request<AdminScanLogResponse>(`/admin/scan-logs?${sp.toString()}`);
}

