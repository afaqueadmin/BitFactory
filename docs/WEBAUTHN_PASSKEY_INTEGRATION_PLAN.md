# WebAuthn/Passkey Integration Plan

**Date Created:** May 1, 2026  
**Status:** Planning Phase  
**Priority:** Feature Enhancement  
**Target Architecture:** Current Custom JWT + 2FA system with minimal changes

---

## 1. Overview & Objectives

### Purpose
Extend the existing JWT + 2FA custom authentication system with WebAuthn/passkey support for passwordless authentication, while preserving all existing security patterns and audit logging.

### Goals
- Add passkey as an **alternative passwordless login method** (alongside email+password)
- Support both platform (biometric) and roaming (security keys) authenticators
- Maintain full backward compatibility with email+password+2FA workflow
- Preserve JWT token generation, cookie handling, and session tracking
- Integrate with existing role-based middleware and AuthContext
- Respect existing activity logging and audit trails
- **BOTH CLIENT and ADMIN/SUPER_ADMIN roles can use passkey login**
- **BOTH CLIENT and ADMIN/SUPER_ADMIN roles can manage passkeys in settings**

### Scope
- **In Scope:** WebAuthn registration, authentication, credential management, multi-step auth flow
- **Out of Scope:** Replacing password auth, changing JWT/token system, Auth0 migration

### User Roles Supported
- **CLIENT**: Users with `role: CLIENT` (default)
- **ADMIN**: Users with `role: ADMIN`
- **SUPER_ADMIN**: Users with `role: SUPER_ADMIN`
- **All roles** can register and use passkeys for login and authentication

---

## 2. Current Authentication System Summary

### Existing Flow (Email + Password + Optional 2FA)

**Login Endpoint:** `src/app/api/login/route.ts`
```
POST /api/login {email, password}
  ↓
  Verify password with bcrypt
  ↓
  If 2FA enabled → return {requiresTwoFactor: true}
  Else → generate JWT tokens + set cookies → return {redirectUrl}
```

**Token Management:** `src/lib/jwt.ts`
- Access token: JWT HS256, 1-hour expiration
- Refresh token: JWT HS256, 7-day expiration
- Both stored as HttpOnly, Secure, SameSite=strict cookies

**Route Protection:** `src/middleware.ts`
- Verifies token on every request
- Role-based access control: CLIENT vs ADMIN/SUPER_ADMIN routes
- Redirects unauthorized users to `/login`
- Prevents logged-in users from viewing `/login`

**Authentication State (Client):** `src/lib/contexts/auth-context.tsx`
- AuthContext provides: user, sessionId, login(), logout(), checkAuth()
- Checks auth every 5 minutes
- Stores sessionId in localStorage

**2FA Flow:** `src/app/api/auth/2fa/`
- Setup: Generate QR code with TOTP secret
- Verify: Store secret, generate backup codes
- Validate (during login): Check TOTP code, return tokens if valid
- Disable: Remove secret and backup codes

### Existing API Structure
```
src/app/api/auth/
├── 2fa/
│   ├── setup/route.ts
│   ├── verify/route.ts
│   └── validate/route.ts (called during login)
├── check/route.ts (token refresh/verify)
├── logout/route.ts
└── signout/route.ts (token blacklist)

src/app/api/login/route.ts (main login endpoint)
```

### Existing Database Structure (Relevant Fields)
```prisma
model User {
  id                    String @id @default(cuid())
  email                 String @unique
  password              String  // bcrypt hash
  name                  String?
  role                  Role @default(CLIENT)  // Values: CLIENT, ADMIN, SUPER_ADMIN
  twoFactorEnabled      Boolean @default(false)
  twoFactorSecret       String?
  twoFactorBackupCodes  String[]
  
  // Existing relations
  activities            UserActivity[]
  sessions              UserSession[]
  blacklisted           TokenBlacklist[]
  // ... many others
}

enum Role {
  ADMIN
  CLIENT
  SUPER_ADMIN
}

model UserActivity {
  id        String
  userId    String
  type      String  // "LOGIN", "LOGOUT", "2FA_ENABLED", etc.
  ipAddress String
  userAgent String
  createdAt DateTime
}

model UserSession {
  id        String
  userId    String
  loginAt   DateTime
  logoutAt  DateTime?
  ipAddress String?
  userAgent String?
}
```

