# Integrate `botty-api` with frontend core flow

## Context

Frontend (`botty-liff-app`) currently has partial API alignment with `botty-api`.  
Core flow scope for this design is:

1. Login (`/`)
2. Onboarding (`/onboard`)
3. Home (`/home`)
4. Scan (`/scan`)

Goal: make frontend behavior and API contracts match backend reality without changing backend endpoints for this pass.

## Scope

### In scope

- Align frontend API client types and payloads with backend responses used by core flow.
- Adjust core-flow page logic where backend contract differs from frontend assumptions.
- Keep existing UI visuals.
- Improve auth/error handling consistency in the API boundary used by core flow.

### Out of scope

- Teacher/admin feature expansion
- Backend endpoint redesign
- UI redesign and non-core flow refactors

## Chosen approach

Hybrid integration (recommended): keep backend unchanged, update frontend API layer + core pages to consume backend contracts safely.

## Architecture and boundaries

- `src/lib/api.ts` is the single translation boundary between backend contract and UI components.
- Pages (`/`, `/onboard`, `/home`, `/scan`) consume typed data from API helpers and should not embed backend-shape assumptions.
- Authentication flow remains LINE LIFF -> `/v1/auth/line` -> Firebase custom token sign-in -> bearer token for protected APIs.

## Contract alignment design

### Auth

- `POST /v1/auth/line` returns `{ customToken, role, onboarded }`.
- Login route behavior:
  - `onboarded === false` -> `/onboard`
  - `onboarded === true` and role `student` -> `/home`
  - `onboarded === true` and role `teacher` -> `/teacher`

### Onboarding and profile

- `POST /v1/me/onboard` request uses `{ fullName, nickname, grade, room, consent }`.
- `GET /v1/me` drives profile-dependent state on `/home`.

### Scan upload

- `POST /v1/scan/upload` uses multipart body with `image`; keep optional `clientConfidence` compatibility.
- Frontend scan result typing is aligned to backend response fields (`scanId`, points/streak values), with frontend mapping where needed for display.

### Home data

- `/home` uses:
  - `GET /v1/me`
  - `GET /v1/school/goal`
- 404 profile flow still redirects to `/onboard`.

## Error handling and auth behavior

- API layer throws structured status-aware errors for non-2xx responses.
- Page-level handlers branch on HTTP status only where behavior differs (e.g., 404 profile missing).
- Login page keeps explicit phase transitions and retry state for LIFF/Firebase/auth failures.
- Desktop gating remains disabled per latest product direction.

## Files expected to change

- `src/lib/api.ts` (primary contract integration boundary)
- `src/app/page.tsx` (login redirect contract handling)
- `src/app/home/page.tsx` (profile/goal loading behavior if needed)
- `src/app/scan/page.tsx` (result field mapping if needed)
- `src/app/onboard/page.tsx` (payload/flow confirmation)

## Validation plan

- Use existing frontend checks:
  - build
  - lint (acknowledging current repo baseline warnings/errors may pre-exist)
- Smoke flow target:
  - Login -> Onboard -> Home -> Scan upload -> Result display

## Acceptance criteria

1. Core flow pages call backend endpoints with matching request payloads.
2. Frontend correctly handles backend response shapes for core flow.
3. Auth token propagation works for protected core-flow endpoints.
4. Core flow does not rely on mocked or placeholder API values.
