# Authentication System: Diagnostic Report & Correction Plan

## Executive Summary

The BitFactory authentication system has **critical inconsistencies** that cause premature logout and security issues:

1. **THREE implementations of token generation** with conflicting expiry times
2. **2FA cookies set BEFORE verification** (security vulnerability)
3. **Sync/async mismatches** in generateTokens usage
4. **JWT expiry vs cookie maxAge consistency issues**

This report maps all conflicts, their dependencies, and provides a step-by-step correction plan.

---

## PART 1: CONFLICT MAPPING

### 1.1 Token Generation Implementations (3 versions found)

#### Version A: `/src/lib/jwt.ts` - ASYNC, 1h access token
```typescript
export async function generateTokens(userId: string, role: string) {
  const accessToken = await signJwtToken({ userId, role });        // 1h expiry
  const refreshToken = await signJwtToken(..., "7d");              // 7d expiry
  return { accessToken, refreshToken };
}
```
**Algorithm:** `jose` library, HS256, async function
**Token expiry:** 1 hour (access), 7 days (refresh)
**Callable:** Must use `await`

---

#### Version B: `/src/lib/helpers/generateTokens.ts` - SYNC, 15m access token
```typescript
const generateTokens = (userId: string, role: string) => {
    const accessToken = jwt.sign(
        { userId, role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '15m' }                                       // 15 MINUTES ⚠️
    );
    const refreshToken = jwt.sign(..., { expiresIn: '7d' });      // 7 days
    return { accessToken, refreshToken };
};
```
**Algorithm:** `jsonwebtoken` library, HS256, sync function
**Token expiry:** 15 minutes (access), 7 days (refresh)
**Callable:** Direct call, no `await`
**JWT_REFRESH_SECRET:** Uses separate env var (not JWT_SECRET!)

---

#### Version C: `/src/app/api/auth/check/route.ts` - LOCAL ASYNC, 1h access token
```typescript
const generateTokens = async (userId: string, role: string) => {
  const accessToken = await signJwtToken({ userId, role });       // 1h expiry
  const refreshToken = await signJwtToken(..., "7d");             // 7d expiry
  return { accessToken, refreshToken };
};
```
**Algorithm:** Identical to Version A
**Location:** Defined locally in this route (NOT imported)
**Purpose:** Used only for refresh token endpoint

---

### 1.2 Where Each Version is Used

| Endpoint | Version Used | Import | Expiry | Async? | Issue |
|----------|--------------|--------|--------|--------|-------|
| `/api/login` | **A** (`jwt.ts`) | ✓ Imported | 1h/7d | ✓ async | ✓ Correct |
| `/api/auth/check` | **C** (local copy) | Defined locally | 1h/7d | ✓ async | ⚠️ Code duplication |
| `/api/auth/2fa/validate` | **B** (helpers) | ✓ Imported | **15m**/7d | ✗ sync | 🔴 **CRITICAL BUG** |

**KEY FINDING:** 2FA login generates tokens with **15-minute** access expiry instead of 1 hour!

---

### 1.3 Cookie MaxAge vs JWT Expiry Mismatch

| Endpoint | Cookie MaxAge | JWT Expiry (actual) | Mismatch? | Impact |
|----------|---|---|---|---|
| `/api/login` | 1 hour (3600s) | 1 hour | ✓ Match | ✓ No issue |
| `/api/auth/check` | 1 hour (3600s) | 1 hour | ✓ Match | ✓ No issue |
| `/api/auth/2fa/validate` | 1 hour (3600s) | **15 minutes** | 🔴 **MISMATCH** | Token expires but cookie persists |

**ROOT CAUSE OF PREMATURE LOGOUT:** 2FA users get a token that expires at 15 minutes, but the cookie is set to expire at 1 hour. After 15 minutes, token is invalid, but cookie exists. Next `/api/auth/check` call will find an invalid token and redirect to login.

---

## PART 2: 2FA FLOW ANALYSIS & SECURITY ISSUES

### 2.1 Current 2FA Validation Flow (INSECURE)

