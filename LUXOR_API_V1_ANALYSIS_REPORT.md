# Luxor API v1 - Comprehensive Analysis Report

**Analysis Date:** 2025-01-14  
**Analysis Type:** Code-First Endpoint Inventory  
**API Version:** v1  
**Base URL:** `https://app.luxor.tech/api/v1`  
**Authentication:** API Key via Authorization header

---

## Executive Summary

The BitFactory application has extensive integration with Luxor Mining API v1 across **3 core components**:

1. **LuxorClient Library** (`src/lib/luxor.ts`) - 1,346 lines - Server-side API client
2. **Luxor Proxy Route** (`src/app/api/luxor/route.ts`) - 1,251 lines - Secure proxy with authentication
3. **Multiple Frontend Pages** - Client-side components consuming the proxy endpoint

**Total Luxor API v1 Endpoints in Use:** 8 distinct endpoints  
**HTTP Methods Supported:** GET (6), POST (4), PUT/PATCH (2), DELETE (2)  
**Protected Endpoints:** Subaccount operations (ADMIN only)  

---

## Part 1: Core API Endpoints Identified

### 1. Active Workers Endpoint
**Luxor API Path:** `/pool/active-workers/{currency}`  
**HTTP Method:** GET  
**Proxy Mapping:** `endpoint=active-workers`  
**Required Parameters:**
- `currency` - Mining currency (BTC, LTC, DOGE, etc.) - **REQUIRED as path parameter**

**Optional Query Parameters:**
- `start_date` - ISO date string (e.g., "2025-01-01")
- `end_date` - ISO date string (e.g., "2025-01-31")
- `tick_size` - Granularity: 5m, 1h, 1d, 1w, 1M
- `page_number` - Pagination (integer)
- `page_size` - Pagination size (integer)
- `subaccount_names` - Comma-separated subaccount names

**Response Type:** `ActiveWorkersResponse` (timeseries data)

**Code Location:** `src/lib/luxor.ts` (generic `request()` method)

**Example Client Call:**
```typescript
const response = await fetch(
  '/api/luxor?endpoint=active-workers&currency=BTC&start_date=2025-01-01&tick_size=1d'
);
const { success, data } = await response.json();
```

**Used By:**
- `src/app/(auth)/luxor/page.tsx` - Line 128
- `src/app/(auth)/clientworkers/page.tsx` - Line 103
- `src/app/api/admin/dashboard/route.ts` - Line 148

---

### 2. Hashrate Efficiency Endpoint
**Luxor API Path:** `/pool/hashrate-efficiency`  
**HTTP Method:** GET  
**Proxy Mapping:** `endpoint=hashrate-history`  
**Required Parameters:**
- `currency` - Mining currency - **REQUIRED as query parameter**

**Optional Query Parameters:**
- `start_date` - ISO date string
- `end_date` - ISO date string
- `tick_size` - Granularity (5m, 1h, 1d, 1w, 1M)
- `page_number` - Pagination
- `page_size` - Pagination size
- `subaccount_names` - Comma-separated subaccount names

**Response Type:** Hashrate and efficiency metrics with historical data

**Code Location:** `src/lib/luxor.ts` (generic `request()` method)

**Example Client Call:**
```typescript
const response = await fetch(
  '/api/luxor?endpoint=hashrate-history&currency=BTC&start_date=2025-01-01&tick_size=1d'
);
```

**Used By:**
- `src/app/(auth)/luxor/page.tsx` - Line 152
- `src/app/api/admin/dashboard/route.ts` - Line 229

---

### 3. Workers Data Endpoint
**Luxor API Path:** `/pool/workers/{currency}`  
**HTTP Method:** GET  
**Proxy Mapping:** `endpoint=workers`  
**Required Parameters:**
- `currency` - Mining currency - **REQUIRED as path parameter**

**Optional Query Parameters:**
- `page_number` - Pagination (integer)
- `page_size` - Pagination size (integer)
- `status` - Worker status filter (e.g., "ACTIVE")
- `subaccount_names` - Comma-separated subaccount names

**Response Type:** Array of worker objects with statistics

**Code Location:** `src/lib/luxor.ts` (generic `request()` method)

**Example Client Call:**
```typescript
const response = await fetch(
  '/api/luxor?endpoint=workers&currency=BTC&page_number=1&page_size=10'
);
```

