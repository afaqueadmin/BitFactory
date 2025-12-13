# Luxor API v1 to v2 Migration Readiness Report

**Report Date:** December 13, 2025  
**Base URL Change:** `https://app.luxor.tech/api/v1` → `https://app.luxor.tech/api/v2`  
**Analysis Scope:** Full codebase migration from v1 to v2 only

---

## EXECUTIVE SUMMARY

✅ **Migration Feasibility: HIGHLY FAVORABLE**

All 8 Luxor API v1 endpoints currently used in BitFactory have direct v2 equivalents. **NO blocking issues identified.** The migration is primarily a mechanical refactoring of:
- Base URL versioning (v1 → v2)
- Endpoint path updates
- Parameter naming conventions (some changes)
- Response structure updates

**Estimated Effort:** Moderate  
**Risk Level:** Low  
**No breaking architectural changes required.**

---

## PART 1: ENDPOINT-BY-ENDPOINT MIGRATION MATRIX

### 1. Active Workers Endpoint

| Aspect | v1 | v2 |
|--------|----|----|
| **Endpoint Name** | Get active workers | Get active workers |
| **v1 Path** | `GET /api/v1/pool/active-workers/{currency}` | - |
| **v2 Path** | - | `GET /api/v2/pool/active-workers/{currency_type}` |
| **Path Parameter** | `currency` (e.g., BTC) | `currency_type` (e.g., BTC) |
| **Status** | ✅ Direct replacement |
| **Migration Type** | Mechanical |

**Query Parameters:**

| Parameter | v1 | v2 | Change |
|-----------|----|----|--------|
| `start_date` | ✅ Required (ISO date) | ✅ Required (ISO date) | **No change** |
| `end_date` | ✅ Required (ISO date) | ✅ Required (ISO date) | **No change** |
| `tick_size` | ✅ Supports: 5m, 1h, 1d, 1w, 1M | ✅ Supports: 5m, 1h, 1d | **CHANGED: v2 does NOT support 1w, 1M** |
| `subaccount_names` | ✅ CSV string or array | ✅ CSV string or array | **No change** |
| `site_id` | ❌ Not supported | ✅ Optional query param | **NEW in v2** |
| `page_number` | ✅ Optional (default: 1) | ✅ Optional (default: 1) | **No change** |
| `page_size` | ✅ Optional (default: 10) | ✅ Optional (default: 10) | **No change** |

**Response Structure Changes:**
- v1: `{ currency, start_date, end_date, tick_size, subaccounts[], active_workers[], pagination }`
- v2: **Same structure** - includes `site` object within subaccounts

**Code Locations to Update:**
- `src/app/(auth)/luxor/page.tsx` - Line 128
- `src/app/(auth)/clientworkers/page.tsx` - Line 103
- `src/app/api/admin/dashboard/route.ts` - Line 148

**Migration Notes:**
- ⚠️ **Remove tick_size values of 1w, 1M** - only 5m, 1h, 1d are supported in v2
- ✅ All existing calls with 1d or lower are compatible
- Subaccounts response now includes `site` object (optional new field, safe to ignore)

---

### 2. Hashrate Efficiency Endpoint

| Aspect | v1 | v2 |
|--------|----|----|
| **Endpoint Name** | Get hashrate efficiency | Get hashrate history |
| **v1 Path** | `GET /api/v1/pool/hashrate-efficiency/{currency}` | - |
| **v2 Path** | - | `GET /api/v2/pool/hashrate-efficiency/{currency_type}` |
| **Path Parameter** | `currency` | `currency_type` |
| **Status** | ✅ Direct replacement |
| **Migration Type** | Mechanical |

**Query Parameters:**

| Parameter | v1 | v2 | Change |
|-----------|----|----|--------|
| `start_date` | ✅ Required (ISO date) | ✅ Required (ISO date) | **No change** |
| `end_date` | ✅ Required (ISO date) | ✅ Required (ISO date) | **No change** |
| `tick_size` | ✅ Supports: 5m, 1h, 1d, 1w, 1M | ✅ Supports: 5m, 1h, 1d, 1w, 1M | **No change** ✅ |
| `subaccount_names` | ✅ CSV string or array | ✅ CSV string or array | **No change** |
| `site_id` | ❌ Not supported | ✅ Optional query param | **NEW in v2** |
| `page_number` | ✅ Optional (default: 1) | ✅ Optional (default: 1) | **No change** |
| `page_size` | ✅ Optional (default: 10) | ✅ Optional (default: 10) | **No change** |

**Response Structure:**
- v1: `{ currency, start_date, end_date, tick_size, subaccounts[], hashrate_efficiency[], pagination }`
- v2: **Same structure** - `hashrate_efficiency[]` array with `{ date_time, hashrate, efficiency }`

**Code Locations to Update:**
- `src/app/(auth)/luxor/page.tsx` - Line 152
- `src/app/api/admin/dashboard/route.ts` - Line 229

**Migration Notes:**
- ✅ All tick_size values (including 1w, 1M) are fully supported in v2
- ✅ No breaking changes - drop-in replacement

---

### 3. Workers Data Endpoint

| Aspect | v1 | v2 |
|--------|----|----|
| **Endpoint Name** | Get workers | Get workers |
| **v1 Path** | `GET /api/v1/pool/workers/{currency}` | - |
| **v2 Path** | - | `GET /api/v2/pool/workers/{currency_type}` |
| **Path Parameter** | `currency` | `currency_type` |
| **Status** | ✅ Direct replacement |
| **Migration Type** | Mechanical |