```
1. User enters 2FA code from authenticator
2. POST /api/auth/2fa/validate { email, token }
3. Lookup user by email
4. Generate tokens (15m access, 7d refresh)
5. SET COOKIES WITH TOKENS ⚠️ BEFORE VERIFICATION
6. Create response object
7. Check if token is backup code → Update DB
8. If not backup code, verify TOTP
9. If verification FAILS → Return error 400
   BUT COOKIES ALREADY SET! ⚠️
10. If verification SUCCEEDS → Log activity, return response
```

**SECURITY ISSUE:** Cookies are set BEFORE 2FA verification completes. If verification fails, valid token cookies are still in the browser.

### 2.2 Order of Operations

```typescript
// Line 38: Tokens generated
const { accessToken, refreshToken } = generateTokens(user.id, user.role);

// Lines 44-58: Response and cookies created IMMEDIATELY
const response = NextResponse.json({ success: true, redirectUrl });
response.cookies.set("token", accessToken, { ... });
response.cookies.set("refresh_token", refreshToken, { ... });

// Lines 61-78: Backup code check (OPTIONAL path)
if (user.twoFactorBackupCodes?.includes(token)) {
  // ... update DB ...
  return response; // ← RETURNS HERE with cookies set
}

// Lines 80-87: TOTP verification happens HERE
const verified = speakeasy.totp.verify({ ... });
if (!verified) {
  return NextResponse.json({ error: "Invalid token" }, { status: 400 }); 
  // ← Error returned but cookies already set in browser!
}
```

---

## PART 3: AUTH CHECK INTERVAL (5-minute check)

### 3.1 Normal Case (Access Token Still Valid)

1. Every 5 minutes, AuthContext calls `/api/auth/check`
2. Access token is verified (1 hour expiry = still valid)
3. No token refresh needed
4. Returns user data
5. ✓ User stays logged in

### 3.2 Issue Case (2FA Users After 15+ minutes)

1. At 15:00 → 2FA user has valid token (15m expiry)
2. At 15:05 → Auth check called, token still valid
3. At 15:10 → Auth check called, token still valid
4. At 15:15 → Token expired (15 minutes up)
5. At 15:20 → Auth check called, access token verification fails
6. `/api/auth/check` tries refresh token → ✓ Refresh works
7. New tokens generated (another 15m access token)
8. User sees brief hiccup but stays logged in

**Why users report logout:** If auth check fails for any reason at exactly token expiry time, they're immediately logged out with no refresh opportunity.

### 3.3 The 5-Minute Vulnerability

If a 2FA user's token is 15 minutes and the check interval is 5 minutes:
- Minutes 0-15: Token valid, check always passes
- Minute 15: Token expires
- Minute 20: Next scheduled check catches expired token, refreshes
- **Issue:** If user leaves browser open and doesn't interact for 20 minutes, they will be logged out

Regular (1h token) users don't hit this because: 55 minutes of buffer before expiry.

---

## PART 4: ENVIRONMENT CONFIGURATION

### 4.1 2FA Enablement

**File:** `/src/app/api/login/route.ts` (line 87-88)
```typescript
const isTwoFactorEnabled = process.env.TWO_FACTOR_ENABLED === "true" || false;
if (isTwoFactorEnabled && user.twoFactorEnabled) {
  return NextResponse.json({ requiresTwoFactor: true, ... });
}
```

**Current State:** 2FA flow activates ONLY if:
1. Environment variable `TWO_FACTOR_ENABLED` is set to `"true"` (string)
2. AND user has `twoFactorEnabled` flag in database

**If env var not set:** Logic defaults to `false`, 2FA is skipped entirely

---

## PART 5: SYNC/ASYNC MISMATCH

### 5.1 The Problem

**File:** `/src/app/api/login/route.ts` (line 116)
```typescript
const { accessToken, refreshToken } = await generateTokens(user.id, user.role);
```

This imports Version A from `jwt.ts`, which is async. The `await` is correct here.

**File:** `/src/app/api/auth/2fa/validate/route.ts` (line 38)
```typescript
const { accessToken, refreshToken } = generateTokens(user.id, user.role);
```

This imports Version B from `helpers/generateTokens.ts`, which is sync. There's no `await` because the function is synchronous.

**The inconsistency:**
- Login imports async version → uses `await`
- 2FA imports sync version → no `await`
- They're different functions with different algorithms!

