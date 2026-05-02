# NotAllowedError on Mobile - Troubleshooting Guide

**Error:** `NotAllowedError: The operation either timed out or was not allowed`  
**Occurs:** During passkey registration or authentication on mobile devices  
**Root Cause:** Mobile authenticator timeout, browser focus loss, or user gesture context expiration

---

## What This Error Means

This error occurs when:

1. **Authentication prompt timed out** - User took >60 seconds to respond (now 120s)
2. **Browser lost focus** - User switched tabs or apps during the process
3. **User gesture context expired** - Too much time between clicking button and completing authenticator
4. **Network latency** - Mobile network delay between getting options and calling startRegistration
5. **Authenticator service issue** - Device's authenticator service not responding

---

## Fixes Applied

### 1. Extended Timeout Window
- **Before:** 60 seconds (default)
- **After:** 120 seconds (doubled)
- **Impact:** Gives users more time on slow mobile networks
- **Where:** Both registration and authentication options

### 2. Better Error Messages
- **Before:** Generic "Something Went Wrong"
- **After:** Specific error types with recovery instructions
- **Examples:**
  - "Registration timed out... Please try again or use a different authenticator"
  - "Security error: Make sure you're accessing from HTTPS or localhost"
  - "Your authenticator doesn't support this operation"

### 3. Improved UI Error Display
- **Before:** Error only shown outside dialog
- **After:** Error shown inside the dialog for immediate visibility
- **Impact:** Users see errors immediately and can retry without closing dialog

### 4. Enhanced Error Handling
```typescript
// Now detects:
- NotAllowedError → Timeout/UX issue
- SecurityError → HTTPS/origin issue
- NotSupportedError → Incompatible authenticator
- AbortError → User cancelled
```

---

## Mobile-Specific Troubleshooting

### Issue: "Timeout" Error

**On iOS:**
1. Ensure Face ID/Touch ID is enrolled
   - Settings → Face ID OR Settings → Touch ID
   - Test with Apple Wallet or App Store
2. Make sure device isn't locked
   - Unlock before clicking register button
3. Authenticator may have timed out
   - Try again, respond faster to the prompt
4. Try using a PIN instead of biometric
   - More reliable for WebAuthn

**On Android:**
1. Ensure fingerprint is enrolled
   - Settings → Biometrics → Fingerprint
   - Test with unlock screen
2. Try using Face Unlock or PIN
   - Different authenticators have different reliability
3. Check Google Play Services is updated
   - WebAuthn uses Google Play Services
   - Settings → Apps → Google Play Services → Update
4. Try a different browser if Chrome fails
   - Chrome usually works best on Android
   - Firefox may have limited WebAuthn support

### Issue: "Not Allowed" Error

**Most Common:**
- User gesture context expired
- Too much time between clicks
- Network latency

**Solution:**
1. 🔄 **Restart and Retry**
   - Close browser completely
   - Restart browser
   - Navigate back to security settings
   - Click "Add Passkey" again
   - Respond quickly to authenticator prompt

2. **Try Simple Credential**
   - Use a PIN instead of biometric
   - Faster to respond
   - More reliable

3. **Optimize Network**
   - Move closer to WiFi router
   - Reduce network latency
   - WiFi usually more reliable than mobile data for WebAuthn

### Issue: Security Error

**Cause:** Accessing from wrong origin

**Solution:**
- ✅ Use: `http://localhost:3000` - Works
- ✅ Use: `https://yourdomain.com` - Works (production)
- ❌ Don't use: `http://127.0.0.1:3000` - WebAuthn blocked
- ❌ Don't use: `http://192.168.x.x:3000` - WebAuthn blocked (localhost IP)

**Note:** WebAuthn only works on:
- `localhost` (any port)
- `127.0.0.1` (⚠️ limited support)
- HTTPS sites (production)

### Issue: "Not Supported" Error

**Cause:** Authenticator doesn't support operation

**Solution:**
1. **Check browser support:**
   - iOS 16+: Safari (best), Chrome (good)
   - Android 14+: Chrome (best), Firefox (limited)
   - Older devices: May not support WebAuthn

2. **Try alternative authenticator:**
   - Platform (built-in): Face ID, Touch ID, Fingerprint
   - Roaming (USB key): YubiKey, Google Titan, etc.

3. **Update OS and apps:**
   - iOS/iPadOS: Settings → General → Software Update
   - Android: Settings → About Phone → Software Update
   - Browsers: Update from app store

---

## Step-by-Step Mobile Debugging

### On First Failure

1. **Note the exact error message**
   - Is it timeout? Not allowed? Not supported?
   - Different errors need different fixes

2. **Check network conditions**
   - Look for WiFi symbol in status bar
   - Slow network (weak WiFi/3G) may timeout

3. **Check authenticator status**
   - iOS: Try unlocking with Face ID first
   - Android: Try unlocking with fingerprint first
   - If device unlock fails, authenticator won't work