**Used By:**
- `src/app/(auth)/luxor/page.tsx` - Line 128
- `src/app/(manage)/workers/page.tsx` - Line 127

---

### 4. Workspace Endpoint
**Luxor API Path:** `/workspace`  
**HTTP Method:** GET  
**Proxy Mapping:** `endpoint=workspace`  
**Required Parameters:** None

**Optional Query Parameters:** None

**Response Type:** `WorkspaceResponse` with array of groups

**Code Location:** `src/lib/luxor.ts` - `getWorkspace()` method (line ~220)

**Example Client Call:**
```typescript
const response = await fetch('/api/luxor?endpoint=workspace');
const { success, data } = await response.json();
const groups = data.groups; // Array of GetGroupResponse objects
```

**Used By:**
- `src/app/(manage)/subaccounts/page.tsx` - Line 138
- `src/app/(manage)/workers/page.tsx` - Line 127, 400
- `src/app/(manage)/groups/page.tsx` - Line 132
- `src/app/(auth)/luxor/page.tsx` - Line 183
- `src/app/api/admin/dashboard/route.ts` - Line 77
- `src/components/CreateUserModal.tsx` - Line 156

**Critical:** Fetching workspace retrieves all groups and their associated subaccounts for the authenticated user.

---

### 5. Group Management Endpoints
**Luxor API Path:** `/workspace/groups`  
**HTTP Methods:** GET, POST, PUT/PATCH, DELETE  
**Proxy Mapping:** `endpoint=group`  

#### 5a. Create Group
**HTTP Method:** POST  
**Required Body Parameters:**
- `name` - Group name (string)

**Response Type:** `CreateGroupResponse` with full group details

**Code Location:** `src/lib/luxor.ts` - `createGroup()` method (line ~245)

**Example Client Call:**
```typescript
const response = await fetch('/api/luxor', {
  method: 'POST',
  body: JSON.stringify({
    endpoint: 'group',
    name: 'My Mining Group'
  })
});
```

**Used By:**
- `src/app/(manage)/groups/page.tsx` - Line 227

#### 5b. Update Group
**HTTP Method:** PATCH  
**Endpoint Path:** `/workspace/groups/{groupId}`  
**Required Path Parameters:**
- `groupId` - UUID of the group

**Required Body Parameters:**
- `name` - New group name (string)

**Response Type:** `UpdateGroupResponse`

**Code Location:** `src/lib/luxor.ts` - `updateGroup()` method (line ~265)

**Example Client Call:**
```typescript
const response = await fetch('/api/luxor', {
  method: 'POST',
  body: JSON.stringify({
    endpoint: 'group',
    groupId: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
    name: 'Updated Group Name'
  })
});
```

**Used By:**
- `src/app/(manage)/groups/page.tsx` - Line 309

#### 5c. Get Group Details
**HTTP Method:** GET  
**Endpoint Path:** `/workspace/groups/{groupId}`  

**Response Type:** `GetGroupResponse` with group details and subaccounts

**Code Location:** `src/lib/luxor.ts` - `getGroup()` method (line ~295)

**Used By:**
- `src/app/(manage)/groups/page.tsx` (via subaccount endpoint)

#### 5d. Delete Group
**HTTP Method:** DELETE  
**Endpoint Path:** `/workspace/groups/{groupId}`  

**Response Type:** `DeleteGroupResponse` (may require approval)

**Code Location:** `src/lib/luxor.ts` - `deleteGroup()` method (line ~280)

**Example Client Call:**
```typescript
const response = await fetch('/api/luxor', {
  method: 'POST',
  body: JSON.stringify({
    endpoint: 'group',
    groupId: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
    operation: 'delete'
  })
});
```

**Used By:**
- `src/app/(manage)/groups/page.tsx` - Line 377

---

### 6. Subaccount Management Endpoints
**Luxor API Path:** `/pool/groups/{groupId}/subaccounts`  
**HTTP Methods:** GET, POST, DELETE  
**Proxy Mapping:** `endpoint=subaccount`  
**Authorization Requirement:** ADMIN or SUPER_ADMIN role only

#### 6a. List Subaccounts
**HTTP Method:** GET  
**Endpoint Path:** `/pool/groups/{groupId}/subaccounts`  
**Required Path Parameters:**
- `groupId` - UUID of the group