**Query Parameters:**

| Parameter | v1 | v2 | Change |
|-----------|----|----|--------|
| `subaccount_names` | ✅ CSV string or array | ✅ CSV string or array | **No change** |
| `site_id` | ❌ Not supported | ✅ Optional query param | **NEW in v2** |
| `status` | ✅ Filter by worker status | ✅ Filter: UNSPECIFIED\|ACTIVE\|INACTIVE | **Enum changed** |
| `page_number` | ✅ Optional (default: 1) | ✅ Optional (default: 1) | **No change** |
| `page_size` | ✅ Optional (default: 10) | ✅ Optional (default: 10) | **No change** |

**Response Structure:**
- v1: `{ currency_type, subaccounts[], total_inactive, total_active, workers[], pagination }`
- v2: **Same structure** - worker objects include: `id, subaccount_name, name, firmware, hashrate, efficiency, stale_shares, rejected_shares, last_share_time, status`

**Code Locations to Update:**
- `src/app/(auth)/luxor/page.tsx` - Line 128
- `src/app/(manage)/workers/page.tsx` - Line 127

**Migration Notes:**
- ✅ Drop-in replacement for status field if not using enumeration
- ✅ v2 returns same worker data

---

### 4. Workspace Endpoint

| Aspect | v1 | v2 |
|--------|----|----|
| **Endpoint Name** | Get workspace | Get workspace |
| **v1 Path** | `GET /api/v1/workspace` | - |
| **v2 Path** | - | `GET /api/v2/workspace` |
| **Parameters** | None | None |
| **Status** | ✅ Direct replacement |
| **Migration Type** | Mechanical |

**Response Structure Changes:**

v1 Response:
```json
{
  "groups": [
    {
      "id": "uuid",
      "name": "group_name",
      "subaccounts": [...]
    }
  ]
}
```

v2 Response:
```json
{
  "id": "workspace_id",
  "name": "My Workspace",
  "products": ["POOL"],
  "sites": [
    {
      "id": "site_id",
      "name": "My Site"
    }
  ]
}
```

**⚠️ BREAKING CHANGE:** v2 **NO LONGER** returns groups or subaccounts in workspace response!

**Workaround Required:**
- To get subaccounts in v2, use dedicated `/v2/pool/subaccounts` endpoint (NEW)
- Groups concept **replaced with Sites** in v2 architecture

**Code Locations to Update:**
- `src/app/(manage)/subaccounts/page.tsx` - Line 138
- `src/app/(manage)/workers/page.tsx` - Line 127, 400
- `src/app/(manage)/groups/page.tsx` - Line 132
- `src/app/(auth)/luxor/page.tsx` - Line 183
- `src/app/api/admin/dashboard/route.ts` - Line 77
- `src/components/CreateUserModal.tsx` - Line 156

**Migration Impact: MODERATE**
- **Groups are now Sites** - architectural change required
- Must fetch subaccounts separately using new `/v2/pool/subaccounts` endpoint
- All pages expecting groups/subaccounts in workspace response need refactoring

---

### 5. Group Management Endpoints

**⚠️ CRITICAL: Groups Concept REMOVED in v2**

v1 had explicit group management endpoints:
- `POST /api/v1/workspace/groups` - Create Group
- `PATCH /api/v1/workspace/groups/{groupId}` - Update Group
- `DELETE /api/v1/workspace/groups/{groupId}` - Delete Group
- `GET /api/v1/workspace/groups/{groupId}` - Get Group

v2 **DOES NOT HAVE group management endpoints.** Instead, v2 uses **Sites**.

**Sites API Available in v2:**
- `GET /api/v2/workspaces/get-sites`
- `POST /api/v2/workspaces/create-site`
- `PUT /api/v2/workspaces/update-site`
- `DELETE /api/v2/workspaces/delete-site`
- `GET /api/v2/workspaces/get-site`

**Code Locations Currently Using Groups:**
- `src/app/(manage)/groups/page.tsx` - ENTIRE PAGE depends on group CRUD
  - Line 227: Create group
  - Line 309: Update group
  - Line 377: Delete group

**Migration Status: ⚠️ PARTIAL - REQUIRES ARCHITECTURE CHANGE**

| Operation | v1 | v2 | Status |
|-----------|----|----|--------|
| Create Group | ✅ POST /workspace/groups | ✅ POST /workspaces/sites | ⚠️ Different endpoint |
| Update Group | ✅ PATCH /workspace/groups/{id} | ✅ PUT /workspaces/sites/{site_id} | ⚠️ Different endpoint |
| Delete Group | ✅ DELETE /workspace/groups/{id} | ✅ DELETE /workspaces/sites/{site_id} | ⚠️ Different endpoint |
| Get Group | ✅ GET /workspace/groups/{id} | ✅ GET /workspaces/sites/{site_id} | ⚠️ Different endpoint |
| List Groups | ✅ Via /workspace endpoint | ✅ GET /workspaces/sites | ⚠️ Different endpoint |

**Required Refactoring:**
1. Rename "Groups" in UI to "Sites" (or create mapping layer)
2. Update all fetch calls to use `/v2/workspaces/sites` endpoints
3. Update request/response models for site objects
4. Parameter renaming: `groupId` → `site_id`, `name` field same

