# LINE Auth SDK Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the backend's handwritten LINE token verification with the `kkdai/line-login-sdk-go` SDK, add frontend retry logic for expired tokens, and ensure secure configuration management for the LINE channel secret.

**Architecture:** The backend will use the LINE SDK's `VerifyIDToken()` method to validate tokens sent from the LIFF frontend. The frontend will detect expired-token auth failures and retry login once with a fresh token. Configuration will be managed through Cloud Run environment variables with the channel secret sourced from Secret Manager.

**Tech Stack:** Go 1.23 (Gin, Firebase Admin SDK, `kkdai/line-login-sdk-go`), TypeScript/Next.js (LIFF 2.28.0, Firebase SDKs), GCP (Cloud Run, Secret Manager, Cloud Build)

---

## File Structure

**Backend files:**
- `botty-api/internal/auth/line.go` — Replace manual HTTP verification with SDK wrapper
- `botty-api/cmd/api/main.go` — Update `/v1/auth/line` handler to use new SDK wrapper, refine error mapping
- `botty-api/internal/auth/line_test.go` — Add SDK-based verification tests
- `botty-api/deploy/cloudrun.yaml` — Add `LINE_CHANNEL_SECRET` environment variable
- `botty-api/go.mod` — Add `github.com/kkdai/line-login-sdk-go` dependency

**Frontend files:**
- `botty-liff-app/src/app/page.tsx` — Add expired-token retry logic to login flow
- `botty-liff-app/src/lib/api.ts` — Ensure error responses are typed for frontend branching
- `botty-liff-app/src/__tests__/app/page.test.tsx` — Add tests for retry behavior

**Configuration:**
- Cloud Run Service should have `LINE_CHANNEL_SECRET` wired from Secret Manager
- `.env.local` (local dev) or Secret Manager (Cloud Run) supplies `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET`

---

## Task 1: Add LINE SDK Dependency

**Files:**
- Modify: `botty-api/go.mod`

- [ ] **Step 1: Review current go.mod**

Run: `cat botty-api/go.mod | head -30`

Expected: See current version of Go and existing dependencies (firebase, cloud.google.com/go, github.com/gin-gonic/gin, etc.)

- [ ] **Step 2: Add line-login-sdk-go to go.mod**

Run the following in `botty-api/`:

```bash
go get github.com/kkdai/line-login-sdk-go
```

Expected: `go.mod` now contains `github.com/kkdai/line-login-sdk-go v<version>` and `go.sum` updated.

- [ ] **Step 3: Verify build works with new dependency**

Run: `cd botty-api && go build ./...`

Expected: No errors; builds successfully.

- [ ] **Step 4: Commit**

```bash
git add botty-api/go.mod botty-api/go.sum
git commit -m "chore: add kkdai/line-login-sdk-go dependency"
```

---

## Task 2: Refactor Backend LINE Verification to Use SDK

**Files:**
- Modify: `botty-api/internal/auth/line.go`

**Current state:** `VerifyIDToken(idToken, channelID)` makes a manual HTTP POST to LINE's verify endpoint and parses JSON.

**Target state:** Wrapper around `social.VerifyIDToken()` from the SDK; reuses channel ID and adds channel secret to SDK constructor.

- [ ] **Step 1: Review current line.go implementation**

Read: `botty-api/internal/auth/line.go` (lines 1–67)

Expected: Understand the current manual HTTP flow, claim names (Sub, Aud, Exp), error handling.

- [ ] **Step 2: Design the new structure**

Sketch the new function signature:

```go
// VerifyIDToken validates a LINE ID token using the SDK.
// Returns the token claims or an error if invalid/expired.
func VerifyIDToken(ctx context.Context, idToken, channelID, channelSecret string) (*TokenClaims, error) {
    // Uses social.VerifyIDToken() from kkdai/line-login-sdk-go
    // Maps returned claims to our local TokenClaims struct
    // Returns error with stable shape for frontend branching
}
```

Decision: Keep the function signature simple; caller passes all three IDs/secrets.

- [ ] **Step 3: Implement new SDK-based verification**

Replace the entire `VerifyIDToken` function in `botty-api/internal/auth/line.go`:

```go
package auth

import (
	"context"
	"fmt"

	"github.com/kkdai/line-login-sdk-go/social"
)

// TokenClaims represents the verified claims from a LINE ID token.
type TokenClaims struct {
	Sub string // LINE user ID (stable identifier)
	Aud string // Expected audience (should be channel ID)
	Exp int64  // Expiration timestamp
}

// VerifyIDToken validates a LINE ID token using the LINE SDK.
// Returns the verified claims or an error if the token is invalid, expired, or verification fails.
func VerifyIDToken(ctx context.Context, idToken, channelID, channelSecret string) (*TokenClaims, error) {
	client := social.New(channelID, channelSecret)
	
	resp, err := client.VerifyIDToken(idToken, social.VerifyIDTokenRequestOptions{}).Do()
	if err != nil {
		// SDK returns errors for invalid/expired tokens as well as network failures.
		return nil, fmt.Errorf("line verify failed: %w", err)
	}

	// Map SDK response to our local claim structure.
	claims := &TokenClaims{
		Sub: resp.Sub,
		Aud: resp.Aud,
		Exp: resp.Exp,
	}

	// Validate audience matches channel ID (extra safety check).
	if claims.Aud != channelID {
		return nil, fmt.Errorf("invalid LINE token audience: expected %s, got %s", channelID, claims.Aud)
	}

	return claims, nil
}
```

- [ ] **Step 4: Update /v1/auth/line handler to use new function**

Read: `botty-api/cmd/api/main.go` (lines 116–165, the `authLineHandler` function)

Modify the handler to:
1. Extract `LINE_CHANNEL_SECRET` from environment (add to init or handler).
2. Call `auth.VerifyIDToken(ctx, idToken, channelID, channelSecret)` instead of the old `fbauth.VerifyIDToken(idToken, channelID)`.
3. Map returned `*TokenClaims` to the user identity (use `claims.Sub` as the LINE user ID).
4. Keep the existing Firestore lookup, pending-user creation, and Firebase custom token mint flow unchanged.

Example changes:

```go
// In authLineHandler or its init:
channelID := os.Getenv("LINE_CHANNEL_ID")
channelSecret := os.Getenv("LINE_CHANNEL_SECRET") // ADD THIS

// Inside authLineHandler:
claims, err := auth.VerifyIDToken(ctx, idToken, channelID, channelSecret)
if err != nil {
    // Map to 401 with stable error shape for frontend.
    c.JSON(401, map[string]interface{}{
        "error": "invalid LINE token",
        "detail": err.Error(), // Debug detail (gated by AUTH_DEBUG if needed).
    })
    return
}

// Use claims.Sub as the LINE user ID.
uid := "line:" + claims.Sub
```

- [ ] **Step 5: Remove old fbauth.VerifyIDToken call (if separate)**

If `fbauth` package has the old `VerifyIDToken`, remove it from `botty-api/internal/auth/firebase.go` or mark as deprecated.

- [ ] **Step 6: Run tests to ensure no build errors**

Run: `cd botty-api && go test ./... -v`

Expected: Build succeeds; any existing tests still pass (or are adjusted if they mocked the old function).

- [ ] **Step 7: Commit**

```bash
git add botty-api/internal/auth/line.go botty-api/cmd/api/main.go
git commit -m "refactor: use kkdai/line-login-sdk-go for ID token verification"
```

---

## Task 3: Add Backend Tests for SDK Verification

**Files:**
- Modify: `botty-api/internal/auth/line_test.go`

**Current state:** File exists with basic tests; `line_test.go` currently tests the old manual HTTP verification.

**Target state:** Tests for the SDK-based verification; includes mock/stub SDK client if possible, or integration tests with live LINE test credentials.

- [ ] **Step 1: Review existing line_test.go**

Read: `botty-api/internal/auth/line_test.go` (all lines)

Expected: Understand current test structure and mocking approach.

- [ ] **Step 2: Write a failing test for valid token verification**

Add to `line_test.go`:

```go
func TestVerifyIDToken_ValidToken(t *testing.T) {
	// For MVP: use a hardcoded test token from LINE or mock the SDK response.
	// If mocking: create a mock social.Client that returns a valid response.
	
	// Real SDK call (integration test):
	// claims, err := VerifyIDToken(context.Background(), testValidIDToken, testChannelID, testChannelSecret)
	
	// Expected: claims are not nil, Sub is a valid string, no error.
	// assert.NoError(t, err)
	// assert.NotNil(t, claims)
	// assert.Equal(t, "line_user_id_123", claims.Sub)
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd botty-api && go test ./internal/auth -v -run TestVerifyIDToken_ValidToken`

Expected: FAIL (either test token is missing or assertion fails because function not yet wired).