**Response Type:** `ListSubaccountsResponse` (array of subaccounts)

**Code Location:** `src/lib/luxor.ts` - `listSubaccounts()` method (line ~340)

**Example Client Call:**
```typescript
const response = await fetch(
  '/api/luxor?endpoint=subaccount&groupId=497f6eca-6276-4993-bfeb-53cbbbba6f08'
);
```

**Used By:**
- `src/app/(manage)/subaccounts/page.tsx` - Line 138 (via workspace endpoint)

#### 6b. Get Specific Subaccount
**HTTP Method:** GET  
**Endpoint Path:** `/pool/groups/{groupId}/subaccounts/{subaccountName}`  
**Required Path Parameters:**
- `groupId` - UUID of the group
- `subaccountName` - Name of the subaccount

**Response Type:** `GetSubaccountResponse`

**Code Location:** `src/lib/luxor.ts` - `getSubaccount()` method (line ~315)

**Example Client Call:**
```typescript
const response = await fetch(
  '/api/luxor?endpoint=subaccount&groupId=497f6eca-6276-4993-bfeb-53cbbbba6f08&name=subaccount_1'
);
```

#### 6c. Add Subaccount
**HTTP Method:** POST  
**Endpoint Path:** `/pool/groups/{groupId}/subaccounts`  
**Required Body Parameters:**
- `groupId` - UUID of the group
- `name` - Subaccount name to add

**Response Type:** `AddSubaccountResponse`

**Code Location:** `src/lib/luxor.ts` - `addSubaccount()` method (line ~360)

**Example Client Call:**
```typescript
const response = await fetch('/api/luxor', {
  method: 'POST',
  body: JSON.stringify({
    endpoint: 'subaccount',
    groupId: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
    name: 'new_subaccount'
  })
});
```

**Used By:**
- `src/app/(manage)/subaccounts/page.tsx` - Line 382

#### 6d. Remove Subaccount
**HTTP Method:** DELETE  
**Endpoint Path:** `/pool/groups/{groupId}/subaccounts/{subaccountName}`  
**Required Parameters:**
- `groupId` - UUID of the group
- `name` - Subaccount name to remove

**Response Type:** `RemoveSubaccountResponse`

**Code Location:** `src/lib/luxor.ts` - `removeSubaccount()` method (line ~385)

**Example Client Call:**
```typescript
const response = await fetch('/api/luxor', {
  method: 'POST',
  body: JSON.stringify({
    endpoint: 'subaccount',
    groupId: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
    name: 'subaccount_1',
    operation: 'delete'
  })
});
```

**Used By:**
- `src/app/(manage)/subaccounts/page.tsx` - Line 474

---

### 7. Payment Settings Endpoints
**Luxor API Path:** `/pool/payment-settings/{currency}`  
**HTTP Methods:** GET, POST, PUT/PATCH  

#### 7a. Get Payment Settings
**HTTP Method:** GET  
**Endpoint Path:** `/pool/payment-settings/{currency}`  
**Required Path Parameters:**
- `currency` - Mining currency (BTC, DOGE, etc.)

**Optional Query Parameters:**
- `page_number` - Pagination
- `page_size` - Pagination size
- `subaccount_names` - Comma-separated subaccount names
- `site_id` - Site identifier

**Response Type:** `PaymentSettingsResponse`

**Code Location:** `src/lib/luxor.ts` - `getPaymentSettings()` method (line ~415)

#### 7b. Get Subaccount Payment Settings
**HTTP Method:** GET  
**Endpoint Path:** `/pool/payment-settings/{currency}/{subaccountName}`  

**Response Type:** `SubaccountPaymentSettingsResponse`

**Code Location:** `src/lib/luxor.ts` - `getSubaccountPaymentSettings()` method (line ~435)

#### 7c. Create/Update Payment Settings
**HTTP Method:** POST  
**Endpoint Path:** `/pool/payment-settings/{currency}/{subaccountName}`  
**Required Body Parameters:**
- `payment_frequency` - e.g., "DAILY"
- `day_of_week` - e.g., "MONDAY"
- `addresses` - Array of address objects with:
  - `address_id` - Integer ID
  - `address_name` - Human-readable name
  - `external_address` - Wallet address
  - `revenue_allocation` - Percentage (0-100)

