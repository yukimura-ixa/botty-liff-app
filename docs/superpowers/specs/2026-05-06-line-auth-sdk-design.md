# LINE Auth SDK Design

## Context

The current login path uses LINE LIFF on the frontend and posts a LINE `id_token` to `POST /v1/auth/line` on `botty-api`. The backend currently verifies that token with a handwritten HTTP call to LINE's verify endpoint. We already confirmed one real failure mode: the frontend can end up sending an expired LINE ID token.

This design keeps the LIFF-based frontend, but moves the backend verification logic onto `kkdai/line-login-sdk-go` so the LINE integration is clearer, easier to test, and easier to extend later.

## Goals

- Keep the frontend on LIFF instead of switching to a full redirect/PKCE login flow.
- Use the LINE Go SDK on the backend for ID token verification.
- Keep Firestore as the source of truth for app profile, role, and onboarding state.
- Prevent stale LINE ID tokens from being reused on the frontend.
- Return a predictable auth error shape so the frontend can decide whether to retry login.

## Non-Goals

- Do not replace LIFF with a server-rendered LINE OAuth callback flow.
- Do not sync LINE profile data into Firestore during login.
- Do not change the core Firestore user model in this pass.
- Do not redesign teacher/admin authorization.

## Options Considered

### 1. Keep LIFF frontend, use LINE SDK on backend

This is the selected approach. It preserves the current app shell, fixes the token verification path, and keeps the auth boundary small.

Trade-off: the backend needs a LINE channel secret because the SDK constructor requires it, even though verification itself only needs the channel ID.

### 2. Switch to backend-owned LINE Login redirect/PKCE

This would move the login screen logic to LINE Login URLs and make the backend responsible for the token exchange.

Trade-off: larger UX and routing change, more moving parts, and it is unnecessary for the current LIFF-based app.

### 3. Keep the handwritten verify call and only adjust the frontend

This would be the smallest code change.

Trade-off: it leaves the LINE integration split between a manual HTTP call and the frontend, which is less maintainable and does not use the SDK the request called for.

## Selected Design

### Frontend

The frontend continues to initialize LIFF, checks `liff.isLoggedIn()`, and requests the LINE ID token immediately before calling `/v1/auth/line`. The frontend must not cache the LINE ID token in session storage or reuse a stale token across page reloads.

If `/v1/auth/line` fails with an auth failure caused by an expired or otherwise invalid LINE token, the frontend should clear only its app session state and force a fresh LIFF login once. After that retry, if auth still fails, the UI should surface the backend error message.

The frontend still treats Firebase as the source of truth after login:

- `POST /v1/auth/line` returns a Firebase custom token.
- The app signs in with `signInWithCustomToken`.
- Protected API calls use the Firebase ID token, not the LINE token.

### Backend

The backend keeps `/v1/auth/line` as the public auth entrypoint, but replaces the manual LINE verification HTTP request with a small wrapper around `kkdai/line-login-sdk-go`.

Implementation shape:

- Create a LINE SDK client with `social.New(lineChannelID, lineChannelSecret)`.
- Call `client.VerifyIDToken(idToken, social.VerifyIDTokenRequestOptions{}).Do()`.
- Map the returned claims to the existing app identity model.
- Use `Sub` as the stable LINE user identifier and derive `uid = "line:" + sub`.
- Keep the existing Firestore lookup / pending-user creation / custom-token minting flow.

The SDK constructor requires both channel ID and channel secret. Even though the verify call itself only uses the channel ID, the backend must receive a `LINE_CHANNEL_SECRET` value to construct the SDK client.

### Error Mapping

The auth endpoint should distinguish between:

- invalid or expired LINE token
- upstream LINE/network failures
- backend internal failures

Recommended response shape for `/v1/auth/line`:

```json
{ "error": "invalid LINE token", "detail": "...optional debug detail..." }
```

The `detail` field should remain debug-gated so production does not leak unnecessary upstream details.

### Configuration

Cloud Run should provide:

- `LINE_CHANNEL_ID`
- `LINE_CHANNEL_SECRET`
- existing app env vars such as `GCP_PROJECT`, `GCS_BUCKET`, and `ALLOWED_ORIGINS`

If the secret is managed in Secret Manager, this design expects a dedicated secret reference for the channel secret as well.

## Implementation Boundaries

- `botty-api/internal/auth/line.go`
  - owns the LINE SDK wrapper and ID token verification
- `botty-api/cmd/api/main.go`
  - owns `/v1/auth/line` request handling and error mapping
- `botty-api/deploy/cloudrun.yaml`
  - owns runtime env wiring for LINE IDs and secrets
- `botty-liff-app/src/app/page.tsx`
  - owns LIFF login bootstrap and retry-on-expired-token behavior
- `botty-liff-app/src/lib/liff.ts`
  - remains the LIFF helper boundary
- `botty-liff-app/src/lib/api.ts`
  - should carry typed auth failures cleanly if the frontend needs to branch on them

## Testing Plan

### Backend tests

- Verify that a valid token path still mints a Firebase custom token and returns `role` and `onboarded`.
- Verify that a LINE verify failure maps to `401`.
- Verify that expired or invalid-token responses keep the body shape stable enough for the frontend retry path.
- Verify that the SDK wrapper is isolated enough to stub the HTTP client or transport in tests.

### Frontend tests

- Verify that the login page requests the LINE ID token immediately before auth.
- Verify that a failed auth response caused by an expired LINE token triggers one forced re-login.
- Verify that successful auth still routes to `/onboard`, `/home`, or `/teacher` based on backend flags.

### Smoke test

1. Open LIFF and log in with a fresh LINE session.
2. Confirm `/v1/auth/line` returns a Firebase custom token.
3. Let the LIFF tab sit long enough for a token to expire, then retry login.
4. Confirm the frontend restarts LIFF login and succeeds on the next fresh token.

## Rollout Plan

1. Add backend SDK verification and the LINE channel secret wiring.
2. Deploy backend and confirm auth still works with a fresh token.
3. Update the frontend retry behavior for expired LINE tokens.
4. Remove any temporary auth debugging flags once the retry path is stable.

## Acceptance Criteria

- The frontend keeps LIFF as the login entrypoint.
- The backend uses the LINE SDK for token verification.
- The backend no longer depends on a handwritten LINE verify request.
- Expired LINE ID tokens no longer leave the user stuck on a permanent auth failure.
- Firestore remains the source of truth for app user data after login.