---

## 3. Architecture Design - WebAuthn Integration

### 3.1 New Authentication Flow

#### Multi-Step Login Flow (Matching Existing 2FA Pattern)

**Step 1: Get Login Options**
```
POST /api/login/options {email}
Response: {username, id: userId, publicKey challenge, etc.}
(OR) Returns that user has no passkeys, can use password
```

**Step 2a: Password Path (Existing)**
```
POST /api/login/password {email, password}
  ├─ If 2FA enabled → {requiresTwoFactor: true} (user goes to 2FA page)
  ├─ If 2FA disabled → {tokens, redirectUrl}
  └─ Both set cookies and create UserSession/UserActivity
```

**Step 2b: Passkey Path (New)**
```
User clicks "Login with Passkey"
  ↓
GET /api/auth/webauthn/authenticate/options {email}
  → Returns challenge, timeout, userVerification
  ↓
Browser WebAuthn prompt (biometric/security key)
  ↓
POST /api/auth/webauthn/authenticate/verify {assertion response}
  → Verify assertion, check counter, validate credential
  ↓
If valid → Generate tokens, set cookies, create session
  → Return {tokens, redirectUrl}
  ↓
If invalid → Return error, user tries again (no 2FA fallback needed - passkey = cryptographic proof)
```

### 3.2 File Structure Changes (Actual)

**New API Endpoints:**
```
src/app/api/auth/webauthn/
├── register/
│   ├── options/route.ts        # GET challenge for registration
│   └── verify/route.ts         # POST attestation for registration
├── authenticate/
│   ├── options/route.ts        # GET challenge for login
│   └── verify/route.ts         # POST assertion for login
└── credentials/
    ├── route.ts                # GET list, DELETE, PATCH rename
```

**Modified Frontend Pages:**
```
src/app/(public)/login/page.tsx
  → Add passkey login tab/button (new tab alongside current form)
  → Conditionally show based on WebAuthn support
  → Current structure: Single form with email + password + optional 2FA
  → Change to: Tab selector (Password | Passkey)

src/app/(auth)/security-setting/page.tsx (CLIENTS)
  → Add passkey management section after TwoFactorSettings
  → Verified: Uses MUI components (Paper, Typography, Button)
  → Verified: Imports ChangePasswordModal and TwoFactorSettings components
  → List, add, rename, delete passkeys

src/app/(manage)/security-settings/page.tsx (ADMINS/SUPER_ADMIN) 
  → Add passkey management section after TwoFactorSettings
  → NOTE: Different path name (plural 'settings' vs singular 'setting')
  → Verified: Identical structure to client page
  → List, add, rename, delete passkeys
```

**New Client Library:**
```
src/lib/webauthn/
├── utils.ts                    # Base64URL encoding, browser detection
├── registration.ts            # Client-side registration ceremony
└── authentication.ts          # Client-side authentication ceremony
```

**Type Definitions:**
```
src/types/types.ts or new src/types/webauthn.ts
  → Add WebAuthn types and interfaces
```

### 3.3 Database Schema Changes

**Minimal Addition to User Model:**
```prisma
model User {
  // ... existing fields ...
  
  // Passkey tracking (optional, mostly for UI/UX)
  webauthnCredentials    WebAuthnCredential[]
}

model WebAuthnCredential {
  id                    String     @id @default(cuid())
  userId                String
  user                  User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  credentialId          Bytes      @unique  // Raw from WebAuthn (for lookups)
  publicKey             Bytes      // COSE encoded public key
  counter               Int        @default(0) // For cloning attack detection
  
  transports            String[]   @default([]) // "usb", "ble", "nfc", "internal", etc.
  aaguid                String?    // Authenticator model identifier
  
  credentialName        String?    // User-friendly name ("My iPhone", "YubiKey", etc.)
  createdAt             DateTime   @default(now())
  lastUsedAt            DateTime?
  
  @@index([userId])
  @@map("webauthn_credentials")
}
```