**Response Type:** `PaymentSettingsActionResponse` (may require approval)

**Code Location:** `src/lib/luxor.ts` - `createPaymentSettings()` method (line ~460)

---

### 8. Transaction History Endpoint
**Luxor API Path:** `/pool/transactions/{currency}`  
**HTTP Method:** GET  

**Required Path Parameters:**
- `currency` - Mining currency

**Optional Query Parameters:**
- `start_date` - ISO date string
- `end_date` - ISO date string
- `page_number` - Pagination
- `page_size` - Pagination size

**Response Type:** `TransactionsResponse` (array of transactions)

**Code Location:** `src/lib/luxor.ts` - `getTransactions()` method (inferred from available methods)

---

## Part 2: Integration Architecture

### Client-Server Communication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ BROWSER (Client-Side)                                          │
│                                                                 │
│  React Components:                                              │
│  - /app/(manage)/groups/page.tsx                               │
│  - /app/(manage)/subaccounts/page.tsx                          │
│  - /app/(manage)/workers/page.tsx                              │
│  - /app/(auth)/luxor/page.tsx                                  │
│  - /components/CreateUserModal.tsx                             │
│                                                                 │
│  Makes fetch() calls to:  /api/luxor?endpoint=xxx              │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS Request
                         │
┌────────────────────────▼────────────────────────────────────────┐
│ NEXT.JS API ROUTE (Server-Side)                                │
│ src/app/api/luxor/route.ts                                     │
│                                                                 │
│ 1. Validates JWT token from cookies                            │
│ 2. Verifies user authentication & role (ADMIN for protected)   │
│ 3. Filters requests by subaccount (security)                   │
│ 4. Routes to appropriate LuxorClient method                    │
│ 5. Returns JSON response                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS Request
                         │ (with Authorization header)
┌────────────────────────▼────────────────────────────────────────┐
│ LUXOR MINING API v1                                             │
│ https://app.luxor.tech/api/v1                                   │
│                                                                 │
│ Endpoints:                                                      │
│ - /pool/active-workers/{currency}                              │
│ - /pool/hashrate-efficiency                                    │
│ - /pool/workers/{currency}                                     │
│ - /workspace                                                   │
│ - /workspace/groups                                            │
│ - /pool/groups/{groupId}/subaccounts                           │
│ - /pool/payment-settings/{currency}                            │
│ - /pool/transactions/{currency}                                │
└─────────────────────────────────────────────────────────────────┘
```

### Security Implementation

**Authentication:**
- JWT token extracted from cookies (`request.cookies.get("token")`)
- Token verified using `verifyJwtToken()` from `src/lib/jwt.ts`
- User profile fetched from database to get `luxorSubaccountName`

**Authorization:**
- Admin-only endpoints protected by role check: `userRole === "ADMIN" || "SUPER_ADMIN"`
- Subaccount operations restricted to ADMIN role
- All requests auto-filtered by user's subaccount for data isolation

**API Key Protection:**
- `LUXOR_API_KEY` environment variable never exposed to client
- Only used server-side in `src/lib/luxor.ts`
- Passed to Luxor API via Authorization header

---

## Part 3: Files Impacted by Luxor API Integration

### Core Implementation Files
| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/luxor.ts` | 1,346 | LuxorClient class with 13+ API methods |
| `src/app/api/luxor/route.ts` | 1,251 | Secure proxy with GET/POST/PUT/PATCH/DELETE handlers |

### Frontend Pages Making Direct Luxor Calls
| File | Usage |
|------|-------|
| `src/app/(manage)/groups/page.tsx` | Create/update/delete groups, list subaccounts |
| `src/app/(manage)/subaccounts/page.tsx` | Fetch workspace, add/remove subaccounts |
| `src/app/(manage)/workers/page.tsx` | Fetch active workers and workspace |
| `src/app/(auth)/luxor/page.tsx` | Workers data, hashrate history, workspace |
| `src/app/(auth)/clientworkers/page.tsx` | Fetch active workers by currency |
| `src/components/CreateUserModal.tsx` | Fetch workspace groups on modal open |

