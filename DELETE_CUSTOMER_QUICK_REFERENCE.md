# Delete Customer Feature - Quick Reference

## What Was Added

✅ **Menu Option**: "Delete Customer" (in red) in the customer action menu
✅ **API Endpoint**: DELETE `/api/user/[id]`
✅ **Confirmation**: Dialog that shows customer name before deletion

## How to Use

1. Navigate to `/customers/overview`
2. Click the three-dot menu (⋮) on any customer row
3. Click "Delete Customer" (appears in RED as last option)
4. Confirm in the dialog that appears
5. Customer deleted and list refreshes

## What Gets Deleted

When a customer is deleted, ALL of the following are permanently removed:
- Customer account
- Login activities
- Session tokens
- Associated miners
- All related data

⚠️ **This cannot be undone!**

## Security

✅ Requires admin account
✅ Requires valid JWT token
✅ Admin cannot delete their own account
✅ Confirmation before deletion

## API Usage

```bash
curl -X DELETE http://localhost:3000/api/user/[customerId] \
  -H "Cookie: token=YOUR_JWT_TOKEN"
```

**Response (Success):**
```json
{ "message": "User deleted successfully" }
```

**Response (Error):**
```json
{ "error": "Only administrators can delete users" }
```

## Error Messages

| Situation | Error Code | Message |
|-----------|-----------|---------|
| No token | 401 | "Unauthorized" |
| Invalid token | 401 | "Invalid token" |
| Not admin | 403 | "Only administrators can delete users" |
| Own account | 400 | "You cannot delete your own account" |
| Server error | 500 | "Failed to delete user" |

## Files Changed

1. **Page**: `/src/app/(manage)/customers/overview/page.tsx`
   - Added `handleDeleteCustomer()` function
   - Added menu item and confirmation logic

2. **API**: `/src/app/api/user/[id]/route.ts`
   - Added DELETE method handler
   - Includes cascading deletes

## Testing

Test these scenarios:
- [ ] Delete a customer and confirm they're gone
- [ ] Cancel deletion in dialog
- [ ] Try deleting with invalid token (should fail)
- [ ] Try deleting your own account (should fail)
- [ ] Verify associated miners are deleted too
- [ ] Check that list refreshes after deletion

---

**Status**: ✅ Ready for use
**Build**: ✅ All checks pass
**Type Safety**: ✅ Full TypeScript support