If a developer accidentally changed the 2FA import to use jwt.ts, it would break:
```typescript
const { accessToken, refreshToken } = generateTokens(user.id, user.role);
// ✗ Missing await! generateTokens returns a Promise, not tokens
// ✗ Result would be { accessToken: Promise, refreshToken: Promise }
```

---

## PART 6: DETAILED CORRECTION PLAN

### Phase 1: Consolidate to Single Token Generation (Priority: CRITICAL)

**Objective:** Remove Version B and C, use only Version A everywhere

**Steps:**

1. **Delete `/src/lib/helpers/generateTokens.ts`**
   - This file is the source of the 15-minute token issue
   - No other files depend on it except 2FA validate (which we'll fix)

2. **Update `/src/app/api/auth/2fa/validate/route.ts`**
   - Change import from `@/lib/helpers/generateTokens` to `@/lib/jwt`
   - Add missing `await` keyword
   - Ensure it's called as async function

3. **Delete local `generateTokens` from `/src/app/api/auth/check/route.ts`**
   - Remove lines 9-15 (local function definition)
   - Import from `@/lib/jwt` instead
   - This eliminates code duplication

4. **Verify only `/src/lib/jwt.ts` generateTokens remains**
   - All files import from here
   - Async function with 1h/7d expiry
   - Uses `jose` library and JWT_SECRET env var

**Files to modify:**
- DELETE: `/src/lib/helpers/generateTokens.ts`
- MODIFY: `/src/app/api/auth/2fa/validate/route.ts` (lines 1-40)
- MODIFY: `/src/app/api/auth/check/route.ts` (lines 3-15)

---

### Phase 2: Fix 2FA Cookie Security Issue (Priority: CRITICAL)

**Objective:** Set cookies ONLY after successful 2FA verification

**Current problematic order (lines 37-58 in 2fa/validate/route.ts):**
```
Line 38: Generate tokens
Lines 44-58: Set cookies (TOO EARLY!)
Lines 61-87: Verify token/backup code
```

**New correct order:**
```
Line 1: Generate tokens
Line 2: Create response WITHOUT cookies yet
Line 3: Verify token/backup code
Line 4: If failed, return error (no cookies set)
Line 5: If success, set cookies on response
Line 6: Return response with cookies
```

**Refactor approach:**
- Generate tokens at start (keep as is)
- Create response object but DON'T set cookies yet
- Run ALL verification logic
- Only if ALL verifications pass → set cookies
- Return response with cookies

**Files to modify:**
- MODIFY: `/src/app/api/auth/2fa/validate/route.ts` (restructure lines 37-126)

---

### Phase 3: Standardize Cookie and JWT Expiry (Priority: HIGH)

**Objective:** Ensure cookie maxAge = JWT expiry for access tokens

**Current state:**
- All endpoints set cookie maxAge to 1 hour (3600s)
- After consolidation, all JWT tokens will be 1 hour
- ✓ Will be consistent

**Verification needed in:**
- `/src/app/api/login/route.ts` (lines 143-155)
- `/src/app/api/auth/check/route.ts` (lines 85-96)
- `/src/app/api/auth/2fa/validate/route.ts` (lines 50-61)

**All should remain:**
```typescript
response.cookies.set("token", accessToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 60 * 60,  // 1 hour ✓
  path: "/",
});

response.cookies.set("refresh_token", refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 7 * 24 * 60 * 60,  // 7 days ✓
  path: "/",
});
```

---

### Phase 4: Verify Auto-Logout Behavior (Priority: HIGH)

**Objective:** Confirm 5-minute auth check works correctly with new token expiry

**After Phase 1-3 completion:**

1. Regular login → 1h access token
   - Works as designed
   - Every 5 minutes, check validates valid token
   - At 55+ minutes, refresh token extends session
   - At 7 days, refresh token expires → auto logout

2. 2FA login → 1h access token (same as regular)
   - Works as designed
   - Same behavior as regular login
   - ✓ No more early logout

3. Auth check endpoint (`/api/auth/check`)
   - Currently has no issues
   - Verify it's using correct token generation
   - Confirm refresh logic works

**Testing scenarios:**
- Login normally → token is 1h → stays logged in
- Login with 2FA → token is 1h → stays logged in (FIXED!)
- Let token expire → auto refresh works
- Close browser → loses refresh token
- Manual logout → tokens blacklisted

---

## PART 7: DEPENDENCY TREE

### Before Correction
```
/api/login (imports jwt.ts)
  ├─ generateTokens() [1h] ✓
  └─ Works correctly

/api/auth/check (local copy)
  ├─ generateTokens() [1h] (duplicated code) ⚠️
  └─ Works but redundant

/api/auth/2fa/validate (imports helpers)
  ├─ generateTokens() [15m] 🔴
  └─ CAUSES EARLY LOGOUT BUG
```

### After Correction
```
/api/login (imports jwt.ts)
  ├─ generateTokens() [1h] ✓

/api/auth/check (imports jwt.ts)
  ├─ generateTokens() [1h] ✓

/api/auth/2fa/validate (imports jwt.ts)
  ├─ generateTokens() [1h] ✓

All three → Single source of truth ✓
All three → 1h access token ✓
All three → Same algorithm ✓
```

---

## PART 8: BREAKDOWN OF REQUIRED CODE CHANGES

### Change 1: Delete `/src/lib/helpers/generateTokens.ts`
- **File:** `/src/lib/helpers/generateTokens.ts` (ENTIRE FILE)
- **Action:** DELETE
- **Reason:** This is the source of the 15-minute token bug
- **Impact:** Removes ability to accidentally use wrong token generation

---

### Change 2: Update `/src/app/api/auth/2fa/validate/route.ts`
- **Lines to change:**
  - Line 5: Change import from `@/lib/helpers/generateTokens` to `@/lib/jwt`
  - Line 38: Change `generateTokens(...)` to `await generateTokens(...)`
  - Lines 37-126: Restructure to set cookies AFTER verification

**Specific changes:**
```typescript
// OLD (Line 5)
import generateTokens from "@/lib/helpers/generateTokens";

// NEW
import { generateTokens } from "@/lib/jwt";

// OLD (Line 38)
const { accessToken, refreshToken } = generateTokens(user.id, user.role);

// NEW
const { accessToken, refreshToken } = await generateTokens(user.id, user.role);

// OLD (Lines 44-58: Set cookies BEFORE verification)
const response = NextResponse.json({ success: true, redirectUrl });
response.cookies.set("token", accessToken, { ... });
response.cookies.set("refresh_token", refreshToken, { ... });
// ... then verify later ...

// NEW (Set cookies AFTER verification)
const response = NextResponse.json({ success: true, redirectUrl });
// ... verify first ...
// Only then set cookies:
response.cookies.set("token", accessToken, { ... });
response.cookies.set("refresh_token", refreshToken, { ... });
```

---

### Change 3: Update `/src/app/api/auth/check/route.ts`
- **Lines to change:**
  - Lines 3-4: Update import to include generateTokens
  - Lines 9-15: Delete local generateTokens definition
  - Line 73: Ensure generateTokens is called with await

**Specific changes:**
```typescript
// OLD (Lines 3-4)
import { verifyJwtToken, signJwtToken } from "@/lib/jwt";

// NEW
import { verifyJwtToken, signJwtToken, generateTokens } from "@/lib/jwt";

// OLD (Lines 9-15: Local definition)
const generateTokens = async (userId: string, role: string) => {
  const accessToken = await signJwtToken({ userId, role });
  const refreshToken = await signJwtToken(
    { userId, role, type: "refresh" },
    "7d",
  );
  return { accessToken, refreshToken };
};

// NEW - DELETE THIS ENTIRE BLOCK, use imported version instead
```

---

## PART 9: VALIDATION CHECKLIST

After making all changes, verify:

- [ ] File `/src/lib/helpers/generateTokens.ts` no longer exists
- [ ] `/src/app/api/auth/2fa/validate/route.ts` imports from `@/lib/jwt`
- [ ] `/src/app/api/auth/2fa/validate/route.ts` uses `await` before `generateTokens(...)`
- [ ] Cookies are set ONLY after 2FA verification succeeds
- [ ] `/src/app/api/auth/check/route.ts` imports `generateTokens` from `@/lib/jwt`
- [ ] No local `generateTokens` definition remains in `/src/app/api/auth/check/route.ts`
- [ ] All three endpoints (login, check, 2fa/validate) generate 1h access tokens
- [ ] Cookie maxAge is 1 hour for all endpoints
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] Build succeeds

