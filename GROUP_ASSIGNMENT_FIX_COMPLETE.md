# Group Assignment Database Integration - Complete Fix

## Problem Statement
When using EditCustomerModal to assign a user to a group, the UI showed "Customer updated successfully" but no data was being added to the `group_subaccounts` table in the Neon database.

## Root Cause Analysis

The issue was that the frontend and backend weren't properly handling the relationship between users, groups, and subaccounts. 

### Database Schema Understanding:
```
User (has luxorSubaccountName field)
    ↓
    └─→ luxorSubaccountName (e.g., "subaccount_1")
            ↓
            └─→ GroupSubaccount (links subaccount to group)
                    ├─ groupId (Foreign key to Group)
                    ├─ subaccountName (The Luxor subaccount name)
                    └─ addedBy (Admin user ID who made assignment)
```

**Key Insight**: The relationship is through the subaccount name, NOT directly through the user ID. A subaccount can only belong to ONE group at a time.

## Solution Implemented

### 1. Frontend Changes

#### CreateUserModal.tsx
- **Added**: Group state management (`groups`, `fetchingGroups`)
- **Added**: `fetchGroups()` function to retrieve active groups from `/api/groups`
- **Added**: Group Selection dropdown in the form after Luxor Subaccount field
- **Updated**: Form submission to include `groupId` in the request body

#### EditCustomerModal.tsx
- **Added**: Group state management (`groups`, `fetchingGroups`)
- **Added**: `fetchGroups()` function (same pattern as CreateUserModal)
- **Added**: Group Selection dropdown in the form after Luxor Subaccount field
- **Updated**: Form submission to include `groupId` in the request body

### 2. Backend Changes

#### `/api/user/create` Route
```typescript
// Accept groupId from request
const { groupId, luxorSubaccountName, ... } = await request.json();

// After creating user and assigning subaccount:
if (role === "CLIENT" && groupId && luxorSubaccountName) {
  await prisma.groupSubaccount.create({
    data: {
      groupId: groupId,
      subaccountName: luxorSubaccountName.trim(),
      addedBy: userId, // Admin user ID
    },
  });
}
```

#### `/api/user/[id]` Route (PUT)
```typescript
// Accept groupId from request
const body = await request.json();

// After updating user:
if (body.groupId && subaccountName && currentUser?.role === "CLIENT") {
  // Remove from all existing groups first
  await prisma.groupSubaccount.deleteMany({
    where: { subaccountName: subaccountName.trim() },
  });
  
  // Add to new group (if not empty)
  if (body.groupId && body.groupId.trim().length > 0) {
    await prisma.groupSubaccount.create({
      data: {
        groupId: body.groupId,
        subaccountName: subaccountName.trim(),
        addedBy: userId,
      },
    });
  }
}
```

## Data Flow

### Create User with Group:
```
User fills form in CreateUserModal
    ↓
Form data includes: { name, email, role, luxorSubaccountName, groupId }
    ↓
POST /api/user/create
    ↓
Backend creates User record
Backend creates GroupSubaccount entry (links subaccount to group)
    ↓
Success message displayed
```

### Update User's Group:
```
User edits existing user in EditCustomerModal
    ↓
Changes Group selection from Group A → Group B
    ↓
PUT /api/user/[id] with { groupId: "new_group_id" }
    ↓
Backend updates User record
Backend deletes GroupSubaccount entry for that subaccount (removes from Group A)
Backend creates new GroupSubaccount entry (adds to Group B)
    ↓
Success message displayed
```

### Remove User from Group:
```
User edits existing user in EditCustomerModal
    ↓
Changes Group selection from Group A → "No Group" (empty)
    ↓
PUT /api/user/[id] with { groupId: null }
    ↓
Backend updates User record
Backend deletes GroupSubaccount entry for that subaccount
    ↓
Success message displayed
```

## Important Implementation Details

### 1. Group Assignment Only for CLIENT Users
Groups can only be assigned to users with the CLIENT role because only CLIENT users have Luxor subaccounts.

### 2. One Subaccount Per Group
A Luxor subaccount can only belong to one group at a time. When changing groups:
1. First, delete the existing GroupSubaccount entry
2. Then, create a new entry with the new group

### 3. Optional Group Assignment
Groups are optional - users can exist without group assignment.

### 4. Group Filtering
Only active groups (`isActive: true`) are shown in the dropdown to prevent assigning users to inactive groups.

### 5. Admin Tracking
The `addedBy` field in GroupSubaccount tracks which admin user made the assignment/change.

## Testing Instructions

### Test Case 1: Create user with group
1. Go to Customers page
2. Click "Create User"
3. Fill in: name, email, role=CLIENT, luxor subaccount
4. Select a group from dropdown
5. Click Create
6. Verify database:
   ```sql
   SELECT * FROM group_subaccounts WHERE "subaccountName" = '{subaccount_name}';
   ```
   Should show: `groupId` = selected group, `subaccountName` = subaccount name

### Test Case 2: Update user to different group
1. Go to Customers page
2. Find user created in Test Case 1
3. Click Edit
4. Change group to different one
5. Click Update
6. Verify database:
   ```sql
   SELECT * FROM group_subaccounts WHERE "subaccountName" = '{subaccount_name}';
   ```
   Should show: `groupId` = new group ID (changed)

### Test Case 3: Remove user from group
1. Go to Customers page
2. Find user
3. Click Edit
4. Select "No Group"
5. Click Update
6. Verify database:
   ```sql
   SELECT * FROM group_subaccounts WHERE "subaccountName" = '{subaccount_name}';
   ```
   Should return: NO ROWS (entry deleted)

## Files Modified

### Frontend Components:
- `src/components/CreateUserModal.tsx` - Added group selection
- `src/components/EditCustomerModal.tsx` - Added group selection

### Backend API Routes:
- `src/app/api/user/create/route.ts` - Added GroupSubaccount creation
- `src/app/api/user/[id]/route.ts` - Added GroupSubaccount management on updates

## Why This Approach

1. **Database Integrity**: Using a separate `GroupSubaccount` table ensures proper referential integrity
2. **Flexibility**: Allows future features like moving subaccounts between groups
3. **Audit Trail**: The `addedBy` field tracks who made assignments
4. **One-to-One Mapping**: Ensures a subaccount belongs to at most one group
5. **User-Centric**: Group membership follows the subaccount, not stored in User table directly

## Backward Compatibility

This change is backward compatible because:
- The `User` table is unchanged (no schema modifications)
- Existing users without groups are unaffected
- The `groupId` parameter is optional in the API endpoints
- Group assignment only happens if explicitly provided

## Expected Behavior After Fix

✅ Creating user with group → Entry appears in `group_subaccounts` table
✅ Updating user to change group → Entry updated in `group_subaccounts` table
✅ Removing user from group → Entry deleted from `group_subaccounts` table
✅ "Customer updated successfully" message now matches actual database state
✅ Only active groups shown in dropdown
✅ Only CLIENT users can be assigned to groups