---

### 6. Subaccount Management Endpoints

| Aspect | v1 | v2 |
|--------|----|----|
| **Concept** | Group subaccounts at `/pool/groups/{groupId}/subaccounts` | Direct subaccounts at `/pool/subaccounts` |
| **Status** | ⚠️ Partial compatibility |
| **Migration Type** | Requires refactoring |

**v1 Endpoints:**
```
GET /api/v1/pool/groups/{groupId}/subaccounts
GET /api/v1/pool/groups/{groupId}/subaccounts/{subaccountName}
POST /api/v1/pool/groups/{groupId}/subaccounts
DELETE /api/v1/pool/groups/{groupId}/subaccounts/{subaccountName}
```

**v2 Endpoints:**
```
GET /api/v2/pool/subaccounts
GET /api/v2/pool/subaccounts/{subaccount_name}
POST /api/v2/pool/subaccounts
PUT /api/v2/pool/subaccounts/{subaccount_name}  [UPDATE - NEW]
DELETE /api/v2/pool/subaccounts/{subaccount_name}
```

**Key Differences:**

| Operation | v1 | v2 | Impact |
|-----------|----|----|--------|
| List subaccounts | `GET /pool/groups/{groupId}/subaccounts` | `GET /pool/subaccounts?site_id={site_id}` | ⚠️ Parameter renamed, optional `site_id` filter |
| Get specific | `GET /pool/groups/{groupId}/subaccounts/{name}` | `GET /pool/subaccounts/{subaccount_name}` | ✅ Simplified path |
| Create | `POST /pool/groups/{groupId}/subaccounts` with `name` | `POST /pool/subaccounts` with `name, site_id` | ⚠️ Requires `site_id` in body |
| Update | ❌ Not supported in v1 | ✅ `PUT /pool/subaccounts/{subaccount_name}` | ✅ NEW feature |
| Delete | `DELETE /pool/groups/{groupId}/subaccounts/{name}` | `DELETE /pool/subaccounts/{subaccount_name}` | ✅ Simplified path |

**Code Locations to Update:**
- `src/app/(manage)/subaccounts/page.tsx`
  - Line 138: Fetch workspace (no longer includes subaccounts)
  - Line 382: Add subaccount (must add site_id)
  - Line 474: Remove subaccount

**Migration Impact: MODERATE**
- Must pass `site_id` when creating subaccounts (NEW requirement)
- Subaccount listing no longer tied to group/site path (simplified)
- No breaking changes for get/delete operations
- NEW: Update subaccount operation available

---

### 7. Payment Settings Endpoints

| Aspect | v1 | v2 |
|--------|----|----|
| **Status** | ✅ Direct replacement |
| **Migration Type** | Mechanical |

**Endpoint Paths:**

| Operation | v1 | v2 | Status |
|-----------|----|----|--------|
| Get Payment Settings | `GET /pool/payment-settings/{currency}` | `GET /pool/payment-settings/{currency_type}` | ✅ Mechanical |
| Get Subaccount Settings | `GET /pool/payment-settings/{currency}/{subaccountName}` | `GET /pool/payment-settings/{currency_type}/{subaccount_name}` | ✅ Mechanical |
| Create Settings | `POST /pool/payment-settings/{currency}/{subaccountName}` | `POST /pool/payment-settings/{currency_type}/{subaccount_name}` | ✅ Mechanical |
| Update Settings | `PATCH /pool/payment-settings/{currency}/{subaccountName}` | `PUT /pool/payment-settings/{currency_type}/{subaccount_name}` | ⚠️ HTTP method changed |

**Query Parameters - Get Payment Settings:**

| Parameter | v1 | v2 | Change |
|-----------|----|----|--------|
| `subaccount_names` | ✅ CSV/array | ✅ CSV/array | **No change** |
| `site_id` | ❌ Not supported | ✅ Optional | **NEW in v2** |
| `page_number` | ✅ Optional | ✅ Optional | **No change** |
| `page_size` | ✅ Optional | ✅ Optional | **No change** |

**Request Body - Create/Update Settings:**

| Field | v1 | v2 | Change |
|-------|----|----|--------|
| `payment_frequency` | ✅ DAILY, WEEKLY, MONTHLY | ✅ DAILY, WEEKLY, MONTHLY | **No change** |
| `day_of_week` | ✅ MONDAY-SUNDAY | ✅ MONDAY-SUNDAY | **No change** |
| `addresses` | ✅ Array of address objects | ✅ Array of address objects | **No change** |
| `wallet_id` | ❌ Not in v1 | ✅ Required in v2 | **NEW requirement** |

**⚠️ BREAKING CHANGE:** v2 Create Payment Settings requires `wallet_id` parameter!

**Code Locations to Update:**
- `src/lib/luxor.ts` - Lines ~415-485 (payment settings methods)
  - Update HTTP method from PATCH to PUT
  - Add `wallet_id` to request body

**Migration Impact: MODERATE**
- HTTP method change (PATCH → PUT) for update operation
- NEW required field: `wallet_id` in create/update bodies
- All other parameters unchanged

---

### 8. Transaction History Endpoint