**No changes needed to:**
- UserActivity (already tracks all activities)
- UserSession (already tracks sessions)
- TokenBlacklist (existing logout mechanism)
- User password field (kept for backward compatibility)

---

## 4. Implementation Details (Aligned with Actual Structure)

### 4.1 Required Dependencies

```json
{
  "@simplewebauthn/browser": "^11.0.0",
  "@simplewebauthn/server": "^11.0.0"
}
```

Install with: `npm install @simplewebauthn/browser @simplewebauthn/server`

No version changes to existing dependencies (bcryptjs, jsonwebtoken, jose, speakeasy all stay the same).

### 4.2 API Endpoints (New - All in src/app/api/auth/webauthn/)

#### Registration Flow

**1. Get Registration Options**
```
POST /api/auth/webauthn/register/options
Body: { email: string }
Auth: Not required (user registering)

Response 200:
{
  challenge: string (base64url),
  rp: { name: string, id: string },
  user: { id: string, email: string, displayName: string },
  pubKeyCredParams: object[],
  timeout: number,
  attestation: "direct" | "indirect" | "none",
  authenticatorSelection: object,
  excludeCredentials?: object[]
}
```

**2. Verify Registration (Attestation)**
```
POST /api/auth/webauthn/register/verify
Body: {
  email: string,
  credentialName?: string,
  attestationResponse: {
    id: string,
    rawId: string,
    response: {
      clientDataJSON: string,
      attestationObject: string,
      transports?: string[]
    },
    type: "public-key"
  }
}
Auth: Required (user must be logged in to add passkey)

Response 200:
{
  success: true,
  credentialId: string (base64url),
  credentialName: string,
  createdAt: ISO timestamp
}

Response 400: 
{
  success: false,
  error: string
}
```

#### Authentication Flow

**3. Get Authentication Options (Challenge)**
```
POST /api/auth/webauthn/authenticate/options
Body: { email: string } (optional, helps show correct user on authenticator)
Auth: Not required

Response 200:
{
  challenge: string (base64url),
  timeout: number,
  userVerification: "preferred" | "required" | "discouraged",
  allowCredentials: [
    {
      id: string (base64url),
      type: "public-key",
      transports?: string[]
    }
  ]
}
```

**4. Verify Authentication (Assertion)**
```
POST /api/auth/webauthn/authenticate/verify
Body: {
  email: string,
  assertionResponse: {
    id: string,
    rawId: string,
    response: {
      clientDataJSON: string,
      authenticatorData: string,
      signature: string,
      userHandle: string
    },
    type: "public-key"
  }
}
Auth: Not required

Response 200:
{
  success: true,
  message: "Authentication successful",
  accessToken: string (JWT),
  refreshToken: string (JWT),
  user: {
    id: string,
    email: string,
    name: string,
    role: string
  },
  redirectUrl: string (e.g., "/dashboard" or "/adminpanel"),
  sessionId: string
  (Also sets cookies: token, refresh_token)
}

Response 401:
{
  success: false,
  error: "Invalid assertion" | "Counter mismatch" | etc.
}
```

#### Credential Management (Requires Authentication)

**5. List User's Passkeys**
```
GET /api/auth/webauthn/credentials
Auth: Required (JWT token)

Response 200:
{
  credentials: [
    {
      id: string (CUID),
      credentialName: string,
      createdAt: ISO timestamp,
      lastUsedAt: ISO timestamp,
      transports: string[]
    }
  ]
}
```

**6. Delete a Passkey**
```
DELETE /api/auth/webauthn/credentials/:credentialId
Auth: Required (JWT token)

Response 200:
{
  success: true,
  message: "Credential deleted"
}

Response 404:
{
  error: "Credential not found"
}
```

**7. Update Passkey Name**
```
PATCH /api/auth/webauthn/credentials/:credentialId
Auth: Required (JWT token)
Body: { credentialName: string }

Response 200:
{
  success: true,
  credentialName: string
}
```

### 4.3 Role-Based Passkey Support (Option A: BOTH Roles)

