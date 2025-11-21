# 🚀 Quick Setup Guide - Access /machine Page

## TL;DR - Get Started in 5 Steps

### Step 1: Ensure Admin User Exists
Run the test user creation script:
```bash
node scripts/create-test-user.js
```

**Admin User Credentials:**
- Email: `afaque@higgs.ae`
- Password: `AdminAhmedHiggs2025!`
- Role: ADMIN ✅

### Step 2: Start Development Server
```bash
npm run dev
```

Server runs on: `http://localhost:3001` (or 3000 if available)

### Step 3: Login as Admin
Go to: `http://localhost:3001/login`

Enter credentials:
- Email: `afaque@higgs.ae`
- Password: `AdminAhmedHiggs2025!`

Click **Login**

### Step 4: Navigate to Miners Page
You'll be redirected to `/adminpanel` after login.

Then navigate to:
```
http://localhost:3001/machine
```

Or find the link in the sidebar navigation.

### Step 5: Test CRUD Operations
✅ View miners statistics
✅ Click "Add Miner" to create
✅ Click edit icon to update
✅ Click delete icon to remove

---

## 📋 What You Should See

### Stats Dashboard
```
┌─────────────────────────────────────┐
│ Total Miners: 0  Active: 0          │
│ Total Hash Rate: 0 TH/s             │
│ Total Power: 0 kW                   │
└─────────────────────────────────────┘
```

### Empty Table Message
"No miners found. Create one to get started."

### Action Buttons
- **Add Miner** - Top right button
- Edit icon (✏️) - On each row
- Delete icon (🗑️) - On each row

---

## ✨ Create Your First Miner

1. Click **"Add Miner"** button
2. Fill the form:
   - **Name**: Miner-001
   - **Model**: Antminer S21
   - **Power Usage**: 3.5 kW
   - **Hash Rate**: 130 TH/s
   - **User**: Select from dropdown
   - **Space**: Select from dropdown (create space first if needed)
   - **Status**: Active

3. Click **"Create Miner"**

The miner will appear in the table!

---

## 🔧 Troubleshooting

### "Page redirects to /login"
✓ Solution: You need to be logged in as ADMIN
- Run: `node scripts/create-test-user.js`
- Login with admin credentials above

### "Can't find spaces/users dropdown"
✓ Solution: Create a space first
- Go to `/space` page
- Click "Add Space"
- Then create miners

### "API Error when creating miner"
✓ Solution: Ensure:
- User exists (check `/api/user/all` with admin token)
- Space exists (check `/api/spaces` with admin token)
- All required fields are filled

### "Build errors"
✓ Solution: Clear cache and rebuild
```bash
rm -rf .next
npm run build
npm run dev
```

---

## 📊 Test Miners CRUD

### Create Miner
```
✅ Click "Add Miner"
✅ Fill form with valid data
✅ Select user and space
✅ Click "Create Miner"
Result: New miner appears in table
```

### Read Miners
```
✅ View all miners in table
✅ See statistics in dashboard
✅ Filter by status (if available)
Result: All miners displayed with details
```

### Update Miner
```
✅ Click edit icon (✏️) on miner
✅ Modal opens with pre-filled data
✅ Modify fields
✅ Click "Update Miner"
Result: Miner details updated in table
```

### Delete Miner
```
✅ Click delete icon (🗑️) on miner
✅ Confirmation dialog appears
✅ Click "Delete"
Result: Miner removed from table and database
```

---

## 🛡️ Important Notes

- **Authentication Required**: `/machine` requires ADMIN login
- **Route Protection**: Middleware blocks non-admin access
- **Token Storage**: JWT tokens stored in HTTP-only cookies
- **Token Duration**: Access token valid for 15 minutes
- **Role-Based**: Only ADMIN role can access `/machine`

---

## 📱 What Works

✅ Create miners with validation
✅ View miners in table
✅ Edit miner details
✅ Delete miners with confirmation
✅ Statistics dashboard
✅ Admin-only access control
✅ Form validation and error handling
✅ API endpoints with security

---

## 🔐 Admin User Details

**Option 1: Use Existing Admin**
```
Email: afaque@higgs.ae
Password: AdminAhmedHiggs2025!
```

**Option 2: Create from Script**
```bash
node scripts/create-test-user.js
```

This creates the admin user in the database if not exists.

---

## 🚀 You're Ready!

Follow these steps and you'll have full access to the miners CRUD feature:
1. ✅ Run create-test-user.js script
2. ✅ Start dev server (npm run dev)
3. ✅ Login with admin credentials
4. ✅ Navigate to /machine
5. ✅ Test CRUD operations!

---

**Status**: ✅ Everything is working correctly
**Next**: Follow the steps above to access the feature
