# Testing Group Assignment Feature

## Overview
This document describes how to test the group assignment feature for users.

## Database Schema Understanding

### Key Models:
1. **User** - Has `luxorSubaccountName` field (the subaccount name assigned to this user)
2. **Group** - Has `id`, `name`, `description`, `isActive`, `createdBy`
3. **GroupSubaccount** - Links a group to a subaccount
   - `groupId` - Foreign key to Group
   - `subaccountName` - The Luxor subaccount name (must match User.luxorSubaccountName)
   - `addedBy` - The admin user who added this entry

## Flow Explanation

### When Creating a User with a Group:
1. Admin creates user with:
   - `name`, `email`, `role` (CLIENT)
   - `luxorSubaccountName` (required for CLIENT)
   - `groupId` (optional)
2. Backend (`/api/user/create`) does:
   - Creates User record with luxorSubaccountName
   - **NEW**: If groupId provided, creates GroupSubaccount entry linking the subaccount to the group

### When Updating a User's Group:
1. Admin updates user and selects new group
2. Backend (`/api/user/[id]`) does:
   - Updates User record
   - **NEW**: If groupId provided, removes subaccount from all groups and adds it to new group
   - This ensures a subaccount can only belong to ONE group at a time

## Testing Steps

### Step 1: Create a Test Group
1. Navigate to Admin Panel → Groups
2. Click "Create Group"
3. Enter group name: "Test Group Alpha"
4. Click Save
5. Note the group ID from the groups table

### Step 2: Create a User WITH Group Assignment
1. Navigate to Customers page
2. Click "Create User"
3. Fill form:
   - Name: "John Test"
   - Email: "john.test@example.com"
   - Role: "CLIENT"
   - Luxor Subaccount: Select one from dropdown (e.g., "subaccount_1")
   - **NEW**: Group: Select "Test Group Alpha"
4. Click Create

### Step 3: Verify Database Entry
Run this SQL query in your database:
```sql
SELECT * FROM group_subaccounts WHERE "subaccountName" = 'subaccount_1';
```

Expected result:
- Should see a row with:
  - `groupId` = ID of "Test Group Alpha"
  - `subaccountName` = "subaccount_1"
  - `addedAt` = current timestamp
  - `addedBy` = admin user ID

### Step 4: Update User to Different Group
1. Go to Customers page
2. Find the user created in Step 2
3. Click Edit
4. Change Group to a different group (e.g., "Test Group Beta")
5. Click Update

### Step 5: Verify Update in Database
Run again:
```sql
SELECT * FROM group_subaccounts WHERE "subaccountName" = 'subaccount_1';
```

Expected result:
- Row should now show:
  - `groupId` = ID of "Test Group Beta" (changed)
  - `subaccountName` = "subaccount_1" (same)

### Step 6: Remove User from Group
1. Go to Customers page
2. Find the user
3. Click Edit
4. Change Group to "No Group" (empty selection)
5. Click Update

### Step 7: Verify Removal from Database
Run again:
```sql
SELECT * FROM group_subaccounts WHERE "subaccountName" = 'subaccount_1';
```

Expected result:
- No rows should be returned (entry deleted)

## What Changed

### Frontend (Components):
- **CreateUserModal.tsx**: Added Group Selection dropdown below Luxor Subaccount
  - Fetches active groups from `/api/groups`
  - Passes `groupId` in form submission
  
- **EditCustomerModal.tsx**: Added Group Selection dropdown below Luxor Subaccount
  - Fetches active groups from `/api/groups`
  - Passes `groupId` in form submission

### Backend (API Routes):
- **`/api/user/create`**: 
  - Now accepts `groupId` parameter
  - Creates GroupSubaccount entry when groupId is provided with a luxor subaccount
  
- **`/api/user/[id]`**:
  - Now accepts `groupId` parameter
  - Handles group changes by:
    1. Removing subaccount from all groups first
    2. Adding to new group (if not empty)
  - Ensures one subaccount per group relationship

## Important Notes

1. **Group assignment only works for CLIENT users** - Only clients have Luxor subaccounts
2. **One subaccount per group** - A subaccount can only be in one group at a time
3. **Group is optional** - Users can exist without a group assignment
4. **Subaccount must exist** - The luxorSubaccountName must have a value for group assignment to work
5. **Admin tracking** - The `addedBy` field tracks which admin made the assignment

## Troubleshooting

### Issue: "Customer updated successfully" but no database entry created
**Solution**: 
- Verify the user has a luxorSubaccountName assigned
- Verify the group ID exists and is active
- Check server logs for any errors in the group assignment section

### Issue: Old group entry still shows in database after update
**Solution**: This shouldn't happen - the logic deletes old entries before creating new ones. Check if:
- A different subaccount name is being used
- Database transaction failed (check server logs)

### Issue: Group dropdown shows no groups
**Solution**:
- Verify groups exist in the database with `isActive = true`
- Check admin/super admin role on the user creating the form
- Verify JWT token is valid

## Expected Behavior After Fix

✅ Creating user with group → Entry created in groups_subaccounts table
✅ Editing user to change group → Entry updated in groups_subaccounts table  
✅ Editing user to remove group → Entry deleted from groups_subaccounts table
✅ "Customer updated successfully" message matches actual database state
