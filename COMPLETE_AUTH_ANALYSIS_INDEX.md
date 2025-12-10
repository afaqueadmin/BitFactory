# Complete Authentication System Analysis & Correction Plan

**Document Date:** December 10, 2025  
**Status:** READY FOR IMPLEMENTATION  
**Severity:** CRITICAL BUG (2FA users logged out after 15 minutes)

---

## Quick Navigation

1. **For quick understanding:** Read `AUTH_FIX_SUMMARY.md`
2. **For technical details:** Read `AUTH_DIAGNOSTIC_AND_CORRECTION_PLAN.md`
3. **For exact code changes:** Read `AUTH_EXACT_CODE_CHANGES.md`
4. **For original analysis:** See `AUTHENTICATION_SYSTEM_ANALYSIS.md`

---

## The Problem Statement

**Symptom:** 2FA-enabled users are automatically logged out after 15 minutes instead of 1 hour.

**Root Cause:** File `/src/lib/helpers/generateTokens.ts` generates tokens with 15-minute expiry (used only by 2FA flow), while all other endpoints generate 1-hour tokens.

**Impact:**
- 2FA login generates `token` JWT with 15m expiry
- Cookie is set to expire in 1 hour
- After 15 minutes, JWT is invalid but cookie still exists
- Next `/api/auth/check` call (every 5 minutes) finds invalid token
- User is logged out
- Regular (non-2FA) users are not affected (1h token = 1h cookie = no mismatch)

**Security Issue:** 2FA cookies are set BEFORE verification completes, allowing invalid tokens to be stored if verification fails.

---

## What Has Changed Since Original Report

**Original Report (`AUTHENTICATION_SYSTEM_ANALYSIS.md`):**
- Stated users remain logged in for 7 days ❌ INCORRECT
- Did not identify the 15-minute token bug ❌ MISSED
- Did not identify cookie-before-verification issue ❌ MISSED
- Did not map three different token generators ❌ INCOMPLETE

**Updated Analysis:**
- Identified exact root cause: Version B token generator with 15m expiry ✅
- Mapped all three token generation implementations ✅
- Identified security vulnerability in 2FA flow ✅
- Provided step-by-step correction plan ✅

---

## Three Token Generator Implementations Found

### Generator A: `/src/lib/jwt.ts` (CORRECT)
```typescript
export async function generateTokens(userId: string, role: string) {
  const accessToken = await signJwtToken({ userId, role });        // 1h
  const refreshToken = await signJwtToken(..., "7d");              // 7d
  return { accessToken, refreshToken };
}
```
**Used by:** `/api/login`, and should be used by all endpoints
**Algorithm:** jose library (async, HS256)

### Generator B: `/src/lib/helpers/generateTokens.ts` (BUGGY - DELETE THIS)
```typescript
const generateTokens = (userId: string, role: string) => {
    const accessToken = jwt.sign(
        { userId, role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '15m' }                                       // 15 MINUTES ❌
    );
    const refreshToken = jwt.sign(..., { expiresIn: '7d' });      // 7d
    return { accessToken, refreshToken };
};
```
**Used by:** `/api/auth/2fa/validate` (WRONG!)
**Algorithm:** jsonwebtoken library (sync, HS256)
**Issue:** 15-minute access token is the root cause of premature logout

### Generator C: `/src/app/api/auth/check/route.ts` (LOCAL COPY - DELETE THIS)
```typescript
const generateTokens = async (userId: string, role: string) => {
  const accessToken = await signJwtToken({ userId, role });       // 1h
  const refreshToken = await signJwtToken(..., "7d");             // 7d
  return { accessToken, refreshToken };
};
```
**Used by:** Token refresh logic (for every 5-minute auth check)
**Issue:** Duplicate code (same logic as Generator A)

---

## 2FA Flow Security Issue

**Current (Insecure) Flow:**

```
User enters 2FA code
        ↓
POST /api/auth/2fa/validate { email, token }
        ↓
Lookup user, generate tokens
        ↓
Create response object
        ↓
SET COOKIES WITH TOKENS ⚠️ (line 44-58)
        ↓
Check backup code (line 61-78)
        ↓
Verify TOTP (line 80-87)
        ↓
If verification FAILS → return error
        BUT COOKIES ALREADY SET! ⚠️⚠️⚠️
```

**Problem:** At line 44-58, we set valid tokens in cookies BEFORE we verify whether the 2FA code is correct. If verification fails at line 87, the error response is returned, but the browser has already received and stored valid tokens.

**Attack scenario:** An attacker could intercept at the 2FA form, and if they can submit any token string to `/api/auth/2fa/validate`, they could potentially receive valid tokens even if they haven't verified their 2FA code.

---

## The Corrections Required

### Phase 1: Remove Duplicates & Unify Token Generation

