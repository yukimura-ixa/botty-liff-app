# Scan flow: annotated bbox preview + mandatory approver confirm

Date: 2026-05-21
Status: approved

## Goal

After student uploads scan image:
1. Show annotated result image (bbox + label overlays from Roboflow workflow) to student.
2. Block point award until student scans approver QR.

Equivalent to existing `SCAN_MODE=enforce` flow + new bbox preview.

## Current state

- `SCAN_MODE` env switches between `off` (instant award), `log` (award + pending), `enforce` (pending only, award after confirm).
- `enforce` flow exists end-to-end: `/api/v1/scan/upload` creates pending; `/api/v1/scan/confirm` consumes pending + approver QR token, then awards.
- Roboflow workflow `botty-infer` outputs: `count_objects.output`, `output_image.image` (annotated JPEG/PNG base64), `predictions` (raw).
- `detect()` (`src/server/scan/detect.ts`) parses only raw predictions; ignores `output_image` + `count_objects`.
- Client (`src/app/scan/page.tsx`) already has approver QR scan UI gated on `approverPrompt`.

## Changes

### 1. Detector — surface annotated image

File: `src/server/scan/detect.ts`

- Extend `WorkflowResponse` type:
  ```ts
  type WorkflowOutput = {
    predictions?: { predictions?: WorkflowPrediction[] };
    output_image?: { value?: string; type?: string };
    count_objects?: { output?: number };
  };
  ```
- Extend `DetectResult`:
  ```ts
  export type DetectResult = {
    accepted: boolean;
    confidence: number;
    class: string;
    itemCount: number;
    annotatedImage?: string; // base64, no data URI prefix
  };
  ```
- In `detect()`, read `outputs[0].output_image.value` (string base64). Strip leading `data:image/...;base64,` if present. Skip if missing or workflow errored.
- Prefer `outputs[0].count_objects.output` for `itemCount` when present; fall back to counting predictions that match `cfg.bottleClass`.

### 2. Upload route — pass through to client

File: `src/app/api/v1/scan/upload/route.ts`

- In all three response branches (`off`, `log`, `enforce`), include `annotatedImage: det.annotatedImage` field when defined.
- No DB persistence. Annotated image is response-only.

### 3. Client API typing

File: `src/lib/api.ts`

- Extend the scan upload response type with `annotatedImage?: string`.

### 4. Scan page — render annotated image

File: `src/app/scan/page.tsx`

- When `result.annotatedImage` present, render an `<img>` near top of result panel: `src={"data:image/jpeg;base64," + result.annotatedImage}`.
- Place above the existing point-breakdown grid.
- Add `alt="ผลการตรวจจับ"`, `loading="lazy"`, sane width (e.g. `width:"100%", maxWidth:360, borderRadius:12`).
- Fall back gracefully when missing: render nothing extra.

### 5. Mode policy

- Keep `SCAN_MODE` env-driven. No code-level removal of `off`/`log` paths (useful for debugging).
- Production env: `SCAN_MODE=enforce` (set in Vercel env). Document in `.env.local` example.

## Out of scope

- Persisting annotated image to Vercel Blob.
- Client-side canvas drawing from raw predictions (fallback if workflow viz block disappears — defer).
- Removing `off`/`log` modes from code.
- Approver-side UI changes.
- Changes to `/api/v1/scan/confirm`.

## Edge cases

- Roboflow workflow returns `output_image` as `{ type: "base64", value: "..." }` or `{ value: "..." }` — accept both shapes.
- `output_image.value` may include `data:image/jpeg;base64,` prefix. Strip before sending or before rendering. Pick one location (recommend strip in `detect()` so server always emits clean base64).
- If workflow viz blocks fail server-side, response still includes raw predictions. Client must tolerate missing `annotatedImage`.
- Payload size: typical annotated JPEG <200KB, base64 inflates ~33%. Acceptable on LIFF mobile.

## Test plan

- Unit: extend existing detector tests with fixture containing `output_image` + `count_objects`; verify `annotatedImage` extracted and prefix stripped.
- Unit: fixture without `output_image`; verify `annotatedImage` undefined.
- Manual: scan in dev with `SCAN_MODE=enforce`. Verify annotated image renders, approver QR still required before award.
- Manual: confirm flow still awards correctly after approver QR scan.

## Files touched

- `src/server/scan/detect.ts` — type + parse
- `src/server/scan/detect.test.ts` — fixtures (if file exists)
- `src/app/api/v1/scan/upload/route.ts` — response pass-through
- `src/lib/api.ts` — response type
- `src/app/scan/page.tsx` — image render
