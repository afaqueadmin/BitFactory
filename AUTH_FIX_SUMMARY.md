# Authentication System: Executive Summary & Quick Fix Guide

## The Problem in 30 Seconds

Your 2FA users are logged out after 15 minutes instead of 1 hour because:

**File `/src/lib/helpers/generateTokens.ts` creates 15-minute tokens** (only for 2FA)
while your login endpoint creates 1-hour tokens (everyone else).

The cookie is set to expire in 1 hour, but the JWT inside it is only valid for 15 minutes. After 15 minutes, the token is invalid, the 5-minute auth-check interval detects this, and the user is logged out.

---

## Root Cause: Three Different Token Generators

| Generator | Location | Expiry | Used By | Issue |
|-----------|----------|--------|---------|-------|
| **A (Correct)** | `/lib/jwt.ts` | 1h access | `/api/login` | ✓ Works fine |
| **B (Buggy)** | `/lib/helpers/generateTokens.ts` | **15m access** | `/api/auth/2fa/validate` | 🔴 **PREMATURE LOGOUT** |
| **C (Duplicate)** | `/api/auth/check/route.ts` (local) | 1h access | Token refresh | ⚠️ Code duplication |

---

## The Security Issue

In `/api/auth/2fa/validate/route.ts`, cookies are set BEFORE verification:

```typescript
// Line 38: Generate tokens
const { accessToken, refreshToken } = generateTokens(user.id, user.role);

// Lines 44-58: Set cookies IMMEDIATELY
response.cookies.set("token", accessToken, { ... });
response.cookies.set("refresh_token", refreshToken, { ... });

// Lines 61-87: Verify 2FA code (THIS HAPPENS AFTER COOKIES SET!)
if (!verified) {
  return NextResponse.json({ error: "Invalid token" }, { status: 400 }); 
  // ✗ Cookies already in browser!
}
```

If verification fails, valid tokens are already in the browser. This is a **security vulnerability**.

---

## The Fix (3 Changes Required)

### Change 1: Delete the Buggy Helper
**File:** `/src/lib/helpers/generateTokens.ts`
**Action:** DELETE entire file

**Reason:** This file is the source of the 15-minute token bug. No other code depends on it except 2FA (which we'll fix to use the correct one).

---

### Change 2: Fix 2FA Validation Route
**File:** `/src/app/api/auth/2fa/validate/route.ts`

**Change A: Line 5 (import)**
```typescript
// OLD
import generateTokens from "@/lib/helpers/generateTokens";

// NEW
import { generateTokens } from "@/lib/jwt";
```

**Change B: Line 38 (add await)**
```typescript
// OLD
const { accessToken, refreshToken } = generateTokens(user.id, user.role);

// NEW
const { accessToken, refreshToken } = await generateTokens(user.id, user.role);
```

**Change C: Lines 37-126 (restructure cookie order)**

IMPORTANT: Move cookie-setting code to AFTER verification succeeds.

Current structure:
```
1. Generate tokens (line 38)
2. Create response (line 44)
3. Set cookies (lines 45-58)
4. Check backup codes (lines 61-78)
5. Verify TOTP (lines 80-87)
```

New structure should be:
```
1. Generate tokens
2. Create response (WITHOUT cookies yet)
3. Check backup codes
4. Verify TOTP
5. If ANY check fails, return error (cookies NOT set)
6. If ALL checks pass, set cookies
7. Return response
```

---

### Change 3: Remove Duplicate Code
**File:** `/src/app/api/auth/check/route.ts`

**Change A: Line 3-4 (update import)**
```typescript
// OLD
import { verifyJwtToken, signJwtToken } from "@/lib/jwt";

// NEW
import { verifyJwtToken, signJwtToken, generateTokens } from "@/lib/jwt";
```

**Change B: Lines 9-15 (delete local function)**
```typescript
// DELETE THIS ENTIRE BLOCK:
const generateTokens = async (userId: string, role: string) => {
  const accessToken = await signJwtToken({ userId, role });
  const refreshToken = await signJwtToken(
    { userId, role, type: "refresh" },
    "7d",
  );
  return { accessToken, refreshToken };
};
```

Use the imported `generateTokens` instead. The logic is identical.

---

## What This Fixes

✅ **2FA users:** 15-minute logout → 1-hour logout (same as regular users)
✅ **Token consistency:** All endpoints use same token generation algorithm
✅ **Security:** 2FA cookies set ONLY after successful verification
✅ **Code quality:** Removes duplicate token generation logic
✅ **Maintainability:** Single source of truth for token creation

---

## Verification After Changes

1. **TypeScript build:** Should pass (remove unused import)
2. **Login flow:** Still works (no changes needed)
3. **2FA flow:** Now generates 1h tokens (was 15m)
4. **Token refresh:** Still works (removed duplicate code)
5. **Auto-logout:** Works at 7 days (refresh token expiry)

---

## Expected Behavior After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Regular login → stays logged in | 1 hour | 1 hour ✓ |
| 2FA login → stays logged in | 15 minutes ✗ | 1 hour ✓ |
| No activity → auto-logout | 7 days | 7 days ✓ |
| Manual logout | Immediate | Immediate ✓ |

---

## Notes

- The main authentication flow works fine for regular login
- Only 2FA users were affected by the 15-minute logout
- The 5-minute auth-check interval was correctly detecting expired tokens; the issue was that 2FA tokens expired in 15 minutes
- After this fix, all token generation uses the same algorithm (`jose` library, HS256, async function)

---

## Files Touched

| File | Action |
|------|--------|
| `/src/lib/helpers/generateTokens.ts` | DELETE |
| `/src/app/api/auth/2fa/validate/route.ts` | MODIFY (3 changes) |
| `/src/app/api/auth/check/route.ts` | MODIFY (2 changes) |
| `/src/app/api/login/route.ts` | NO CHANGES |

**Estimated effort:** 15-20 minutes to implement and test

---

## Detailed Diagnostic Report

See: `AUTH_DIAGNOSTIC_AND_CORRECTION_PLAN.md`

That file contains:
- Complete conflict mapping
- 2FA flow analysis
- Auth check interval analysis
- Dependency tree
- Validation checklist
- Remaining issues (not fixed by this phase)
