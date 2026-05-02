# WebAuthn Mobile Testing Guide

**Date:** May 1, 2026  
**Issue:** Registration failing on mobile with "Something Went Wrong" error

---

## Key Fixes Applied

### 1. **Changed attestationType from "direct" to "none"**
   - ✅ Fixes: Most mobile authenticators don't support `direct` attestation
   - Mobile platforms (iOS, Android) typically use `none` format
   - `direct` was too restrictive and causing registration to fail

### 2. **Changed userVerification from "preferred" to "discouraged"**
   - ✅ Fixes: Mobile biometric timeout issues
   - `discouraged` mode works better with mobile authenticators
   - Reduces prompts for biometric verification during registration

### 3. **Fixed SimpleWebAuthn v11 API integration**
   - ✅ Correctly accessing `credential` object from registration response
   - Proper extraction of `credentialID`, `credentialPublicKey`, and `counter`
   - Better error logging for debugging

### 4. **Added comprehensive logging**
   - ✅ Both registration and authentication paths now log detailed information
   - Helps identify exactly where failures occur
   - Check server logs (terminal running `npm run dev`)

---

## Testing Mobile Registration

### Prerequisites
- Dev server running: `npm run dev`
- Logged in as admin user on mobile browser
- Mobile device with biometric capability (Touch ID, Face ID, Fingerprint, PIN)

### Step 1: Navigate to Admin Security Settings
```
URL: http://localhost:3000/manage/security-settings
(Or your machine's IP: http://192.168.x.x:3000/manage/security-settings)
```

### Step 2: Scroll to Passkeys Section
- You should see "Add Passkey" button
- If you see "WebAuthn not supported", try a different browser or device

### Step 3: Click "Add Passkey"
1. You'll see a dialog asking for a passkey name (e.g., "My iPhone")
2. Enter a name and click "Register"
3. Your device's authenticator should prompt you

#### What You'll See on iOS
- Face ID prompt OR
- Touch ID prompt OR
- "Create a Passkey?" dialog with options

**Action:** Complete the biometric prompt or use PIN

#### What You'll See on Android
- Fingerprint prompt OR
- Face recognition prompt OR
- PIN prompt
- "Create a passkey?" dialog

**Action:** Complete the biometric or security prompt

### Step 4: Check for Success
**Success Signs:**
- ✅ Passkey appears in the table with name and created date
- ✅ No error messages
- ✅ Can see rename/delete buttons next to the credential

**Failure Signs:**
- ❌ "Something Went Wrong" error message
- ❌ Dialog closes without creating credential
- ❌ Timeout after 60 seconds

---

## Testing Mobile Authentication (Login)

### Prerequisites
- At least one passkey registered (from registration test above)
- On mobile device, navigate to login page
- **NOT logged in**

### Step 1: Navigate to Login Page
```
URL: http://localhost:3000/login
(Or your machine's IP: http://192.168.x.x:3000/login)
```

### Step 2: Switch to Passkey Tab
- You should see two tabs: "Password" and "Passkey"
- Click "Passkey" tab

### Step 3: Enter Email and Click "Login with Passkey"
1. Enter your email address
2. Click "Login with Passkey" button
3. Device authenticator should prompt

### Step 4: Complete Authentication
- Complete the biometric/security prompt when asked
- Should redirect to dashboard or admin panel
- Check that you're logged in

---

## Server Logs - What to Look For

When testing, watch your terminal running `npm run dev` for these log messages:

### Registration Logs
```
Generating registration options { 
  userId: '...', 
  rpId: 'localhost',
  origin: 'http://localhost:3000',
  userEmail: 'webdeveloper.sas@gmail.com' 
}
Registration options generated { 
  hasChallenge: true, 
  rpId: 'localhost'
}
WebAuthn register verify: Starting verification { 
  userId: '...', 
  credentialId: 'pQECAyYgASFYIKl...' 
}
WebAuthn register verify: Verification successful { 
  credentialIDLength: 64,
  counter: 0
}
WebAuthn register verify: Credential stored { 
  credentialId: 'cmxx12345...' 
}
```

### Authentication Logs
```
WebAuthn auth verify: Looking up credential { 
  userId: '...',
  credentialIdFromResponse: 'pQECAyYgASF...',
  credentialCount: 1
}
WebAuthn auth verify: Found matching credential { 
  userId: '...',
  credentialDbId: 'cmxx12345...'
}
WebAuthn auth verify: Verification successful { 
  userId: '...',
  credentialId: 'cmxx12345...'
}
```

### Error Logs to Watch For
```
Registration verification failed: [error message]
Credential not found
Challenge not found or expired
Counter mismatch: possible authenticator cloning detected
```

---

## Troubleshooting Mobile Issues

### Issue 1: "Something Went Wrong" During Registration

**Common Causes:**

#### A) Challenge Timeout
- **Sign:** Error happens after 60 seconds of waiting
- **Fix:** Ensure you're responding to the biometric prompt quickly
- **Try:** Use PIN instead of biometric (more reliable)

#### B) Mobile Browser Not Supporting WebAuthn
- **Sign:** No authenticator prompt appears
- **Check:**
  - iOS: Use Safari (best support) or Chrome
  - Android: Use Chrome (recommended)
  - Check server logs for "registration options" success