**Delete file:** `/src/lib/helpers/generateTokens.ts`
- This file is the source of the 15-minute token bug
- Replace all imports with Generator A from `@/lib/jwt`

**Update file:** `/src/app/api/auth/check/route.ts`
- Remove local `generateTokens` definition (lines 9-15)
- Import `generateTokens` from `@/lib/jwt` instead
- This eliminates code duplication

**Result:** Only Generator A (`/lib/jwt.ts`) remains, used by all three endpoints

---

### Phase 2: Fix 2FA Verification Security

**Update file:** `/src/app/api/auth/2fa/validate/route.ts`
- Line 5: Change import from `/lib/helpers/generateTokens` to `/lib/jwt`
- Line 38: Add `await` before `generateTokens(...)` call
- Lines 37-126: Restructure to set cookies ONLY after verification succeeds

**New correct order:**
```
1. Parse request
2. Lookup user
3. Generate tokens
4. Create response (WITHOUT cookies yet)
5. Check backup code / Verify TOTP
6. If verification FAILS → return error (no cookies)
7. If verification SUCCEEDS → set cookies on response
8. Return response
```

---

### Phase 3: Verify Expiry Consistency

After Phases 1-2, all endpoints will:
- Generate 1-hour access tokens
- Set cookie maxAge to 1 hour
- Generate 7-day refresh tokens
- Set cookie maxAge to 7 days

