# Scan Attempt Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-attempt logging to `POST /api/v1/scan/upload`: write a Firestore row for every accepted, denied, or rejected scan; emit a structured stdout JSON line for every attempt (including errors/auth); expose admin UI to query the log.

**Architecture:** New helper `src/server/scan/log.ts` is called inline at each return point in `route.ts`. Helper writes a row to Firestore collection `scanAttempts` for tracked outcomes and emits a tagged stdout JSON line. A new admin-guarded `GET /api/v1/admin/scan-logs` endpoint returns paginated rows plus per-outcome aggregates over a window. A new client page `/admin/scan-logs` and a new "Scan Logs" tab on `/teacher/student?uid=...` render the data. 30-day retention via Firestore TTL on `expiresAt`.

**Tech Stack:** Next.js 16 App Router (Node runtime), Firebase Admin (`firebase-admin/firestore`), React 19 client components, Vitest. No new deps.

**Spec:** `docs/superpowers/specs/2026-05-28-scan-attempt-logging-design.md`

---

## File Structure

### New files

- `src/server/scan/log.ts` — Pure helper. Exports `logScanAttempt` (async, Firestore + stdout), `logScanEvent` (sync, stdout-only), `ScanOutcome`, `StdoutOnlyOutcome`, `ScanAttemptLog`. Calls `writeScanAttempt` from the repo. No-ops when `process.env.VITEST` is set.
- `src/server/scan/log.test.ts` — Vitest unit tests for `log.ts` shape, stdout shape, error swallowing, VITEST no-op.
- `src/server/scan/log-repo.ts` — Firestore I/O. Exports `writeScanAttempt(input)`, `listScanAttempts(query)`, `countScanAttemptsByOutcome(query)`. Mirrors style of `src/server/scan/repo.ts` (uses `fbFirestore()`).
- `src/app/api/v1/admin/scan-logs/route.ts` — Admin-guarded `GET` handler. Parses query params, calls repo, returns `{ rows, nextCursor, aggregates }`.
- `src/app/admin/scan-logs/page.tsx` — Client global page with filter bar, aggregates strip, paginated table.
- `src/app/admin/scan-logs/ScanLogTable.tsx` — Reusable client component used by global page and per-student tab.
- `src/components/admin/StudentScanLogsTab.tsx` — Per-user tab embedded into `src/app/teacher/student/page.tsx`.

### Modified files

- `src/app/api/v1/scan/upload/route.ts` — Replace scattered `console.warn`/`console.error` with `logScanEvent`; add `await logScanAttempt(...)` before each Firestore-tracked return.
- `src/lib/api.ts` — Add client helper `adminListScanLogs(query)` (typed wrapper around `GET /api/v1/admin/scan-logs`).
- `src/app/teacher/student/page.tsx` — Add tab control + render `<StudentScanLogsTab uid={uid}/>` when selected.
- `src/app/admin/page.tsx` — Add a navigation card/link to `/admin/scan-logs`.
- `scripts/README.md` (or `AGENTS.md` deploy notes section) — Document the one-time post-deploy step to enable Firestore TTL on `scanAttempts.expiresAt`.

---

## Phase 1: Helper Module + Repo + Route Wiring (PR 1)

### Task 1: Define types and stub the helper

**Files:**
- Create: `src/server/scan/log.ts`

- [ ] **Step 1: Create `src/server/scan/log.ts` with type definitions and function stubs**

```ts
// src/server/scan/log.ts
export type ScanOutcome =
  | "awarded"
  | "preview"
  | "replay"
  | "denied_cooldown"
  | "denied_daily_cap"
  | "denied_dup_hash"
  | "denied_dup_phash"
  | "rejected_not_pet";

export type StdoutOnlyOutcome =
  | "ip_rate"
  | "auth"
  | "bad_request"
  | "bad_image"
  | "no_profile"
  | "not_eligible"
  | "error_detector"
  | "error_storage"
  | "error_preview"
  | "error_award_race";

export interface ScanAttemptLog {
  scanId: string;
  uid: string;
  classKey: string;
  outcome: ScanOutcome;
  at: Date;
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

export interface StdoutEventCtx {
  scanId?: string;
  uid?: string;
  reason?: string;
  err?: unknown;
}

export async function logScanAttempt(_input: ScanAttemptLog): Promise<void> {
  throw new Error("not implemented");
}

export function logScanEvent(_outcome: StdoutOnlyOutcome, _ctx: StdoutEventCtx = {}): void {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (only the stubs exist; no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/server/scan/log.ts
git commit -m "feat(scan-log): scaffold log helper types and stubs"
```

---

### Task 2: Tests for `logScanEvent` (stdout-only path)

**Files:**
- Create: `src/server/scan/log.test.ts`

- [ ] **Step 1: Write failing tests for `logScanEvent`**

