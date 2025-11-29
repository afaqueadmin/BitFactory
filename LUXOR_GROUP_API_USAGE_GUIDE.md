# Luxor Group APIs - Quick Usage Guide

## Accessing the Admin Page

### URL
```
http://localhost:3000/luxorapi
```

### Requirements
- Must be logged in as an admin user
- JWT token must be present in HTTP-only cookies
- User must have ADMIN role in the system

### Navigation
After logging in, navigate to the admin dashboard and look for "Luxor Workspace Groups" or use the direct URL.

## Features

### Dashboard Statistics
- **Total Groups**: Count of all workspace groups
- **Total Members**: Sum of all members across all groups
- **Total Subaccounts**: Sum of all subaccounts across all groups

### Group Table
Displays all available groups with:
- Group name and unique ID
- Group type (POOL, DERIVATIVES, HARDWARE)
- Number of members
- Number of subaccounts
- Action buttons (Edit, Delete)

### Create Group
1. Click **"Create Group"** button in the top-right
2. Enter the group name in the modal dialog
3. Click **"Create"** to submit
4. New group appears in the table immediately

### Edit Group
1. Click the **Edit** (pencil) icon on any group row
2. Update the group name in the modal dialog
3. Click **"Update"** to submit
4. Group name updates in the table immediately

### Delete Group
1. Click the **Delete** (trash) icon on any group row
2. Confirm the deletion in the modal dialog
3. Click **"Delete"** to confirm
4. Group is removed from the table

### Refresh Data
- Click **"Refresh"** button to reload all groups from the API
- Useful if changes were made outside this interface

## API Details

### Request Format
All requests use JSON with the following structure:

**Create:**
```json
{
  "endpoint": "group",
  "name": "New Group Name"
}
```

**Update:**
```json
{
  "endpoint": "group",
  "id": "group-id-123",
  "name": "Updated Name"
}
```

**Delete:**
```json
{
  "endpoint": "group",
  "id": "group-id-123"
}
```

### Response Format
All responses follow this structure:

```json
{
  "success": true,
  "data": { /* response data */ },
  "timestamp": "2025-11-22T15:30:45.123Z"
}
```

On error:
```json
{
  "success": false,
  "error": "Error message describing what went wrong",
  "timestamp": "2025-11-22T15:30:45.123Z"
}
```

## Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Authentication required: No token found" | Not logged in or session expired | Log in again |
| "User not found in database" | User account was deleted | Contact administrator |
| "Unsupported endpoint" | Invalid endpoint name | Check endpoint spelling |
| "Group name is required" | Submitted empty group name | Enter a group name |
| "Group ID is required" | Missing group ID for update/delete | Refresh the page |
| "Service configuration error" | LUXOR_API_KEY not set in environment | Contact system administrator |

## Browser Console

Enable browser console (F12) to see debug logs:

```
[Luxor Groups] Fetching workspace data...
[Luxor Groups] Creating group: My Group
[Luxor Groups] Group created successfully
```

Check the Network tab to see actual API requests/responses.

## Server Logs

When running locally with `npm run dev`, check terminal output for:

```
[Luxor Proxy] Authenticating user...
[Luxor Proxy] POST: User authenticated: user-id-123
[Luxor Proxy] POST: Creating group: My Group
[Luxor Proxy] POST: Successfully created group
```

## Common Issues

### 1. "Cannot access /luxorapi"
- Check if you're logged in
- Verify you have ADMIN role
- Check middleware logs for authentication issues

### 2. "Error Loading Groups"
- Check if LUXOR_API_KEY is set in environment variables
- Verify API server is accessible
- Check server logs for detailed error messages

### 3. Groups not appearing in table
- Click "Refresh" button to reload data
- Check browser console for errors
- Check if you have permission to view groups

### 4. Form submission fails silently
- Check browser console for errors
- Verify group name is not empty
- Check server logs for API errors

## Testing with cURL

You can test the API endpoints from the command line:

### Create Group
```bash
curl -X POST http://localhost:3000/api/luxor \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_JWT_TOKEN" \
  -d '{
    "endpoint": "group",
    "name": "Test Group"
  }'
```

### Update Group
```bash
curl -X PUT http://localhost:3000/api/luxor \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_JWT_TOKEN" \
  -d '{
    "endpoint": "group",
    "id": "group-id",
    "name": "Updated Name"
  }'
```

### Delete Group
```bash
curl -X DELETE http://localhost:3000/api/luxor \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_JWT_TOKEN" \
  -d '{
    "endpoint": "group",
    "id": "group-id"
  }'
```

## Notes

- All operations require valid JWT authentication
- Changes are immediately reflected in the UI
- Group IDs are read-only identifiers from Luxor API
- Group types (POOL, DERIVATIVES, HARDWARE) are determined by Luxor
- Member and subaccount information is read-only on this page

## Support

For issues or questions:
1. Check the browser console (F12)
2. Check server logs (terminal where `npm run dev` is running)
3. Verify authentication status
4. Verify LUXOR_API_KEY environment variable is set
5. Review error messages in the UI alerts