**CLIENT Role Support:**
- ✅ Can register passkeys in `src/app/(auth)/security-setting/page.tsx`
- ✅ Can login with passkeys on `src/app/(public)/login/page.tsx`
- ✅ Redirects to `/dashboard` after successful passkey login
- ✅ Can manage passkeys in security settings

**ADMIN & SUPER_ADMIN Role Support:**
- ✅ Can register passkeys in `src/app/(manage)/security-settings/page.tsx`
- ✅ Can login with passkeys on `src/app/(public)/login/page.tsx`
- ✅ Redirects to `/adminpanel` after successful passkey login
- ✅ Can manage passkeys in security settings

**Implementation Note:**
- No role-based restrictions in WebAuthn endpoints
- All three role types treated identically for passkey registration and authentication
- Role-based redirect happens AFTER successful authentication (same as password auth)

### 4.4 Integration with Existing Systems

**Session Management:**
- After successful passkey authentication → generate same JWT tokens as password auth
- Set same cookies: `token` (1hr), `refresh_token` (7 days)
- Create UserSession record (same as password login)
- Create UserActivity record with `type: "PASSKEY_LOGIN"`

**Middleware (src/middleware.ts):**
- **No changes needed** - middleware already checks JWT tokens, doesn't care how they were generated
- Passkey logins will flow through same RBAC checks as password logins

**AuthContext (src/lib/contexts/auth-context.tsx):**
- **No changes needed** - context works with tokens/cookies, agnostic to auth method
- `checkAuth()` will work the same for both password and passkey logins

**Activity Logging:**
- New activity types: `PASSKEY_LOGIN`, `PASSKEY_REGISTERED`, `PASSKEY_DELETED`
- Same UserActivity model, no schema changes needed
- Same ipAddress and userAgent tracking as existing activities

---

## 5. Frontend Implementation Plan

### 5.1 Login Page Changes

**File:** `src/app/(public)/login/page.tsx`

**Verified Current Structure:**
- Email input (TextField, required)
- Password input (TextField, required, with show/hide toggle)
- "Forgot password?" link → opens ForgotPasswordModal
- "Continue" button (login button)
- Conditional: If 2FA required → shows TwoFactorVerification component
- Error message display (Alert component)
- Loading state with CircularProgress
- Components used: MUI (Box, Button, TextField, Paper, Alert, CircularProgress, InputAdornment, IconButton)
- TwoFactorVerification component shows after password validation

**New Implementation:**
- Add **Tab selector (Tabs component)**: "Password" | "Passkey"
- **Password Tab** (existing logic, keep as-is):
  - Email input
  - Password input (with show/hide toggle)
  - "Forgot password?" link
  - Continue button
  - Optional TwoFactorVerification component (shown after login if 2FA enabled)
  - Error/loading states
- **Passkey Tab** (new):
  - Email input
  - "Login with Passkey" button (only shown if WebAuthn supported)
  - Loading spinner during authentication
  - Error message display
  - No 2FA step (passkey = cryptographic proof)

**Logic:**
```typescript
1. User enters email on passkey tab
2. User clicks "Login with Passkey" button
3. Call GET /api/auth/webauthn/authenticate/options {email}
4. Browser shows WebAuthn prompt (biometric/security key)
5. User proves identity (fingerprint, face, touch security key, etc.)
6. Call POST /api/auth/webauthn/authenticate/verify {assertion}
7. If success: set cookies, redirect to dashboard/adminpanel
8. If error: show message (e.g., "No passkey found", "Verification failed")
```

### 5.2 Security Settings Pages - Passkey Management

**File 1 (CLIENTS):** `src/app/(auth)/security-setting/page.tsx`

**Verified Current Structure:**
- Title: "Security Settings"
- Paper component with Password Settings section
  - "Change Password" button → opens ChangePasswordModal
- Box with TwoFactorSettings component (displays 2FA setup/disable)
- Uses MUI components (Paper, Typography, Button, Alert, CircularProgress)
- Fetches user data from `/api/user/profile` (gets twoFactorEnabled status)

**New Addition:**
- Add **Passkeys section** (after TwoFactorSettings, using same Paper component pattern)
- List existing passkeys in a table/list with:
  - Friendly name (e.g., "My iPhone", "Office Yubikey")
  - Device type from transports array if available
  - Created date
  - Last used date
  - Rename and Delete buttons
