# Group Assignment Feature - Quick Reference

## What Was Fixed
EditCustomerModal now properly saves group assignments to the `group_subaccounts` table in the database.

## Key Files Changed

| File | Changes |
|------|---------|
| `src/components/CreateUserModal.tsx` | Added group dropdown + fetchGroups logic |
| `src/components/EditCustomerModal.tsx` | Added group dropdown + fetchGroups logic |
| `src/app/api/user/create/route.ts` | Added GroupSubaccount creation on user creation |
| `src/app/api/user/[id]/route.ts` | Added GroupSubaccount management on user update |

## How It Works Now

### Frontend Flow:
1. User/Group selection happens in modal form
2. Form submission sends `groupId` to backend API
3. Backend creates/updates `GroupSubaccount` entries
4. Database reflects the group assignment

### Database Impact:
- **Before**: User created → ✅ (User table updated) but group_subaccounts empty ❌
- **After**: User created → ✅ (User table) + ✅ (group_subaccounts updated)

## Key Business Rules

| Rule | Reason |
|------|--------|
| Only CLIENT users can have groups | Only clients have Luxor subaccounts |
| One subaccount per group | Ensures clear group membership |
| Groups are optional | Users can exist without group assignment |
| Only active groups shown | Prevents assigning to inactive groups |
| Admin tracked in `addedBy` | Audit trail of who made assignments |

## Database Schema Reference

```sql
-- User has subaccount
SELECT user.id, user.luxorSubaccountName FROM users WHERE id = 'user_id';

-- Subaccount linked to group via GroupSubaccount
SELECT * FROM group_subaccounts 
WHERE subaccountName = 'subaccount_name';
-- Result: { id, groupId, subaccountName, addedAt, addedBy }

-- Find all subaccounts in a group
SELECT * FROM group_subaccounts 
WHERE groupId = 'group_id';
```

## API Contract

### Create User
```json
POST /api/user/create
{
  "name": "John",
  "email": "john@example.com",
  "role": "CLIENT",
  "luxorSubaccountName": "subaccount_1",
  "groupId": "group_123"
}
```

### Update User
```json
PUT /api/user/{userId}
{
  "name": "John Updated",
  "luxorSubaccountName": "subaccount_1",
  "groupId": "group_456"  // Change to different group
}
```

### Remove from Group
```json
PUT /api/user/{userId}
{
  "groupId": null  // Remove from group
}
```

## Verification Query

```sql
-- Check if subaccount is in a group
SELECT 
  g.id as group_id,
  g.name as group_name,
  gs.subaccountName,
  gs.addedAt,
  u.name as admin_name
FROM group_subaccounts gs
JOIN groups g ON gs.groupId = g.id
JOIN users u ON gs.addedBy = u.id
WHERE gs.subaccountName = 'subaccount_1';
```

## Troubleshooting Checklist

- [ ] User has `role = 'CLIENT'`
- [ ] User has `luxorSubaccountName` assigned
- [ ] Group exists and `isActive = true`
- [ ] Check server logs for group assignment errors
- [ ] Verify JWT token is valid (admin/super-admin)
- [ ] Check if subaccount already assigned to another group (will be moved)

## Expected Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| No group_subaccounts entry created | Missing luxorSubaccountName | Ensure subaccount is selected first |
| Group dropdown empty | No active groups exist | Create groups and set isActive=true |
| Old group still shows in database | Subaccount name mismatch | Verify exact subaccount name spelling |
| Duplicate entry error | Transaction failed mid-way | Check database for orphaned entries |

## Performance Notes

- Group fetching happens on modal open (not on every keystroke)
- Groups are filtered to active only (reduces payload)
- GroupSubaccount operations are non-blocking (won't fail user creation)
- Indexes on `groupId` and `subaccountName` for fast queries

## Future Enhancements

- Bulk group assignment for multiple users
- Group membership history/audit log
- Subaccount transfer between groups UI
- Group-based permissions and features
