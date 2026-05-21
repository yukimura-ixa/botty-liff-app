# Scan flow: bbox preview + approver confirm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Roboflow workflow's annotated bbox image to the scan client and ensure points are only awarded after the student scans an approver QR.

**Architecture:** Extend the detector to extract the workflow's `output_image` (annotated JPEG, base64) alongside raw predictions. Pass it through `/api/v1/scan/upload` to the client. Render it in the scan result panel. Award gating already exists via `SCAN_MODE=enforce` and `/api/v1/scan/confirm`; just make sure prod env uses enforce.

**Tech Stack:** Next.js 16 App Router, Vitest, TypeScript, Roboflow Workflows API.

**Spec:** `docs/superpowers/specs/2026-05-21-scan-bbox-approver-confirm-design.md`

---

### Task 1: Extend detector types + parsing for annotated image

**Files:**
- Modify: `src/server/scan/detect.ts`
- Test: `src/server/scan/detect.test.ts`

- [ ] **Step 1: Add failing test — extract annotated image with `data:` prefix stripped**

Append in `src/server/scan/detect.test.ts` inside `describe("detect", ...)`:

```ts
const okResponseFull = (
  preds: { class: string; confidence: number }[],
  extras: Partial<{ outputImage: string; countObjects: number }> = {},
) => ({
  ok: true,
  status: 200,
  json: async () => ({
    outputs: [{
      predictions: { image: { width: 100, height: 100 }, predictions: preds },
      ...(extras.outputImage !== undefined ? { output_image: { type: "base64", value: extras.outputImage } } : {}),
      ...(extras.countObjects !== undefined ? { count_objects: { output: extras.countObjects } } : {}),
    }],
  }),
});

it("extracts annotatedImage from output_image.value", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponseFull(
    [{ class: "PET Bottle", confidence: 0.85 }],
    { outputImage: "AAA_BASE64_BYTES" },
  )));
  const r = await detect(cfg, Buffer.from("fake-bytes"));
  expect(r.annotatedImage).toBe("AAA_BASE64_BYTES");
});

it("strips data URI prefix from output_image.value", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponseFull(
    [{ class: "PET Bottle", confidence: 0.85 }],
    { outputImage: "data:image/jpeg;base64,ZZZ_BYTES" },
  )));
  const r = await detect(cfg, Buffer.from("fake-bytes"));
  expect(r.annotatedImage).toBe("ZZZ_BYTES");
});

it("leaves annotatedImage undefined when output_image missing", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponseFull(
    [{ class: "PET Bottle", confidence: 0.85 }],
  )));
  const r = await detect(cfg, Buffer.from("fake-bytes"));
  expect(r.annotatedImage).toBeUndefined();
});

it("prefers count_objects.output for itemCount", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponseFull(
    [{ class: "PET Bottle", confidence: 0.85 }, { class: "PET Bottle", confidence: 0.9 }],
    { countObjects: 5 },
  )));
  const r = await detect(cfg, Buffer.from("fake-bytes"));
  expect(r.itemCount).toBe(5);
});
```

- [ ] **Step 2: Run tests — confirm new ones fail**

Run: `npx vitest run src/server/scan/detect.test.ts`
Expected: 4 new tests fail (annotatedImage / itemCount mismatch).

- [ ] **Step 3: Implement — replace `detect.ts` body**

Use Serena `replace_symbol_body` on `WorkflowResponse` type and `detect` function. Full file should read:

```ts
export type DetectorConfig = {
  url: string;
  apiKey: string;
  bottleClass: string;
  acceptThreshold: number;
};

export type DetectResult = {
  accepted: boolean;
  confidence: number;
  class: string;
  itemCount: number;
  annotatedImage?: string;
};

type WorkflowPrediction = { class: string; confidence: number };
type WorkflowOutput = {
  predictions?: { predictions?: WorkflowPrediction[] };
  output_image?: { value?: string; type?: string };
  count_objects?: { output?: number };
};
type WorkflowResponse = {
  outputs?: WorkflowOutput[];
  error_type?: string;
  message?: string;
};

export function classMatches(predicted: string, want: string): boolean {
  return predicted.trim().toLowerCase() === want.trim().toLowerCase();
}

function stripDataUriPrefix(s: string): string {
  const i = s.indexOf("base64,");
  return i >= 0 && s.startsWith("data:") ? s.slice(i + "base64,".length) : s;
}

export async function detect(cfg: DetectorConfig, imageBytes: Buffer | Uint8Array): Promise<DetectResult> {
  if (imageBytes.length === 0) throw new Error("empty image bytes");
  const encoded = Buffer.from(imageBytes).toString("base64");
  const body = JSON.stringify({
    api_key: cfg.apiKey,
    inputs: {
      image: { type: "base64", value: encoded },
    },
  });
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`roboflow status ${res.status}: ${text.slice(0, 200)}`);
  }
  const out = (await res.json()) as WorkflowResponse;
  if (out.error_type) throw new Error(`roboflow workflow: ${out.error_type}`);

  const first = out.outputs?.[0];
  const preds = first?.predictions?.predictions ?? [];
  let best: { conf: number; cls: string } | null = null;
  let count = 0;
  for (const p of preds) {
    if (!classMatches(p.class, cfg.bottleClass)) continue;
    count++;
    if (!best || p.confidence > best.conf) best = { conf: p.confidence, cls: p.class };
  }

  const rawImg = first?.output_image?.value;
  const annotatedImage = typeof rawImg === "string" && rawImg.length > 0 ? stripDataUriPrefix(rawImg) : undefined;

  const cntFromBlock = first?.count_objects?.output;
  const itemCount = typeof cntFromBlock === "number" ? cntFromBlock : count;

  if (!best) return { accepted: false, confidence: 0, class: "", itemCount: 0, annotatedImage };
  return {
    accepted: best.conf >= cfg.acceptThreshold,
    confidence: best.conf,
    class: best.cls,
    itemCount,
    annotatedImage,
  };
}

export function detectorConfigFromEnv(): DetectorConfig {
  const host = (process.env.ROBOFLOW_HOST ?? "https://serverless.roboflow.com").replace(/\/+$/, "");
  const model = (process.env.ROBOFLOW_MODEL ?? "napat-pbd-gmail-com/workflows/botty-infer").replace(/^\/+|\/+$/g, "");
  const apiKey = process.env.ROBOFLOW_API_KEY;
  if (!apiKey) throw new Error("ROBOFLOW_API_KEY missing");
  return {
    url: `${host}/${model}`,
    apiKey,
    bottleClass: process.env.ROBOFLOW_BOTTLE_CLASS ?? "PET Bottle",
    acceptThreshold: process.env.BOTTLE_ACCEPT_THRESHOLD ? Number(process.env.BOTTLE_ACCEPT_THRESHOLD) : 0.7,
  };
}
```

- [ ] **Step 4: Run tests — confirm all pass**

