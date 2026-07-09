# Spoof / 2D-source detection — soft-launch flag+log

**Date:** 2026-06-11
**Status:** Approved design, pending implementation
**Topic:** Detect scans captured from a 2D reproduction (screen recapture, printed
photo, photo-of-a-photo) rather than a real 3D bottle. Soft launch: flag + log
only, no blocking.

## Problem

A student can cheat the bottle scan by photographing a **2D source** instead of a
real bottle:

- a screen showing a bottle image (LCD/LED recapture),
- a printed photo,
- a photo-of-a-photo / poster.

All three share one tell: no parallax/depth, flat lighting, planar geometry. We
want to detect these and surface them for review.

## Context: existing defenses

- **`BIN_CONFIRM_MODE=enforce` (default)** already requires a physical staff-QR
  confirm before any points land — the strongest anti-spoof, because a 2D-source
  cheat still earns nothing without in-person staff proximity. This feature is
  defense-in-depth + audit visibility, not the primary gate.
- Camera-only capture (gallery upload blocked) — already shipped.
- Existing dedup: sha256 hash, perceptual hash, cooldown, daily cap, IP limit.

## Scope decision (soft launch)

**Flag + log only. No control-flow change.** Record a spoof score on the
`scanAttempts` log; the scan proceeds exactly as it does today. Rationale: no
training data yet → a hard reject with a mis-tuned threshold would strand
legitimate students. The staff-QR physical gate is the real backstop while we
gather score distribution. Hard enforcement (reject / force-confirm) is a
possible later iteration, out of scope here.

## Architecture

Detection already calls a **Roboflow Workflow** endpoint (`detect()` in
`src/server/scan/detect.ts`) with the base64 image and parses object-detection
predictions. We extend the **same workflow** with a classification block, so it
is **one fetch, one parse** — no extra latency, round-trip, or cost beyond the
added model.

### Two parts

#### Part A — Roboflow (data + ops, human-in-loop)

Greenfield model. These are console/CLI ops actions an agent cannot fully perform
(labeling + training need a human); scaffolded via the roboflow skills/MCP.

1. New **classification** project, 2 classes: `real` / `flat2d`.
2. Data collection:
   - **`real`** positives: pull existing real scan images from Vercel Blob (we
     already have many).
   - **`flat2d`** negatives — three sub-sources, **balanced counts** (or it
     overfits to screens and misses print):
     - screen recapture (LCD/LED — moiré, subpixel grid),
     - printed photo (paper texture, halftone dots),
     - photo-of-photo / poster.
   - ~few hundred per class to start.
3. Train classifier.
4. Add a **classification block** to the existing detection Workflow, fed the
   same input image, exposed as a named output `spoof` (top class + confidence).
5. Publish the new workflow version.

#### Part B — Code (server)

No control-flow change. **Fail-open** throughout.

| File | Change |
|---|---|
| `src/server/scan/detect.ts` | Extend `WorkflowOutput` with an optional `spoof` classification field; in `detect()` parse it into a new `DetectResult.spoofScore?: number` (probability of the `flat2d` class). Missing / malformed → `undefined`, never throws. |
| `src/server/scan/log.ts` | `ScanAttemptLog` += `spoofScore?: number`. |
| `src/server/scan/log-repo.ts` | `writeScanAttempt` optKeys += `spoofScore` (omitted from the doc when undefined). |
| `src/app/api/v1/scan/upload/route.ts` | Pass `spoofScore: det.spoofScore` into the `logScanAttempt` calls (`pending` / `awarded` / `preview` outcomes). Scan proceeds exactly as today. |
| Scan Logs UI (audit) | Surface `spoofScore` (column / optional filter) so staff can review high-score scans. **Follow-up issue**, not blocking. |

## Data flow

```
upload → detect() (one fetch)
       → workflow returns: detection predictions + spoof classification
       → DetectResult.spoofScore  (prob of flat2d)
       → logScanAttempt records spoofScore on scanAttempts
       → audit reviews
```

Points gate unchanged — staff-QR confirm remains the physical backstop.

## Error handling — fail-open (the safety property)

If the spoof classification output is **absent** (old workflow version still
live, or the block errored), `spoofScore` is `undefined` → logged without it →
**the scan is never blocked.** This is what makes the soft launch safe: it cannot
strand a student. No new enable/disable env var is needed — no spoof block in the
deployed workflow simply means the score is absent, which is handled gracefully.
Part B code can ship and lie dormant until the workflow emits `spoof`.

## Threshold

Flag-only → log the **raw score** always; no hard threshold. Skip a
`spoofSuspected` boolean for now. Add an audit-UI filter (e.g. `spoofScore >= X`)
later, once the real score distribution is visible. Avoids guessing a threshold
with zero training data.

## Testing

- `src/server/scan/detect.test.ts`:
  - workflow response **with** a `spoof` output → `spoofScore` parsed correctly,
  - **without** the output → `spoofScore` undefined,
  - **malformed** spoof output → `spoofScore` undefined (fail-open, no throw).
- `log-repo` test: `spoofScore` persisted when present, omitted when undefined.

Firestore repos are otherwise verified through routes / manually, per project
convention.

## YAGNI cuts

- No reject / force-confirm path (soft launch only).
- No separate classifier endpoint (extend the existing workflow).
- No enable/disable env (workflow version controls presence).
- No `spoofSuspected` threshold boolean (raw score is enough for now).

## Ownership split

- **Part A** (labeling / training / workflow publish) — human/ops, scaffolded via
  roboflow skills.
- **Part B** (code) — can ship independently and stays dormant (fail-open) until
  the workflow emits `spoof`.
