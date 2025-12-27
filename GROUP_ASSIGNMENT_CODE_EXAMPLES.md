# Group Assignment - Code Examples & Reference

## Frontend Form Integration

### CreateUserModal.tsx - Group Selection UI
```tsx
// State for groups
const [fetchingGroups, setFetchingGroups] = useState(true);
const [groups, setGroups] = useState<Group[]>([]);

// Form data includes groupId
const [formData, setFormData] = useState({
  name: "",
  email: "",
  role: "CLIENT",
  luxorSubaccountName: "",
  groupId: "", // ← NEW field
});

// Fetch groups on modal open
useEffect(() => {
  if (open) {
    fetchGroups();
  }
}, [open]);

// Fetch active groups from API
const fetchGroups = async () => {
  try {
    setFetchingGroups(true);
    const response = await fetch("/api/groups");
    const data = await response.json();
    
    if (data.success) {
      const activeGroups = data.data.filter((g: Group) => g.isActive);
      setGroups(activeGroups);
    }
  } catch (err) {
    console.error("Error fetching groups:", err);
  } finally {
    setFetchingGroups(false);
  }
};

// Group Selection in form
<FormControl fullWidth disabled={fetchingGroups}>
  <InputLabel>Group (Optional)</InputLabel>
  <Select
    value={formData.groupId || ""}
    onChange={(e) =>
      setFormData((prev) => ({
        ...prev,
        groupId: e.target.value,
      }))
    }
    label="Group (Optional)"
  >
    <MenuItem value="">No Group</MenuItem>
    {groups.map((group) => (
      <MenuItem key={group.id} value={group.id}>
        {group.name}
      </MenuItem>
    ))}
  </Select>
</FormControl>

// Form submission includes groupId
const response = await fetch("/api/user/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(formData), // ← Includes groupId
});
```

### EditCustomerModal.tsx - Same Pattern
```tsx
// Identical to CreateUserModal pattern:
// 1. State for groups and groupId in formData
// 2. useEffect calling fetchGroups()
// 3. Group Selection dropdown in form
// 4. Form submission includes groupId

// But with initialData:
const [formData, setFormData] = useState({
  name: initialData.name || "",
  email: initialData.email || "",
  luxorSubaccountName: initialData.luxorSubaccountName || "",
  groupId: initialData.groupId || "", // ← Pre-populate if exists
  // ...other fields
});

// Submit with updated groupId
const response = await fetch(`/api/user/${customerId}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    ...formData,
    groupId: formData.groupId || null, // ← Include groupId
  }),
});
```

## Backend API Implementation

### POST /api/user/create - Create User with Group

```typescript
export async function POST(request: NextRequest) {
  try {
    // 1. Verify JWT token
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    
    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;
    
    // 2. Extract request body (NEW: includes groupId)
    const {
      name,
      email,
      role,
      luxorSubaccountName,
      groupId, // ← NEW parameter
    } = await request.json();
    
    // 3. Create user record
    const newUser = await prisma.user.create({
      data: { name, email, password: hashedPassword, role },
    });
    
    // 4. Assign luxor subaccount
    if (role === "CLIENT" && luxorSubaccountName) {
      await prisma.user.update({
        where: { id: newUser.id },
        data: { luxorSubaccountName: luxorSubaccountName.trim() },
      });
    }
    
    // 5. [NEW] Create group assignment if provided
    if (role === "CLIENT" && groupId && luxorSubaccountName) {
      try {
        await prisma.groupSubaccount.create({
          data: {
            groupId: groupId,
            subaccountName: luxorSubaccountName.trim(),
            addedBy: userId, // Admin who created the user
          },
        });
        console.log(`Subaccount "${luxorSubaccountName}" added to group "${groupId}"`);
      } catch (groupError) {
        console.error("Failed to add subaccount to group:", groupError);
        // Don't fail user creation if group assignment fails
      }
    }
    
    return NextResponse.json({
      message: "User created successfully",
      user: newUser,
    });
    
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
```

### PUT /api/user/[id] - Update User with Group Management

```typescript
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // 1. Verify JWT token
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    
    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;
    
    // 2. Check authorization (must be admin/super-admin)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({error: "Forbidden"}, {status: 403});
    }
    
    // 3. Extract request body (NEW: includes groupId)
    const body = await request.json();
    
    // 4. Get current user info
    const currentUser = await prisma.user.findUnique({
      where: { id },
      select: { luxorSubaccountName: true, role: true },
    });
    
    // 5. Update user record
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        email: body.email,
        // ... other fields
        luxorSubaccountName: body.luxorSubaccountName !== undefined
          ? body.luxorSubaccountName
          : undefined,
      },
    });
    
    // 6. [NEW] Handle group assignment changes
    const subaccountName =
      body.luxorSubaccountName !== undefined
        ? body.luxorSubaccountName
        : currentUser?.luxorSubaccountName;
    
    if (body.groupId && subaccountName && currentUser?.role === "CLIENT") {
      try {
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
              addedBy: userId, // Admin who made the update
            },
          });
          console.log(`Subaccount moved to group "${body.groupId}"`);
        } else {
          console.log(`Subaccount removed from all groups`);
        }
      } catch (groupError) {
        console.error("Failed to update group assignment:", groupError);
        // Log error but don't fail the user update
      }
    }
    
    return NextResponse.json({
      message: "User updated successfully",
      user: updatedUser,
    });
    
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
```

## Database Query Examples

### Check if subaccount is in a group
```sql
SELECT 
  g.id,
  g.name,
  gs.subaccountName,
  gs.addedAt,
  u.name as addedBy
