# Luxor Group APIs - Troubleshooting & Debug Instructions

## Issue Summary
- ✅ **CREATE** group: Working
- ❌ **EDIT** group: HTTP 404 error
- ❌ **DELETE** group: HTTP 400 error

## Root Cause Analysis

The likely issue is that the **group IDs returned from the workspace endpoint are not compatible with the group operations endpoints** (PUT/DELETE).

There could be several reasons:
1. The workspace returns groups in a different format than individual group operations expect
2. The ID field structure differs between endpoints
3. The groups might not have the required permissions for modification

## How to Debug - Step by Step

### Step 1: Get Console Logs (CRITICAL)

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Open the page**:
   - Navigate to: `http://localhost:3000/luxorapi`
   - Make sure you're logged in as admin

3. **Open Browser Console**:
   - Press `F12` key
   - Go to **Console** tab
   - Clear console with `console.clear()` or the trash icon

4. **Take Screenshot of Initial Logs**:
   - Refresh the page (F5)
   - Look for these logs:
     ```
     [Luxor Groups] Fetching workspace groups...
     [Luxor Groups] Workspace data: { ...groups: [...] ... }
     [Luxor Groups] Parsed groups: [...]
     ```
   - **COPY the "Parsed groups" data** - this is crucial

### Step 2: Capture the Group Data

In the console, the "Parsed groups" output shows something like:
```javascript
[
  {
    id: "???",  ← WHAT IS THIS VALUE?
    name: "Group Name",
    type: "POOL",
    url: "...",
    members: [...],
    subaccounts: [...]
  }
]
```

**The `id` field is key**. Note:
- Is it a UUID like `550e8400-e29b-41d4-a716-446655440000`?
- Is it a short string like `group-abc123`?
- Is it a number like `123`?

### Step 3: Attempt Edit and Capture Error

1. **Try to edit a group**:
   - Click the Edit (pencil) icon on any group row
   - Change the name to something like "Test Edit"
   - Click "Update"

2. **Immediately look at Console for UPDATE REQUEST logs**:
   ```
   [Luxor Groups] UPDATE REQUEST:
     Group ID: [COPY THIS VALUE]
     Group ID Type: [NOTE THIS]
     New Name: Test Edit
     Request Body: {...}
   ```

3. **Look for UPDATE RESPONSE**:
   ```
   [Luxor Groups] UPDATE RESPONSE:
     Status: 404
     Success: false
     Data: { success: false, error: "..." }
   ```

4. **COPY the full error message**

### Step 4: Check Network Tab

1. **Open Network Tab** (F12 → Network)
2. **Clear network history**
3. **Try to edit group again**
4. **Look for PUT request to `/api/luxor`**
5. **Click on it and check**:
   - **Headers** → Request URL
   - **Payload** → What data was sent?
   - **Response** → Full error response

6. **COPY the full Response JSON**

### Step 5: Check Server Logs

1. **Look at terminal where `npm run dev` is running**
2. **Find logs like**:
   ```
   [Luxor Proxy] PUT: Updating group [GROUP_ID] with name: [NAME]
   [Luxor Proxy] PUT: Luxor API error (404): [ERROR MESSAGE]
   ```

3. **COPY these server logs**

---

## Information to Collect Before Contacting Support

Create a document with these sections and **copy-paste the actual output**:

### 📋 Console Log - Initial Page Load
```
[PASTE THE PARSED GROUPS OUTPUT HERE]
```

### 📋 Console Log - Update Request
```
[PASTE THE UPDATE REQUEST LOGS HERE]
```

### 📋 Console Log - Update Response
```
[PASTE THE UPDATE RESPONSE LOGS HERE]
```

### 📋 Network Tab Screenshot
[ATTACH SCREENSHOT OF: PUT request → Payload → Response]

### 📋 Server Terminal Output
```
[PASTE SERVER LOGS HERE]
```

### 📋 Your Group ID Format
```
The ID format appears to be: [UUID / STRING / NUMBER]
Example: [PASTE AN ACTUAL ID]
```

---

## Possible Solutions

Based on your debugging info, we might need to:

### Option A: ID Mapping Issue
If the IDs are different in workspace vs group operations, we need to map them correctly.

### Option B: API Response Format
If the workspace returns groups in a non-standard format, we need to adjust parsing.

### Option C: Permissions Issue
If it's a 403, the API key might need different scopes.

---

## Temporary Workaround

While we debug, you can:

1. **Edit/Delete groups on Luxor Dashboard**:
   - Go to: https://app.luxor.tech/workspaces/overview
   - Make changes there

2. **Refresh the page**:
   - Click "Refresh" button on the `/luxorapi` page
   - Changes will appear

This is a workaround, not a long-term solution.

---

## Quick Testing Commands

If you want to test via cURL instead:

### Test PUT (Edit)
```bash
curl -X PUT http://localhost:3000/api/luxor \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_JWT_TOKEN" \
  -d '{
    "endpoint": "group",
    "id": "YOUR_GROUP_ID",
    "name": "Test Name"
  }'
```

### Test DELETE
```bash
curl -X DELETE http://localhost:3000/api/luxor \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_JWT_TOKEN" \
  -d '{
    "endpoint": "group",
    "id": "YOUR_GROUP_ID"
  }'
```

Replace:
- `YOUR_JWT_TOKEN`: Your actual JWT token (from cookies)
- `YOUR_GROUP_ID`: An actual group ID from the page

---

## Next Steps

1. **Collect all the debugging information** from steps 1-5 above
2. **Share the collected information**
3. We'll analyze and provide the fix
4. You test the fix
5. Done!

---

## FAQ

**Q: Why is create working but edit/delete not?**
A: POST might work with minimal validation, but PUT/DELETE require exact ID matching and might have stricter validation.

**Q: Could this be a permissions issue?**
A: Possible, but unlikely since CREATE works. More likely an ID format mismatch.

**Q: How long will debugging take?**
A: If you provide good logs, we can fix it in 5-10 minutes. Without logs, it could take much longer.

**Q: Will this break anything?**
A: No, the debugging only adds console logs. No functional changes.

---

## Getting Help

If you get stuck:
1. Re-read steps 1-4 carefully
2. Make sure you're looking at the right console (browser, not server)
3. Make sure you're in the right tab (Console, not Elements/Network)
4. Refresh the page between test attempts
5. Clear browser cache if things look weird (Ctrl+Shift+Delete)

**Ready to debug? Start with Step 1 above!**