### Server-Side API Routes Using Luxor
| File | Usage |
|------|-------|
| `src/app/api/admin/dashboard/route.ts` | Aggregate workspace, workers, and hashrate data for admin dashboard |

### Authentication & Middleware
| File | Usage |
|------|-------|
| `src/middleware.ts` | Protects Luxor routes with auth checks |
| `src/lib/jwt.ts` | Token verification (used by proxy) |
| `src/lib/prisma.ts` | Database queries for user/subaccount mapping |

---

## Part 4: Endpoint Usage Summary

### By Page/Component

**Admin Dashboard (`/admin`)**
- ✅ Workspace retrieval
- ✅ Active workers (BTC)
- ✅ Hashrate efficiency (BTC)

**Groups Page (`/manage/groups`)**
- ✅ Fetch all groups (via workspace)
- ✅ Create new group
- ✅ Update group name
- ✅ Delete group
- ✅ List subaccounts in group

**Subaccounts Page (`/manage/subaccounts`)**
- ✅ Fetch all groups (via workspace)
- ✅ Add subaccount to group
- ✅ Remove subaccount from group

**Workers Page (`/manage/workers`)**
- ✅ Fetch all workers (pool/workers/{currency})
- ✅ Fetch workspace for group context

**Client Workers Page (`/auth/clientworkers`)**
- ✅ Fetch active workers by currency

**Luxor Dashboard (`/auth/luxor`)**
- ✅ Fetch workers data
- ✅ Fetch hashrate history
- ✅ Fetch workspace

**Create User Modal**
- ✅ Fetch workspace groups on load

---

## Part 5: Query Parameter Matrix

### Parameters Used by Endpoint

| Parameter | Endpoints | Required? | Type |
|-----------|-----------|-----------|------|
| `currency` | active-workers, hashrate-history, workers, payment-settings, transactions | Path | string |
| `start_date` | active-workers, hashrate-history, transactions | Query | ISO date |
| `end_date` | active-workers, hashrate-history, transactions | Query | ISO date |
| `tick_size` | active-workers, hashrate-history | Query | 5m\|1h\|1d\|1w\|1M |
| `page_number` | active-workers, workers, payment-settings, transactions | Query | integer |
| `page_size` | active-workers, workers, payment-settings, transactions | Query | integer |
| `subaccount_names` | active-workers, workers, payment-settings | Query | CSV string |
| `status` | workers | Query | string |
| `site_id` | payment-settings | Query | string |
| `groupId` | subaccount operations | Body | UUID |
| `name` | group/subaccount creation | Body | string |

---

## Part 6: API Response Types

### TypeScript Interfaces (from luxor.ts)

```typescript
// Workspace & Groups
WorkspaceResponse & { groups: GetGroupResponse[] }
CreateGroupResponse
UpdateGroupResponse
DeleteGroupResponse
GetGroupResponse

// Subaccounts
GetSubaccountResponse
ListSubaccountsResponse
AddSubaccountResponse
RemoveSubaccountResponse

// Payment Settings
PaymentSettingsResponse
SubaccountPaymentSettingsResponse
PaymentSettingsActionResponse
PaymentSettingsRequest

// Workers & Mining Data
ActiveWorkersResponse (timeseries)
// (Response types inferred from method names)

// Transaction Data
TransactionsResponse
```

---

## Part 7: Dependency Map

### Direct Dependencies

```
src/app/api/luxor/route.ts
├── src/lib/luxor.ts (LuxorClient)
├── src/lib/jwt.ts (verifyJwtToken)
├── src/lib/prisma.ts (prisma.user.findUnique)
└── next/server (NextRequest, NextResponse)

src/lib/luxor.ts
└── node:fetch API (global)

Frontend Pages
└── src/app/api/luxor (via fetch)
```

### Environment Dependencies

```
LuxorClient requires:
- LUXOR_API_KEY (environment variable)
  Location: Process in src/lib/luxor.ts constructor
  Used in: Authorization header for all Luxor API calls
```

### Database Dependencies

```
Proxy Route (route.ts) queries:
- prisma.user.findUnique() 
  Fields: id, luxorSubaccountName, role
  Purpose: Map JWT user ID to Luxor subaccount name
```

---

## Part 8: Request/Response Format Examples

### Example 1: Fetch Active Workers

