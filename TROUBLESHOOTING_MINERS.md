# 🆘 Miners CRUD - Troubleshooting Guide

## Problem: "Cannot access http://localhost:3000/machine"

### Root Cause
The `/machine` page requires **Admin Authentication**. Without a valid JWT token in cookies, the middleware redirects to `/login`.

### Solution

#### Step 1: Ensure Admin User Exists
```bash
cd /home/sheheryar/Project/API2/BitFactory
node scripts/create-test-user.js
```

Expected output:
```
✅ User afaque@higgs.ae already exists!
Email: afaque@higgs.ae
Password: AdminAhmedHiggs2025!
---
```

#### Step 2: Kill Any Existing Processes
```bash
# Kill any running Next.js servers
pkill -f "next dev"
pkill -f "node"
```

#### Step 3: Start Fresh Dev Server
```bash
cd /home/sheheryar/Project/API2/BitFactory
npm run dev
```

Expected output:
```
> bitfactory@0.1.0 dev
> next dev --turbopack

 ⚠ Port 3000 is in use, using port 3001 instead
   ▲ Next.js 15.5.3
   - Local: http://localhost:3001
   - Network: http://192.168.100.122:3001
   
 ✓ Starting...
 ✓ Compiled in Xs
```

#### Step 4: Open Browser and Login
```
URL: http://localhost:3001/login
Email: afaque@higgs.ae
Password: AdminAhmedHiggs2025!
```

#### Step 5: Access Miners Page
After successful login:
```
URL: http://localhost:3001/machine
```

---

## Common Issues & Fixes

### Issue 1: "Redirects to /login" (Still After Login)

**Cause**: Cookie not being set properly

**Fix**:
```bash
# Clear browser cookies
# 1. Open DevTools (F12)
# 2. Go to Application → Cookies
# 3. Delete all cookies for localhost
# 4. Go back to /login
# 5. Login again
```

Or restart browser completely:
```bash
# Close browser
# Clear browser cache
# Reopen browser
# Go to http://localhost:3001/login
```

---

### Issue 2: "Invalid credentials" on Login

**Cause**: Admin user doesn't exist or password is wrong

**Fix**:
```bash
# Option 1: Create admin user
node scripts/create-test-user.js

# Option 2: Login with correct credentials
Email: afaque@higgs.ae
Password: AdminAhmedHiggs2025!

# Option 3: Check database directly
npx prisma studio
# Look in 'users' table for ADMIN role users
```

---

### Issue 3: "Port 3000 already in use"

**Cause**: Another process is using port 3000

**Fix**:
```bash
# Kill process on port 3000
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Or kill all Node processes
pkill -9 node

# Or use port 3001
npm run dev  # Will automatically use 3001
```

---

### Issue 4: "Cannot GET /machine" (404 Error)

**Cause**: Page doesn't exist or build failed

**Fix**:
```bash
# Rebuild the project
npm run build

# Check for errors
npm run build 2>&1 | grep -i error

# If errors exist, show them
npm run build
```

---

### Issue 5: Build Errors (TypeScript)

**Cause**: Type errors in code

**Fix**:
```bash
# Check for specific errors
npm run build 2>&1 | grep "Type error"

# Clear build cache
rm -rf .next
rm -rf out

# Rebuild
npm run build
```

---

### Issue 6: "Cannot find module" Errors

**Cause**: Dependencies not installed

**Fix**:
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Or update Prisma client
npx prisma generate
```

---

### Issue 7: Database Connection Errors

**Cause**: DATABASE_URL not set or invalid

**Fix**:
```bash
# Check .env file
cat .env | grep DATABASE_URL

# Ensure it has a valid PostgreSQL connection string
# Format: postgresql://user:password@host:port/database

# Test connection
npx prisma studio

# If error, check .env.local or .env files
ls -la .env*
```

---

### Issue 8: "API returns 401 Unauthorized"

**Cause**: No token in request

**Fix**:
```javascript
// Ensure fetch includes credentials:
fetch('/api/machine', {
  credentials: 'include',  // Include cookies
  headers: {
    'Content-Type': 'application/json'
  }
})

