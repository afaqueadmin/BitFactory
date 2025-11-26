# Debugging Guide - Luxor Group APIs Edit/Delete Issues

## Current Issue
- ✅ CREATE: Working perfectly
- ❌ UPDATE (Edit): Returns HTTP 404
- ❌ DELETE: Returns HTTP 400

## Debugging Steps

### Step 1: Check Browser Console Logs

1. Open your browser (Chrome/Firefox)
2. Press `F12` to open Developer Tools
3. Go to **Console** tab
4. Clear console
5. Try to edit a group
6. Look for these log messages:

```
[Luxor Groups] Fetching workspace groups...
[Luxor Groups] Workspace data: { ... }
[Luxor Groups] Parsed groups: [ ... ]
```

### Step 2: Inspect the Group IDs

Look for the "Parsed groups" output. It should show something like:

```javascript
[
  {
    id: "some-group-id-here",
    name: "Group Name",
    type: "POOL",
    ...
  }
]
```

**Note the format of the `id` field** - is it:
- A UUID? (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- A number? (e.g., `123`)
- A string? (e.g., `group-abc123`)

### Step 3: Check Network Tab

1. Open **Network** tab in Developer Tools
2. Filter for "api" or "luxor"
3. Try to edit a group
4. Look for the PUT request to `/api/luxor`
5. Click on it and check:
   - **Request Headers**: Should show `Content-Type: application/json`
   - **Request Payload**: Should show the group ID being sent
   - **Response**: Should show the error message from Luxor API

### Step 4: Check Server Logs

1. Look at your terminal where `npm run dev` is running
2. Look for messages like:

```
[Luxor Proxy] PUT: Updating group <GROUP_ID> with name: <NAME>
[Luxor Proxy] PUT: Luxor API error (404): ...
```

### Step 5: Copy Full Error Response

When you see the error in Network tab, expand the response and copy the full JSON. It might look like:

```json
{
  "success": false,
  "error": "Group not found",
  "timestamp": "2025-11-22T..."
}
```

---

## Common Issues & Solutions

### Issue 1: Group IDs Don't Match

**Symptom**: 404 errors on update/delete

**Cause**: The workspace endpoint might return different group objects than what the individual group operations expect.

**Solution**: We need to check if we need to use a different ID field. The workspace might return groups with a different ID structure.

### Issue 2: Missing Permissions

**Symptom**: 400 or 403 errors

**Cause**: The API key might not have permission to modify groups.

**Solution**: Verify the `LUXOR_API_KEY` has the correct permissions in your Luxor account.

### Issue 3: API Format Mismatch

**Symptom**: Groups list shows but operations fail

**Cause**: The workspace endpoint might return groups in a different format than expected.

**Solution**: We might need to adjust how we parse the groups from the workspace response.

---

## What to Share With Us

When reporting the issue, please provide:

1. **Console output** showing the parsed groups (especially the ID format)
2. **Network tab screenshot** showing the PUT/DELETE request and response
3. **Server log output** showing the error from the proxy
4. **Full JSON error response** from the API

This will help us identify exactly what's going wrong.

---

## Temporary Workaround

If you need to edit/delete groups immediately, you can:

1. Go directly to Luxor dashboard: https://app.luxor.tech/
2. Edit/delete groups from there
3. Then refresh your local page (click "Refresh" button)

The groups should appear updated.

---

## Next Steps

After you provide the debugging information:

1. We'll update the `fetchGroups()` function to parse groups correctly
2. We might need to adjust the group ID mapping
3. We'll test edit/delete operations
4. We'll update the page with the fix

---

## Real-Time Testing Steps

### To test and get logs:

1. **Start dev server**: `npm run dev`
2. **Navigate to page**: `http://localhost:3000/luxorapi`
3. **Open Console**: F12 → Console tab
4. **Look at initial logs** - you should see:
   ```
   [Luxor Groups] Fetching workspace groups...
   [Luxor Groups] Workspace data: { groups: [...] }
   [Luxor Groups] Parsed groups: [...]
   ```

5. **Try to edit a group**:
   - Click Edit icon on any group
   - Update the name
   - Click Update
   - Watch console for error messages

6. **Copy the exact error** and share with us

This will help us fix the issue quickly!
