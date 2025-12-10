# Authentication System: Exact Code Changes Required

## CHANGE #1: Delete File (Complete Deletion)

### File to DELETE
```
/src/lib/helpers/generateTokens.ts
```

**Current contents (to be deleted):**
```typescript
import jwt from 'jsonwebtoken';

// Token generation with proper types
const generateTokens = (userId: string, role: string) => {
    const accessToken = jwt.sign(
        { userId, role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
        { userId, role, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
        { expiresIn: '7d' }
    );

    return { accessToken, refreshToken };
};

export default generateTokens;
```

**Delete this entire file.** It's the source of the 15-minute token bug.

---

## CHANGE #2: Update 2FA Validate Route

### File to MODIFY
```
/src/app/api/auth/2fa/validate/route.ts
```

---

### Modification 2A: Fix Import (Line 5)

**OLD:**
```typescript
import generateTokens from "@/lib/helpers/generateTokens";
```

**NEW:**
```typescript
import { generateTokens } from "@/lib/jwt";
```

---

### Modification 2B: Add Await Keyword (Line 38)

**OLD:**
```typescript
    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
```

**NEW:**
```typescript
    const { accessToken, refreshToken } = await generateTokens(user.id, user.role);
```

---

### Modification 2C: Restructure Cookie Setting Order (Lines 37-126)

**CRITICAL:** Cookies must be set AFTER verification succeeds, not before.

**Current problematic structure:**
```typescript
    // Generate tokens with role
    const { accessToken, refreshToken } = generateTokens(user.id, user.role);

    // Determine redirect URL based on role
    const redirectUrl = user.role === "ADMIN" ? "/adminpanel" : "/dashboard";

    const response = NextResponse.json({ success: true, redirectUrl });

    // Set cookies with proper flags
    response.cookies.set("token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60, // 1 hour
      path: "/",
    });

    response.cookies.set("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    // First check if it's a backup code
    if (user.twoFactorBackupCodes?.includes(token)) {
      // ... handle backup code ...
      return response; // ✗ Returns with cookies already set
    }

    // Verify TOTP
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: "base32",
      token: token,
      window: 1,
    });

    if (!verified) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 }); 
      // ✗ Cookies already in browser!
    }

    // Log successful 2FA verification
    await prisma.userActivity.create({
      // ...
    });

    return response;
```

**New correct structure (MOVE COOKIE SETTING TO END):**

```typescript
    // Generate tokens with role
    const { accessToken, refreshToken } = await generateTokens(user.id, user.role);

    // Determine redirect URL based on role
    const redirectUrl = user.role === "ADMIN" ? "/adminpanel" : "/dashboard";

    // Create response WITHOUT cookies yet
    const response = NextResponse.json({ success: true, redirectUrl });

    // Perform verifications BEFORE setting cookies
    
    // Check if it's a backup code
    if (user.twoFactorBackupCodes?.includes(token)) {
      // Remove the used backup code
      await prisma.user.update({
        where: { email },
        data: {
          twoFactorBackupCodes: {
            set: user.twoFactorBackupCodes.filter((code) => code !== token),
          },
        },
      });

      // Log the backup code usage
      await prisma.userActivity.create({
        data: {
          userId: user.id,
          type: "2FA_BACKUP_CODE_USED",
          ipAddress: req.headers.get("x-forwarded-for") || "unknown",
          userAgent: req.headers.get("user-agent") || "unknown",
        },
      });

      // Verification passed, now set cookies
      response.cookies.set("token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60, // 1 hour
        path: "/",
      });

      response.cookies.set("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: "/",
      });

      return response;
    }

    // Verify TOTP
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: "base32",
      token: token,
      window: 1,
    });

    if (!verified) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 }); 
      // ✓ Cookies NOT set because verification failed
    }

    // Log successful 2FA verification
    await prisma.userActivity.create({
      data: {
        userId: user.id,
        type: "2FA_VERIFICATION_SUCCESS",
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    // All verifications passed, now set cookies
    response.cookies.set("token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60, // 1 hour
      path: "/",
    });

    response.cookies.set("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
```

**Key changes:**
1. Cookies set TWICE (once for backup code path, once for TOTP path)
2. Each path verifies BEFORE setting cookies
3. If verification fails, response returned WITHOUT cookies
4. If verification passes, cookies added to response
5. Both paths return response with cookies set only after successful verification

---

## CHANGE #3: Update Auth Check Route

### File to MODIFY
```
/src/app/api/auth/check/route.ts
```

---

### Modification 3A: Update Import (Lines 3-4)

**OLD:**
```typescript
import { verifyJwtToken, signJwtToken } from "@/lib/jwt";

// Runtime config
export const runtime = "nodejs";

// Config options
const generateTokens = async (userId: string, role: string) => {
  const accessToken = await signJwtToken({ userId, role });
  const refreshToken = await signJwtToken(
    { userId, role, type: "refresh" },
    "7d",
  );
  return { accessToken, refreshToken };
};
```

**NEW:**
```typescript
import { verifyJwtToken, signJwtToken, generateTokens } from "@/lib/jwt";

// Runtime config
export const runtime = "nodejs";
```