// Or in curl:
curl -b "token=YOUR_TOKEN" http://localhost:3001/api/machine
```

---

### Issue 9: "User is not admin" Error

**Cause**: Logged in as CLIENT, not ADMIN

**Fix**:
```bash
# Create admin user
node scripts/create-test-user.js

# Or change user role in database
npx prisma studio
# Find user in 'users' table
# Change 'role' from 'CLIENT' to 'ADMIN'
# Save

# Login with that user
```

---

### Issue 10: "Space/User not found" Error

**Cause**: Trying to create miner without existing user/space

**Fix**:
```bash
# Create space first
# 1. Go to http://localhost:3001/space
# 2. Click "Add Space"
# 3. Fill in details
# 4. Create space

# Then create miner with that space
# Or use existing space/user
```

---

## Verification Checklist

Run through this checklist to ensure everything works:

```
✅ Admin user exists
   Run: node scripts/create-test-user.js
   
✅ Dev server running
   Run: npm run dev
   Check: http://localhost:3001 loads
   
✅ Can access login page
   Go to: http://localhost:3001/login
   Check: Page loads without errors
   
✅ Can login with admin
   Email: afaque@higgs.ae
   Password: AdminAhmedHiggs2025!
   Check: Redirects to /adminpanel
   
✅ Can access /machine page
   Go to: http://localhost:3001/machine
   Check: Page loads with table
   
✅ Can see statistics
   Check: Dashboard shows metrics
   
✅ Can create miner
   Click: "Add Miner"
   Fill: Form fields
   Check: Modal shows validation
   
✅ Can view miners
   Check: Table displays data
   
✅ Can edit miner
   Click: Edit icon
   Check: Modal pre-fills data
   
✅ Can delete miner
   Click: Delete icon
   Check: Confirmation appears
```

---

## Debug Mode

Enable detailed logging:

### 1. Check Server Logs
```bash
# Terminal running npm run dev will show:
# - Page requests
# - API calls
# - Errors
# - Authentication logs
```

### 2. Browser DevTools
```
F12 → Console → Look for errors
F12 → Network → Check API requests
F12 → Application → Cookies → Verify 'token' exists
```

### 3. Database Inspection
```bash
npx prisma studio
# Opens web UI to inspect database
# Check: users, miners, spaces tables
```

### 4. Environment Check
```bash
# Verify environment variables
echo $DATABASE_URL
echo $JWT_SECRET
echo $NODE_ENV
```

---

## Full Reset (If Nothing Works)

```bash
#!/bin/bash

# 1. Kill all Node processes
pkill -9 node

# 2. Clean build
rm -rf .next out

# 3. Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# 4. Generate Prisma client
npx prisma generate

# 5. Create test users
node scripts/create-test-user.js

# 6. Start fresh
npm run dev
```

Save as `reset.sh` and run:
```bash
chmod +x reset.sh
./reset.sh
```

---

## Verify Everything Works

After fixing issues, verify:

```bash
# 1. Server is running
curl -I http://localhost:3001

# 2. Can login
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"afaque@higgs.ae","password":"AdminAhmedHiggs2025!"}'

# 3. Can access API with token
# (Replace TOKEN with actual token from login response)
curl -H "Cookie: token=TOKEN" http://localhost:3001/api/machine
```

---

## Still Having Issues?

Check these files:
- `.env` - Database URL and JWT secret
- `.env.local` - Local overrides
- `src/middleware.ts` - Authentication logic
- `src/app/(manage)/machine/page.tsx` - Page component
- `src/app/api/machine/route.ts` - API routes

---

## Contact Support

If issues persist:
1. Provide browser console errors
2. Show server terminal output
3. Include `.env` (without secrets)
4. Check database connection

---

**Last Updated**: November 21, 2025
**Status**: ✅ All issues should be resolved with these steps