- [ ] **Step 4: Write test for expired token (returns error)**

Add to `line_test.go`:

```go
func TestVerifyIDToken_ExpiredToken(t *testing.T) {
	// Use an expired test token or mock SDK to return expired error.
	claims, err := VerifyIDToken(context.Background(), testExpiredIDToken, testChannelID, testChannelSecret)
	
	// Expected: claims is nil, error is not nil, error message contains "expired" or similar.
	assert.Error(t, err)
	assert.Nil(t, claims)
	assert.Contains(t, err.Error(), "verify failed") // or more specific message
}
```

- [ ] **Step 5: Write test for invalid audience**

Add to `line_test.go`:

```go
func TestVerifyIDToken_InvalidAudience(t *testing.T) {
	// Use a token with an audience that doesn't match our channel ID.
	claims, err := VerifyIDToken(context.Background(), validTokenWithWrongAud, testChannelID, testChannelSecret)
	
	// Expected: error mentions audience mismatch.
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid audience")
}
```

- [ ] **Step 6: Set up test credentials**

In `line_test.go`, define test constants:

```go
const (
	testChannelID = "2009977470" // Use hardcoded channel ID from current deploy
	testChannelSecret = "..." // Use actual secret or placeholder for CI
	testValidIDToken = "..." // Use a real valid token from LINE or mock
	testExpiredIDToken = "..." // Use an expired token or mock error response
)
```

Decision: For MVP, use a mock or a real test token from LINE's sandbox. For CI, use a test credential stored in Secret Manager.

- [ ] **Step 7: Run all tests to verify they pass**

Run: `cd botty-api && go test ./internal/auth -v`

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add botty-api/internal/auth/line_test.go
git commit -m "test: add SDK-based ID token verification tests"
```

---

## Task 4: Add LINE_CHANNEL_SECRET to Cloud Run Configuration

**Files:**
- Modify: `botty-api/deploy/cloudrun.yaml`
- Infrastructure: Create or reference Secret Manager secret for `LINE_CHANNEL_SECRET`

- [ ] **Step 1: Review current cloudrun.yaml**

Read: `botty-api/deploy/cloudrun.yaml` (all lines)

Expected: Understand current env var structure and how secrets are wired (if any).

- [ ] **Step 2: Add LINE_CHANNEL_SECRET reference to cloudrun.yaml**

Modify the `env` section to include:

```yaml
- name: LINE_CHANNEL_SECRET
  valueFrom:
    secretKeyRef:
      name: line-channel-secret
      key: latest
```

Or, if preferring a direct value (less secure but simpler for test):

```yaml
- name: LINE_CHANNEL_SECRET
  value: "secret_value_here"
```

**Decision:** Use Secret Manager reference (`secretKeyRef`) for production security. For local testing, use a `.env` file or export in shell.

- [ ] **Step 3: Create or verify Secret Manager secret (if using secretKeyRef)**

If not using direct value, ensure the secret exists in GCP Secret Manager:

Run:

```bash
gcloud secrets versions list line-channel-secret --project=botty-495408
```

Expected: Secret exists; if not, create it:

```bash
echo -n "your_secret_value" | gcloud secrets create line-channel-secret --data-file=- --project=botty-495408
```

- [ ] **Step 4: Verify Cloud Run service account has permission to read secret**

Run:

```bash
gcloud projects get-iam-policy botty-495408 --flatten=bindings[].members --filter="bindings.members:serviceAccount=botty-api@*"
```

Expected: Service account has `roles/secretmanager.secretAccessor` or similar. If not, grant it:

```bash
gcloud projects add-iam-policy-binding botty-495408 \
  --member=serviceAccount:botty-api@botty-495408.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

- [ ] **Step 5: Test locally with environment variable**

For local dev, create `.env.local` in `botty-api/` or export:

```bash
export LINE_CHANNEL_ID="2009977470"
export LINE_CHANNEL_SECRET="your_secret_here"
cd botty-api && go run ./cmd/api/main.go
```

Expected: Server starts without errors; env vars are readable.

- [ ] **Step 6: Commit cloudrun.yaml changes**

```bash
git add botty-api/deploy/cloudrun.yaml
git commit -m "config: add LINE_CHANNEL_SECRET to Cloud Run env"
```

---

## Task 5: Build and Test Backend Locally

**Files:**
- Already covered (line.go, main.go, cloudrun.yaml)

- [ ] **Step 1: Build the backend**