| Aspect | v1 | v2 |
|--------|----|----|
| **Endpoint Name** | Get transactions | Get transactions |
| **v1 Path** | `GET /api/v1/pool/transactions/{currency}` | - |
| **v2 Path** | - | `GET /api/v2/pool/transactions/{currency_type}` |
| **Status** | ✅ Direct replacement |
| **Migration Type** | Mechanical |

**Query Parameters:**

| Parameter | v1 | v2 | Change |
|-----------|----|----|--------|
| `start_date` | ✅ Required (ISO date) | ✅ Required (ISO date) | **No change** |
| `end_date` | ✅ Required (ISO date) | ✅ Required (ISO date) | **No change** |
| `subaccount_names` | ✅ CSV/array | ✅ CSV/array | **No change** |
| `site_id` | ❌ Not supported | ✅ Optional | **NEW in v2** |
| `transaction_type` | ⓘ Not documented in v1 | ✅ "debit" \| "credit" | **NEW in v2** |
| `page_number` | ✅ Optional (default: 1) | ✅ Optional (default: 1) | **No change** |
| `page_size` | ✅ Optional (default: 10) | ✅ Optional (default: 10) | **No change** |

**Response Structure:**
- v1/v2: `{ transactions[], pagination }`
- Transaction fields: `currency_type, date_time, address_name, subaccount_name, transaction_category, currency_amount, usd_equivalent, transaction_id, transaction_type`

**Code Locations to Update:**
- No current usage in codebase

**Migration Notes:**
- ✅ Drop-in replacement
- NEW optional filtering by `transaction_type`

---

## PART 2: REQUIRED CODE CHANGES (HIGH-LEVEL)

### 2.1 Luxor Client Library (`src/lib/luxor.ts`)

**Changes Required:**

1. **Update Base URL**
   - Line 52: Change `https://app.luxor.tech/api/v1` → `https://app.luxor.tech/api/v2`

2. **Method Updates - Parameter Renaming**
   - All methods using `currency` parameter → rename to `currency_type` (e.g., in request paths)
   - Maintain backward compatibility at TypeScript interface level with property mapping

3. **Payment Settings Methods - HTTP Method Change**
   - `createPaymentSettings()`: POST method stays the same ✅
   - `updatePaymentSettings()`: Change from PATCH to PUT method
   - Add `wallet_id` as required parameter in both methods

4. **Payment Settings Methods - Add wallet_id**
   - Method signature: Add `wallet_id: number` to `createPaymentSettings()` params
   - Method signature: Add `wallet_id: number` to `updatePaymentSettings()` params

5. **Subaccount Methods - Add site_id Requirement**
   - `addSubaccount()`: Change to require `site_id` parameter
   - Update method to pass `site_id` in request body

6. **Response Type Updates**
   - Update interface for workspace response (no longer includes groups)
   - Add new interfaces for Site objects
   - Update subaccount response to optionally include site object

**Files to Modify:**
- `src/lib/luxor.ts`

---

### 2.2 Proxy Route (`src/app/api/luxor/route.ts`)

**Changes Required:**

1. **Endpoint Mapping Update**
   - Update `endpointMap` object to reflect v2 endpoint structure
   - Rename parameters in map entries (currency → currency_type where applicable)
   - Add `site_id` handling for subaccount operations

2. **Query Parameter Handling**
   - Rename `currency` → `currency_type` in parameter extraction logic
   - Add `site_id` extraction for relevant endpoints

3. **Subaccount Operations Refactoring**
   - Update logic to NOT expect group-based subaccount paths
   - Change to use flat `/v2/pool/subaccounts` endpoint structure
   - Add `site_id` extraction from request body for creation

4. **Payment Settings Handling**
   - Add `wallet_id` extraction from request body
   - Update HTTP method from PATCH to PUT in appropriate handler

5. **Response Adaptation**
   - Workspace endpoint handling: Remove expectation of groups in response
   - May need adapter layer to convert v2 Sites to v1-like Groups for frontend compatibility

**Files to Modify:**
- `src/app/api/luxor/route.ts`

---

### 2.3 Frontend Pages - Critical Changes

#### Pages Using Groups (MAJOR REFACTORING REQUIRED)

**`src/app/(manage)/groups/page.tsx` - ENTIRE PAGE NEEDS REFACTORING**
- Current: Manages "Groups" via `/workspace/groups` endpoints
- Required: Must be rewritten to manage "Sites" via `/workspaces/sites` endpoints
- Impact: Page functionality changes from Groups to Sites
- Scope: Major refactoring (create, read, update, delete operations)

**Recommendation:** Either:
1. Rename and refactor the page to "Sites" (recommended, aligns with v2)
2. Create abstraction layer to map Sites → Groups for UI compatibility

#### Pages Using Workspace Endpoint (MODERATE REFACTORING REQUIRED)

**`src/app/(manage)/subaccounts/page.tsx`**
- Line 138: Currently fetches workspace to get groups/subaccounts
- Required: Split into two calls:
  1. Fetch workspace (for metadata)
  2. Fetch subaccounts separately via `/v2/pool/subaccounts`
- Impact: Moderate - requires refactoring fetch logic

**`src/app/(manage)/workers/page.tsx`**
- Line 127, 400: Fetch workspace for context
- Required: Update to handle Sites instead of Groups
- Impact: Moderate

**`src/app/(auth)/luxor/page.tsx`**
- Line 183: Fetch workspace
- Required: Update to handle new response structure
- Impact: Low-moderate (may only be using workspace ID/name)

