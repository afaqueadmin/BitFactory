# 🔐 Authentication Required for /machine Page

## Issue Summary

The `/machine` page requires **Admin Authentication**. When accessing it without a valid authentication token, the middleware redirects you to `/login`.

## ✅ Solution: Login First

### Step 1: Start the Development Server
```bash
npm run dev
```

The server will start on `http://localhost:3001` (if 3000 is in use)

### Step 2: Access the Login Page
```
http://localhost:3001/login
```

### Step 3: Login with Admin Account
You need to use **admin credentials** to access the `/machine` page.

**Note**: The `/machine` page is in the `(manage)` route group, which is ADMIN-ONLY.

### Step 4: Access the Miners Page
After successful login with an admin account:
```
http://localhost:3001/machine
```

---

## 🔍 Understanding the Authentication Flow

### Route Protection
- **Public Routes**: `/`, `/login`
- **Admin Routes** (in `(manage)` group): `/machine`, `/space`, `/customers`, `/adminpanel`
- **Client Routes** (in `(auth)` group): `/dashboard`, `/wallet`, `/miners`, `/workers`

### Middleware Behavior
```typescript
// If no token → Redirect to /login
// If token expired → Redirect to /login
// If ADMIN token → Allow access to /manage routes
// If CLIENT token → Allow access to /auth routes, block /manage routes
```

### Token Storage
- Tokens are stored in **HTTP-only cookies** for security
- Token name: `token` (access token)
- Backup token: `refresh_token` (refresh token)

---

## 👤 Admin Account Requirements

To access the `/machine` page, you need:
1. A **valid admin account** in the database
2. Correct **credentials** (email + password)
3. **Valid JWT token** in cookies after login

### Checking Admin Status
After login, the JWT token includes the role:
```typescript
{
  userId: "user123",
  role: "ADMIN"  // Must be ADMIN to access /machine
}
```

---

## 🧪 Testing the Miners CRUD Feature

### Option 1: Login via UI (Recommended)
```
1. Go to http://localhost:3001/login
2. Enter admin email and password
3. Click "Login"
4. You'll be redirected to /adminpanel (default admin page)
5. Navigate to /machine in the sidebar or URL
```

### Option 2: Test via API (For Developers)
If you want to test the API endpoints directly without the UI:

#### Step 1: Get Admin Token
```bash
# Login to get token
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your-password"
  }'
```

#### Step 2: Use Token to Access API
```bash
# Create miner
curl -X POST http://localhost:3001/api/machine \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_JWT_TOKEN" \
  -d '{
    "name": "Miner-001",
    "model": "Antminer S21",
    "powerUsage": 3.5,
    "hashRate": 130,
    "userId": "user123",
    "spaceId": "space456",
    "status": "ACTIVE"
  }'
```

---

## 🛠️ Troubleshooting Access Issues

### Issue: "Redirected to /login"
**Cause**: No valid authentication token
**Solution**: Login with admin credentials first

### Issue: "Forbidden: Admin access required"
**Cause**: Logged in but not as admin
**Solution**: Use an admin account (role = "ADMIN")

### Issue: "Invalid token"
**Cause**: Token expired or corrupted
**Solution**: Clear cookies and login again
```bash
# Clear cookies in browser DevTools:
# Application → Cookies → localhost → Delete token & refresh_token
```

### Issue: "API returns 401 Unauthorized"
**Cause**: No token in request headers
**Solution**: Include token in Cookie header:
```bash
curl ... -H "Cookie: token=YOUR_TOKEN" ...
```

---

## 🔑 Admin User Creation

If no admin account exists, create one using the database or API:

### Via Database (Direct)
```sql
INSERT INTO users (id, email, name, password, role, "createdAt", "updatedAt")
VALUES (
  'cuid123',
  'admin@example.com',
  'Admin User',
  'hashed_password_here',
  'ADMIN',
  NOW(),
  NOW()
);
```

### Via API (If available)
```bash
curl -X POST http://localhost:3001/api/user/create \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "secure-password",
    "name": "Admin User",
    "role": "ADMIN"
  }'
```

---

## ✨ Features Available After Authentication

Once logged in as admin, you can:

1. **View Miners**
   - See all miners in the table
   - View statistics dashboard
   - Filter by status, user, or space

2. **Create Miner**
   - Click "Add Miner" button
   - Fill form with miner details
   - Select user and space

3. **Edit Miner**
   - Click edit icon on miner row
   - Modify any field
   - Save changes

4. **Delete Miner**
   - Click delete icon on miner row
   - Confirm deletion
   - Miner is removed

---

## 📋 API Authentication Headers

All API requests to `/api/machine/*` require:

```bash
# Required Header
Cookie: token=YOUR_JWT_TOKEN

# Or via curl
curl ... --cookie "token=YOUR_JWT_TOKEN" ...

# Or via fetch
fetch(url, {
  credentials: 'include',  // Automatically includes cookies
  headers: {
    'Content-Type': 'application/json'
  }
})
```

---

## 🔐 Security Notes

- ✅ Tokens are HTTP-only (cannot access via JavaScript)
- ✅ Tokens expire after 15 minutes
- ✅ Refresh tokens expire after 7 days
- ✅ Admin-only endpoints validate role on every request
- ✅ Invalid tokens are automatically cleared

---

## 🚀 Next Steps

1. **Login**: Go to http://localhost:3001/login with admin credentials
2. **Navigate**: Go to http://localhost:3001/machine
3. **Test CRUD**: Use the UI to create, read, update, delete miners
4. **API Testing**: Use the API endpoints with curl or Postman

---

## 📞 Need Help?

- **Can't login?** Check admin credentials in database
- **Token issues?** Clear cookies and login again
- **API errors?** Check the error message in response
- **Page redirects?** Verify role is ADMIN in JWT token

---

**Status**: ✅ Everything is working correctly - authentication is required as designed
**Solution**: Login with admin account to access /machine page