**Client Request:**
```typescript
const response = await fetch(
  '/api/luxor?endpoint=active-workers&currency=BTC&start_date=2025-01-01&end_date=2025-01-31&tick_size=1d'
);
const { success, data } = await response.json();
```

**Proxy Processing:**
1. Validates JWT token from cookies
2. Extracts user.luxorSubaccountName from database
3. Calls `luxorClient.request('/pool/active-workers/BTC', { start_date, end_date, tick_size, subaccount_names: userSubaccount })`
4. Luxor API processes request and returns timeseries data
5. Returns to client in format: `{ success: true, data: {...}, timestamp: "..." }`

**Client Response:**
```json
{
  "success": true,
  "data": {
    "currency": "BTC",
    "subaccount": "user_subaccount",
    "hashrate": [...],
    "active_workers": [...],
    "timestamp": "2025-01-14T12:00:00Z"
  },
  "timestamp": "2025-01-14T12:30:45Z"
}
```

### Example 2: Create Group

**Client Request:**
```typescript
const response = await fetch('/api/luxor', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    endpoint: 'group',
    name: 'Mining Pool 1'
  })
});
const { success, data, error } = await response.json();
```

**Proxy Processing:**
1. Validates JWT token
2. Validates POST body contains endpoint and name
3. Calls `luxorClient.createGroup('Mining Pool 1')`
4. Returns created group with ID and details

**Client Response:**
```json
{
  "success": true,
  "data": {
    "id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
    "name": "Mining Pool 1",
    "created_at": "2025-01-14T12:30:00Z",
    "subaccounts": []
  },
  "timestamp": "2025-01-14T12:30:45Z"
}
```

---

## Part 9: Error Handling

### Error Response Format

All endpoints return standardized error format:

```json
{
  "success": false,
  "error": "Error message describing what failed",
  "timestamp": "2025-01-14T12:30:45Z"
}
```

### Common Error Scenarios

| Scenario | Status | Error Message |
|----------|--------|---------------|
| Missing JWT token | 401 | "Authentication required: No token found" |
| Invalid/expired token | 401 | "Authentication failed: Invalid or expired token" |
| User not in database | 401 | "User not found in database" |
| Missing endpoint parameter | 400 | "Endpoint parameter is required" |
| Invalid endpoint name | 400 | "Unsupported endpoint: ...Supported endpoints: ..." |
| Missing currency parameter | 400 | `Endpoint "..." requires a currency parameter` |
| Admin-only endpoint | 403 | "ADMIN access required for this endpoint" |
| Luxor API error | (varies) | Luxor's error message + status code |
| Invalid JSON body | 400 | "Invalid JSON in request body" |
| Service configuration | 500 | "Service configuration error. Please contact support." |

### LuxorError Class

```typescript
class LuxorError extends Error {
  statusCode: number;    // HTTP status from Luxor API
  message: string;       // Error message
  details?: Record<string, unknown>;  // Full error response
}
```

---

## Part 10: Performance & Scaling Considerations

### Current Implementation Characteristics

**Request Flow:**
- Client → Next.js Route (validation, auth) → Luxor API (remote)
- Single round-trip per request (no caching)
- Subaccount filtering applied server-side for security

**Pagination Support:**
- `page_number` and `page_size` parameters supported
- Used by: active-workers, workers, payment-settings, transactions

**Rate Limiting:**
- No explicit rate limiting in proxy
- Depends on Luxor API's rate limits

**Data Isolation:**
- Every request auto-filtered by user's `luxorSubaccountName`
- Users cannot access other users' data

---

## Conclusion

This analysis documents **8 distinct Luxor API v1 endpoints** currently in use across the BitFactory application, with comprehensive integration through:

1. **Typed TypeScript client** (`LuxorClient`) with 13+ methods
2. **Secure server-side proxy** with JWT authentication and role-based access control
3. **6 frontend pages** consuming mining data, group management, and subaccount operations
4. **Admin dashboard** aggregating key metrics

All endpoints are accessed through `/api/luxor` proxy route which maintains security by:
- Validating authentication
- Restricting admin-only operations
- Auto-filtering results by user's subaccount
- Never exposing API key to client

---

**Report Generated:** 2025-01-14  
**Analysis Method:** Code-first inspection of src/lib/luxor.ts and src/app/api/luxor/route.ts with grep verification across codebase