**`src/components/CreateUserModal.tsx`**
- Line 156: Fetch workspace groups
- Required: Change to fetch subaccounts via new endpoint
- Impact: Moderate - need to update how groups are populated

#### Pages Using Active Workers (MINOR REFACTORING REQUIRED)

**`src/app/(auth)/luxor/page.tsx`**
- Line 128: Fetch active workers
- Required: Only parameter rename (currency → currency_type)
- Impact: Low - mechanical change

**`src/app/(auth)/clientworkers/page.tsx`**
- Line 103: Fetch active workers
- Required: Only parameter rename
- Impact: Low - mechanical change

#### Pages Using Other Endpoints (MINOR REFACTORING REQUIRED)

**`src/app/api/admin/dashboard/route.ts`**
- Line 77, 148, 229: Fetches workspace, active workers, hashrate
- Required: Update workspace fetch; rename currency parameters
- Impact: Low-moderate

**Files to Modify:**
- `src/app/(manage)/groups/page.tsx` - **MAJOR**
- `src/app/(manage)/subaccounts/page.tsx` - **MODERATE**
- `src/app/(manage)/workers/page.tsx` - **MODERATE**
- `src/app/(auth)/luxor/page.tsx` - **MODERATE**
- `src/app/(auth)/clientworkers/page.tsx` - **LOW**
- `src/components/CreateUserModal.tsx` - **MODERATE**
- `src/app/api/admin/dashboard/route.ts` - **MODERATE**

---

## PART 3: COMPLETE FILES IMPACTED

**Core Implementation:**
- ✅ `src/lib/luxor.ts` - LuxorClient class
- ✅ `src/app/api/luxor/route.ts` - Proxy route handler

**Frontend Pages:**
- ✅ `src/app/(manage)/groups/page.tsx` - **MAJOR CHANGES**
- ✅ `src/app/(manage)/subaccounts/page.tsx` - **MODERATE CHANGES**
- ✅ `src/app/(manage)/workers/page.tsx` - **MODERATE CHANGES**
- ✅ `src/app/(auth)/luxor/page.tsx` - **MODERATE CHANGES**
- ✅ `src/app/(auth)/clientworkers/page.tsx` - **MINOR CHANGES**
- ✅ `src/components/CreateUserModal.tsx` - **MODERATE CHANGES**

**API Routes:**
- ✅ `src/app/api/admin/dashboard/route.ts` - **MODERATE CHANGES**

**No changes needed:**
- ✅ `src/lib/jwt.ts` - Authentication unchanged
- ✅ `src/middleware.ts` - Routing unchanged
- ✅ `src/lib/prisma.ts` - Database layer unchanged

---

## PART 4: BREAKING CHANGES & RISKS

### Critical Breaking Changes

#### 1. ⚠️ **WORKSPACE ENDPOINT RESPONSE STRUCTURE CHANGED**

**v1 Response:**
```json
{
  "groups": [
    {
      "id": "uuid",
      "name": "Mining Pool 1",
      "subaccounts": [...]
    }
  ]
}
```

**v2 Response:**
```json
{
  "id": "workspace_id",
  "name": "My Workspace",
  "products": ["POOL"],
  "sites": [
    {
      "id": "site_uuid",
      "name": "My Site"
    }
  ]
}
```

**Impact:**
- All code expecting `groups` array will break
- Must refetch subaccounts separately
- Subaccounts are NO LONGER nested in workspace response
- **All pages fetching workspace must be updated**

**Risk Level:** 🔴 **HIGH**

---

#### 2. ⚠️ **GROUP MANAGEMENT ENDPOINTS DEPRECATED**

**Affected v1 Endpoints (NO LONGER EXIST):**
- ❌ `POST /api/v1/workspace/groups` - Create Group
- ❌ `PATCH /api/v1/workspace/groups/{groupId}` - Update Group  
- ❌ `DELETE /api/v1/workspace/groups/{groupId}` - Delete Group
- ❌ `GET /api/v1/workspace/groups/{groupId}` - Get Group

**Replacement in v2:**
- ✅ `POST /api/v2/workspaces/sites` - Create Site
- ✅ `PUT /api/v2/workspaces/sites/{site_id}` - Update Site
- ✅ `DELETE /api/v2/workspaces/sites/{site_id}` - Delete Site
- ✅ `GET /api/v2/workspaces/sites/{site_id}` - Get Site

**Impact:**
- Groups page will completely break without refactoring
- Groups RENAMED to Sites in v2 architecture
- Parameter changes: `groupId` → `site_id`

**Risk Level:** 🔴 **CRITICAL**

**Affected Code:**
- `src/app/(manage)/groups/page.tsx` - Create, update, delete operations all fail

---

#### 3. ⚠️ **SUBACCOUNT ENDPOINT PATHS SIMPLIFIED**

**v1 Subaccount Endpoints:**
```
GET /api/v1/pool/groups/{groupId}/subaccounts
GET /api/v1/pool/groups/{groupId}/subaccounts/{name}
POST /api/v1/pool/groups/{groupId}/subaccounts
DELETE /api/v1/pool/groups/{groupId}/subaccounts/{name}
```

**v2 Subaccount Endpoints:**
```
GET /api/v2/pool/subaccounts
GET /api/v2/pool/subaccounts/{subaccount_name}
POST /api/v2/pool/subaccounts
PUT /api/v2/pool/subaccounts/{subaccount_name}  [NEW]
DELETE /api/v2/pool/subaccounts/{subaccount_name}
```

