# Authentication System Analysis Report

## Executive Summary

The BitFactory authentication system uses JWT tokens (HS256) with dual-token architecture (access + refresh tokens) for session management. The system includes manual logout with token blacklisting and automatic session check every 5 minutes, but currently lacks an explicit auto-logout timeout mechanism.

---

## 1. LOGIN FLOW

### Entry Point
**File:** `src/app/api/login/route.ts`

**Process:**
1. User submits email and password
2. Validates input format and email syntax
3. Finds user in database (Prisma)
4. Verifies password using bcrypt with timing attack protection
5. If 2FA enabled: returns `requiresTwoFactor: true` (requires separate 2FA verification)
6. If password valid:
   - Generates access token (1 hour expiry) and refresh token (7 days expiry)
   - Logs login activity to `UserActivity` table
   - Sets HttpOnly cookies with secure flags
   - Redirects to role-appropriate dashboard

**Cookies Set:**
- `token`: Access token (1 hour, HttpOnly, Secure, SameSite=Strict)
- `refresh_token`: Refresh token (7 days, HttpOnly, Secure, SameSite=Strict)

**Role-Based Redirect:**
- `ADMIN` or `SUPER_ADMIN` → `/adminpanel`
- `CLIENT` → `/dashboard`

---

## 2. LOGOUT FLOW

### Two Logout Endpoints (⚠️ DUPLICATION DETECTED)

#### Endpoint 1: `/api/auth/logout`
**File:** `src/app/api/auth/logout/route.ts`  
**Purpose:** Minimal logout (deprecated/unused)

**Action:**
- Only deletes the `token` cookie
- Does NOT delete `refresh_token`
- Does NOT add token to blacklist
- Does NOT log logout activity
- **⚠️ Issues:** Incomplete; refresh token remains valid

#### Endpoint 2: `/api/auth/signout` ✅ (CORRECT)
**File:** `src/app/api/auth/signout/route.ts`  
**Purpose:** Complete, secure logout (USED)

**Process:**
1. Extracts `token` from cookies
2. Verifies JWT to get `userId`
3. Adds token to `TokenBlacklist` (expires in 15 minutes)
4. Logs logout activity to `UserActivity` table with IP and User-Agent
5. Clears both cookies: `token` and `refresh_token`
6. Returns success response

**Security Features:**
- Token invalidation (short TTL for cleanup)
- Activity logging
- Both cookies cleared
- Graceful error handling (continues logout even if verification fails)

### Client-Side Logout
**File:** `src/lib/contexts/auth-context.tsx` (function `logout()`)

**Process:**
1. Clears user state immediately (optimistic)
2. Calls `router.refresh()` to clear Next.js cache
3. Calls `/api/auth/signout` endpoint
4. Clears `localStorage` and `sessionStorage`
5. Forces hard navigation with `window.location.href = '/login'`

**Error Handling:**
- If server-side logout fails, still navigates to login
- Ensures client-side logout regardless of server response

---

## 3. AUTO-LOGOUT / SESSION TIMEOUT

### Current Implementation

#### Periodic Auth Check
**File:** `src/lib/contexts/auth-context.tsx`

**Mechanism:**
```javascript
useEffect(() => {
  const interval = setInterval(checkAuth, 5 * 60 * 1000); // Every 5 minutes
  return () => clearInterval(interval);
}, []);
```

**What Happens:**
1. Every 5 minutes, the client checks `/api/auth/check`
2. If access token is expired but refresh token is valid → new tokens are auto-generated
3. If both tokens invalid/expired → user redirected to login
4. No user interaction required (silent refresh)

#### Token Expiration (Server-Side)
**File:** `src/lib/jwt.ts`

**Token Lifetimes:**
- **Access Token:** 1 hour (signed with `setExpirationTime("1h")`)
- **Refresh Token:** 7 days (signed with `setExpirationTime("7d")`)

**Verification:**
- `verifyJwtToken()` throws error if token has expired
- Handled by `/api/auth/check` endpoint

### ⚠️ **CRITICAL ISSUE: No Explicit Session Timeout**