---

## PART 10: EXPECTED BEHAVIOR AFTER CORRECTION

### Regular Login
```
User submits email/password
→ /api/login validates
→ Generates 1h access + 7d refresh tokens
→ Sets both cookies
→ Redirects to dashboard
✓ Works as designed
```

### 2FA Login
```
User submits email/password
→ /api/login checks 2FA required
→ Returns requiresTwoFactor: true
→ User enters 2FA code
→ /api/auth/2fa/validate receives code
→ VERIFIES code first (before cookies!)
→ If valid: generates 1h access + 7d refresh tokens
→ Sets both cookies AFTER verification
→ Redirects to dashboard
✓ Now works same as regular login
```

### Auto-Logout via Refresh Expiry
```
User logged in 7 days ago
→ Refresh token expires
→ /api/auth/check finds expired refresh token
→ Cannot refresh
→ Clears cookies
→ Redirects to login
✓ Works as designed (absolute timeout)
```

### Auto-Logout via Access Token Expiry
```
User logged in 1 hour ago
→ Access token expires at 1h
→ At 5m, 10m, 15m, etc. → /api/auth/check finds valid token
→ At 55m → Token still valid
→ At 60m → Access token expired
→ Next /api/auth/check (if triggered) → Refresh token valid
→ New tokens generated
→ Session extends another hour
✓ Silent refresh works
```