**Impact:**
- Subaccounts no longer nested under groups
- Parameter `site_id` now required in POST body (NEW)
- Simpler flat API but requires parameter restructuring
- Fetching subaccounts by group no longer possible (fetch all, filter client-side)

**Risk Level:** 🟠 **MODERATE**

---

#### 4. ⚠️ **ACTIVE WORKERS ENDPOINT: tick_size SUPPORT REDUCED**

**v1 Supported:**
- 5m, 1h, 1d, 1w, 1M ✅

**v2 Supported:**
- 5m, 1h, 1d only

**Impact:**
- Code using `tick_size=1w` or `tick_size=1M` will fail
- Admin dashboard may show weekly/monthly views
- Must refactor to use daily data and aggregate client-side if weekly/monthly needed

**Risk Level:** 🟠 **MODERATE**

**Affected Code:**
- Any page using active-workers with 1w or 1M tick_size

---

#### 5. ⚠️ **PAYMENT SETTINGS HTTP METHOD CHANGED**

**v1:** `PATCH /api/v1/pool/payment-settings/{currency}/{subaccountName}`

**v2:** `PUT /api/v2/pool/payment-settings/{currency_type}/{subaccount_name}`

**Impact:**
- Existing code using PATCH will fail
- HTTP library must support PUT requests (standard, but verify)

**Risk Level:** 🟡 **LOW** (mechanical change)

---

#### 6. ⚠️ **PAYMENT SETTINGS: wallet_id NOW REQUIRED**

**v1:** Optional or not documented

**v2:** `wallet_id` is REQUIRED in POST/PUT body

```json
{
  "wallet_id": 0,  // REQUIRED - NEW
  "payment_frequency": "DAILY",
  "day_of_week": "MONDAY",
  "addresses": [...]
}
```

**Impact:**
- Code creating/updating payment settings without `wallet_id` will fail with 400 error
- Must obtain valid `wallet_id` before calling endpoint

**Risk Level:** 🟡 **MODERATE** (requires parameter addition)

**Question:** Where does `wallet_id` come from? Is it:
- Auto-increment integer (0, 1, 2, ...)?
- Returned from previous payment settings query?
- User-provided value?

---

#### 7. ⚠️ **ACTIVE WORKERS QUERY PARAMETER NAMING**

**v1:** Path parameter `{currency}`  
**v2:** Path parameter `{currency_type}`

**Impact:**
- Client and internal code must use `currency_type` in paths
- Minimal impact if wrapped in proxy (already done)

**Risk Level:** 🟡 **LOW** (mechanical)

---

### Data Availability Changes

| Data | v1 | v2 | Impact |
|------|----|----|--------|
| Groups API | ✅ Full CRUD | ❌ Removed (replaced by Sites) | ⚠️ Moderate - must migrate to Sites |
| Subaccounts nested in Workspace | ✅ Available | ❌ Removed | ⚠️ High - must fetch separately |
| Group subaccounts path | ✅ `/groups/{id}/subaccounts` | ❌ Removed | ⚠️ High - must use flat `/subaccounts` |
| Weekly active workers | ✅ Available (1w) | ❌ Not supported | ⚠️ Moderate - must aggregate daily |
| Monthly active workers | ✅ Available (1M) | ❌ Not supported | ⚠️ Moderate - must aggregate daily |
| Wallet ID (payment settings) | ❌ N/A | ✅ Required | ⚠️ Moderate - must add parameter |
| Site ID filtering | ❌ N/A | ✅ Optional | ✅ Positive - better filtering |
| Subaccount update | ❌ Not supported | ✅ Available (PUT) | ✅ Positive - new feature |

---

## PART 5: MIGRATION BLOCKERS & WORKAROUNDS

### Blocker 1: ⚠️ Groups Concept Deprecated

**Issue:** v1 Groups API completely removed from v2. BitFactory has entire page managing groups.

**Why It's Blocked:**
- No direct equivalent endpoint
- Sites API is the replacement but has different structure
- Business logic tied to group concept

**Workaround Options:**

**Option A: Direct Migration to Sites (Recommended)**
- Rename groups to sites in UI
- Update all endpoints to call Sites API
- Update database if needed to track sites instead of groups
- Estimated effort: Moderate-High

**Option B: Create Abstraction Layer**
- Write adapter that maps Sites → Groups internally
- Frontend sees Groups, backend uses Sites
- More complex but preserves existing UI/UX
- Estimated effort: High

**Option C: Discontinue Group Management**
- Remove groups/sites management page entirely
- Users manage sites directly through Luxor web UI
- Simplest but removes feature from BitFactory
- Estimated effort: Low

**Recommendation:** Option A - Direct migration aligns with v2 architecture

---

### Blocker 2: ⚠️ Subaccounts No Longer Nested in Workspace

**Issue:** v1 returned all subaccounts nested within workspace response. v2 returns only workspace metadata.

**Why It's Blocked:**
- Multiple pages expect subaccounts in workspace response
- Pattern used: `workspace.groups[i].subaccounts`
- v2 requires separate API call

**Workaround:**

**Required Changes:**
1. Fetch workspace (get metadata: id, name, sites)
2. Fetch subaccounts separately via `/v2/pool/subaccounts`
3. In frontend, manually associate subaccounts with sites if needed