- **Add Passkey** button
  - Opens modal/dialog with friendly name input
  - Triggers registration flow (WebAuthn prompt)
  - Success confirmation

---

**File 2 (ADMINS/SUPER_ADMIN):** `src/app/(manage)/security-settings/page.tsx`

**Verified Current Structure:**
- Identical structure to client page
- Title: "Security Settings"
- Paper component with Password Settings section
- Box with TwoFactorSettings component
- Same MUI components used
- Fetches from same `/api/user/profile` endpoint

**New Addition:**
- Add identical **Passkeys section** as client page
- Same list, add, rename, delete functionality

**Logic:**
```typescript
1. On page load: GET /api/auth/webauthn/credentials
2. Display list of credentials
3. User clicks "Add Passkey"
4. Call POST /api/auth/webauthn/register/options {email}
5. Browser shows WebAuthn prompt (register new passkey)
6. User follows prompt (scan fingerprint, insert security key, etc.)
7. Call POST /api/auth/webauthn/register/verify {attestation}
8. On success: add to list
9. On error: show message with retry option

10. User clicks "Edit" on passkey:
    - Modal to rename credential
    - Call PATCH /api/auth/webauthn/credentials/:id {credentialName}

11. User clicks "Delete" on passkey:
    - Confirmation dialog
    - Call DELETE /api/auth/webauthn/credentials/:id
    - Remove from list
```

### 5.3 Client-Side Libraries

**New file:** `src/lib/webauthn/utils.ts`
```typescript
// Base64URL encoding/decoding
export function bufferToBase64url(buffer: ArrayBuffer): string
export function base64urlToBuffer(base64url: string): ArrayBuffer

// Browser capability check
export function isWebAuthnSupported(): boolean

// Helper for extracting credential ID from response
export function extractCredentialId(response: ...): string
```

**New file:** `src/lib/webauthn/registration.ts`
```typescript
// Called when user adds passkey
export async function registerPasskey(
  email: string,
  credentialName?: string
): Promise<{success: boolean; credentialId?: string; error?: string}>
```

**New file:** `src/lib/webauthn/authentication.ts`
```typescript
// Called when user logs in with passkey
export async function authenticateWithPasskey(
  email: string
): Promise<{success: boolean; tokens?: {access, refresh}; user?: User; error?: string}>
```

---

## 6. Backend Implementation Details

### Phase 1: Setup & Database (Estimated: 1 day)
- [ ] Add `@simplewebauthn/browser` and `@simplewebauthn/server` to package.json
- [ ] Add WebAuthnCredential model to prisma/schema.prisma
- [ ] Run `prisma migrate dev -n add_webauthn`
- [ ] Generate Prisma client
- [ ] Create src/types/webauthn.ts with TypeScript interfaces
- [ ] Decide on challenge storage (Redis vs in-memory cache)

### Phase 2: Backend - WebAuthn Utils (Estimated: 1 day)
- [ ] Create src/lib/webauthn/server.ts with SimpleWebAuthn wrappers
- [ ] Create challenge storage utility (Redis or in-memory)
- [ ] Add base64url encoding/decoding helpers
- [ ] Test utility functions

### Phase 3: Backend - Registration Endpoints (Estimated: 1-2 days)
- [ ] Implement POST /api/auth/webauthn/register/options
- [ ] Implement POST /api/auth/webauthn/register/verify
- [ ] Store credentials in database
- [ ] Add logging (UserActivity with type PASSKEY_REGISTERED)
- [ ] Error handling and validation
- [ ] Test registration flow

### Phase 4: Backend - Authentication Endpoints (Estimated: 1-2 days)
- [ ] Implement POST /api/auth/webauthn/authenticate/options
- [ ] Implement POST /api/auth/webauthn/authenticate/verify
- [ ] Reuse existing token generation (`src/lib/jwt.ts`)
- [ ] Set cookies (same as password auth)
- [ ] Counter validation for cloning detection
- [ ] Log activity (UserActivity with type PASSKEY_LOGIN)
- [ ] Test authentication flow