**What changed:**
- Added `generateTokens` to the import
- Deleted the local `generateTokens` function definition (lines 9-15 in old version)
- Now uses the imported version instead

---

### Modification 3B: Verify Usage (Line 73)

**Verify this line exists (it should need no changes):**
```typescript
const { accessToken, refreshToken: newRefreshToken } =
  await generateTokens(user.id, user.role);
```

This line should already have the `await` keyword and should work correctly once we've updated the import.

---

## Complete Before/After Summary

| Change | File | Type | Impact |
|--------|------|------|--------|
| 1 | `/src/lib/helpers/generateTokens.ts` | DELETE | Removes 15m token bug |
| 2A | `/src/app/api/auth/2fa/validate/route.ts` | IMPORT | Uses correct token generator |
| 2B | `/src/app/api/auth/2fa/validate/route.ts` | AWAIT | Handles async properly |
| 2C | `/src/app/api/auth/2fa/validate/route.ts` | STRUCTURE | Sets cookies after verification |
| 3A | `/src/app/api/auth/check/route.ts` | IMPORT | Removes duplicate code |
| 3B | `/src/app/api/auth/check/route.ts` | DELETE | Removes duplicate function |

---

## Token Generation After Changes

```typescript
// Only one implementation remains: /src/lib/jwt.ts

export async function generateTokens(userId: string, role: string) {
  const accessToken = await signJwtToken({ userId, role });     // 1h expiry
  const refreshToken = await signJwtToken(
    { userId, role, type: "refresh" },
    "7d",                                                         // 7d expiry
  );
  return { accessToken, refreshToken };
}
```

Used by:
- `/api/login` → ✓ Already correct
- `/api/auth/check` → ✓ After change
- `/api/auth/2fa/validate` → ✓ After change

---

## Testing After Implementation

### Test 1: Regular Login
```
1. Go to login page
2. Enter credentials
3. Click login
4. Expected: Redirected to dashboard/adminpanel
5. Verify: Token cookie exists, valid for 1 hour
```

### Test 2: 2FA Login
```
1. Go to login page
2. Enter 2FA-enabled user credentials
3. Should see 2FA code input
4. Enter TOTP code from authenticator
5. Expected: Redirected to dashboard/adminpanel
6. Verify: Token cookie exists, valid for 1 hour (NOT 15 minutes)
7. Verify: Stay logged in for full hour
```

### Test 3: Token Refresh
```
1. Login (any method)
2. Wait for token to expire (or manually verify at 55 minutes)
3. Make request to protected endpoint
4. Expected: Token automatically refreshed
5. Verify: New token cookie set with 1h expiry
```

### Test 4: Invalid 2FA Code
```
1. Go to login page
2. Enter 2FA-enabled user credentials
3. Enter WRONG 2FA code
4. Expected: Error message "Invalid token"
5. Verify: NO token cookie set (check browser dev tools)
6. Verify: Still on 2FA input screen
```

### Test 5: Logout
```
1. Login
2. Click logout
3. Expected: Redirected to login
4. Verify: Token cookie cleared
5. Verify: Refresh token cookie cleared
```

---

## Rollback Plan (if needed)

If something goes wrong, you can rollback by:

1. **Restore `/src/lib/helpers/generateTokens.ts`** from git
2. **Revert changes to `/src/app/api/auth/2fa/validate/route.ts`**
3. **Revert changes to `/src/app/api/auth/check/route.ts`**

```bash
git checkout HEAD -- src/lib/helpers/generateTokens.ts
git checkout HEAD -- src/app/api/auth/2fa/validate/route.ts
git checkout HEAD -- src/app/api/auth/check/route.ts
```

---

## Performance Impact

- ✓ No negative impact
- ✓ Removes duplicate code (slight reduction in bundle size)
- ✓ Same algorithm and performance (just consolidated)
- ✓ Same execution time for token generation

---

## Security Impact

- ✓ POSITIVE: 2FA cookies now set AFTER verification (prevents early token exposure)
- ✓ POSITIVE: Single token generation method reduces attack surface
- ✓ NEUTRAL: Token expiry times unchanged (1h access, 7d refresh)
- ✓ NEUTRAL: No changes to bcrypt or cryptographic algorithms

---

## Important Notes

1. **After deleting `/src/lib/helpers/generateTokens.ts`:**
   - Run `npm run build` to verify no build errors
   - Check that no other files import from this file

2. **The restructured 2FA flow:**
   - Looks longer because verification code is now duplicated for backup code path
   - This is intentional (prevents setting cookies before verification)
   - If needed later, this could be refactored with a helper function

3. **The token generation:**
   - All three flows (login, check, 2fa/validate) now use identical logic
   - Reduces chance of token expiry mismatches in future
   - Makes codebase easier to maintain

---

## Commit Message Suggestion

```
fix(auth): consolidate token generation and fix 2FA premature logout

- Delete buggy 15-minute token generator (lib/helpers/generateTokens.ts)
- Update 2FA validate endpoint to use correct 1-hour token generation
- Fix 2FA security: cookies set ONLY after successful verification
- Remove duplicate token generation code from auth check endpoint
- All three auth flows now use identical token generation logic

Fixes: 2FA users were logged out after 15 minutes instead of 1 hour
```