**Current State:**
- User can remain logged in for up to **7 days** (refresh token lifetime)
- No inactivity timeout exists
- No "idle logout" mechanism
- Auth check only runs every 5 minutes (passive, not event-driven)

**Example Scenario:**
- User logs in on Monday
- Leaves the application idle for 3 days without closing browser
- Application automatically logs them out only after 7 days
- No warning before auto-logout

---

## 4. TOKEN REFRESH LOGIC

**File:** `src/app/api/auth/check/route.ts`

**Process:**
1. Receives request with both `token` and `refresh_token` cookies
2. Attempts to verify access token first
3. If access token expired:
   - Tries to verify refresh token
   - If refresh token valid:
     - Generates new access + refresh tokens
     - Sets new cookies
     - Returns user data with new tokens
4. If both tokens invalid/expired:
   - Clears both cookies
   - Returns 401 Unauthorized
   - Client redirects to login

**No Token Blacklist Check:**
⚠️ The refresh endpoint does NOT check if tokens are in the `TokenBlacklist`. This means a blacklisted token could theoretically still refresh if used before expiry.

---

## 5. COMPLETE FILE INVENTORY

| File Path | Purpose | Role in Auth Lifecycle |
|-----------|---------|------------------------|
| `src/app/api/login/route.ts` | User login endpoint | Entry point; creates tokens |
| `src/app/api/auth/logout/route.ts` | ⚠️ Incomplete logout | Deprecated (unused) |
| `src/app/api/auth/signout/route.ts` | Complete logout endpoint | Main logout; blacklists token |
| `src/app/api/auth/check/route.ts` | Auth status & token refresh | Session validation & renewal |
| `src/app/api/auth/verify/route.ts` | Simple token verification | Status checks only |
| `src/lib/jwt.ts` | JWT creation & verification | Token lifecycle management |
| `src/lib/contexts/auth-context.tsx` | React auth context & hooks | Client-side session state |
| `src/middleware.ts` | Next.js route protection | Role-based access control |
| `src/app/(auth)/layout.tsx` | Auth layout wrapper | Ensures auth context availability |
| `src/components/AppBar.tsx` | Logout button UI | Initiates logout |
| `src/app/api/auth/2fa/setup/route.ts` | 2FA setup endpoint | Optional 2FA configuration |
| `src/app/api/auth/2fa/verify/route.ts` | 2FA verification | Enables 2FA post-setup |
| `prisma/schema.prisma` | Database schema | Defines TokenBlacklist, UserActivity |

---

## 6. IDENTIFIED ISSUES & DUPLICATIONS

### 🔴 **Critical Issues**

| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| No explicit inactivity timeout | HIGH | Global | Users stay logged in for 7 days even if inactive |
| Missing blacklist check in refresh | HIGH | `src/app/api/auth/check/route.ts` | Blacklisted tokens can refresh tokens before expiry |
| Duplicate logout endpoints | MEDIUM | `logout` + `signout` | Confusion; incomplete endpoint still accessible |
| No CSRF protection on logout | MEDIUM | `POST /api/auth/signout` | Logout can be triggered without verification |

### 🟡 **Code Quality Issues**

1. **Unused logout endpoint:** `src/app/api/auth/logout/route.ts` should be removed
   - Only deletes `token`, leaves `refresh_token` valid
   - Never called by frontend
   - Creates security confusion

2. **No logout CSRF protection:**
   - Logout is a state-changing operation (POST)
   - No CSRF token or origin verification
   - Could be triggered by malicious sites

3. **No device management:**
   - No tracking of active sessions per user
   - No "logout from all devices" feature
   - Refresh token can be used indefinitely

4. **Silent refresh at 5-minute intervals:**
   - Extends session every time user is active
   - Can lead to effectively permanent sessions
   - No user awareness of ongoing session

---

## 7. AUTO-LOGOUT TIMEOUT BEHAVIOR

### Current Behavior
- **Absolute Timeout:** 7 days (refresh token expiry)
- **Inactivity Timeout:** None (passive auth check)
- **User Awareness:** None