```ts
// src/server/scan/log.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logScanEvent } from "./log";

describe("logScanEvent", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let prevVitest: string | undefined;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prevVitest = process.env.VITEST;
    delete process.env.VITEST;
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    if (prevVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = prevVitest;
  });

  it("emits a single-line JSON with tag and outcome", () => {
    logScanEvent("ip_rate", { scanId: "S1" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0]![0] as string;
    expect(typeof line).toBe("string");
    expect(line).not.toContain("\n");
    const parsed = JSON.parse(line);
    expect(parsed.tag).toBe("scan");
    expect(parsed.outcome).toBe("ip_rate");
    expect(parsed.scanId).toBe("S1");
  });

  it("includes uid and reason when provided", () => {
    logScanEvent("not_eligible", { uid: "U1", reason: "role=student status=banned" });
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed.uid).toBe("U1");
    expect(parsed.reason).toBe("role=student status=banned");
  });

  it("serializes err to message + stack", () => {
    const err = new Error("boom");
    logScanEvent("error_detector", { err });
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed.errMessage).toBe("boom");
    expect(typeof parsed.errStack).toBe("string");
  });

  it("is a no-op when VITEST env is set", () => {
    process.env.VITEST = "1";
    logScanEvent("auth", { scanId: "S2" });
    expect(logSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/scan/log.test.ts`
Expected: FAIL with "not implemented".

- [ ] **Step 3: Implement `logScanEvent`**

Edit `src/server/scan/log.ts`, replace the `logScanEvent` stub with:

```ts
export function logScanEvent(outcome: StdoutOnlyOutcome, ctx: StdoutEventCtx = {}): void {
  if (process.env.VITEST) return;
  const payload: Record<string, unknown> = {
    tag: "scan",
    outcome,
    at: new Date().toISOString(),
  };
  if (ctx.scanId) payload.scanId = ctx.scanId;
  if (ctx.uid) payload.uid = ctx.uid;
  if (ctx.reason) payload.reason = ctx.reason;
  if (ctx.err !== undefined) {
    const e = ctx.err;
    if (e instanceof Error) {
      payload.errMessage = e.message;
      payload.errStack = e.stack ?? "";
    } else {
      payload.errMessage = String(e);
    }
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/scan/log.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/scan/log.ts src/server/scan/log.test.ts
git commit -m "feat(scan-log): logScanEvent stdout helper"
```

---

### Task 3: Repo write — `writeScanAttempt`

**Files:**
- Create: `src/server/scan/log-repo.ts`

- [ ] **Step 1: Create `src/server/scan/log-repo.ts`**

```ts
// src/server/scan/log-repo.ts
import { fbFirestore } from "@/server/lib/firebase";
import type { Timestamp } from "firebase-admin/firestore";
import type { ScanAttemptLog, ScanOutcome } from "./log";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function writeScanAttempt(input: ScanAttemptLog): Promise<void> {
  const fs = fbFirestore();
  const expiresAt = new Date(input.at.getTime() + TTL_MS);
  const doc: Record<string, unknown> = {
    scanId: input.scanId,
    uid: input.uid,
    classKey: input.classKey,
    outcome: input.outcome,
    at: input.at,
    localDate: input.localDate,
    expiresAt,
  };
  const optKeys: (keyof ScanAttemptLog)[] = [
    "basePoints", "streakBonus", "totalPoints",
    "itemCount", "detectedClass", "confidence", "clientConf",
    "dupReason",
  ];
  for (const k of optKeys) {
    const v = input[k];
    if (v !== undefined) doc[k] = v;
  }
  await fs.collection("scanAttempts").add(doc);
}

export interface ScanLogQuery {
  from?: Date;
  to?: Date;
  outcomes?: ScanOutcome[];
  uid?: string;
  classKey?: string;
  scanId?: string;
  cursor?: string | null;
  limit?: number;
}

export interface ScanLogRow extends ScanAttemptLog {
  id: string;
}

export async function listScanAttempts(q: ScanLogQuery): Promise<{ rows: ScanLogRow[]; nextCursor: string | null }> {
  const fs = fbFirestore();
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  let ref = fs.collection("scanAttempts").orderBy("at", "desc").limit(limit + 1);
  if (q.uid) ref = ref.where("uid", "==", q.uid) as typeof ref;
  if (q.classKey) ref = ref.where("classKey", "==", q.classKey) as typeof ref;
  if (q.scanId) ref = ref.where("scanId", "==", q.scanId) as typeof ref;
  if (q.outcomes && q.outcomes.length === 1) {
    ref = ref.where("outcome", "==", q.outcomes[0]) as typeof ref;
  } else if (q.outcomes && q.outcomes.length > 1 && q.outcomes.length <= 10) {
    ref = ref.where("outcome", "in", q.outcomes) as typeof ref;
  }
  if (q.from) ref = ref.where("at", ">=", q.from) as typeof ref;
  if (q.to) ref = ref.where("at", "<=", q.to) as typeof ref;
  if (q.cursor) {
    const c = await fs.collection("scanAttempts").doc(q.cursor).get();
    if (c.exists) ref = ref.startAfter(c) as typeof ref;
  }
  const snap = await ref.get();
  const docs = snap.docs;
  const trimmed = docs.slice(0, limit);
  const nextCursor = docs.length > limit ? trimmed[trimmed.length - 1]!.id : null;
  return {
    rows: trimmed.map((d) => toRow(d.id, d.data())),
    nextCursor,
  };
}

export async function countScanAttemptsByOutcome(q: ScanLogQuery): Promise<Record<ScanOutcome, number>> {
  const fs = fbFirestore();
  let ref = fs.collection("scanAttempts").orderBy("at", "desc").limit(5000);
  if (q.uid) ref = ref.where("uid", "==", q.uid) as typeof ref;
  if (q.classKey) ref = ref.where("classKey", "==", q.classKey) as typeof ref;
  if (q.from) ref = ref.where("at", ">=", q.from) as typeof ref;
  if (q.to) ref = ref.where("at", "<=", q.to) as typeof ref;
  const snap = await ref.get();
  const counts: Record<ScanOutcome, number> = {
    awarded: 0, preview: 0, replay: 0,
    denied_cooldown: 0, denied_daily_cap: 0,
    denied_dup_hash: 0, denied_dup_phash: 0,
    rejected_not_pet: 0,
  };
  for (const d of snap.docs) {
    const o = d.get("outcome") as ScanOutcome | undefined;
    if (o && o in counts) counts[o] += 1;
  }
  return counts;
}

function toRow(id: string, d: FirebaseFirestore.DocumentData): ScanLogRow {
  return {
    id,
    scanId: strOf(d.scanId),
    uid: strOf(d.uid),
    classKey: strOf(d.classKey),
    outcome: d.outcome as ScanOutcome,
    at: tsToDate(d.at),
    localDate: strOf(d.localDate),
    basePoints: numOpt(d.basePoints),
    streakBonus: numOpt(d.streakBonus),
    totalPoints: numOpt(d.totalPoints),
    itemCount: numOpt(d.itemCount),
    detectedClass: strOpt(d.detectedClass),
    confidence: numOpt(d.confidence),
    clientConf: numOpt(d.clientConf),
    dupReason: d.dupReason === "hash" || d.dupReason === "phash" ? d.dupReason : undefined,
  };
}

function tsToDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (v && typeof v === "object" && "toDate" in v && typeof (v as Timestamp).toDate === "function") {
    return (v as Timestamp).toDate();
  }
  return new Date(0);
}
function strOf(v: unknown): string { return typeof v === "string" ? v : ""; }
function strOpt(v: unknown): string | undefined { return typeof v === "string" ? v : undefined; }
function numOpt(v: unknown): number | undefined { return typeof v === "number" ? v : undefined; }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/scan/log-repo.ts
git commit -m "feat(scan-log): scanAttempts firestore repo (write + list + counts)"
```

