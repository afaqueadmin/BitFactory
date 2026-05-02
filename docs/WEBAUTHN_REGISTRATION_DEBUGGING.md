# WebAuthn Registration Debugging Guide

## Error: "The operation either timed out or was not allowed"

This error occurs during the WebAuthn registration ceremony (when the authenticator prompt appears). It means SimpleWebAuthn successfully got registration options from the server, but the authenticator rejected or timed out.

---

## Quick Diagnosis Checklist

### 1. Verify Environment Setup ✅
Your `.env` file should have:
```
NEXTAUTH_URL="http://localhost:3000"
WEBAUTHN_RP_ID="localhost"
```

### 2. Check Dev Server is Running
- Restart the dev server: `npm run dev`
- Confirm it's running on `http://localhost:3000`
- The browser console should show logs with RP ID and origin info

### 3. Verify You're Logged In
- PasskeySettings requires authentication (JWT token in cookies)
- Make sure you're logged into the admin account
- Check Application tab in DevTools → Cookies → token should exist

---

## Step-by-Step Debug Process

### Step 1: Check Network Request
1. Open DevTools → Network tab
2. Navigate to `http://localhost:3000/manage/security-settings`
3. Scroll down to Passkeys section
4. Click "Add Passkey" button
5. Look for `POST /api/auth/webauthn/register/options` request

**Expected Response (Status 200):**
```json
{
  "challenge": "dGVzdGNoYWxsZW5nZQ...",
  "rp": {
    "name": "BitFactory",
    "id": "localhost"
  },
  "user": {
    "id": "...",
    "name": "admin@bitfactory.ae",
    "displayName": "admin@bitfactory.ae"
  },
  "pubKeyCredParams": [...],
  "timeout": 60000,
  "attestation": "direct",
  "authenticatorSelection": {...}
}
```

**If you see an error (401, 500):**
- **401**: Token missing or invalid. Log in again.
- **500**: Check server logs for error details. See Step 2 below.

---

### Step 2: Check Server Logs
1. Look at your terminal running `npm run dev`
2. When you click "Add Passkey", you should see log messages:
   ```
   Generating registration options { userId: '...', rpId: 'localhost', origin: 'http://localhost:3000', userEmail: '...' }
   Registration options generated { hasChallenge: true, rpId: 'localhost' }
   ```

3. If you don't see these logs:
   - Check that you saved `.env` file
   - Restart the dev server
   - The dev server might not be reloading your changes

---

### Step 3: Check Browser Console
1. Open DevTools → Console tab
2. Look for messages from the registration flow:
   ```
   Registration options received { rpId: 'localhost', userId: '...', challenge: '...' }
   WebAuthn registration ceremony error: {error details}
   ```

3. The error message here might reveal the actual issue.

---

### Step 4: Identify the Authenticator

When you click "Add Passkey", a WebAuthn prompt appears. **What do you see?**

#### Option A: Windows Hello / Biometric Prompt
- **If it redirects to Windows Sign-in:** Success! (but then error happens)
- **If nothing appears:** Windows Hello may not be configured
- **Solution:** 
  - Settings → Accounts → Sign-in options → Windows Hello setup
  - Or use a password PIN instead
  - Or use a security key (YubiKey, etc.)

#### Option B: "Use a different sign-in option"
- This is Windows 10/11 asking for alternatives
- **Solution:** Click "Use a different sign-in option" → choose "PIN" or "Password"

#### Option C: USB Security Key Prompt
- **If it says "Insert key":** Insert your YubiKey / security key
- **If it times out:** The browser waited 60 seconds without detecting key
- **Solution:** Try with a USB security key inserted

#### Option D: Nothing Happens
- WebAuthn might not be supported
- Or the origin is wrong and browser rejected it
- Check browser console for errors

#### Option E: Gets to biometric/prompt but times out
- This is the "operation timed out" error
- The authenticator was asked but didn't respond
- **Possible causes:**
  - Device is locked (unlock it)
  - Biometric not configured (use PIN instead)
  - Authenticator service issue (restart browser)
  - Timeout is too short (should be 60 seconds)

---

## Browser-Specific Issues

### Chrome / Edge
- ✅ Supports Windows Hello (Windows)
- ✅ Supports platform authenticators
- ❌ May have issues with USB security keys on some systems