Run: `cd botty-api && go build -o ./bin/api ./cmd/api/main.go`

Expected: Binary created at `botty-api/bin/api`.

- [ ] **Step 2: Start backend server locally**

Run:

```bash
export LINE_CHANNEL_ID="2009977470"
export LINE_CHANNEL_SECRET="test_secret"
export GCP_PROJECT="botty-495408"
export FIRESTORE_EMULATOR_HOST="localhost:8081" # if using local Firestore
cd botty-api && ./bin/api
```

Expected: Server listens on port (default 8080 or configured port); logs show routes registered.

- [ ] **Step 3: Test /v1/auth/line endpoint with curl**

Run (in another terminal):

```bash
curl -X POST http://localhost:8080/v1/auth/line \
  -H "Content-Type: application/json" \
  -d '{"idToken":"test_invalid_token"}'
```

Expected: 401 response with error message about invalid token.

- [ ] **Step 4: Run full test suite**

Run: `cd botty-api && go test ./... -v`

Expected: All tests pass.

- [ ] **Step 5: Commit (no changes needed if build passes)**

If any fixes were made:

```bash
git add botty-api/...
git commit -m "build: backend SDK integration passes local tests"
```

---

## Task 6: Deploy Backend to Cloud Run

**Files:**
- No code changes (uses existing Cloud Build and Cloud Run setup)

- [ ] **Step 1: Review Cloud Build trigger**

Ensure `botty-api/cloudbuild.yaml` is configured to build from `botty-api/` directory.

Read: `botty-api/cloudbuild.yaml`

Expected: Build context is correct, build steps reference the right Dockerfile path.

- [ ] **Step 2: Push code to trigger build**

Run:

```bash
git add .
git commit -m "feat: integrate LINE SDK on backend"
git push origin main
```

Expected: Cloud Build automatically triggers a new build.

- [ ] **Step 3: Monitor Cloud Build**

Run:

```bash
gcloud builds list --project=botty-495408 --limit=1
```

Expected: Build shows "SUCCESS" after a few minutes.

- [ ] **Step 4: Verify Cloud Run deployment**

Run:

```bash
gcloud run services describe botty-api --project=botty-495408 --region=asia-southeast3
```

Expected: Latest revision is active; env vars include `LINE_CHANNEL_SECRET`.

- [ ] **Step 5: Test deployed endpoint**

Run:

```bash
CLOUD_RUN_URL="https://botty-api-xxx.run.app" # from previous command
curl -X POST $CLOUD_RUN_URL/v1/auth/line \
  -H "Content-Type: application/json" \
  -d '{"idToken":"test_invalid_token"}'
```

Expected: 401 response.

---

## Task 7: Update Frontend to Request Fresh LINE Token

**Files:**
- Modify: `botty-liff-app/src/app/page.tsx`

**Current state:** Lines 37–42 already request a fresh token before `authLine()` call.

**Target state:** Verify fresh-token request is in place and add explicit comment/structure for clarity.

- [ ] **Step 1: Review current login flow**

Read: `botty-liff-app/src/app/page.tsx` (lines 30–60, the main login logic)

Expected: See `getLineIdToken()` call immediately before `authLine(idToken)`.

- [ ] **Step 2: Verify fresh token is requested**

Check that the code structure is:

```typescript
const idToken = await getLineIdToken(); // Fresh token request
const { customToken, role, onboarded } = await authLine(idToken); // Pass fresh token
```

If the flow differs, refactor to ensure fresh token is requested right before auth call.

- [ ] **Step 3: Run frontend build to verify no errors**

Run: `cd botty-liff-app && npm run build`

Expected: Build succeeds; no TypeScript errors.

- [ ] **Step 4: Commit (if changes were made)**

```bash
git add botty-liff-app/src/app/page.tsx
git commit -m "refactor: ensure fresh LINE token is requested before auth"
```

---

## Task 8: Add Frontend Retry Logic for Expired LINE Tokens

**Files:**
- Modify: `botty-liff-app/src/app/page.tsx`
- Modify: `botty-liff-app/src/lib/api.ts`

**Current state:** No retry logic; expired token causes permanent auth failure.

**Target state:** Detect 401 from expired LINE token, clear session, force fresh LIFF login, retry once.

- [ ] **Step 1: Review current authLine() implementation**

Read: `botty-liff-app/src/lib/api.ts`

Expected: See function signature and error handling structure.

- [ ] **Step 2: Ensure authLine() returns structured errors**