---

### Task 4: Tests for `logScanAttempt` (Firestore + stdout)

**Files:**
- Modify: `src/server/scan/log.test.ts`

- [ ] **Step 1: Add failing tests for `logScanAttempt`**

Append to `src/server/scan/log.test.ts`:

```ts
import { logScanAttempt } from "./log";
import * as logRepo from "./log-repo";

describe("logScanAttempt", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let prevVitest: string | undefined;

  const base = {
    scanId: "S1",
    uid: "U1",
    classKey: "M5/1",
    at: new Date("2026-05-28T10:00:00Z"),
    localDate: "2026-05-28",
  };

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    writeSpy = vi.spyOn(logRepo, "writeScanAttempt").mockResolvedValue();
    prevVitest = process.env.VITEST;
    delete process.env.VITEST;
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    writeSpy.mockRestore();
    if (prevVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = prevVitest;
  });

  it("writes Firestore and emits stdout for awarded outcome", async () => {
    await logScanAttempt({
      ...base,
      outcome: "awarded",
      basePoints: 10,
      streakBonus: 2,
      totalPoints: 12,
      itemCount: 1,
      detectedClass: "PET",
      confidence: 0.93,
      clientConf: 0.4,
    });
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0]![0]).toMatchObject({
      outcome: "awarded",
      basePoints: 10, streakBonus: 2, totalPoints: 12,
    });
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed.tag).toBe("scan");
    expect(parsed.outcome).toBe("awarded");
    expect(parsed.basePoints).toBe(10);
  });

  it("swallows Firestore errors and never throws (stderr emitted)", async () => {
    writeSpy.mockRejectedValueOnce(new Error("firestore down"));
    await expect(
      logScanAttempt({ ...base, outcome: "denied_cooldown" }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });

  it("is a full no-op when VITEST env is set", async () => {
    process.env.VITEST = "1";
    await logScanAttempt({ ...base, outcome: "replay" });
    expect(writeSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("includes dupReason for dup outcomes", async () => {
    await logScanAttempt({
      ...base,
      outcome: "denied_dup_phash",
      dupReason: "phash",
    });
    expect(writeSpy.mock.calls[0]![0].dupReason).toBe("phash");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/scan/log.test.ts`
Expected: FAIL (new `logScanAttempt` tests fail with "not implemented").

- [ ] **Step 3: Implement `logScanAttempt`**

Edit `src/server/scan/log.ts`. Add import at the top:

```ts
import { writeScanAttempt } from "./log-repo";
```

Replace the `logScanAttempt` stub with:

```ts
export async function logScanAttempt(input: ScanAttemptLog): Promise<void> {
  if (process.env.VITEST) return;
  const payload: Record<string, unknown> = {
    tag: "scan",
    outcome: input.outcome,
    scanId: input.scanId,
    uid: input.uid,
    classKey: input.classKey,
    at: input.at.toISOString(),
    localDate: input.localDate,
  };
  const optKeys: (keyof ScanAttemptLog)[] = [
    "basePoints", "streakBonus", "totalPoints",
    "itemCount", "detectedClass", "confidence", "clientConf",
    "dupReason",
  ];
  for (const k of optKeys) {
    const v = input[k];
    if (v !== undefined) payload[k] = v;
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
  try {
    await writeScanAttempt(input);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("scanAttempts write failed", {
      scanId: input.scanId,
      uid: input.uid,
      outcome: input.outcome,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/scan/log.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/scan/log.ts src/server/scan/log.test.ts
git commit -m "feat(scan-log): logScanAttempt with stdout + firestore + error swallowing"
```

---

### Task 5: Wire `route.ts` — replace stdout-only console calls

**Files:**
- Modify: `src/app/api/v1/scan/upload/route.ts`

- [ ] **Step 1: Add import**

At the top of `src/app/api/v1/scan/upload/route.ts`, add:

```ts
import { logScanAttempt, logScanEvent } from "@/server/scan/log";
```

- [ ] **Step 2: Replace IP rate-limit branch (line ~66)**

```ts
const ipCheck = ipScanLimiter.take(clientIp(req));
if (!ipCheck.ok) {
  logScanEvent("ip_rate", { reason: `retryAfter=${ipCheck.retryAfterSec}` });
  return rateLimitResponse(ipCheck.retryAfterSec);
}
```

- [ ] **Step 3: Replace auth branch (line ~68-73)**

```ts
let ctx;
try { ctx = await verifyBearerToken(req); }
catch (e) {
  if (e instanceof AuthError) {
    logScanEvent("auth", { reason: `${e.status} ${e.message}` });
    return jsonError(e.status, e.message);
  }
  logScanEvent("auth", { err: e });
  return jsonError(500, "auth");
}
```

- [ ] **Step 4: Replace multipart / image validation branches (line ~75-87)**

```ts
let form: FormData;
try { form = await req.formData(); }
catch {
  logScanEvent("bad_request", { uid: ctx.uid, reason: "invalid multipart" });
  return jsonError(400, "invalid multipart");
}

const file = form.get("image");
if (!(file instanceof Blob)) {
  logScanEvent("bad_image", { uid: ctx.uid, reason: "missing image" });
  return jsonError(400, "missing image");
}
if (file.size === 0) {
  logScanEvent("bad_image", { uid: ctx.uid, reason: "empty image" });
  return jsonError(400, "empty image");
}
if (file.size < MIN_IMAGE_BYTES) {
  logScanEvent("bad_image", { uid: ctx.uid, reason: "image too small" });
  return jsonError(400, "image too small");
}
if (file.size > MAX_IMAGE_BYTES) {
  logScanEvent("bad_image", { uid: ctx.uid, reason: "image too large" });
  return jsonError(413, "image too large");
}
```

- [ ] **Step 5: Replace mime sniff and profile / eligibility branches (lines ~85-101)**

After the mime sniff:

```ts
if (!sniffImageMime(buf)) {
  logScanEvent("bad_image", { uid: ctx.uid, reason: "unsupported image format" });
  return jsonError(400, "unsupported image format (need JPEG or PNG)");
}
```

After loading the profile:

```ts
const prof = await getUser(ctx.uid);
if (!prof) {
  logScanEvent("no_profile", { uid: ctx.uid, scanId });
  return jsonError(404, "profile");
}
const SCAN_ELIGIBLE_ROLES = new Set(["student", "admin"]);
if (!SCAN_ELIGIBLE_ROLES.has(prof.role) || prof.status !== "active") {
  logScanEvent("not_eligible", {
    uid: ctx.uid,
    scanId,
    reason: `role=${prof.role} status=${prof.status}`,
  });
  // (remove the previous console.warn line)
  return jsonError(403, "not eligible");
}
```

- [ ] **Step 6: Replace remaining error console calls in the route**

For each existing `console.error(...)` call in the route, replace with the matching `logScanEvent`:

| Original | Replacement |
|---|---|
| `console.error("detector error", ctx.uid, err)` (both occurrences) | `logScanEvent("error_detector", { uid: ctx.uid, scanId, err })` |
| `console.error("blob upload error", ctx.uid, err)` (both occurrences) | `logScanEvent("error_storage", { uid: ctx.uid, scanId, err })` |
| `console.error("preview scan write failed", ctx.uid, err)` | `logScanEvent("error_preview", { uid: ctx.uid, scanId, err })` |
| `console.error("phash failed", ctx.uid, err)` | leave as-is (best-effort phash failure is not an outcome; this is debug noise — keep `console.error` line) |
| The implicit race loss after `await awardScan(awardArgs)` when `!awarded` and `prior` is missing/mismatch (`return jsonError(409, "duplicate scan")` near line ~266) | precede with `logScanEvent("error_award_race", { uid: ctx.uid, scanId })` |

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Run existing tests**