**Fix if issues:**
1. Clear cache: Ctrl+Shift+Delete
2. Restart browser
3. Try Incognito window (no extensions)

### Firefox
- ❌ Limited WebAuthn support on Windows (requires security keys)
- ✅ Works well with USB security keys
- ⚠️ May require enabling in about:config

**Check if enabled:**
1. Type `about:config` in address bar
2. Search for "webauthn"
3. Ensure `security.webauthn.enable` is `true`

### Safari (Mac/iOS)
- ✅ Excellent Web Authn support
- ✅ Seamless Touch ID / Face ID integration
- ✅ iCloud Keychain passkeys

### Mobile Browsers
- ✅ Chrome Android: Supports biometric passkeys
- ✅ Safari iOS: Supports Face ID / Touch ID passkeys
- ❌ Firefox Mobile: Limited support

---

## Solutions by Cause

### Solution 1: Enable Windows Hello (if using Windows)
```
Settings → Accounts → Sign-in options → Windows Hello
Click "Set up" for fingerprint, face, or PIN
```

### Solution 2: Use PIN Instead
When WebAuthn prompt asks for authentication method:
- Select "PIN" instead of biometric
- It's more reliable and doesn't timeout

### Solution 3: Use USB Security Key
- Get a YubiKey or similar
- Works across all devices and browsers
- Insert when prompted

### Solution 4: Try Different Browser
If it works in Chrome but not Firefox:
- Chrome/Edge have better WebAuthn support
- Firefox requires security keys on Windows
- Safari uses Touch ID on Mac

### Solution 5: Check RP ID Configuration
If you see "RP ID mismatch" error:
- Current URL: Check address bar
- RP ID in response: Should match domain
- For `http://localhost:3000`, RP ID should be `localhost` ✅

**Wrong examples:**
- ❌ `localhost:3000` (includes port - wrong!)
- ❌ `http://localhost` (includes protocol - should not)
- ❌ `127.0.0.1` (IP addresses don't work)

### Solution 6: Clear Cache and Restart
1. Close all browser windows
2. Run: `npm run dev` (restart server)
3. Clear browser cache: Ctrl+Shift+Delete
4. Open incognito window
5. Navigate to `http://localhost:3000`
6. Log in again
7. Try adding passkey

---

## Advanced: Check SimpleWebAuthn Version

Run this in browser console:
```javascript
// Check if WebAuthn is supported
console.log("WebAuthn supported:", window.PublicKeyCredential !== undefined);

// Check platform authenticator
(async () => {
  if (window.PublicKeyCredential) {
    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    console.log("Platform authenticator available:", available);
  }
})();
```

---

## Still Not Working?

Provide me with:
1. **Browser and OS:** (e.g., Chrome on Windows 11, Safari on M1 Mac)
2. **Authenticator type:** (Windows Hello, TouchID, Security Key, etc.)
3. **Network response:** Copy the JSON from `/api/auth/webauthn/register/options`
4. **Console error:** Copy the exact error message from DevTools Console
5. **Server logs:** Copy relevant log lines from the terminal

---

## Technical Details

### Why "operation timed out"?
The browser's WebAuthn implementation waited up to 60 seconds (`timeout: 60000`). If the authenticator doesn't respond in that time, it times out.

**Common causes:**
- Authenticator service is stuck (restart browser)
- Device screen is locked (unlock and try again)
- Biometric not configured (use PIN)
- Timeout too aggressive (can't change without code changes)

### Why "not allowed"?
User rejected the request or browser blocked it for security reasons:
- User clicked "Cancel" on the prompt
- Browser detected potential phishing (wrong origin/RP ID)
- Authenticator is being used on multiple tabs simultaneously
- Session expired (need to log in again)

---

## Reference: Status Codes from /register/options

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Success | Proceed to WebAuthn prompt |
| 401 | Unauthorized | Log in again, check JWT token |
| 404 | User not found | Verify user exists in database |
| 500 | Server error | Check server logs, restart dev server |

---

## Next Steps

1. **Immediately:**
   - Restart dev server to load new `.env` variables
   - Test registration with debug logging enabled

2. **If still failing:**
   - Identify your browser and authenticator type
   - Follow the browser-specific solution above
   - Share console error and network response

3. **If persistent:**
   - Try different authenticator (PIN vs biometric vs security key)
   - Try different browser
   - Try different device/OS
