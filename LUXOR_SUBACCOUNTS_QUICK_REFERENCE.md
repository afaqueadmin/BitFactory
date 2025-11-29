# Luxor Subaccounts - Quick Reference

## Files Modified/Created

```
✏️  src/lib/luxor.ts
    - Added 4 subaccount methods to LuxorClient
    - Added 4 TypeScript interfaces
    - Updated LUXOR_ENDPOINTS constant

✏️  src/app/api/luxor/route.ts
    - Added checkAdminAccess() helper
    - Updated endpointMap with subaccount entry
    - Added subaccount handling to GET, POST, DELETE handlers
    - Added adminOnly authorization checks

✨ src/app/(manage)/subaccounts/page.tsx
    - NEW: Complete subaccounts management UI
    - Group selector dropdown
    - Subaccounts CRUD operations
    - Real-time updates
```

---

## Quick Start - API Usage

### From Client (React Component)

```typescript
// List subaccounts for a group
const response = await fetch('/api/luxor?endpoint=subaccount&groupId=abc123');
const { success, data } = await response.json();
// data contains { subaccounts: [...] }

// Add a subaccount
await fetch('/api/luxor', {
  method: 'POST',
  body: JSON.stringify({
    endpoint: 'subaccount',
    groupId: 'abc123',
    name: 'new_subaccount'
  })
});

// Remove a subaccount
await fetch('/api/luxor', {
  method: 'DELETE',
  body: JSON.stringify({
    endpoint: 'subaccount',
    groupId: 'abc123',
    name: 'old_subaccount'
  })
});
```

### From Backend (Server-side)

```typescript
import { createLuxorClient } from '@/lib/luxor';

const client = createLuxorClient('user_name');

// List subaccounts
const subaccounts = await client.listSubaccounts('group-id');

// Get specific subaccount
const subaccount = await client.getSubaccount('group-id', 'subaccount-name');

// Add subaccount
const added = await client.addSubaccount('group-id', 'new-subaccount');

// Remove subaccount
const action = await client.removeSubaccount('group-id', 'old-subaccount');
```

---

## Authorization

✅ **ADMIN users**: Full access to all subaccount operations  
❌ **Non-ADMIN users**: Get 403 Forbidden error

The authorization check happens:
1. During JWT extraction (user.role is validated)
2. At route handler level (checkAdminAccess() validates ADMIN role)
3. Returns 403 Forbidden if user is not ADMIN

---

## Error Responses

```json
// Missing required field
{ "success": false, "error": "Group ID is required", "timestamp": "..." }
// Status: 400

// Not authorized
{ "success": false, "error": "ADMIN access required for this endpoint", "timestamp": "..." }
// Status: 403

// Authentication failed
{ "success": false, "error": "Authentication required: No token found", "timestamp": "..." }
// Status: 401
```

---

## UI Navigation

Navigate to `/manage/subaccounts` to access the management page.

**Features:**
- Select group from dropdown
- View all subaccounts in selected group
- Add new subaccounts with form validation
- Delete subaccounts with confirmation dialog
- Manual refresh button
- Real-time error messages

---

## Console Logging

All operations log to console with `[Luxor Subaccounts]` prefix:

```javascript
[Luxor Subaccounts] Fetching workspace groups...
[Luxor Subaccounts] Workspace data: {...}
[Luxor Subaccounts] Parsed groups: [...]
[Luxor Subaccounts] Successfully fetched 3 groups
[Luxor Subaccounts] Group selected: abc123
[Luxor Subaccounts] Fetching subaccounts for group: abc123
[Luxor Subaccounts] Successfully fetched 5 subaccounts
```

Similarly for API routes:

```javascript
[Luxor Proxy] POST: Requested endpoint: subaccount
[Luxor Proxy] POST: Adding subaccount: new_account to group: abc123
[Luxor Proxy] Successfully added subaccount
```

---

## Type Safety

Full TypeScript support with interfaces:

```typescript
// Subaccount details
interface GetSubaccountResponse {
  id: number;
  name: string;
  created_at: string;
  url: string;
}

// List response
interface ListSubaccountsResponse {
  subaccounts: GetSubaccountResponse[];
}

// Add response (same structure as GetSubaccountResponse)
interface AddSubaccountResponse { ... }

// Remove response (extends WorkspaceAction with approval status)
interface RemoveSubaccountResponse extends WorkspaceAction { ... }
```

---

## Testing Commands

```bash
# List subaccounts (requires ADMIN token in cookie)
curl -X GET "http://localhost:3000/api/luxor?endpoint=subaccount&groupId=497f6eca-6276-4993-bfeb-53cbbbba6f08" \
  -H "Cookie: token=<jwt-token>"

# Add subaccount
curl -X POST "http://localhost:3000/api/luxor" \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<jwt-token>" \
  -d '{"endpoint":"subaccount","groupId":"497f6eca-6276-4993-bfeb-53cbbbba6f08","name":"test_account"}'

# Delete subaccount
curl -X DELETE "http://localhost:3000/api/luxor" \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<jwt-token>" \
  -d '{"endpoint":"subaccount","groupId":"497f6eca-6276-4993-bfeb-53cbbbba6f08","name":"test_account"}'
```

---

## Implementation Details

### GET Handler
- Supports query parameters: `groupId` (required), `name` (optional)
- If `name` provided: fetches specific subaccount
- If no `name`: lists all subaccounts in group
- Requires ADMIN role
- Returns 400 if `groupId` missing

### POST Handler
- Accepts JSON body with: `endpoint`, `groupId`, `name`
- Creates new subaccount or adds existing to group
- Requires ADMIN role
- Returns 400 if any required field missing
- Returns 201 Created on success

### DELETE Handler
- Accepts JSON body with: `endpoint`, `groupId`, `name`
- Removes subaccount from group
- If subaccount belongs only to this group, it's deleted entirely
- Requires ADMIN role
- Returns action status (may require approval)
- Returns 400 if any required field missing

---

## Security Features

✅ Server-side API key storage (never exposed to client)  
✅ JWT token validation on every request  
✅ Role-based access control (ADMIN only)  
✅ Structured error handling with appropriate HTTP statuses  
✅ Console logging for debugging  
✅ Validation of all input parameters  
✅ Type-safe throughout (TypeScript)  

---

## Dependencies

No new external dependencies added. Uses existing:
- `next/server` - NextResponse, NextRequest
- `prisma` - Database queries
- `@mui/material` - UI components
- TypeScript generics for type safety