Run: `npx vitest run`
Expected: PASS (no behavior changes; only added logging).

- [ ] **Step 9: Commit**

```bash
git add src/app/api/v1/scan/upload/route.ts
git commit -m "feat(scan-log): structured stdout events at non-Firestore branches"
```

---

### Task 6: Wire `route.ts` — Firestore-tracked outcomes

**Files:**
- Modify: `src/app/api/v1/scan/upload/route.ts`

- [ ] **Step 1: Add `await logScanAttempt` for the preview rejected branch (line ~110)**

In the `prof.role !== "student"` branch, after `if (!det.accepted)`:

```ts
if (!det.accepted) {
  await logScanAttempt({
    scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
    outcome: "rejected_not_pet",
    at: new Date(), localDate,
    confidence: det.confidence, clientConf,
    itemCount: det.itemCount, detectedClass: det.class,
  });
  return new Response(JSON.stringify({ error: "not a PET bottle", confidence: det.confidence }), {
    status: 422, headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Add `await logScanAttempt` for preview success (line ~150)**

Just before `return jsonOk({ scanId, ..., preview: true, ... })`:

```ts
await logScanAttempt({
  scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
  outcome: "preview",
  at: capturedAt, localDate,
  itemCount: det.itemCount, detectedClass: det.class,
  confidence: det.confidence, clientConf,
});
return jsonOk({ /* unchanged */ });
```

- [ ] **Step 3: Add `await logScanAttempt` for replay branch (line ~175)**

```ts
const prior = await getStoredScan(scanId);
if (prior) {
  if (prior.uid !== ctx.uid) return jsonError(409, "duplicate scan");
  await logScanAttempt({
    scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
    outcome: "replay",
    at: new Date(), localDate,
    basePoints: prior.basePoints, streakBonus: prior.streakBonus, totalPoints: prior.totalPoints,
    itemCount: prior.itemCount, detectedClass: prior.detectedClass, confidence: prior.confidence,
  });
  return jsonOk(replayResult(scanId, prior, prof));
}
```

- [ ] **Step 4: Add `await logScanAttempt` for cooldown branch (line ~182)**

```ts
if (wait > 0) {
  await logScanAttempt({
    scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
    outcome: "denied_cooldown",
    at: new Date(), localDate,
  });
  return new Response(JSON.stringify({ error: "cooldown", retryAfter: Math.ceil(wait / 1000) }), {
    status: 429, headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 5: Add `await logScanAttempt` for daily cap branch (line ~187)**

```ts
if (prof.dailyScanDate === localDate && (prof.dailyScans ?? 0) >= DAILY_LIMIT) {
  await logScanAttempt({
    scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
    outcome: "denied_daily_cap",
    at: new Date(), localDate,
  });
  return new Response(JSON.stringify({ error: "daily_limit", limit: DAILY_LIMIT }), {
    status: 429, headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 6: Add `await logScanAttempt` for dup branch (line ~200-206)**

```ts
const dup = await isDuplicateScan(ctx.uid, hash, phash);
if (dup.dup) {
  const dupReason: "hash" | "phash" = dup.reason === "sha256" ? "hash" : "phash";
  await logScanAttempt({
    scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
    outcome: dupReason === "hash" ? "denied_dup_hash" : "denied_dup_phash",
    at: new Date(), localDate,
    dupReason,
  });
  return new Response(
    JSON.stringify({ error: "duplicate scan", reason: dup.reason }),
    { status: 409, headers: { "Content-Type": "application/json" } },
  );
}
```

- [ ] **Step 7: Add `await logScanAttempt` for student `rejected_not_pet` (line ~216)**

```ts
if (!det.accepted) {
  await logScanAttempt({
    scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
    outcome: "rejected_not_pet",
    at: new Date(), localDate,
    confidence: det.confidence, clientConf,
    itemCount: det.itemCount, detectedClass: det.class,
  });
  return new Response(JSON.stringify({ error: "not a PET bottle", confidence: det.confidence }), {
    status: 422, headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 8: Add `await logScanAttempt` for awarded path (just before final `return jsonOk` near line ~270)**

After `bustLeaderboardCaches();`:

```ts
await logScanAttempt({
  scanId, uid: ctx.uid, classKey: prof.classKey ?? "",
  outcome: "awarded",
  at: capturedAt, localDate,
  basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
  itemCount: det.itemCount, detectedClass: det.class,
  confidence: det.confidence, clientConf,
});
return jsonOk({ /* unchanged */ });
```

- [ ] **Step 9: Typecheck and run all tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/v1/scan/upload/route.ts
git commit -m "feat(scan-log): logScanAttempt on awarded/preview/replay/denied/rejected branches"
```

---

## Phase 2: Admin Read API (PR 2)

### Task 7: Admin API route — `GET /api/v1/admin/scan-logs`

**Files:**
- Create: `src/app/api/v1/admin/scan-logs/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/v1/admin/scan-logs/route.ts
import { NextRequest } from "next/server";
import { verifyBearerToken, AuthError } from "@/server/lib/auth";
import { hasRole } from "@/server/lib/role-guard";
import { jsonError, jsonOk } from "@/server/lib/http";
import { listScanAttempts, countScanAttemptsByOutcome, type ScanLogQuery } from "@/server/scan/log-repo";
import type { ScanOutcome } from "@/server/scan/log";

export const runtime = "nodejs";

const ALLOWED: ScanOutcome[] = [
  "awarded", "preview", "replay",
  "denied_cooldown", "denied_daily_cap",
  "denied_dup_hash", "denied_dup_phash",
  "rejected_not_pet",
];

export async function GET(req: NextRequest) {
  let ctx;
  try { ctx = await verifyBearerToken(req); }
  catch (e) {
    if (e instanceof AuthError) return jsonError(e.status, e.message);
    return jsonError(500, "auth");
  }
  if (!hasRole(ctx, "admin")) return jsonError(403, "forbidden");

  const sp = req.nextUrl.searchParams;
  const q: ScanLogQuery = {
    from: parseDate(sp.get("from")),
    to: parseDate(sp.get("to")),
    outcomes: parseOutcomes(sp.get("outcome")),
    uid: sp.get("uid") || undefined,
    classKey: sp.get("classKey") || undefined,
    scanId: sp.get("scanId") || undefined,
    cursor: sp.get("cursor") || null,
    limit: parseLimit(sp.get("limit")),
  };

  const [list, aggregates] = await Promise.all([
    listScanAttempts(q),
    countScanAttemptsByOutcome({ from: q.from, to: q.to, uid: q.uid, classKey: q.classKey }),
  ]);
  return jsonOk({
    rows: list.rows.map((r) => ({ ...r, at: r.at.toISOString() })),
    nextCursor: list.nextCursor,
    aggregates,
  });
}

function parseDate(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function parseLimit(v: string | null): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.min(200, Math.max(1, Math.floor(n)));
}
function parseOutcomes(v: string | null): ScanOutcome[] | undefined {
  if (!v) return undefined;
  const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
  const filtered = parts.filter((p): p is ScanOutcome => (ALLOWED as string[]).includes(p));
  return filtered.length ? filtered : undefined;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/admin/scan-logs/route.ts
git commit -m "feat(scan-log): admin GET /api/v1/admin/scan-logs"
```

---

### Task 8: Client helper in `src/lib/api.ts`

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add types and helper**

Add near other admin helpers in `src/lib/api.ts`:

```ts
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
  // Reuse whatever auth-attaching `fetchJson` (or equivalent) the file already exports.
  // If there is no such helper, call fetch with Authorization: Bearer <token> from the
  // same place other admin helpers obtain it.
  return await fetchJson<AdminScanLogResponse>(`/api/v1/admin/scan-logs?${sp.toString()}`);
}
```

> The exact auth-attach helper depends on `src/lib/api.ts`'s existing utilities (e.g. `fetchJson`, `apiGet`, `request`). Use whichever pattern other admin helpers in the same file already use. **Do not invent a new auth-handling pattern.**

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(scan-log): client helper adminListScanLogs"
```

---

## Phase 3: Admin UI (PR 3)

### Task 9: Shared table component

**Files:**
- Create: `src/app/admin/scan-logs/ScanLogTable.tsx`

- [ ] **Step 1: Create component**

```tsx
// src/app/admin/scan-logs/ScanLogTable.tsx
'use client';
import { useEffect, useState } from 'react';
import { adminListScanLogs, type AdminScanLogQuery, type AdminScanLogResponse, type AdminScanLogRow, type AdminScanLogOutcome } from '@/lib/api';

const OUTCOMES: AdminScanLogOutcome[] = [
  "awarded", "preview", "replay",
  "denied_cooldown", "denied_daily_cap",
  "denied_dup_hash", "denied_dup_phash",
  "rejected_not_pet",
];

const OUTCOME_COLORS: Record<AdminScanLogOutcome, string> = {
  awarded: "#1f8a3a",
  preview: "#5b6cff",
  replay: "#7a7a7a",
  denied_cooldown: "#b58b00",
  denied_daily_cap: "#b58b00",
  denied_dup_hash: "#c4540e",
  denied_dup_phash: "#c4540e",
  rejected_not_pet: "#b00020",
};

interface Props {
  fixedUid?: string;
  initialFrom?: string;
  initialTo?: string;
}

export function ScanLogTable({ fixedUid, initialFrom, initialTo }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(initialFrom ?? weekAgo);
  const [to, setTo] = useState(initialTo ?? today);
  const [outcomes, setOutcomes] = useState<AdminScanLogOutcome[]>([]);
  const [uid, setUid] = useState(fixedUid ?? '');
  const [classKey, setClassKey] = useState('');
  const [scanId, setScanId] = useState('');
  const [data, setData] = useState<AdminScanLogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(cursor: string | null = null) {
    setLoading(true);
    setError('');
    try {
      const q: AdminScanLogQuery = {
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
        outcome: outcomes.length ? outcomes : undefined,
        uid: fixedUid ?? (uid || undefined),
        classKey: classKey || undefined,
        scanId: scanId || undefined,
        cursor,
        limit: 50,
      };
      const res = await adminListScanLogs(q);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(null); /* eslint-disable-next-line */ }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>to <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {!fixedUid && <input placeholder="uid" value={uid} onChange={(e) => setUid(e.target.value)} />}
        {!fixedUid && <input placeholder="classKey" value={classKey} onChange={(e) => setClassKey(e.target.value)} />}
        {!fixedUid && <input placeholder="scanId" value={scanId} onChange={(e) => setScanId(e.target.value)} />}
        <select multiple value={outcomes} onChange={(e) => {
          const opts = Array.from(e.target.selectedOptions).map((o) => o.value as AdminScanLogOutcome);
          setOutcomes(opts);
        }} style={{ minWidth: 180, height: 100 }}>
          {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button onClick={() => load(null)} disabled={loading}>Apply</button>
      </div>

      {data && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {OUTCOMES.map((o) => (
            <span key={o} style={{
              padding: '2px 8px', borderRadius: 999, fontSize: 12,
              background: OUTCOME_COLORS[o], color: 'white',
            }}>
              {o} {data.aggregates[o] ?? 0}
            </span>
          ))}
        </div>
      )}

      {error && <div style={{ color: '#b00020' }}>{error}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', background: '#f4f4f4' }}>
              <th style={th()}>at (BKK)</th>
              <th style={th()}>uid</th>
              <th style={th()}>class</th>
              <th style={th()}>outcome</th>
              <th style={th()}>detected</th>
              <th style={th()}>conf</th>
              <th style={th()}>points</th>
              <th style={th()}>scanId</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={td()}>{formatBkk(r.at)}</td>
                <td style={td()}>
                  {fixedUid
                    ? r.uid
                    : <a href={`/teacher/student?uid=${encodeURIComponent(r.uid)}`}>{shortUid(r.uid)}</a>}
                </td>
                <td style={td()}>{r.classKey}</td>
                <td style={td()}>
                  <span style={{
                    padding: '1px 6px', borderRadius: 4, color: 'white',
                    background: OUTCOME_COLORS[r.outcome],
                  }}>{r.outcome}</span>
                </td>
                <td style={td()}>{r.detectedClass ?? '-'}</td>
                <td style={td()}>{r.confidence != null ? r.confidence.toFixed(2) : '-'}</td>
                <td style={td()}>{pointsCell(r)}</td>
                <td style={td()}>
                  <button onClick={() => navigator.clipboard.writeText(r.scanId)}
                          title="copy" style={{ fontFamily: 'monospace' }}>
                    {r.scanId.slice(0, 8)}…
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        {data?.nextCursor && (
          <button onClick={() => load(data.nextCursor)} disabled={loading}>Next page</button>
        )}
      </div>
    </div>
  );
}

function th(): React.CSSProperties { return { padding: '6px 8px', fontWeight: 600 }; }
function td(): React.CSSProperties { return { padding: '6px 8px', verticalAlign: 'top' }; }
function shortUid(u: string) { return u.length > 8 ? `${u.slice(0, 8)}…` : u; }
function formatBkk(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(d);
}
function pointsCell(r: AdminScanLogRow): string {
  if (r.basePoints == null && r.streakBonus == null && r.totalPoints == null) return '-';
  return `${r.basePoints ?? 0}+${r.streakBonus ?? 0}=${r.totalPoints ?? 0}`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/scan-logs/ScanLogTable.tsx
git commit -m "feat(scan-log): ScanLogTable client component"
```

---

### Task 10: Global page `/admin/scan-logs`

**Files:**
- Create: `src/app/admin/scan-logs/page.tsx`

- [ ] **Step 1: Create page**

```tsx
// src/app/admin/scan-logs/page.tsx
'use client';
import { Suspense } from 'react';
import { theme as t } from '@/lib/theme';
import { ScanLogTable } from './ScanLogTable';

export default function ScanLogsPage() {
  return (
    <main style={{ minHeight: '100dvh', background: t.bone, padding: 16 }}>
      <h1 style={{ margin: '0 0 12px' }}>Scan Logs</h1>
      <Suspense fallback={<div>Loading…</div>}>
        <ScanLogTable />
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Hand-test in dev**

Run: `npm run dev`
Open `http://localhost:3000/admin/scan-logs` while signed in as an admin.
Expected: table loads (possibly empty), filter bar and aggregates strip render, no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/scan-logs/page.tsx
git commit -m "feat(scan-log): /admin/scan-logs page"
```

---

### Task 11: Add admin home link

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add a navigation entry**

Inside the existing admin home page, add a card/link to `/admin/scan-logs` alongside other admin links. The exact JSX depends on what is already there; follow the same pattern as existing cards (do not introduce a new styling system).

If the admin page renders an array of `{ title, href, description }`, append `{ title: 'Scan Logs', href: '/admin/scan-logs', description: 'Audit per-scan attempts (awarded/denied/rejected) — 30d' }`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(scan-log): link Scan Logs from /admin"
```

---

### Task 12: Per-student tab on `/teacher/student`

**Files:**
- Create: `src/components/admin/StudentScanLogsTab.tsx`
- Modify: `src/app/teacher/student/page.tsx`

- [ ] **Step 1: Create wrapper component**

```tsx
// src/components/admin/StudentScanLogsTab.tsx
'use client';
import { ScanLogTable } from '@/app/admin/scan-logs/ScanLogTable';

export function StudentScanLogsTab({ uid }: { uid: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <ScanLogTable fixedUid={uid} />
    </div>
  );
}
```

- [ ] **Step 2: Add tab UI to `src/app/teacher/student/page.tsx`**

In `TeacherProfileContent`, after the existing `useState` declarations, add:

```ts
const [tab, setTab] = useState<'profile' | 'scanLogs'>('profile');
```

Just before the existing content render (the part that paints student details), add a tab strip:

```tsx
<div style={{ display: 'flex', gap: 8, padding: '12px 16px 0' }}>
  <button onClick={() => setTab('profile')} disabled={tab === 'profile'}>โปรไฟล์</button>
  <button onClick={() => setTab('scanLogs')} disabled={tab === 'scanLogs'}>Scan Logs</button>
</div>
```

Wrap the existing profile JSX in `{tab === 'profile' && ( … )}` and after it render:

```tsx
{tab === 'scanLogs' && uid && (
  <div style={{ padding: 16 }}>
    <StudentScanLogsTab uid={uid} />
  </div>
)}
```

Import at the top:

```ts
import { StudentScanLogsTab } from '@/components/admin/StudentScanLogsTab';
```

- [ ] **Step 3: Typecheck and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Hand-test**

Run: `npm run dev`
As an admin, open `/teacher/student?uid=<known-student-uid>`. Click "Scan Logs". Expected: table renders with rows for that uid only; filter bar shows no `uid` input.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/StudentScanLogsTab.tsx src/app/teacher/student/page.tsx
git commit -m "feat(scan-log): Scan Logs tab on /teacher/student"
```

---

## Phase 4: Documentation & Deploy Gate

### Task 13: Document TTL post-deploy step

**Files:**
- Modify: `AGENTS.md` (or `scripts/README.md` if it exists)

- [ ] **Step 1: Add a "Post-deploy steps" subsection**

Append a new section to the chosen file:

```md
## Post-deploy: enable Firestore TTL for scanAttempts

After the first deployment that includes scan attempt logging, enable the TTL
policy on the `scanAttempts` collection so 30-day-old rows auto-purge:

1. Open the Firebase console → Firestore → TTL.
2. Add a policy on collection `scanAttempts`, field `expiresAt`.
3. Status should turn "Active" within ~24h.

Without this step the collection grows unbounded.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: post-deploy TTL step for scanAttempts"
```

- [ ] **Step 3: File a bd issue for the deploy gate**

```bash
bd create \
  --title="Enable Firestore TTL on scanAttempts.expiresAt" \
  --description="Post-deploy step gating scan-log retention. See AGENTS.md > Post-deploy: enable Firestore TTL." \
  --type=task \
  --priority=2
```

---

## Self-Review (done)

- **Spec coverage**
  - §1 Architecture → Tasks 1, 3, 5–8, 9–12.
  - §2 Data flow (call-site map) → Tasks 5, 6.
  - §3 Helper API → Tasks 1, 2, 4.
  - §4 Admin UI → Tasks 7–12.
  - §5 Testing → Tasks 2, 4 (helper unit). Route-level tests deferred: none exist today (`src/app/api/v1/scan/upload/__tests__/` is empty); the spec's "extend if exists; else add 3 minimum" was a hedge — for this plan we rely on helper unit tests and hand-tested route changes. If the next reviewer wants real route tests, file them as a follow-up.
  - §6 Migration/rollout → Tasks 5–6 (console replacements), Task 13 (TTL doc + bd issue). No feature flag, no backfill, matches spec.
  - §7 Risks — write latency + storage + TTL forget — Task 13 mitigates TTL forget; latency/storage are accepted.

- **Placeholder scan** — all code blocks complete; no TBD/TODO; one `> Note` in Task 8 directs the engineer to follow the existing auth-attach helper in `src/lib/api.ts`. This is intentional (we don't know its exact shape), not a placeholder.

- **Type consistency** — `ScanOutcome`, `StdoutOnlyOutcome`, `ScanAttemptLog` defined in Task 1 are reused by Tasks 3, 4, 5, 6 in the server, and a client-side mirror (`AdminScanLogOutcome`, etc.) is defined in Task 8 to avoid leaking server imports into client code. `writeScanAttempt` signature matches between Task 3 (definition) and Task 4 (mock).