Update `authLine()` in `api.ts` to return or throw an error with the backend response body:

```typescript
export async function authLine(idToken: string) {
    const response = await fetch(`${API_BASE}/v1/auth/line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
        const errorBody = await response.json();
        // Throw structured error so caller can branch on error message.
        throw new ApiError(errorBody.error || 'Auth failed', errorBody);
    }

    return response.json();
}
```

- [ ] **Step 3: Wrap authLine() call in try-catch with retry logic in page.tsx**

Modify the login flow in `page.tsx`:

```typescript
let retried = false;

async function tryAuth() {
    try {
        const idToken = await getLineIdToken();
        return await authLine(idToken);
    } catch (error) {
        // If auth failed and we haven't retried yet, retry with fresh LIFF login.
        if (!retried && error instanceof ApiError && error.message.includes('invalid LINE token')) {
            retried = true;
            // Clear app session state.
            await firebaseAuth.signOut();
            // Force fresh LIFF login.
            await liff.logout();
            await liff.login(); // Restarts LIFF login flow.
            // Retry auth once.
            return tryAuth();
        }
        // If retry failed or error is not token-related, surface error to user.
        throw error;
    }
}

const result = await tryAuth();
```

**Decision:** Retry only once and only on "invalid LINE token" error to avoid infinite loops.

- [ ] **Step 4: Update error handling in login page**

Ensure UI surfaces backend errors after retry fails:

```typescript
try {
    const { customToken, role, onboarded } = await tryAuth();
    // Sign in and route...
} catch (error) {
    // Show error to user
    setErrorMessage(error.message);
}
```

- [ ] **Step 5: Run frontend build**

Run: `cd botty-liff-app && npm run build`

Expected: Builds successfully; TypeScript checks pass.

- [ ] **Step 6: Commit**

```bash
git add botty-liff-app/src/app/page.tsx botty-liff-app/src/lib/api.ts
git commit -m "feat: add expired-token retry logic on frontend"
```

---

## Task 9: Write Frontend Tests for Retry Logic

**Files:**
- Create: `botty-liff-app/src/__tests__/app/page.test.tsx` (if not exists)

- [ ] **Step 1: Set up test file structure**

Create `botty-liff-app/src/__tests__/app/page.test.tsx` with basic test skeleton:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/page';

// Mock external dependencies
jest.mock('@/lib/liff');
jest.mock('@/lib/api');
jest.mock('firebase/auth');

describe('Login Page', () => {
    // Tests will go here
});
```

- [ ] **Step 2: Write test for successful login (no retry needed)**

Add test:

```typescript
test('should login successfully with valid LINE token', async () => {
    const mockIdToken = 'valid_token_123';
    const mockCustomToken = 'firebase_token_456';
    
    // Mock LIFF to return valid token
    (getLineIdToken as jest.Mock).mockResolvedValue(mockIdToken);
    // Mock auth to succeed
    (authLine as jest.Mock).mockResolvedValue({ 
        customToken: mockCustomToken, 
        role: 'user', 
        onboarded: true 
    });

    render(<Page />);
    
    // Wait for auth flow to complete
    await waitFor(() => {
        expect(authLine).toHaveBeenCalledWith(mockIdToken);
    });
});
```

- [ ] **Step 3: Write test for expired token retry**

Add test:

```typescript
test('should retry once on expired LINE token error', async () => {
    const validToken = 'fresh_token_789';
    
    // First call: LIFF returns stale token
    (getLineIdToken as jest.Mock)
        .mockResolvedValueOnce('stale_token_old')
        .mockResolvedValueOnce(validToken); // Second call: fresh token
    
    // First auth call fails with expired token error
    (authLine as jest.Mock)
        .mockRejectedValueOnce(new ApiError('invalid LINE token', {}))
        .mockResolvedValueOnce({ 
            customToken: 'firebase_token', 
            role: 'user', 
            onboarded: true 
        });

    render(<Page />);
    
    // Verify retry happened
    await waitFor(() => {
        expect(authLine).toHaveBeenCalledTimes(2);
        expect(authLine).toHaveBeenNthCalledWith(1, 'stale_token_old');
        expect(authLine).toHaveBeenNthCalledWith(2, validToken);
    });
});
```

- [ ] **Step 4: Write test for error after retry fails**

Add test:

```typescript
test('should surface error if retry fails', async () => {
    // Mock auth to fail twice with same error
    (authLine as jest.Mock)
        .mockRejectedValueOnce(new ApiError('invalid LINE token', {}))
        .mockRejectedValueOnce(new ApiError('invalid LINE token', {}));
    
    render(<Page />);
    
    // Verify error is shown
    await waitFor(() => {
        expect(screen.getByText(/invalid LINE token/)).toBeInTheDocument();
    });
});
```

- [ ] **Step 5: Run tests**

Run: `cd botty-liff-app && npm run test`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add botty-liff-app/src/__tests__/app/page.test.tsx
git commit -m "test: add frontend retry logic tests"
```

---

## Task 10: Smoke Test Full Login Flow

**Files:**
- No code changes (manual testing)

- [ ] **Step 1: Open LIFF in browser**

1. Deploy frontend to a staging environment or run locally.
2. Open the LIFF URL in a LINE app or LINE web client.
3. Confirm LIFF initializes and shows the login button.

Expected: LIFF loads without errors.

- [ ] **Step 2: Log in with fresh token**

1. Click login button.
2. LIFF fetches fresh ID token from LINE server.
3. Frontend calls `POST /v1/auth/line` with fresh token.

Expected: Backend returns Firebase custom token; frontend signs in; user is routed to `/onboard` or `/home`.

- [ ] **Step 3: Simulate expired token scenario**

1. Log out and open LIFF again.
2. Wait 10+ minutes without activity (or use browser dev tools to mock an old token in localStorage).
3. Try to log in again (or refresh the page if login was already cached).

Expected: Frontend detects expired token error, retries with fresh LIFF login, and succeeds.

- [ ] **Step 4: Verify error handling**

1. Test invalid token by manually sending a malformed token to `/v1/auth/line`.
2. Verify 401 response with error message.

Expected: Backend returns 401; frontend can branch on error.

- [ ] **Step 5: Document results**

Record in issue or PR:
- ✓ Fresh token auth works
- ✓ Expired token retry works
- ✓ Error handling is stable
- ✓ No unexpected redirects or crashes

---

## Task 11: Clean Up and Remove Debug Flags

**Files:**
- Modify: `botty-api/cmd/api/main.go` (if AUTH_DEBUG was added)

- [ ] **Step 1: Check for debug flags in code**

Search for `AUTH_DEBUG`, temporary error detail fields, or other debug logging:

Run: `grep -r "AUTH_DEBUG\|debug.*detail" botty-api/cmd/api/ botty-liff-app/src/app/page.tsx`

Expected: Locate any temporary flags.

- [ ] **Step 2: Remove or gate debug logging**

If auth error details were exposed for debugging, remove them or gate behind an environment flag:

```go
if os.Getenv("AUTH_DEBUG") == "1" {
    c.JSON(401, map[string]interface{}{
        "error": "invalid LINE token",
        "detail": err.Error(),
    })
} else {
    c.JSON(401, map[string]interface{}{
        "error": "invalid LINE token",
    })
}
```

- [ ] **Step 3: Commit cleanup**

```bash
git add botty-api/cmd/api/main.go
git commit -m "chore: remove temporary auth debug flags"
```

---

## Task 12: Summary and Handoff

- [ ] **Step 1: Verify all tests pass locally**

Run:

```bash
cd botty-api && go test ./...
cd botty-liff-app && npm run test
```

Expected: All tests pass.

- [ ] **Step 2: Build and push final code**

Run:

```bash
git log --oneline | head -10 # Review recent commits
git push origin main
```

Expected: All commits are on main; Cloud Build triggers final build.

- [ ] **Step 3: Document completion in PR or issue**

Summarize:
- Backend now uses LINE SDK for token verification.
- Frontend has retry logic for expired tokens.
- Configuration is secure (LINE_CHANNEL_SECRET in Secret Manager).
- All tests pass; smoke test confirms full flow works.

---

## Acceptance Criteria Checklist

- [ ] Backend uses `kkdai/line-login-sdk-go` for ID token verification
- [ ] Frontend requests fresh LINE token immediately before auth call
- [ ] Frontend detects expired-token errors and retries with fresh login once
- [ ] `LINE_CHANNEL_SECRET` is wired to Cloud Run via Secret Manager or env var
- [ ] Backend tests cover valid, expired, and invalid-audience tokens
- [ ] Frontend tests cover successful login and retry-on-expired-token paths
- [ ] Smoke test confirms full flow (fresh login, retry on expiry) works
- [ ] No temporary debug flags or logging in production code
- [ ] All commits are on main; Cloud Run deployment is live