### Manual Logout
```
User clicks logout
→ /api/auth/signout called
→ Token added to blacklist
→ Both cookies cleared
→ AuthContext redirects to login
✓ Works as designed
```

---

## PART 11: REMAINING ISSUES (Not Fixed by This Plan)

### Issue 1: No Inactivity Timeout
- **Current:** Users stay logged in until refresh token expires (7 days)
- **Impact:** Idle users remain authenticated
- **Requires:** Separate implementation (out of scope for this phase)

### Issue 2: Duplicate Logout Endpoints
- `/api/auth/logout` (incomplete, unused)
- `/api/auth/signout` (correct, used)
- **Recommendation:** Delete `/api/auth/logout` in a future cleanup phase

### Issue 3: No Blacklist Check on Token Refresh
- **Current:** `/api/auth/check` refreshes tokens without checking blacklist
- **Risk:** Theoretically, a token could refresh before its 15-min blacklist TTL expires
- **Recommendation:** Add blacklist check before refreshing (future enhancement)

### Issue 4: No CSRF Protection on Logout
- **Current:** `POST /api/auth/signout` has no CSRF verification
- **Recommendation:** Add CSRF token validation (future enhancement)

---

## PART 12: SUMMARY OF CHANGES

| File | Action | Reason |
|------|--------|--------|
| `/src/lib/helpers/generateTokens.ts` | DELETE | Source of 15m token bug |
| `/src/app/api/auth/2fa/validate/route.ts` | MODIFY | Fix import, add await, restructure cookie order |
| `/src/app/api/auth/check/route.ts` | MODIFY | Remove duplicate code, import instead |
| `/src/app/api/login/route.ts` | VERIFY | Should need no changes (already correct) |

**Total files to modify:** 3 (1 delete, 2 update)
**Total lines changed:** ~30-40 lines across files
**Build impact:** Should improve (remove dead code)
**Test impact:** Tests using 2FA should now pass correctly

---

## CONCLUSION

The authentication system has one critical root cause: **Version B (`/lib/helpers/generateTokens.ts`) creates 15-minute tokens for 2FA users while cookie is set to 1 hour, causing misalignment.**

Once consolidated to use only Version A (`/lib/jwt.ts`) everywhere:
1. All tokens are 1 hour (access) + 7 days (refresh)
2. All cookies match JWT expiry
3. All three flows (login, check, 2FA) use identical logic
4. 2FA cookies set after verification (secure)
5. No more premature logout for 2FA users
6. Auto-logout works as designed (absolute 7-day timeout)

The fixes are straightforward:
1. Delete the buggy helper file
2. Update 2FA route to import correct function and restructure verification order
3. Remove duplicate code from check route

**Estimated time to implement:** 15-20 minutes
**Testing time:** 10-15 minutes (login, 2FA, refresh, logout flows)