Run: `npx vitest run src/server/scan/detect.test.ts`
Expected: all tests PASS (existing 7 + 4 new).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/scan/detect.ts src/server/scan/detect.test.ts
git commit -m "feat(scan): extract annotated bbox image + count from Roboflow workflow"
```

---

### Task 2: Pass `annotatedImage` through upload API response

**Files:**
- Modify: `src/app/api/v1/scan/upload/route.ts` (three response branches near end of `POST`)

- [ ] **Step 1: Add `annotatedImage` to the `off` branch response**

In `src/app/api/v1/scan/upload/route.ts`, locate the `if (m === "off")` `jsonOk({ ... })` call. Add the field inside the object:

```ts
return jsonOk({
  scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
  basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
  newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
  annotatedImage: det.annotatedImage,
});
```

- [ ] **Step 2: Add `annotatedImage` to the `log` branch response**

Same file, `if (m === "log")` block:

```ts
return jsonOk({
  pendingId, expiresInSec: Math.floor(PENDING_TTL_MS / 1000),
  scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
  basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
  newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
  annotatedImage: det.annotatedImage,
});
```

- [ ] **Step 3: Add `annotatedImage` to the `enforce` (final) branch response**

Same file, last `return jsonOk({...})` (the `awarded: false` one):

```ts
return jsonOk({
  pendingId, expiresInSec: Math.floor(PENDING_TTL_MS / 1000),
  scanId, detectedClass: det.class, confidence: det.confidence, itemCount: det.itemCount,
  basePoints: pt.basePoints, streakBonus: pt.streakBonus, totalPoints: pt.total,
  newTotalPoints: newTotal, streakDays: newStreak, prevRank: prof.rank ?? "ต้นกล้า", newRank,
  awarded: false,
  annotatedImage: det.annotatedImage,
});
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. (Field will be typed `string | undefined` from `det.annotatedImage`.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/scan/upload/route.ts
git commit -m "feat(scan): include annotatedImage in /scan/upload responses"
```

---

### Task 3: Extend client `ScanResult` type

**Files:**
- Modify: `src/lib/api.ts:93-107` (the `ScanResult` interface)

- [ ] **Step 1: Add `annotatedImage?: string` to `ScanResult`**

Final interface:

```ts
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
  pendingId?: string
  expiresInSec?: number
  annotatedImage?: string
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(scan): add annotatedImage to client ScanResult type"
```

---

### Task 4: Render annotated image in scan result panel

**Files:**
- Modify: `src/app/scan/page.tsx` (the result panel, just inside the result `<div>` before the points breakdown grid)

- [ ] **Step 1: Locate result panel**

Open `src/app/scan/page.tsx`. Find the section that renders the result card — guarded by `result && ...`. The points grid is built from an array like `[["ขวด PET พื้นฐาน", ...], ["โบนัสสตรีค", ...], ...]`. Insert the annotated image block immediately above the title/grid, still inside the result-card wrapper.

- [ ] **Step 2: Add the annotated image block**

Insert this JSX immediately inside the result wrapper, before the icon/title row:

```tsx
{result.annotatedImage && (
  <img
    src={`data:image/jpeg;base64,${result.annotatedImage}`}
    alt="ผลการตรวจจับ"
    loading="lazy"
    style={{
      width: "100%",
      maxWidth: 360,
      borderRadius: 12,
      display: "block",
      marginBottom: 12,
      objectFit: "contain",
    }}
  />
)}
```

(Place this immediately after the opening `<div>` of the result card and before the existing emoji/title block. Pure additive — no other JSX changes.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors. (Next.js may warn about `<img>` vs `<Image>` — acceptable here because the source is a runtime base64 data URI, not optimizable by `next/image`.)

- [ ] **Step 5: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat(scan): render annotated bbox image in result panel"
```

---

### Task 5: Set `SCAN_MODE=enforce` for dev + production

**Files:**
- Modify: `.env.local` (local only — do NOT commit)
- Vercel env (Production + Preview)

- [ ] **Step 1: Set local env**

Edit `.env.local`. Ensure line exists:

```
SCAN_MODE=enforce
```

- [ ] **Step 2: Set Vercel env (production + preview)**

Run (or use Vercel dashboard):

```bash
vercel env add SCAN_MODE production
# enter value: enforce
vercel env add SCAN_MODE preview
# enter value: enforce
```

(Skip if already set — `vercel env ls` to check.)

- [ ] **Step 3: No commit** — env files are gitignored. No code change in this task.

---

### Task 6: Manual end-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify upload + bbox preview**

1. Open the LIFF URL in browser (LINE webview or `liff.url`).
2. Sign in as a student with `status=active`.
3. Capture/upload a PET-bottle image.
4. Expected: result card shows annotated image at top (bounding boxes + labels visible), points listed but `awarded: false` (approver QR section visible).

- [ ] **Step 3: Verify approver gating**

1. Open `/approver` in a second browser as an approver-role user. Note the rotating QR.
2. Scan the approver QR from the scan-result screen.
3. Expected: client calls `/scan/confirm`, response `ok: true`. Points then reflect in `/home` / `/history`.

- [ ] **Step 4: Verify non-PET rejection**

1. Upload a non-bottle image.
2. Expected: 422 "not a PET bottle". No pending created. No annotated image needed (route returns before reaching detector image extraction — verify whether response still includes a 422 body; no UI regression).

- [ ] **Step 5: Browser network check**

In DevTools → Network → `/scan/upload`. Confirm response JSON contains `annotatedImage` (base64 string).

---

## Self-review notes

- All 5 spec requirements covered: detector type + parse (Task 1), upload route pass-through (Task 2), client type (Task 3), client render (Task 4), env policy (Task 5).
- No placeholders or "TBD" markers.
- Types consistent across tasks: `annotatedImage?: string` matches in `DetectResult`, route responses, and `ScanResult`.
- Approver/confirm logic unchanged; existing `SCAN_MODE=enforce` path provides the gating.
