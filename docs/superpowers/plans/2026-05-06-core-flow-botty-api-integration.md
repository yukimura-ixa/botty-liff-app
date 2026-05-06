# Core Flow Botty API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate frontend core flow (`/`, `/onboard`, `/home`, `/scan`) with real `botty-api` contracts so auth and data flow work end-to-end.

**Architecture:** Keep backend endpoints unchanged and make `src/lib/api.ts` the integration boundary. Normalize backend response shapes in API helpers so page components use stable typed data. Update only core-flow pages where behavior assumptions currently diverge from backend responses.

**Tech Stack:** Next.js App Router, TypeScript, Firebase Auth (custom token), LINE LIFF, Go backend (`/v1` REST)

---

## File Structure and Responsibilities

- Modify: `src/lib/api.ts`
  - Own request header behavior, auth token injection, error shaping, and response normalization.
- Modify: `src/app/page.tsx`
  - Own LIFF login bootstrap and post-auth routing decisions.
- Modify: `src/app/scan/page.tsx`
  - Own scan upload UX and result rendering fields.
- Modify: `src/app/onboard/page.tsx` (only if payload/redirect mismatch appears)
  - Own onboarding submit payload for `/v1/me/onboard`.
- Modify: `src/app/home/page.tsx` (only if profile-not-found/error branching needs correction)
  - Own `/v1/me` + `/v1/school/goal` startup flow.

---

### Task 1: Fix API boundary contract and multipart behavior

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Write a failing contract check (RED)**

Create/adjust type expectations in `src/lib/api.ts` so current mismatches are explicit (scan result and teacher student response shapes).

```ts
export interface BackendScanUploadResponse {
  scanId: string;
  material: string;
  sizeMl: number;
  basePoints: number;
  streakBonus: number;
  totalPoints: number;
  newTotalPoints: number;
  streakDays: number;
}

export interface BackendTeacherStudentResponse {
  profile: StudentProfile;
  series7: number[];
}
```

- [ ] **Step 2: Run build to verify current code is incompatible**

Run: `npm run build`  
Expected: compile/use-site failures until helper return types and consumers are aligned.

- [ ] **Step 3: Implement minimal API-layer fix (GREEN)**

Update request header logic to avoid forcing JSON content type for `FormData`, and normalize response types.

```ts
const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
const baseHeaders: Record<string, string> = {
  ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
};

const res = await fetch(`${BASE}${path}`, {
  ...init,
  headers: {
    ...baseHeaders,
    ...(init?.headers as Record<string, string> | undefined),
  },
});
```

```ts
export interface ScanResult {
  scanId: string;
  material: string;
  sizeMl: number;
  basePoints: number;
  streakBonus: number;
  totalPoints: number;
  newTotalPoints: number;
  streakDays: number;
}

export async function getStudent(uid: string): Promise<StudentProfile & { sevenDaySeries: number[] }> {
  const raw = await request<BackendTeacherStudentResponse>(`/teacher/students/${uid}`);
  return { ...raw.profile, sevenDaySeries: raw.series7 ?? [] };
}
```

- [ ] **Step 4: Run build to verify API layer compiles**

Run: `npm run build`  
Expected: build succeeds with updated `api.ts` contracts.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: align api client with botty-api contracts"
```

---

### Task 2: Restore login routing to backend auth contract

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write failing behavior assertion (RED)**

Document current mismatch: login currently routes all authenticated users to `/onboard` instead of honoring backend `onboarded` + `role`.

```ts
// target behavior after authLine:
// onboarded ? (role === 'teacher' ? '/teacher' : '/home') : '/onboard'
```

- [ ] **Step 2: Run build to lock baseline before edit**

Run: `npm run build`  
Expected: current baseline passes but behavior remains incorrect for onboarded users.

- [ ] **Step 3: Implement minimal routing fix (GREEN)**

Use `authLine` response to route correctly and keep LIFF login redirect URI.

```ts
if (sessionStorage.getItem('firebaseIdToken')) {
  const role = sessionStorage.getItem('role');
  router.replace(role === 'teacher' ? '/teacher' : '/home');
  return;
}

const { customToken, role, onboarded } = await authLine(idToken);
sessionStorage.setItem('role', role);
router.replace(onboarded ? (role === 'teacher' ? '/teacher' : '/home') : '/onboard');
```

- [ ] **Step 4: Run build to verify login page compiles**

Run: `npm run build`  
Expected: build succeeds and login flow uses backend-auth flags.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "fix: route login flow using onboarded and role"
```

---

### Task 3: Align scan page rendering with backend scan response

**Files:**
- Modify: `src/app/scan/page.tsx`

- [ ] **Step 1: Write failing field-use check (RED)**

Identify/remove UI dependencies on fields not returned by backend (`confidence`, `capturedAt`, `newTotals` object).

```ts
// remove direct dependency on:
// result.confidence
// result.capturedAt
// result.newTotals.totalPoints
```

- [ ] **Step 2: Run build to verify current type mismatch**

Run: `npm run build`  
Expected: compile/runtime field assumptions force adjustments once `ScanResult` is corrected.

- [ ] **Step 3: Implement minimal rendering fix (GREEN)**

Render only fields guaranteed by backend upload response.

```tsx
<div style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', padding: '6px 14px', borderRadius: 999 }}>
  {result.material} · {result.sizeMl}ml
</div>
<div style={{ fontSize: 72, fontWeight: 900, color: t.gold, lineHeight: 1 }}>
  +{result.totalPoints}
</div>
```

- [ ] **Step 4: Run build to verify scan page compiles**

Run: `npm run build`  
Expected: build succeeds with no invalid scan-result field usage.

- [ ] **Step 5: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "fix: match scan result UI to backend payload"
```

---

### Task 4: End-to-end core-flow smoke and cleanup commit

**Files:**
- Modify: `src/app/home/page.tsx`
- Modify: `src/app/onboard/page.tsx`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Define smoke scenarios (RED checklist)**

```md
1. Login in LIFF with a new student -> lands on /onboard
2. Submit onboard form -> lands on /home
3. Home loads profile and school goal from API
4. Scan upload returns points and shows success card
```

- [ ] **Step 2: Run smoke flow and capture failures**

Run local flow with `npm run dev` and record any API-contract or routing mismatch found during the four scenarios above.

- [ ] **Step 3: Apply minimal fixes**

Apply only fixes required by the four smoke scenarios in these three files.

```ts
// home fallback must keep onboarding redirect for missing profile
if (e instanceof ApiError && e.status === 404) {
  router.replace('/onboard');
  return;
}
```

- [ ] **Step 4: Final verification**

Run:

```bash
npm run build
```

Expected: build succeeds for the integrated core flow.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/app/page.tsx src/app/scan/page.tsx src/app/home/page.tsx src/app/onboard/page.tsx
git commit -m "feat: integrate botty-api core flow into frontend"
```