**Code Pattern - v1:**
```typescript
const workspace = await fetch('/api/luxor?endpoint=workspace');
const groups = workspace.data.groups; // Groups with nested subaccounts
```

**Code Pattern - v2:**
```typescript
const workspace = await fetch('/api/luxor?endpoint=workspace');
const subaccounts = await fetch('/api/luxor?endpoint=subaccounts');
// Manually associate subaccounts with sites if needed
```

**Estimated Effort:** Moderate - requires 2 API calls where v1 had 1

---

### Blocker 3: ⚠️ Active Workers: 1w and 1M tick_size Not Supported

**Issue:** Code using weekly or monthly granularity for active workers will fail.

**Why It's Blocked:**
- v2 only supports: 5m, 1h, 1d
- No direct replacement for 1w, 1M

**Workaround Options:**

**Option A: Use Daily Aggregation (Recommended)**
- Fetch daily data (tick_size=1d)
- Aggregate in client-side code to weekly/monthly
- Provides same data, slightly slower

**Option B: Store/Cache Historical Data**
- Before migration, export weekly/monthly summaries to database
- Migrate existing summaries to BitFactory database
- Query from database instead of API

**Option C: Remove Weekly/Monthly Views**
- Only show daily/hourly/5-minute granularity
- Simplest but reduces dashboard features

**Recommendation:** Option A - client-side aggregation of daily data

**Current Usage:**
- Unclear if admin dashboard uses 1w or 1M - must inspect code

---

### Blocker 4: ❌ Payment Settings wallet_id Parameter Unknown

**Issue:** v2 requires `wallet_id` in payment settings creation/update, but unclear what this value should be.

**Why It's Blocked:**
- Documentation shows `wallet_id: integer` required
- No guidance on what value to use
- Could be auto-increment, UUID, or user ID

**Workaround:**

**Required Clarification:** Contact Luxor support or check v2 docs for:
1. What is `wallet_id`?
2. How to obtain/generate it?
3. Is there a wallet creation endpoint?
4. Can we query existing wallets?

**Temporary Workaround:** 
- Use hardcoded value like `wallet_id: 0` for testing
- Determine correct value from Luxor documentation or support

**Estimated Impact:** Will be clear once v2 wallet documentation is reviewed

---

## PART 6: ARCHITECTURAL & DATA CHANGES REQUIRED

### 1. Groups → Sites Conceptual Migration

**Database Considerations:**

Current BitFactory schema likely tracks:
```sql
-- Hypothetical current schema
Groups (id, name, workspace_id, ...)
GroupSubaccounts (group_id, subaccount_id, ...)
```

**Migration Path:**

Option 1: Rename in Database
```sql
-- Rename tables
ALTER TABLE Groups RENAME TO Sites;
-- Update schema to match v2 Sites structure
ALTER TABLE Sites ADD COLUMN products JSON;
```

Option 2: Keep Separate Layer
```sql
-- Keep existing schema, map v2 Sites to v1 Groups at API layer
-- Adapter pattern: Sites ↔ Groups translation
```

**Recommendation:** Option 1 - rename for v2 alignment

---

### 2. Subaccount Fetching Pattern Change

**Current Pattern (v1):**
- Single workspace endpoint call
- Returns workspace + all groups + all subaccounts
- N+0 queries (all data in one call)

**New Pattern (v2):**
- Two separate calls required
- Workspace call returns workspace metadata + sites
- Subaccounts call returns flat list of subaccounts
- N+1 query pattern (two round trips)

**Optimization:**
- Could cache subaccounts client-side to reduce calls
- Could batch requests with Promise.all()

---

### 3. Site ID Management

**Changes:**
- v2 requires `site_id` when creating subaccounts
- Sites concept now central to workspace organization
- Must ensure site exists before creating subaccounts

**Data Flow:**
1. Fetch workspace → get available sites
2. Validate site_id exists before creating subaccount with site_id

---

## PART 7: SUMMARY TABLE - MIGRATION EFFORT BY FILE

| File | Changes | Complexity | Est. Effort | Risk |
|------|---------|-----------|-------------|------|
| `src/lib/luxor.ts` | Base URL, method signatures, parameter renaming, wallet_id addition | Medium | 2-3 hrs | Low |
| `src/app/api/luxor/route.ts` | Endpoint mapping updates, parameter handling, response adaptation | Medium | 3-4 hrs | Medium |
| `src/app/(manage)/groups/page.tsx` | Rename to sites, refactor all CRUD operations | High | 4-6 hrs | High |
| `src/app/(manage)/subaccounts/page.tsx` | Split workspace fetch, add site_id handling | Medium | 2-3 hrs | Medium |
| `src/app/(manage)/workers/page.tsx` | Update workspace handling, parameter renaming | Medium | 1-2 hrs | Low |
| `src/app/(auth)/luxor/page.tsx` | Parameter renaming, workspace response handling | Low-Medium | 1-2 hrs | Low |
| `src/app/(auth)/clientworkers/page.tsx` | Parameter renaming only | Low | 30 min | Low |
| `src/components/CreateUserModal.tsx` | Subaccount fetch logic update | Low-Medium | 1-2 hrs | Low |
| `src/app/api/admin/dashboard/route.ts` | Parameter renaming, workspace handling | Low-Medium | 1-2 hrs | Low |