- **Fix:** Try different browser or device

#### C) Biometric Not Enrolled
- **Sign:** Authenticator prompt fails immediately
- **Check:**
  - iOS: Settings → Face ID/Touch ID → Verify enrolled
  - Android: Settings → Biometrics → Verify enrolled
- **Fix:** Enroll fingerprint/face or use PIN

#### D) Origin/Domain Mismatch
- **Sign:** Error about "origin" in any console messages
- **Check:** Your NEXTAUTH_URL matches your access URL
  - Accessing via `localhost` → NEXTAUTH_URL should be `http://localhost:3000`
  - Accessing via IP → RP ID might be wrong
- **Fix:** Use `localhost:3000` not `127.0.0.1:3000` or IP addresses

### Issue 2: Passkey Shows in List but Can't Login

**Causes:**
- Counter validation failure (cloning detection)
- Credential lookup mismatch

**Troubleshoot:**
1. **Check server logs for credential lookup:**
   ```
   WebAuthn auth verify: Looking up credential
   WebAuthn auth verify: Credential not found
   ```
   - If "not found", credential ID in database doesn't match response
   - Try deleting and re-registering the passkey

2. **Check counter validation:**
   ```
   Counter mismatch: possible authenticator cloning detected
   ```
   - This is a security feature
   - The authenticator's counter didn't increment properly
   - Re-register the passkey

### Issue 3: Can Register but Authentication Times Out

**Causes:**
- Challenge expired (5-minute TTL)
- Browser session issue
- Mobile authenticator service issue

**Try:**
1. Clear browser cache and cookies
2. Close all tabs and reopen the app
3. Restart the browser completely
4. Try again within 5 minutes of getting options

### Issue 4: Only Works on Desktop, Not Mobile

**Likely Causes:**
1. **Mobile browser limitations**
   - iOS: Safari has best support; Firefox has limited WebAuthn
   - Android: Chrome recommended; other browsers may have issues

2. **Network/CORS Issue**
   - If accessing via IP from phone: might have CORS/origin issues
   - Solution: Add your IP to NEXTAUTH_URL or use a domain name

3. **Platform Authenticator Not Available on Mobile**
   - Platform authenticator is device-specific
   - Solution: This is expected; use roaming authenticator (security key)

---

## Testing Checklist

Use this checklist to verify everything works on mobile:

### Registration
- [ ] Can navigate to security settings
- [ ] "Add Passkey" button is visible
- [ ] Clicking button opens name input dialog
- [ ] Can enter a friendly name (e.g., "My iPhone")
- [ ] Clicking register shows authenticator prompt
- [ ] Can complete biometric/security prompt
- [ ] Passkey appears in list after completion
- [ ] Passkey shows correct name, created date, and transports

### Authentication
- [ ] Can navigate to login page
- [ ] Passkey tab is visible (not just password)
- [ ] Can enter email and click "Login with Passkey"
- [ ] Authenticator prompt appears
- [ ] Can complete authentication
- [ ] Redirects to dashboard/admin panel
- [ ] Successfully logged in (can see user profile)

### Error Handling
- [ ] Entering wrong email shows error
- [ ] Cancelling authenticator prompt shows error message
- [ ] Timeout after 60 seconds shows error
- [ ] Can retry after error

---

## Environment Configuration

Your `.env` file should have:
```
NEXTAUTH_URL="http://localhost:3000"
WEBAUTHN_RP_ID="localhost"
```

If these are missing or wrong, WebAuthn will fail!

---

## Next Steps

1. **Restart dev server** with new code:
   ```bash
   npm run dev
   ```

2. **Test on mobile:**
   - Register a passkey
   - Check server logs
   - Attempt to login

3. **Share results:**
   - What error do you see?
   - What device/browser are you using?
   - Copy any relevant server log messages
   - Copy network response status and body (if visible)

---

## Advanced: Check Registration Response Format

If registration is failing, the issue might be how your mobile browser encodes the attestation response. 

**To check:**
1. Open DevTools on mobile (if supported)
2. Look at the POST request body to `/api/auth/webauthn/register/verify`
3. Check that it has:
   - `id`: Credential ID (string, base64url)
   - `type`: "public-key"
   - `response.clientDataJSON`: Attestation client data (string, base64url)
   - `response.attestationObject`: Attestation object (string, base64url)
   - `response.transports`: Array like `["hybrid", "internal"]`

**Expected Structure:**
```json
{
  "id": "pQECAyYgASFYIKldjSrUtwyjq1_J-BEpmZWxCxIERA5CCh7_ppfIbCI8Ilgg9d4BHEmmp8rVe6cjDLXsHKJ_TjbzhkVlAj3zdlpQJ6s",
  "type": "public-key",
  "response": {
    "clientDataJSON": "eyJjaGFsbGVuZ2...",
    "attestationObject": "o2NmbXRkbm9uZWdhdHRTdG10..."
  },
  "transports": ["hybrid", "internal"]
}
```

---

## Environment Details for Reference

- **Node Version:** Check with `node --version`
- **Browser:** Your mobile browser (Safari, Chrome, Firefox, Edge)
- **Device:** iOS / Android with version
- **Authenticator Type:** Platform (built-in) or Roaming (security key)

This information helps diagnose mobile-specific issues if needed.