### How to Modify Timeout Duration

#### To Change Token Expiry:
1. **Access Token (1 hour):**
   - File: `src/app/api/login/route.ts` (line: `maxAge: 60 * 60`)
   - File: `src/lib/jwt.ts` (line: `.setExpirationTime("1h")`)

2. **Refresh Token (7 days):**
   - File: `src/app/api/login/route.ts` (line: `maxAge: 7 * 24 * 60 * 60`)
   - File: `src/lib/jwt.ts` (line: `.setExpirationTime("7d")`)

3. **Auth Check Interval (5 minutes):**
   - File: `src/lib/contexts/auth-context.tsx` (line: `setInterval(checkAuth, 5 * 60 * 1000)`)

#### To Add Inactivity Timeout:
- Not currently implemented
- Would require tracking last activity timestamp
- Would need event listener for user interactions
- Would clear session if no activity for X minutes

---

## 8. SECURITY & CONSISTENCY ASSESSMENT

### ✅ Strengths
- HttpOnly, Secure, SameSite cookies (prevents XSS/CSRF attacks)
- Bcrypt password hashing with timing attack protection
- Dual-token architecture (separate short-lived & long-lived tokens)
- Activity logging for audit trail
- Role-based route protection in middleware
- Token blacklisting mechanism

### ⚠️ Weaknesses
- **No inactivity timeout** (users can stay logged in while idle)
- **No blacklist check on refresh** (security risk)
- **No CSRF protection on logout** (POST operation)
- **Duplicate logout endpoints** (confusion, unused code)
- **No device/session tracking** (can't logout from specific devices)
- **Silent token refresh** (extends sessions without user knowledge)

---

## 9. RECOMMENDATIONS

### Priority 1 (Critical)
1. **Remove unused logout endpoint** (`src/app/api/auth/logout/route.ts`)
2. **Add blacklist check to token refresh logic** in `src/app/api/auth/check/route.ts`
3. **Implement inactivity timeout** with configurable duration (e.g., 30 minutes)

### Priority 2 (Important)
1. Add CSRF protection to logout endpoint (CSRF token or state verification)
2. Implement "logout from all devices" feature
3. Add session management UI (view active sessions, logout from specific devices)

### Priority 3 (Nice-to-Have)
1. Add logout warning before timeout expiry
2. Persist inactivity timeout preferences per user
3. Implement "remember me" for extended sessions with user consent

---

## 10. TOKEN LIFECYCLE DIAGRAM

```
┌─ LOGIN ─────────────────┐
│ POST /api/login         │
│ → Verify password       │
│ → Create tokens         │
│ → Set cookies (1h + 7d) │
└────────────┬────────────┘
             ↓
    ┌─────────────────────┐
    │ USER AUTHENTICATED  │
    │ Cookies set         │
    └────────┬────────────┘
             ↓
    ┌──────────────────────────────┐
    │ Every 5 minutes (auto)        │
    │ GET /api/auth/check          │
    │ - If token expired: refresh  │
    │ - If both expired: logout    │
    └────────┬─────────────────────┘
             ↓
    TOKEN EXPIRES (1h access / 7d refresh)
             ↓
    ┌──────────────────────────────┐
    │ LOGOUT FLOW                  │
    │ Option 1: Manual             │
    │  POST /api/auth/signout      │
    │  → Blacklist token           │
    │  → Clear cookies             │
    │  → Log activity              │
    │                              │
    │ Option 2: Auto (7 days)      │
    │  → Tokens expire             │
    │  → Next /api/auth/check      │
    │  → Cookies cleared           │
    │  → Redirect to /login        │
    └──────────────────────────────┘
```

---

## Notes

- **JWT Secret:** Stored in `JWT_SECRET` environment variable
- **Database Driver:** Prisma ORM (PostgreSQL/other)
- **Cookie Store:** Next.js cookie management
- **No session database:** Only uses JWT + blacklist, no server-side session storage
- **Activity Logging:** All login/logout activities logged to `UserActivity` table
- **Middleware Protection:** All non-public routes validated at middleware level