4. **Try immediately (no delay)**
   - Click "Add Passkey"
   - Respond to prompt immediately
   - Don't wait or let device sleep

### If It Still Fails

**Try Progressive Fallback:**

1. **Same Method, Faster**
   - Try again, but respond to prompt immediately

2. **Different Method, Same Device**
   - iOS: Try PIN instead of Face ID
   - Android: Try PIN instead of Fingerprint

3. **Different Authenticator**
   - Use a USB security key (YubiKey)
   - Use a different phone
   - Try a security key instead of biometric

4. **Different Browser**
   - iOS: Safari > Chrome > Firefox
   - Android: Chrome > Firefox > Edge

5. **Different Network**
   - Try different WiFi network
   - Try cellular (Cellular may be slower but more stable)
   - Try different location

---

## Known Mobile Issues by Device

| Device | Issue | Workaround |
|--------|-------|-----------|
| iPhone 13/14 | Face ID timeout | Use Touch ID or PIN |
| iPhone 15+ | Works perfectly | None needed |
| iPad (older) | Limited support | Use Safari, may need update |
| Samsung (older) | Fingerprint unreliable | Use PIN or DNA Face Unlock |
| Google Pixel 6+ | Works well | None needed |
| Generic Android | May not support | Try different browser |

---

## Testing Checklist for Mobile

- [ ] Device is unlocked
- [ ] Authenticator (biometric) is enrolled
- [ ] Browser is updated to latest version
- [ ] Accessing via `http://localhost:3000` (dev) or HTTPS domain
- [ ] Network connection is stable (WiFi preferred)
- [ ] Device screen doesn't auto-rotate during prompt
- [ ] Responded to authenticator prompt within 60 seconds
- [ ] No other tabs/apps requesting authentication simultaneously
- [ ] Device security settings allow WebAuthn

---

## Network Considerations

**WebAuthn needs:**
1. Connection to get registration options (fast)
2. Connection to verify with server (fast)
3. Local authenticator response (immediate)
4. All must complete within timeout

**On Slow Networks:**
- Timeout may expire while waiting for options
- Solution: 120-second timeout (just applied) helps
- Solution: Retry on faster network

**Best Network Conditions:**
- Strong WiFi: Most reliable
- Strong cellular (4G/5G): Usually works
- Weak WiFi: May timeout often
- Bluetooth tethering: Slowest, often fails

---

## Advanced: Check Registration Response Format

To verify registration is working correctly:

1. **Open DevTools on mobile** (if browser supports)
2. **Go to Network tab**
3. **Click "Add Passkey"**
4. **Look for POST to `/api/auth/webauthn/register/options`**
5. **Check Response tab** - Should show:
   ```json
   {
     "challenge": "NEdeoxE-yFHQX7oLo_Av-u6slw4V3GL7etvsK3g6r4M",
     "rp": {
       "name": "BitFactory",
       "id": "localhost"
     },
     "timeout": 120000,
     "user": {...},
     "pubKeyCredParams": [...]
   }
   ```

If response shows error instead, the issue is server-side, not client-side.

---

## When to Use Alternative Auth Methods

If WebAuthn consistently fails on a device:

1. **For testing:** Use password authentication instead
2. **For production:** Keep password auth as fallback
3. **For security:** 2FA + password is still secure
4. **For users:** Provide choice between password and passkey

---

## Support Information

If you're still experiencing issues:

1. **Collect this information:**
   - Device type and OS version
   - Browser type and version
   - Exact error message
   - Network type (WiFi/cellular)
   - Screenshot of error
   - Server logs (from dev server terminal)

2. **Check server logs for:**
   ```
   "Generating registration options" ← Options fetched
   "Registration options generated" ← Challenge stored
   "WebAuthn registration ceremony error" ← Client error
   "Registration verification failed" ← Server error
   ```

3. **Share diagnostics:**
   - Network tab from DevTools
   - Console errors from DevTools
   - Any error messages shown to user
   - Timeline of what happened

---

## Quick Reference

| Error | Most Likely Cause | Quick Fix |
|-------|------------------|-----------|
| NotAllowedError | Timeout or lost focus | Retry, use PIN, check network |
| SecurityError | Wrong origin | Use localhost:3000 or HTTPS domain |
| NotSupportedError | Incompatible authenticator | Try different device/browser |
| AbortError | User cancelled | Click button and respond to prompt |
| No prompt appears | Browser doesn't support WebAuthn | Try Safari/Chrome, update OS |

---

## Recommended Next Steps

1. ✅ **Just Applied Fixes:**
   - Extended timeout to 120 seconds
   - Better error messages
   - Error display in dialog

2. 🔄 **Immediate Test:**
   - Clear browser cache
   - Restart dev server
   - Test on mobile device
   - Try registering a passkey

3. 📝 **If Still Failing:**
   - Note exact error message
   - Check server logs
   - Try on different device/browser
   - Check network conditions

4. 🚀 **If Working:**
   - Test login with passkey
   - Test on multiple devices
   - Test with multiple authenticators