No changes needed to other endpoints (they're already correct).

---

## Expected Results After Correction

### Regular Login
- ✓ Already working correctly
- ✓ Generates 1h access + 7d refresh tokens
- ✓ Stays logged in for 1 hour

### 2FA Login (FIXED)
- ✓ Now generates 1h access + 7d refresh tokens (was 15m)
- ✓ Cookies set ONLY after 2FA verification passes
- ✓ Stays logged in for 1 hour (not 15 minutes)

### Token Refresh
- ✓ Still works correctly
- ✓ Extends session another hour every time refresh occurs
- ✓ No longer duplicated code

### Auto-Logout
- ✓ Still occurs after 7 days (refresh token expiry)
- ✓ Still occurs if explicitly logged out
- ✓ Still occurs after manual 5-minute auth check detects expired token

---

## Files to Be Modified

| File | Action | Lines | Complexity |
|------|--------|-------|------------|
| `/src/lib/helpers/generateTokens.ts` | DELETE | All | Trivial |
| `/src/app/api/auth/2fa/validate/route.ts` | MODIFY | 3 + 50+ | Medium |
| `/src/app/api/auth/check/route.ts` | MODIFY | 2 | Simple |
| `/src/app/api/login/route.ts` | VERIFY | N/A | None |

**Total changes:** ~60 lines across 3 files (1 deletion, 2 modifications)

---

## Implementation Checklist

- [ ] Review this entire analysis
- [ ] Review `AUTH_EXACT_CODE_CHANGES.md` for exact line-by-line changes
- [ ] Delete `/src/lib/helpers/generateTokens.ts`
- [ ] Update `/src/app/api/auth/2fa/validate/route.ts` (line 5 import)
- [ ] Update `/src/app/api/auth/2fa/validate/route.ts` (line 38 await)
- [ ] Update `/src/app/api/auth/2fa/validate/route.ts` (lines 37-126 restructure)
- [ ] Update `/src/app/api/auth/check/route.ts` (lines 3-4 import)
- [ ] Update `/src/app/api/auth/check/route.ts` (delete lines 9-15)
- [ ] Run `npm run build`
- [ ] Verify no TypeScript errors
- [ ] Verify no ESLint errors
- [ ] Test regular login
- [ ] Test 2FA login
- [ ] Test token refresh
- [ ] Test invalid 2FA code (should NOT set cookies)
- [ ] Test logout
- [ ] Commit changes

---

## Remaining Known Issues (NOT fixed by this phase)

These are out of scope for the current correction but should be addressed in future phases:

1. **No inactivity timeout**
   - Users stay logged in until refresh token expires (7 days)
   - Would require activity event tracking
   - Could implement in future phase

2. **Duplicate logout endpoints**
   - `/api/auth/logout` (incomplete) - should be deleted
   - `/api/auth/signout` (correct) - should remain
   - Minor cleanup for future phase

3. **No blacklist check on refresh**
   - `/api/auth/check` doesn't verify blacklist before refreshing
   - Low risk but good security practice to add
   - Could implement in future phase

4. **No CSRF protection on logout**
   - POST endpoint without CSRF token
   - Low risk due to HttpOnly cookies
   - Could implement in future phase

---

## Rollback Instructions

If you need to revert these changes:

```bash
# Restore deleted file
git checkout HEAD -- src/lib/helpers/generateTokens.ts

# Restore modified files
git checkout HEAD -- src/app/api/auth/2fa/validate/route.ts
git checkout HEAD -- src/app/api/auth/check/route.ts

# Verify revert
npm run build
```

---

## Documentation Artifacts

This analysis generated 4 comprehensive documents:

1. **AUTHENTICATION_SYSTEM_ANALYSIS.md** - Original (outdated) analysis
2. **AUTH_DIAGNOSTIC_AND_CORRECTION_PLAN.md** - Detailed technical analysis (CURRENT - most detailed)
3. **AUTH_FIX_SUMMARY.md** - Executive summary (CURRENT - easiest to understand)
4. **AUTH_EXACT_CODE_CHANGES.md** - Line-by-line code changes (CURRENT - for implementation)
5. **COMPLETE_AUTH_ANALYSIS_INDEX.md** - This document (navigation guide)

**Recommended reading order:**
- Start: `AUTH_FIX_SUMMARY.md` (5 min read)
- Then: `AUTH_EXACT_CODE_CHANGES.md` (implementation guide)
- Deep dive: `AUTH_DIAGNOSTIC_AND_CORRECTION_PLAN.md` (comprehensive analysis)

---

## Questions Answered

**Q: Why are 2FA users logged out after 15 minutes?**  
A: File `/lib/helpers/generateTokens.ts` creates 15-minute tokens. Only 2FA uses this file.

**Q: Why aren't regular users affected?**  
A: Regular login uses `/lib/jwt.ts` which creates 1-hour tokens.

**Q: Is this a security vulnerability?**  
A: Yes, two issues: (1) 15-minute expiry causes unexpected logout, (2) 2FA cookies set before verification is insecure.

**Q: Will the fix break anything?**  
A: No. The fix aligns 2FA with regular login behavior (1h tokens), removes duplicate code, and improves security.

**Q: Do I need to change the environment variables?**  
A: No. Both token generators use `JWT_SECRET`. The helper file also checked `JWT_REFRESH_SECRET`, which is not used elsewhere.

**Q: What about the 5-minute auth check?**  
A: It's working correctly. It detects the 15-minute token expiry correctly. Once fixed, it will detect 1-hour token expiry correctly.

**Q: Will users stay logged in for 7 days after this fix?**  
A: No. Absolute maximum is still 7 days (refresh token expiry), but users will be logged out earlier if:
  - They manually click logout (immediate)
  - They close browser (session ends)
  - They don't refresh token before 7 days
  - Refresh token is blacklisted

---

## Success Criteria

After implementation, these must be true:

✓ Build passes with no errors  
✓ 2FA users stay logged in for 1 hour (not 15 minutes)  
✓ Regular users stay logged in for 1 hour (unchanged)  
✓ Token refresh works correctly  
✓ Invalid 2FA code does not set cookies  
✓ Manual logout works  
✓ Only one token generation implementation exists  
✓ No code duplication in auth endpoints  

---

## Timeline

- **Analysis:** COMPLETE ✓
- **Documentation:** COMPLETE ✓
- **Code changes:** READY FOR IMPLEMENTATION
- **Testing:** PENDING IMPLEMENTATION
- **Deployment:** PENDING TESTING

**Estimated effort:**
- Implementation: 15-20 minutes
- Testing: 10-15 minutes
- Verification: 5 minutes
- **Total: 30-50 minutes**

---

## Contact & Questions

All analysis is self-contained in these documents. If any clarification is needed:

1. Review `AUTH_EXACT_CODE_CHANGES.md` for the exact code changes
2. Review `AUTH_DIAGNOSTIC_AND_CORRECTION_PLAN.md` for the detailed analysis
3. Review `AUTH_FIX_SUMMARY.md` for the quick overview

---

## Appendix: File Mapping

### Files That MUST Change
- `/src/lib/helpers/generateTokens.ts` - DELETE
- `/src/app/api/auth/2fa/validate/route.ts` - MODIFY
- `/src/app/api/auth/check/route.ts` - MODIFY

### Files That Need NO CHANGES
- `/src/app/api/login/route.ts` - Already correct
- `/src/lib/jwt.ts` - Keep as is
- `/src/middleware.ts` - No changes needed
- `/src/lib/contexts/auth-context.tsx` - No changes needed
- `/src/app/(public)/login/page.tsx` - No changes needed
- `/src/components/TwoFactorVerification.tsx` - No changes needed
- All other files - No changes needed

---

## Summary

**The bug:** 2FA users get 15-minute tokens, regular users get 1-hour tokens.

**The fix:** Make 2FA use the same 1-hour token generator as everyone else, fix cookie setting order.

**The effort:** ~30-50 minutes including testing.

**The benefit:** 2FA login works reliably, more secure, cleaner code.

---

**Document Status: READY FOR IMPLEMENTATION**

All information needed to fix the authentication system is contained in the attached documents.