FROM group_subaccounts gs
JOIN groups g ON gs.groupId = g.id
JOIN users u ON gs.addedBy = u.id
WHERE gs.subaccountName = 'subaccount_1';
```

### Find all subaccounts in a group
```sql
SELECT 
  gs.subaccountName,
  gs.addedAt,
  u.name as addedBy
FROM group_subaccounts gs
JOIN users u ON gs.addedBy = u.id
WHERE gs.groupId = 'group_123'
ORDER BY gs.addedAt DESC;
```

### Find user's group assignment
```sql
SELECT 
  u.id,
  u.name,
  u.luxorSubaccountName,
  g.id as group_id,
  g.name as group_name
FROM users u
LEFT JOIN group_subaccounts gs ON u.luxorSubaccountName = gs.subaccountName
LEFT JOIN groups g ON gs.groupId = g.id
WHERE u.id = 'user_123';
```

### Get subaccount assignment history
```sql
SELECT 
  gs.id,
  gs.groupId,
  g.name as group_name,
  gs.subaccountName,
  gs.addedAt,
  u.name as assignedBy
FROM group_subaccounts gs
LEFT JOIN groups g ON gs.groupId = g.id
JOIN users u ON gs.addedBy = u.id
WHERE gs.subaccountName = 'subaccount_1'
ORDER BY gs.addedAt DESC;
```

## Type Definitions

### Frontend Group Interface
```typescript
interface Group {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  creator: {
    id: string;
    name: string;
    email: string;
  };
  _count?: {
    subaccounts: number;
  };
}

interface CreateUserFormData {
  name: string;
  email: string;
  role: "CLIENT" | "ADMIN" | "SUPER_ADMIN";
  luxorSubaccountName: string;
  groupId: string; // ← NEW
  // ... other fields
}

interface EditCustomerFormData {
  name: string;
  email: string;
  luxorSubaccountName: string;
  groupId?: string; // ← NEW, optional for pre-filled data
  // ... other fields
}
```

### Prisma Models Reference
```typescript
// User model
model User {
  id: string;
  email: string;
  name: string;
  luxorSubaccountName: string; // Links to GroupSubaccount via subaccountName
  // ... other fields
}

// Group model
model Group {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  subaccounts: GroupSubaccount[];
  createdBy: string;
  // ... other fields
}

// GroupSubaccount model
model GroupSubaccount {
  id: string;
  groupId: string; // Foreign key to Group
  subaccountName: string; // Links to User.luxorSubaccountName
  group: Group;
  addedAt: DateTime;
  addedBy: string; // Admin user ID who added this
}
```

## Error Handling Examples

### Handling Missing Subaccount
```typescript
if (role === "CLIENT" && !luxorSubaccountName) {
  return NextResponse.json(
    { error: "A Luxor subaccount must be selected for CLIENT users" },
    { status: 400 }
  );
}
```

### Graceful Group Assignment Failure
```typescript
try {
  // Group assignment logic
} catch (groupError) {
  console.error("Failed to update group assignment:", groupError);
  // Don't throw - let user creation/update succeed
  // Group assignment is non-critical
}
```

### Validation for Group Change
```typescript
// Ensure subaccount exists before trying to change its group
if (body.groupId && subaccountName) {
  // Only proceed if both groupId and subaccountName are provided
}

// Ensure old entry is removed before new one is created
await prisma.groupSubaccount.deleteMany({
  where: { subaccountName: subaccountName.trim() },
});
// Then create new entry with new groupId
```

## Testing Code Snippets

### Jest Test Example
```typescript
describe("User Group Assignment", () => {
  it("should create GroupSubaccount entry when creating user with group", async () => {
    const response = await fetch("/api/user/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "John",
        email: "john@example.com",
        role: "CLIENT",
        luxorSubaccountName: "subaccount_1",
        groupId: "group_123",
      }),
    });
    
    expect(response.ok).toBe(true);
    
    // Verify GroupSubaccount was created
    const groupSubaccount = await prisma.groupSubaccount.findUnique({
      where: { subaccountName: "subaccount_1" },
    });
    
    expect(groupSubaccount).toBeDefined();
    expect(groupSubaccount.groupId).toBe("group_123");
  });
  
  it("should move subaccount to new group on user update", async () => {
    const response = await fetch("/api/user/user_123", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        luxorSubaccountName: "subaccount_1",
        groupId: "group_456", // Change to different group
      }),
    });
    
    expect(response.ok).toBe(true);
    
    // Verify GroupSubaccount points to new group
    const groupSubaccount = await prisma.groupSubaccount.findUnique({
      where: { subaccountName: "subaccount_1" },
    });
    
    expect(groupSubaccount.groupId).toBe("group_456");
  });
});
```

## Curl Command Examples

### Create user with group
```bash
curl -X POST http://localhost:3000/api/user/create \
  -H "Content-Type: application/json" \
  -b "token=<JWT_TOKEN>" \
  -d '{
    "name": "John",
    "email": "john@example.com",
    "role": "CLIENT",
    "luxorSubaccountName": "subaccount_1",
    "groupId": "group_123"
  }'
```

### Update user to change group
```bash
curl -X PUT http://localhost:3000/api/user/user_id \
  -H "Content-Type: application/json" \
  -b "token=<JWT_TOKEN>" \
  -d '{
    "groupId": "group_456"
  }'
```

### Remove user from group
```bash
curl -X PUT http://localhost:3000/api/user/user_id \
  -H "Content-Type: application/json" \
  -b "token=<JWT_TOKEN>" \
  -d '{
    "groupId": null
  }'
```
