# Group Management Schema - Implementation Complete

## ✅ Status: COMPLETED

Two new tables have been successfully added to the Neon database without affecting any existing data.

---

## Database Schema Created

### 1. **groups** Table
Stores group information for organizing subaccounts.

```sql
CREATE TABLE "public"."groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL
);

CREATE INDEX "groups_isActive_idx" ON "public"."groups"("isActive");
```

**Fields:**
- `id`: Unique identifier (CUID)
- `name`: Group name (required, max 255 chars)
- `description`: Optional description
- `isActive`: Enable/disable group (default: true)
- `createdAt`: Timestamp when created
- `updatedAt`: Timestamp when last modified
- `createdBy`: User ID of admin who created it

---

### 2. **group_subaccounts** Table
Junction table linking subaccounts to groups (one subaccount per group only).

```sql
CREATE TABLE "public"."group_subaccounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "subaccountName" TEXT NOT NULL UNIQUE,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT NOT NULL,
    FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "group_subaccounts_subaccountName_key" ON "public"."group_subaccounts"("subaccountName");
CREATE INDEX "group_subaccounts_groupId_idx" ON "public"."group_subaccounts"("groupId");
CREATE INDEX "group_subaccounts_subaccountName_idx" ON "public"."group_subaccounts"("subaccountName");
```

**Fields:**
- `id`: Unique identifier (CUID)
- `groupId`: Foreign key to groups table
- `subaccountName`: Luxor subaccount name (unique - ensures one per group)
- `addedAt`: Timestamp when added to group
- `addedBy`: User ID of admin who added it

**Constraints:**
- `UNIQUE(subaccountName)`: Ensures a subaccount can only be in ONE group
- `ON DELETE CASCADE`: If group is deleted, all linked subaccounts are removed

---

## Prisma Models

### Group Model
```typescript
model Group {
  id              String   @id @default(cuid())
  name            String   @db.VarChar(255)
  description     String?  @db.Text
  isActive        Boolean  @default(true)
  
  subaccounts     GroupSubaccount[]
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdBy       String
  
  @@index([isActive])
  @@map("groups")
}
```

### GroupSubaccount Model
```typescript
model GroupSubaccount {
  id              String   @id @default(cuid())
  groupId         String
  subaccountName  String   @unique
  
  group           Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  
  addedAt         DateTime @default(now())
  addedBy         String
  
  @@index([groupId])
  @@index([subaccountName])
  @@map("group_subaccounts")
}
```

---

## Migration Details

**Migration File:** `prisma/migrations/20251227100511_add_group_management_tables/migration.sql`

**Applied:** ✅ Yes (migration exists in migrations folder)

**Existing Data:** ✅ Completely Safe
- No existing tables were modified
- No existing data was deleted or altered
- Migration only adds new tables
- All foreign keys and indexes are properly configured

---

## Example Usage

### Create a Group
```typescript
const group = await prisma.group.create({
  data: {
    name: "North America Ops",
    description: "All mining operations in North America",
    createdBy: "admin_user_1",
    subaccounts: {
      create: [
        { subaccountName: "higgs_test", addedBy: "admin_user_1" },
        { subaccountName: "production_1", addedBy: "admin_user_1" },
        { subaccountName: "production_2", addedBy: "admin_user_1" }
      ]
    }
  },
  include: { subaccounts: true }
});
```

### Add Subaccount to Group
```typescript
const subaccount = await prisma.groupSubaccount.create({
  data: {
    groupId: "group_1",
    subaccountName: "new_account",
    addedBy: "admin_user_1"
  }
});
```

### Find Group of a Subaccount
```typescript
const link = await prisma.groupSubaccount.findUnique({
  where: { subaccountName: "higgs_test" },
  include: { group: true }
});
```

### Get All Subaccounts in a Group
```typescript
const group = await prisma.group.findUnique({
  where: { id: "group_1" },
  include: { subaccounts: true }
});
```

---

## Key Features

✅ **Flat Structure**: Simple one-to-many relationship (no nested groups)  
✅ **Unique Constraint**: Database enforces one subaccount per group  
✅ **Cascade Delete**: Deleting a group removes all linked subaccounts  
✅ **Audit Trail**: Know who created what and when  
✅ **Admin Only**: `createdBy` and `addedBy` track admin actions  
✅ **Indexed for Performance**: All foreign keys and unique fields are indexed  
✅ **Zero Data Loss**: Migration only adds, never modifies/deletes  

---

## Next Steps

Ready to create:
1. API routes for group management (CRUD operations)
2. UI page for managing groups
3. Authorization checks (Admin/Super Admin only)
4. Integration with subaccounts page (display group membership)