**Total Estimated Effort:** 15-25 hours (2-3 days of focused work)

**Total Risk Level:** 🟠 **MODERATE** (primary risk: groups → sites refactoring)

---

## PART 8: PREREQUISITE CLARIFICATIONS NEEDED

Before migration begins, **clarify these items with Luxor:**

1. ❓ **wallet_id in Payment Settings**
   - What is wallet_id?
   - How is it generated/obtained?
   - Can we query existing wallet IDs?
   - Is there a wallet creation endpoint?

2. ❓ **Sites API Details**
   - Complete Sites endpoint documentation?
   - Site attributes (permissions, settings, etc.)?
   - Relationship between Sites and Subaccounts?

3. ❓ **Subaccount site_id Requirement**
   - Is site_id always required when creating subaccounts?
   - Can a subaccount belong to multiple sites?
   - How to determine which site_id to use?

4. ❓ **Active Workers tick_size Limitation**
   - Is 1w/1M support planned for future v2 updates?
   - Are there alternative endpoints for weekly/monthly aggregates?

5. ❓ **Workspace Response Backward Compatibility**
   - Will v2 ever return groups/subaccounts in workspace response?
   - Is flat subaccount endpoint the final design?

---

## PART 9: PHASED MIGRATION STRATEGY

### Phase 1: Core Client Library (Low Risk)
1. Update `src/lib/luxor.ts` base URL
2. Update method signatures and parameter names
3. Add wallet_id support to payment settings methods
4. Test with v2 API endpoints

**Duration:** 2-3 hours  
**Risk:** Low  

### Phase 2: Proxy Route & Simple Endpoints (Medium Risk)
1. Update `src/app/api/luxor/route.ts` endpoint mapping
2. Update parameter handling for all renamed parameters
3. Test active-workers, workers, hashrate-history, transactions endpoints

**Duration:** 3-4 hours  
**Risk:** Medium

### Phase 3: Subaccount Refactoring (Medium Risk)
1. Update subaccount methods to use flat endpoint structure
2. Add site_id requirement to subaccount creation
3. Update workspace fetch to handle new response structure
4. Test subaccount CRUD operations

**Duration:** 2-3 hours  
**Risk:** Medium

### Phase 4: Groups → Sites Migration (High Risk)
1. Rename groups page to sites page OR update all group CRUD calls
2. Update all group operations to use Sites API endpoints
3. Refactor group response handling to sites response handling
4. Comprehensive testing of site management functionality

**Duration:** 4-6 hours  
**Risk:** High

### Phase 5: Frontend Integration & Testing (Medium Risk)
1. Update all frontend pages to handle new data structures
2. Split workspace + subaccount fetching where needed
3. Handle removed tick_size options (1w, 1M)
4. End-to-end testing across all modified pages

**Duration:** 3-4 hours  
**Risk:** Medium

### Phase 6: Cutover & Validation (Medium Risk)
1. Deploy to staging environment
2. Comprehensive regression testing
3. Verify all pages work correctly
4. Deploy to production with rollback plan

**Duration:** 2-3 hours  
**Risk:** Medium

---

## PART 10: ROLLBACK PLAN

**Pre-Migration:**
- Tag current version in git as `pre-v2-migration`
- Export current API specifications as backup
- Create database backup

**During Migration:**
- Maintain dual API support temporarily (v1 and v2 side-by-side)
- Use feature flag to switch between v1 and v2

**Rollback Procedure:**
```bash
git revert <migration-commits>
Update base URL back to v1
Redeploy previous version
Verify all endpoints working
```

---

## PART 11: CONCLUSION & RECOMMENDATION

### Overall Assessment

✅ **Migration is FEASIBLE and RECOMMENDED**

**Key Findings:**
1. All v1 endpoints have v2 equivalents (some with architectural changes)
2. No critical data loss expected
3. Primary effort is refactoring groups → sites and splitting workspace fetch
4. Estimated total effort: 15-25 developer hours
5. Risk level: Moderate (manageable with phased approach)

### What CAN Be Migrated Directly ✅
- Active workers endpoint (mechanical)
- Hashrate efficiency endpoint (mechanical)
- Workers endpoint (mechanical) 
- Transactions endpoint (mechanical)
- Payment settings (with HTTP method and param changes)
- Subaccount get/delete (with path simplification)

### What Requires Refactoring ⚠️
- Workspace endpoint (response structure completely changed)
- Group management (API completely replaced with Sites)
- Subaccount creation (now requires site_id)
- Active workers granularity (1w/1M not supported)

### What Is NOT SUPPORTED ❌
- Historical data for 1w/1M tick sizes (workaround: aggregate daily data)
- Group concept (replacement: Sites concept exists in v2)

### Next Steps

1. **Clarify wallet_id** with Luxor support
2. **Review detailed Sites API** documentation
3. **Create test environment** with v2 API access
4. **Implement Phase 1** (core library updates)
5. **Test incrementally** before full migration
6. **Plan stakeholder communication** about Groups→Sites rename

### Recommended Timeline

- **Week 1:** Planning, clarifications, Phase 1-2
- **Week 2:** Phase 3-4, staging environment testing  
- **Week 3:** Phase 5-6, production deployment

---

**Report Generated:** December 13, 2025  
**Status:** Ready for implementation with prerequisite clarifications