### Phase 5: Backend - Credential Management (Estimated: 1 day)
- [ ] Implement GET /api/auth/webauthn/credentials (list)
- [ ] Implement DELETE /api/auth/webauthn/credentials/:id
- [ ] Implement PATCH /api/auth/webauthn/credentials/:id (rename)
- [ ] Add authorization checks (verify ownership)
- [ ] Activity logging

### Phase 6: Frontend - Login Page (Estimated: 1-2 days)
- [ ] Add tabs/switch: Password | Passkey
- [ ] Create src/lib/webauthn/authentication.ts (client-side)
- [ ] Implement passkey login flow on login page
- [ ] WebAuthn support detection
- [ ] Error handling and user feedback
- [ ] Test in different browsers

### Phase 7: Frontend - Settings Page (Estimated: 1-2 days)
- [ ] Create src/lib/webauthn/registration.ts (client-side)
- [ ] Add passkey management section to security-setting page
- [ ] List, add, rename, delete passkeys
- [ ] Modal for adding new passkey
- [ ] Confirmation dialogs for delete
- [ ] Error messages and loading states

### Phase 8: Testing & Documentation (Estimated: 1-2 days)
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Cross-device testing (Windows Hello, Touch ID, Face ID, YubiKey, etc.)
- [ ] Integration test with existing password auth
- [ ] Security audit (counter validation, challenge handling)
- [ ] Performance testing (no impact on existing flows)
- [ ] Update architecture docs

### Phase 9: Staging & Production Deployment (Estimated: 1 day)
- [ ] Deploy to staging with feature flag (disabled)
- [ ] Enable for internal team testing
- [ ] Staging smoke tests
- [ ] Deploy to production
- [ ] Feature flag rollout: 5% → 25% → 100%
- [ ] Monitor error rates and user feedback

**Total Estimated Timeline:** 8-12 days (1.5-2 weeks)

---

## 7. Security Considerations

### 7.1 WebAuthn-Specific

1. **Origin Verification** (handled by SimpleWebAuthn)
   - RP ID must match domain (bitfactory.app or localhost:3000 for dev)
   - SimpleWebAuthn validates this automatically

2. **Challenge Management**
   - Each challenge must be unique and used only once
   - Store in Redis or in-memory cache with 5-10 minute TTL
   - Verify challenge matches in assertion response
   - Delete challenge after use

3. **Signature Counter Validation**
   - Validate WebAuthn signature counter to detect cloned authenticators
   - Increment counter on each successful login
   - If counter ever decreases → potential cloning attack (log alert, force re-registration)

4. **Attestation Validation**
   - Verify attestation object during registration
   - Decision: Verify attestation statement OR accept any valid format
   - (Consider: only allow certain authenticators via AAGUID whitelist later)

### 7.2 Existing System Preservation

**No Breaking Changes:**
- Password auth works exactly as before
- 2FA system unchanged
- JWT/token generation unchanged
- Middleware unchanged
- AuthContext unchanged
- All existing audit logging continues to work

**UserActivity Tracking:**
- New activity types: `PASSKEY_LOGIN`, `PASSKEY_REGISTERED`, `PASSKEY_DELETED`
- Verified existing activity types in codebase: `LOGIN`, `LOGOUT`, `2FA_ENABLED`, `PROFILE_UPDATE`, etc.
- All logged with ipAddress and userAgent (same pattern as existing)
- Enables audit trail for security events
- Stored in UserActivity model (no schema changes needed, just new type field values)

**Session Management:**
- Same UserSession creation as password login
- Same token expiration (1hr access, 7 days refresh)
- Same cookie flags (HttpOnly, Secure, SameSite=strict)

### 7.3 Data Protection

**Private Keys:**
- WebAuthn private keys NEVER leave the authenticator
- Only public key stored in `WebAuthnCredential.publicKey`
- Credential ID (WebAuthn identifier) stored in `credential ID` field

**Credential Revocation:**
- Soft delete using `isActive` or `deletedAt` field (optional)
- Maintain audit trail of credential lifecycle
- Or hard delete is fine since private key is on device

