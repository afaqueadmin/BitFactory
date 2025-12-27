# Group Assignment - Complete Flow Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  CreateUserModal.tsx / EditCustomerModal.tsx                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Form State:                                                │ │
│  │  - name, email, role                                       │ │
│  │  - luxorSubaccountName (required for CLIENT)              │ │
│  │  - groupId (OPTIONAL)                                      │ │
│  │                                                            │ │
│  │ useEffect on modal open:                                  │ │
│  │  1. fetchSubaccounts() → GET /api/user/subaccounts       │ │
│  │  2. fetchGroups() → GET /api/groups (active only)        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            ↓                                      │
│  Form Submission (handleSubmit):                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ POST /api/user/create or PUT /api/user/[id]              │ │
│  │ Body: { name, email, luxorSubaccountName, groupId, ... } │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  POST /api/user/create                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. Validate JWT token (extract userId)                    │ │
│  │ 2. Check admin/super-admin role                            │ │
│  │ 3. Create User record:                                     │ │
│  │    → INSERT INTO users (name, email, password, role)      │ │
│  │ 4. Assign luxor subaccount (if provided):                 │ │
│  │    → UPDATE users SET luxorSubaccountName = ?             │ │
│  │ 5. Create cost payment (if CLIENT with initialDeposit)    │ │
│  │ 6. [NEW] Create group assignment (if groupId provided):   │ │
│  │    → INSERT INTO group_subaccounts                        │ │
│  │       (groupId, subaccountName, addedBy)                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            ↓                                      │
│  PUT /api/user/[id]                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. Validate JWT token                                      │ │
│  │ 2. Check admin/super-admin role                            │ │
│  │ 3. Update User record:                                     │ │
│  │    → UPDATE users SET name=?, email=?, ...                │ │
│  │ 4. [NEW] Manage group assignment:                         │ │
│  │    a. DELETE FROM group_subaccounts                       │ │
│  │       WHERE subaccountName = ? (remove from old group)    │ │
│  │    b. INSERT INTO group_subaccounts                       │ │
│  │       (groupId, subaccountName, addedBy)                  │ │
│  │       (add to new group if groupId not empty)             │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  users table                                                      │
│  ┌─────────────────────────────────────────────────┐            │
│  │ id | email | name | role | luxorSubaccountName │            │
│  ├─────────────────────────────────────────────────┤            │
│  │ u1 │ j@x.com│ John │CLIENT│ subaccount_1      │            │
│  └─────────────────────────────────────────────────┘            │
│                            ↓                                      │
│  groups table                   group_subaccounts table          │
│  ┌──────────────────────────┐  ┌─────────────────────────────┐ │
│  │ id | name | isActive | ..│  │ id │ groupId│subaccountName│ │
│  ├──────────────────────────┤  ├─────────────────────────────┤ │
│  │ g1 │ Alpha │ true      │  │ gs1│  g1   │ subaccount_1  │ │
│  │ g2 │ Beta  │ true      │  └─────────────────────────────┘ │
│  └──────────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Scenarios

### Scenario 1: Create User with Group

```
User fills form:
  name: "John"
  email: "john@example.com"
  role: "CLIENT"
  luxorSubaccountName: "subaccount_1"
  groupId: "group_alpha"
  │
  ├─→ Frontend validates & submits
  │
  └─→ Backend (/api/user/create):
      │
      ├─→ [Step 1] Create user in 'users' table
      │   users[new_id] = { name, email, password, role }
      │
      ├─→ [Step 2] Assign subaccount
      │   users[new_id].luxorSubaccountName = "subaccount_1"
      │
      └─→ [Step 3] Create group assignment ✨ NEW
          group_subaccounts[] = {
            groupId: "group_alpha",
            subaccountName: "subaccount_1",
            addedBy: admin_id
          }

✅ Result: Entry created in group_subaccounts
```

### Scenario 2: Update User - Change Group

```
User edits existing user:
  luxorSubaccountName: "subaccount_1" (same)
  groupId: "group_beta" (changed from "group_alpha")
  │
  ├─→ Frontend submits updated form
  │
  └─→ Backend (/api/user/[id]):
      │
      ├─→ [Step 1] Update user record
      │   users[id] = { updated fields }
      │
      └─→ [Step 2] Update group assignment ✨ NEW
          a) DELETE from group_subaccounts
             WHERE subaccountName = "subaccount_1"
             → Removes from "group_alpha"
          
          b) INSERT into group_subaccounts
             groupId: "group_beta",
             subaccountName: "subaccount_1",
             addedBy: admin_id
             → Adds to "group_beta"

✅ Result: Subaccount moved from group_alpha to group_beta
```