### 7.4 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Cloned authenticator | Counter validation catches this |
| Compromised public key | Public keys are by definition public; signature still requires private key |
| Lost/stolen device | User deletes credential via settings page |
| Phishing attack | Origin verification prevents passkey use on wrong domain |
| Brute force | WebAuthn prompt shows origin; user sees if wrong domain |
| Challenge replay | Each challenge unique + single-use |

---

## 8. File Structure Summary

**New Files to Create:**
```
src/lib/webauthn/
├── server.ts                   # SimpleWebAuthn wrappers, challenge management
├── client.ts                   # Client-side registration & authentication helpers
└── utils.ts                    # Base64url, browser detection, type helpers

src/app/api/auth/webauthn/
├── register/
│   ├── options/route.ts        # POST register options (challenge)
│   └── verify/route.ts         # POST register verify (attestation)
├── authenticate/
│   ├── options/route.ts        # POST authenticate options (challenge)
│   └── verify/route.ts         # POST authenticate verify (assertion)
└── credentials/
    ├── route.ts                # GET list, DELETE, PATCH manage credentials

src/types/webauthn.ts          # TypeScript types for WebAuthn responses
```

**Modified Files:**
```
prisma/schema.prisma                       # Add WebAuthnCredential model + relation to User
src/app/(public)/login/page.tsx            # Add Passkey tab selector, new tab content
src/app/(auth)/security-setting/page.tsx   # Add Passkey management section
src/app/(manage)/security-settings/page.tsx # Add Passkey management section (ADMIN/SUPER_ADMIN)
components/                                # New component: PasskeySettings (or inline both pages)
```

**No Changes To:**
```
src/middleware.ts              # Already works with WebAuthn logins (checks JWT)
src/lib/jwt.ts                 # Reuse existing token generation
src/lib/contexts/auth-context.tsx # Works with any JWT login method
src/app/api/login/route.ts     # Can keep for password-only legacy
```

---

## 9. Integration Checklist

### Before Starting (VERIFIED ITEMS)
- [x] **Verified:** Both CLIENT and ADMIN/SUPER_ADMIN pages exist for security settings
  - Client: `src/app/(auth)/security-setting/page.tsx` (singular)
  - Admin: `src/app/(manage)/security-settings/page.tsx` (plural)
- [x] **Verified:** Both use identical structure (MUI Paper, TwoFactorSettings component)
- [x] **Verified:** Both pages fetch user profile from `/api/user/profile`
- [x] **Verified:** Login page at `src/app/(public)/login/page.tsx` uses current email+password flow
- [x] **Verified:** TwoFactorSettings component exists and handles 2FA setup/disable
- [x] **Verified:** ChangePasswordModal component exists for password changes
- [x] **Verified:** User.role enum has values: CLIENT, ADMIN, SUPER_ADMIN
- [x] **Verified:** UserActivity model logs activities with ipAddress, userAgent

### Planning Items (STILL NEEDED)
- [ ] Decide on challenge storage (Redis recommended, in-memory works for single server)
- [ ] Decide on attestation validation strategy (verify vs accept any format)
- [ ] Set RP ID (bitfactory.app or localh ost:3000 for dev) - must match domain in production
- [ ] Design UI mockups for: login tabs and passkey management sections
- [ ] Decide: Create new PasskeySettings component or inline code in both pages

### Development
- [ ] Use `localhost:3000` at start
- [ ] Test registration and authentication flows manually
- [ ] Test counter validation with multiple authenticators
- [ ] Verify cookies are set correctly
- [ ] Verify UserActivity logs are created

### Testing
- [ ] Browser support: Chrome, Firefox, Safari, Edge
- [ ] Authenticators: Windows Hello, Touch ID, Face ID, YubiKey, Google Titan
- [ ] Cross-domain: ensure origin validation works
- [ ] Error cases: no credential, wrong credential, expired challenge

### Deployment
- [ ] Feature flag in production (disabled initially)
- [ ] Gradual rollout: 5% → 25% → 100%
- [ ] Monitor error rates, specifically:
  - Failed authentications
  - Counter validation failures
  - Challenge timeouts
- [ ] Have rollback plan ready (disable feature flag)

---

## 10. Related Documentation