### Scenario 3: Update User - Remove from Group

```
User edits existing user:
  luxorSubaccountName: "subaccount_1" (same)
  groupId: null (changed from "group_beta")
  │
  ├─→ Frontend submits
  │
  └─→ Backend (/api/user/[id]):
      │
      ├─→ [Step 1] Update user record
      │
      └─→ [Step 2] Remove from group ✨ NEW
          DELETE from group_subaccounts
          WHERE subaccountName = "subaccount_1"
          → Removes from "group_beta"

✅ Result: Subaccount no longer in any group
```

## Component Lifecycle

### CreateUserModal.tsx

```
┌─────────────────────────────────────────┐
│ Component Mount                         │
└──────────────┬──────────────────────────┘
               │
         useEffect:
         ├─→ fetchSubaccounts()
         │   └─→ GET /api/user/subaccounts
         │
         └─→ fetchGroups()
             └─→ GET /api/groups
                 ├─→ Filter isActive = true
                 └─→ Update state.groups
               │
    ┌──────────v────────────┐
    │ Render Form            │
    ├───────────────────────┤
    │ • Name input          │
    │ • Email input         │
    │ • Role select         │
    │ • Luxor dropdown      │
    │ • [NEW] Group dropdown│  ← Gets options from state.groups
    │ • Submit button       │
    └──────────┬────────────┘
               │
           handleSubmit:
         fetch("/api/user/create", {
           body: JSON.stringify({
             name,
             email,
             role,
             luxorSubaccountName,
             groupId  ← [NEW] Send groupId
           })
         })
               │
         ┌─────v─────┐
         │   Success  │
         └────────────┘
```

### EditCustomerModal.tsx

```
┌──────────────────────────────────────────┐
│ Component Mount / open=true              │
└───────────────┬──────────────────────────┘
                │
          useEffect:
          ├─→ Fetch initial data (customer info)
          │   └─→ Pre-fill form with existing values
          │
          ├─→ fetchSubaccounts()
          │
          └─→ fetchGroups()  ← [NEW]
              └─→ Load available groups
              
    ┌──────────v────────────────────┐
    │ Render Edit Form               │
    ├────────────────────────────────┤
    │ • Name input (pre-filled)      │
    │ • Email input (pre-filled)     │
    │ • Luxor dropdown (pre-selected)│
    │ • [NEW] Group dropdown         │
    │   (pre-selected if has group)  │
    │ • Save button                  │
    └──────────┬─────────────────────┘
               │
           handleSubmit:
         fetch("/api/user/[id]", {
           method: "PUT",
           body: JSON.stringify({
             ...existing fields,
             groupId  ← [NEW] Send groupId
           })
         })
               │
         ┌─────v─────────────────┐
         │ Database Updated:      │
         │ • User record updated  │
         │ • GroupSubaccount      │
         │   created/updated      │
         └────────────────────────┘
```

## State Flow Diagram

```
CreateUserModal/EditCustomerModal State:

formData = {
  name: string,
  email: string,
  role: "CLIENT" | "ADMIN" | "SUPER_ADMIN",
  luxorSubaccountName: string | "",
  groupId: string | ""  ← [NEW]
  ... other fields
}

groups: Array<{
  id: string,
  name: string,
  description: string,
  isActive: boolean,
  creator: { id, name, email }
}>

fetchingGroups: boolean ← Shows loading indicator on dropdown

onChange → setFormData({...prev, groupId: e.target.value})
onSubmit → Send formData (including groupId) to API
```

## Key Decision Points

```
When user submits form:

Is user role = CLIENT?
├─→ YES: Check luxorSubaccountName
│   ├─→ Provided: Check groupId
│   │   ├─→ Provided: Create GroupSubaccount entry ✅
│   │   └─→ Not provided: Skip group assignment ✅
│   └─→ Not provided: Error (required for CLIENT)
│
└─→ NO (ADMIN/SUPER_ADMIN): Skip group assignment entirely
```

## Relationship Model

```
User (1) ──has─→ (1) luxorSubaccountName
           │
           └──mapped via──→ GroupSubaccount (many) ──links─→ (1) Group
           
One User → One LuxorSubaccount → Zero or One Group

Constraint: Each subaccountName can only appear once in group_subaccounts
           (one subaccount per group maximum)
```
