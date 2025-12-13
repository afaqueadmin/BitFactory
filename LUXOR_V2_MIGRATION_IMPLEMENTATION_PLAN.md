# Luxor API v1 to v2 Migration - Implementation Plan

**Project:** BitFactory  
**Date:** December 13, 2025  
**Migration Type:** Full v1 to v2 cutover (no hybrid mode)  
**Total Estimated Effort:** 18-28 hours (3-4 days)

---

## OVERVIEW

This implementation plan divides the Luxor API v1 to v2 migration into 7 distinct phases with 24 actionable tasks. Each phase builds on the previous, with clear dependencies, effort estimates, and risk assessments.

**Critical Path:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

**Key Principles:**
- Backend changes before frontend changes
- Test each phase before proceeding
- Maintain rollback capability at each phase
- Address blockers before dependent tasks

---

## PHASE SUMMARY

| Phase | Focus Area | Tasks | Total Effort | Risk Level | Frontend Impact |
|-------|-----------|-------|--------------|------------|-----------------|
| **Phase 0** | Pre-Migration | 3 tasks | 1-2 hrs | Low | None |
| **Phase 1** | Core Library | 4 tasks | 2-3 hrs | Low | None |
| **Phase 2** | Proxy Route | 3 tasks | 3-4 hrs | Medium | None |
| **Phase 3** | Reporting Endpoints | 3 tasks | 2-3 hrs | Low-Medium | Yes (3 pages) |
| **Phase 4** | Subaccounts & Workspace | 4 tasks | 4-5 hrs | High | Yes (4 pages) |
| **Phase 5** | Groups → Sites Migration | 3 tasks | 4-6 hrs | **CRITICAL** | Yes (1 page) |
| **Phase 6** | Payment Settings | 2 tasks | 1-2 hrs | Medium | None |
| **Phase 7** | Testing & Deployment | 2 tasks | 2-3 hrs | Medium | All pages |

---

## PHASE 0: PRE-MIGRATION SETUP

**Goal:** Establish safety nets and clarify blockers before any code changes.

### Task 0.1: Create Git Safety Branch

| Attribute | Details |
|-----------|---------|
| **Task ID** | 0.1 |
| **Task Name** | Create pre-migration Git tag and backup branch |
| **Type** | Infrastructure |
| **Scope** | Backend + Frontend |
| **Dependencies** | None |
| **Effort** | 15 minutes |
| **Risk** | 🟢 Low |

**Actions:**
- Create Git tag: `pre-v2-migration` on current main branch
- Create backup branch: `backup/v1-stable`
- Document current commit hash
- Verify all changes are committed

**Success Criteria:**
- Tag exists: `git tag pre-v2-migration`
- Backup branch created and pushed
- Clean working directory

**Blockers:** None

---

### Task 0.2: Clarify wallet_id Parameter with Luxor

| Attribute | Details |
|-----------|---------|
| **Task ID** | 0.2 |
| **Task Name** | Obtain wallet_id specification from Luxor API docs |
| **Type** | Research / Documentation |
| **Scope** | Backend (Payment Settings) |
| **Dependencies** | None |
| **Effort** | 30 minutes - 1 hour |
| **Risk** | 🟡 Medium (blocks Phase 6) |

**Actions:**
- Review Luxor API v2 documentation for wallet endpoints
- Identify how to obtain/generate wallet_id
- Document wallet_id structure (integer? UUID? auto-increment?)
- Determine if wallet creation endpoint exists
- Confirm if existing wallet IDs can be queried

**Success Criteria:**
- Clear understanding of wallet_id parameter
- Documented process for obtaining wallet_id
- Test wallet_id value identified

**Blockers:**
- ⚠️ Payment settings creation/update cannot proceed without wallet_id
- If unclear, may need to contact Luxor support or test with sample values

---

### Task 0.3: Set Up v2 API Test Environment

| Attribute | Details |
|-----------|---------|
| **Task ID** | 0.3 |
| **Task Name** | Configure test environment with v2 API access |
| **Type** | Infrastructure |
| **Scope** | Backend |
| **Dependencies** | None |
| **Effort** | 30 minutes |
| **Risk** | 🟢 Low |

**Actions:**
- Verify v2 API key/token has access to v2 endpoints
- Create test configuration file with v2 base URL
- Set up environment variable for v2 URL (e.g., `LUXOR_API_VERSION=v2`)
- Test basic v2 endpoint (e.g., GET /workspace) via curl/Postman

**Success Criteria:**
- Successful API call to v2 workspace endpoint
- Environment configured for easy switching between v1/v2

**Blockers:** None

---

## PHASE 1: CORE LIBRARY UPDATES (Backend Only)

**Goal:** Update LuxorClient class to support v2 endpoints without breaking existing functionality.

**Frontend Impact:** ❌ None (internal library changes only)

### Task 1.1: Update Base URL and Configuration

| Attribute | Details |
|-----------|---------|
| **Task ID** | 1.1 |
| **Task Name** | Update LuxorClient base URL from v1 to v2 |
| **Type** | Backend |
| **Scope** | `src/lib/luxor.ts` |
| **Dependencies** | Task 0.3 (test environment) |
| **Effort** | 15 minutes |
| **Risk** | 🟢 Low |

**Changes Required:**
- Line 52: Change `https://app.luxor.tech/api/v1` → `https://app.luxor.tech/api/v2`
- Optionally: Make base URL configurable via environment variable

**Files Modified:**
- `src/lib/luxor.ts`

**Success Criteria:**
- Base URL updated
- Client initialized with v2 URL
- No syntax errors

**Blockers:** None

---

### Task 1.2: Update Reporting Endpoint Methods

| Attribute | Details |
|-----------|---------|
| **Task ID** | 1.2 |
| **Task Name** | Update active-workers, hashrate, workers, transactions methods |
| **Type** | Backend |
| **Scope** | `src/lib/luxor.ts` |
| **Dependencies** | Task 1.1 |
| **Effort** | 1 hour |
| **Risk** | 🟢 Low |

**Changes Required:**

**Method: `getActiveWorkers()`**
- Parameter rename: `currency` → `currency_type`
- Validate tick_size: Only allow `5m`, `1h`, `1d` (remove `1w`, `1M`)
- Update request path: `/pool/active-workers/${currency_type}`

**Method: `getHashrateEfficiency()`**
- Parameter rename: `currency` → `currency_type`
- Update request path: `/pool/hashrate-efficiency/${currency_type}`
- tick_size unchanged: still supports `5m`, `1h`, `1d`, `1w`, `1M`

**Method: `getWorkers()`**
- Parameter rename: `currency` → `currency_type`
- Update request path: `/pool/workers/${currency_type}`
- Add optional `site_id` parameter

**Method: `getTransactions()`**
- Parameter rename: `currency` → `currency_type`
- Update request path: `/pool/transactions/${currency_type}`
- Add optional `transaction_type` parameter (`debit` | `credit`)
- Add optional `site_id` parameter

**Files Modified:**
- `src/lib/luxor.ts` (lines ~100-300)

**Success Criteria:**
- All 4 methods updated with new parameters
- TypeScript types updated for parameter names
- No compilation errors

**Blockers:** None

---

### Task 1.3: Update Workspace & Subaccount Methods

| Attribute | Details |
|-----------|---------|
| **Task ID** | 1.3 |
| **Task Name** | Update workspace and subaccount endpoint methods |
| **Type** | Backend |
| **Scope** | `src/lib/luxor.ts` |
| **Dependencies** | Task 1.1 |
| **Effort** | 1.5 hours |
| **Risk** | 🟡 Medium (response structure change) |

**Changes Required:**

**Method: `getWorkspace()`**
- Update request path: `/workspace` (no change)
- **⚠️ Update response type:** No longer returns `groups[]`, now returns `sites[]`
- Add TypeScript interface for v2 workspace response:
  ```typescript
  interface WorkspaceV2Response {
    id: string;
    name: string;
    products: string[];
    sites: Site[];
  }
  
  interface Site {
    id: string;
    name: string;
  }
  ```

**Method: `getSubaccounts()`** (NEW - doesn't exist in v1)
- Create new method to fetch subaccounts separately
- Request path: `GET /pool/subaccounts`
- Optional parameters: `site_id`, `page_number`, `page_size`
- Response: Array of subaccount objects with pagination

**Method: `getSubaccount(subaccountName)`**
- Update request path: `/pool/subaccounts/${subaccountName}` (remove groupId)

**Method: `addSubaccount(name, siteId)`**
- **⚠️ Add required parameter:** `siteId`
- Update request path: `POST /pool/subaccounts`
- Request body: `{ name, site_id }`

**Method: `updateSubaccount(subaccountName, data)`** (NEW - doesn't exist in v1)
- Create new method for updating subaccounts
- Request path: `PUT /pool/subaccounts/${subaccountName}`

**Method: `removeSubaccount(subaccountName)`**
- Update request path: `DELETE /pool/subaccounts/${subaccountName}` (remove groupId)

**Files Modified:**
- `src/lib/luxor.ts` (lines ~300-500)

**Success Criteria:**
- Workspace method returns Sites instead of Groups
- New getSubaccounts() method created
- addSubaccount() requires site_id
- All methods compile without errors

**Blockers:**
- ⚠️ Workspace response structure change will break frontend pages (addressed in Phase 4)

---

### Task 1.4: Update Payment Settings Methods

| Attribute | Details |
|-----------|---------|
| **Task ID** | 1.4 |
| **Task Name** | Update payment settings methods with wallet_id |
| **Type** | Backend |
| **Scope** | `src/lib/luxor.ts` |
| **Dependencies** | Task 1.1, Task 0.2 (wallet_id clarity) |
| **Effort** | 45 minutes |
| **Risk** | 🟡 Medium (requires wallet_id) |

**Changes Required:**

**Method: `getPaymentSettings(currency_type)`**
- Parameter rename: `currency` → `currency_type`
- Update request path: `/pool/payment-settings/${currency_type}`
- Add optional `site_id` parameter

**Method: `getSubaccountPaymentSettings(currency_type, subaccountName)`**
- Parameter rename: `currency` → `currency_type`
- Update request path: `/pool/payment-settings/${currency_type}/${subaccountName}`

**Method: `createPaymentSettings(currency_type, subaccountName, wallet_id, data)`**
- Parameter rename: `currency` → `currency_type`
- **⚠️ Add required parameter:** `wallet_id: number`
- Update request path: `POST /pool/payment-settings/${currency_type}/${subaccountName}`
- Request body: `{ wallet_id, payment_frequency, addresses, day_of_week }`

**Method: `updatePaymentSettings(currency_type, subaccountName, wallet_id, data)`**
- **⚠️ Change HTTP method:** PATCH → PUT
- Parameter rename: `currency` → `currency_type`
- **⚠️ Add required parameter:** `wallet_id: number`
- Update request path: `PUT /pool/payment-settings/${currency_type}/${subaccountName}`

**Files Modified:**
- `src/lib/luxor.ts` (lines ~415-485)

**Success Criteria:**
- All payment methods updated with currency_type
- wallet_id added to create/update methods
- HTTP method changed to PUT for updates

**Blockers:**
- ⚠️ Depends on Task 0.2 (wallet_id clarification)
- If wallet_id structure is unclear, use placeholder value for testing

---

## PHASE 2: PROXY ROUTE UPDATES (Backend Only)

**Goal:** Update API proxy route to correctly map v2 endpoints and handle parameter changes.

**Frontend Impact:** ❌ None (internal proxy changes)

### Task 2.1: Update Endpoint Mapping Configuration

| Attribute | Details |
|-----------|---------|
| **Task ID** | 2.1 |
| **Task Name** | Update endpointMap to reflect v2 paths |
| **Type** | Backend |
| **Scope** | `src/app/api/luxor/route.ts` |
| **Dependencies** | Phase 1 complete |
| **Effort** | 1.5 hours |
| **Risk** | 🟡 Medium |

**Changes Required:**

**Update endpointMap object:**
- Active workers: `/pool/active-workers/:currency` → `/pool/active-workers/:currency_type`
- Hashrate: `/pool/hashrate-efficiency/:currency` → `/pool/hashrate-efficiency/:currency_type`
- Workers: `/pool/workers/:currency` → `/pool/workers/:currency_type`
- Transactions: `/pool/transactions/:currency` → `/pool/transactions/:currency_type`
- Workspace: `/workspace` (no change)
- Subaccounts: `/pool/groups/:groupId/subaccounts` → `/pool/subaccounts`
- Payment settings: Update parameter names

**Parameter Extraction Logic:**
- Rename `currency` extraction to `currency_type`
- Remove `groupId` extraction from subaccount paths
- Add `site_id` extraction where applicable

**Files Modified:**
- `src/app/api/luxor/route.ts` (lines ~50-150)

**Success Criteria:**
- All endpoint paths updated
- Parameter extraction matches v2 requirements
- No compilation errors

**Blockers:** None

---

### Task 2.2: Update Subaccount Request Handling

| Attribute | Details |
|-----------|---------|
| **Task ID** | 2.2 |
| **Task Name** | Refactor subaccount proxy logic for flat endpoint structure |
| **Type** | Backend |
| **Scope** | `src/app/api/luxor/route.ts` |
| **Dependencies** | Task 2.1 |
| **Effort** | 1 hour |
| **Risk** | 🟡 Medium |

**Changes Required:**

**GET /api/luxor?endpoint=subaccounts**
- Remove groupId path parameter handling
- Use `/pool/subaccounts` endpoint
- Extract optional `site_id` query parameter
- Pass pagination parameters

**GET /api/luxor?endpoint=subaccounts&name={name}**
- Use `/pool/subaccounts/${name}` (no groupId)

**POST /api/luxor?endpoint=subaccounts**
- Extract `site_id` from request body
- Validate site_id is present
- Call `/pool/subaccounts` with `{ name, site_id }` body

**PUT /api/luxor?endpoint=subaccounts&name={name}** (NEW)
- Add new endpoint handler for update operation
- Use `/pool/subaccounts/${name}` with PUT method

**DELETE /api/luxor?endpoint=subaccounts&name={name}**
- Use `/pool/subaccounts/${name}` (no groupId)

**Files Modified:**
- `src/app/api/luxor/route.ts` (lines ~400-600)

**Success Criteria:**
- Subaccount operations work without groupId
- site_id properly extracted and passed
- Update operation (PUT) supported

**Blockers:** None

---

### Task 2.3: Update Payment Settings Request Handling

| Attribute | Details |
|-----------|---------|
| **Task ID** | 2.3 |
| **Task Name** | Update payment settings proxy with PUT method and wallet_id |
| **Type** | Backend |
| **Scope** | `src/app/api/luxor/route.ts` |
| **Dependencies** | Task 2.1 |
| **Effort** | 45 minutes |
| **Risk** | 🟢 Low |

**Changes Required:**

**POST /api/luxor?endpoint=payment-settings (Create)**
- Extract `wallet_id` from request body
- Validate wallet_id is present
- Rename `currency` to `currency_type` in path
- Pass wallet_id in request body to v2 API

**PUT /api/luxor?endpoint=payment-settings (Update)**
- **⚠️ Change method handler:** PATCH → PUT
- Extract `wallet_id` from request body
- Rename `currency` to `currency_type` in path

**GET /api/luxor?endpoint=payment-settings**
- Rename `currency` to `currency_type` in path extraction
- Add optional `site_id` query parameter handling

**Files Modified:**
- `src/app/api/luxor/route.ts` (lines ~700-850)

**Success Criteria:**
- HTTP method changed to PUT for updates
- wallet_id extracted and passed to v2 API
- currency_type parameter used

**Blockers:** None

---

## PHASE 3: REPORTING ENDPOINTS FRONTEND (Frontend + Backend)

**Goal:** Update frontend pages that use reporting endpoints (active workers, hashrate, workers, transactions).

**Frontend Impact:** ✅ Yes (3 pages)

### Task 3.1: Update Luxor Dashboard Page

| Attribute | Details |
|-----------|---------|
| **Task ID** | 3.1 |
| **Task Name** | Update luxor dashboard to use v2 reporting endpoints |
| **Type** | Frontend |
| **Scope** | `src/app/(auth)/luxor/page.tsx` |
| **Dependencies** | Phase 2 complete |
| **Effort** | 1 hour |
| **Risk** | 🟡 Medium (tick_size validation) |

**Changes Required:**

**Line 128: Active Workers Fetch**
- Update fetch call to pass `currency_type` instead of `currency`
- **⚠️ Validate tick_size:** Remove any usage of `1w` or `1M` tick sizes
- If 1w/1M is used, replace with `1d` and add client-side aggregation logic

**Line 152: Hashrate Efficiency Fetch**
- Update fetch call to pass `currency_type` instead of `currency`
- tick_size unchanged (still supports 1w, 1M)

**Line 183: Workspace Fetch**
- **⚠️ Update response handling:** Workspace no longer returns groups/subaccounts
- Handle new response structure with sites
- If subaccounts are needed, add separate fetch to `/pool/subaccounts`

**Files Modified:**
- `src/app/(auth)/luxor/page.tsx`

**Success Criteria:**
- All reporting endpoint calls work with v2
- No tick_size errors for active workers
- Page renders correctly with new data structure

**Blockers:**
- ⚠️ If page relies on weekly/monthly active workers data, must implement client-side aggregation

**Testing:**
- Verify active workers chart displays correctly
- Verify hashrate chart displays correctly
- Verify no console errors

---

### Task 3.2: Update Client Workers Page

| Attribute | Details |
|-----------|---------|
| **Task ID** | 3.2 |
| **Task Name** | Update client workers page to use v2 active workers endpoint |
| **Type** | Frontend |
| **Scope** | `src/app/(auth)/clientworkers/page.tsx` |
| **Dependencies** | Phase 2 complete |
| **Effort** | 30 minutes |
| **Risk** | 🟢 Low |

**Changes Required:**

**Line 103: Active Workers Fetch**
- Update fetch call to pass `currency_type` instead of `currency`
- **⚠️ Validate tick_size:** Ensure not using `1w` or `1M`

**Files Modified:**
- `src/app/(auth)/clientworkers/page.tsx`

**Success Criteria:**
- Active workers data loads correctly
- No tick_size validation errors
- Page renders without errors

**Blockers:** None

**Testing:**
- Load page and verify workers list displays
- Check console for errors

---

### Task 3.3: Update Workers Management Page

| Attribute | Details |
|-----------|---------|
| **Task ID** | 3.3 |
| **Task Name** | Update workers management page to use v2 workers endpoint |
| **Type** | Frontend |
| **Scope** | `src/app/(manage)/workers/page.tsx` |
| **Dependencies** | Phase 2 complete |
| **Effort** | 45 minutes |
| **Risk** | 🟢 Low |

**Changes Required:**

**Line 127: Workers Fetch**
- Update fetch call to pass `currency_type` instead of `currency`
- Add optional `site_id` parameter if filtering by site

**Line 400: Workspace Fetch**
- **⚠️ Update response handling:** Handle sites instead of groups
- If using workspace for context, update to use sites structure

**Files Modified:**
- `src/app/(manage)/workers/page.tsx`

**Success Criteria:**
- Workers list loads correctly
- Workspace context handled properly
- No parameter errors

**Blockers:** None

**Testing:**
- Load workers management page
- Verify workers table displays
- Check filter functionality

---

## PHASE 4: SUBACCOUNTS & WORKSPACE FRONTEND (Frontend + Backend)

**Goal:** Update frontend pages that depend on workspace structure and subaccount operations.

**Frontend Impact:** ✅ Yes (4 pages) - **HIGH RISK**

### Task 4.1: Update Subaccounts Management Page

| Attribute | Details |
|-----------|---------|
| **Task ID** | 4.1 |
| **Task Name** | Refactor subaccounts page for flat API structure |
| **Type** | Frontend |
| **Scope** | `src/app/(manage)/subaccounts/page.tsx` |
| **Dependencies** | Phase 2 complete |
| **Effort** | 2 hours |
| **Risk** | 🔴 High (major refactoring) |

**Changes Required:**

**Line 138: Workspace Fetch**
- **⚠️ Split into two fetches:**
  1. Fetch workspace → get sites
  2. Fetch subaccounts separately via `/pool/subaccounts`
- Update state to handle separate workspace and subaccounts data

**Line 382: Add Subaccount**
- **⚠️ Add site_id requirement:**
  - Add dropdown to select site (from workspace.sites)
  - Pass `site_id` in request body
  - Validate site_id is selected before submission

**Line 474: Remove Subaccount**
- Update to use flat subaccount path (no groupId)
- Request: `DELETE /pool/subaccounts/${subaccountName}`

**UI Updates:**
- Add site selector dropdown to create subaccount form
- Display site association in subaccounts list
- Handle case where workspace has no sites

**Files Modified:**
- `src/app/(manage)/subaccounts/page.tsx`

**Success Criteria:**
- Subaccounts list loads from separate endpoint
- Create subaccount requires site selection
- Delete subaccount works without groupId
- UI displays site associations

**Blockers:**
- ⚠️ Must have at least one site in workspace to create subaccounts
- If no sites exist, must create site first (see Phase 5)

**Testing:**
- Load subaccounts page
- Create new subaccount with site selection
- Delete subaccount
- Verify no console errors

---

### Task 4.2: Update Admin Dashboard Route

| Attribute | Details |
|-----------|---------|
| **Task ID** | 4.2 |
| **Task Name** | Update admin dashboard API route to use v2 endpoints |
| **Type** | Backend |
| **Scope** | `src/app/api/admin/dashboard/route.ts` |
| **Dependencies** | Phase 2 complete |
| **Effort** | 1 hour |
| **Risk** | 🟡 Medium |

**Changes Required:**

**Line 77: Workspace Fetch**
- **⚠️ Update to handle sites instead of groups**
- If dashboard aggregates by groups, refactor to aggregate by sites
- If subaccounts are needed, fetch separately

**Line 148: Active Workers Fetch**
- Update to pass `currency_type` instead of `currency`
- Validate tick_size (no 1w/1M)

**Line 229: Hashrate Fetch**
- Update to pass `currency_type` instead of `currency`

**Response Aggregation:**
- If dashboard returns group-based stats, update to site-based stats
- Update response interface to match new structure

**Files Modified:**
- `src/app/api/admin/dashboard/route.ts`

**Success Criteria:**
- Dashboard endpoint returns correct data structure
- All v2 endpoints called successfully
- No parameter errors

**Blockers:** None

**Testing:**
- Call admin dashboard endpoint
- Verify response structure
- Check all nested endpoint calls succeed

---

### Task 4.3: Update Create User Modal

| Attribute | Details |
|-----------|---------|
| **Task ID** | 4.3 |
| **Task Name** | Update user creation modal to fetch subaccounts separately |
| **Type** | Frontend |
| **Scope** | `src/components/CreateUserModal.tsx` |
| **Dependencies** | Phase 2 complete |
| **Effort** | 45 minutes |
| **Risk** | 🟡 Medium |

**Changes Required:**

**Line 156: Workspace Fetch**
- **⚠️ Change logic:**
  - Fetch workspace to get workspace metadata
  - Fetch subaccounts separately via `/pool/subaccounts`
- Update state to handle separate data sources

**UI Updates:**
- If modal displays groups, update to display sites
- If modal displays subaccounts, fetch from new endpoint

**Files Modified:**
- `src/components/CreateUserModal.tsx`

**Success Criteria:**
- Modal opens and loads data correctly
- Subaccounts list populated from separate fetch
- User creation works as before

**Blockers:** None

**Testing:**
- Open create user modal
- Verify subaccounts dropdown populated
- Create test user

---

### Task 4.4: Update Any Other Workspace-Dependent Components

| Attribute | Details |
|-----------|---------|
| **Task ID** | 4.4 |
| **Task Name** | Search and update remaining workspace fetch usages |
| **Type** | Frontend |
| **Scope** | Multiple files |
| **Dependencies** | Phase 2 complete |
| **Effort** | 1 hour |
| **Risk** | 🟡 Medium |

**Actions:**
- Search codebase for workspace fetch calls: `grep -r "endpoint=workspace" src/`
- Identify any files not yet updated
- Update each to handle v2 workspace response structure

**Files to Check:**
- Any dashboard components
- Any group management components
- Any reporting components using workspace context

**Success Criteria:**
- All workspace fetches updated
- No components expecting groups in workspace response

**Blockers:** None

---

## PHASE 5: GROUPS → SITES MIGRATION (Frontend + Backend)

**Goal:** Migrate Groups management page to Sites management OR remove/refactor.

**Frontend Impact:** ✅ Yes (1 page) - **CRITICAL RISK**

### Task 5.1: Implement Sites API Methods in LuxorClient

| Attribute | Details |
|-----------|---------|
| **Task ID** | 5.1 |
| **Task Name** | Add Sites CRUD methods to LuxorClient |
| **Type** | Backend |
| **Scope** | `src/lib/luxor.ts` |
| **Dependencies** | Phase 1 complete |
| **Effort** | 1.5 hours |
| **Risk** | 🟡 Medium |

**Changes Required:**

**Add New Methods:**

```typescript
// Create Site
createSite(name: string, data?: any): Promise<Site>
  → POST /workspaces/sites

// Get Sites
getSites(): Promise<Site[]>
  → GET /workspaces/sites

// Get Specific Site
getSite(siteId: string): Promise<Site>
  → GET /workspaces/sites/{site_id}

// Update Site
updateSite(siteId: string, data: any): Promise<Site>
  → PUT /workspaces/sites/{site_id}

// Delete Site
deleteSite(siteId: string): Promise<void>
  → DELETE /workspaces/sites/{site_id}
```

**Add TypeScript Interfaces:**
```typescript
interface Site {
  id: string;
  name: string;
  // Add other site properties from v2 docs
}
```

**Files Modified:**
- `src/lib/luxor.ts`

**Success Criteria:**
- All 5 site methods implemented
- TypeScript interfaces defined
- Methods compile without errors

**Blockers:**
- ⚠️ Requires complete Sites API documentation from Luxor
- If Sites API details are unclear, may need to contact Luxor support

---

### Task 5.2: Update Proxy Route for Sites Endpoints

| Attribute | Details |
|-----------|---------|
| **Task ID** | 5.2 |
| **Task Name** | Add Sites endpoint handlers to proxy route |
| **Type** | Backend |
| **Scope** | `src/app/api/luxor/route.ts` |
| **Dependencies** | Task 5.1 |
| **Effort** | 1 hour |
| **Risk** | 🟡 Medium |

**Changes Required:**

**Add Endpoint Handlers:**
- `GET /api/luxor?endpoint=sites` → GET /workspaces/sites
- `GET /api/luxor?endpoint=sites&id={id}` → GET /workspaces/sites/{id}
- `POST /api/luxor?endpoint=sites` → POST /workspaces/sites
- `PUT /api/luxor?endpoint=sites&id={id}` → PUT /workspaces/sites/{id}
- `DELETE /api/luxor?endpoint=sites&id={id}` → DELETE /workspaces/sites/{id}

**Parameter Handling:**
- Extract `site_id` from query parameters
- Extract request body for create/update operations
- Pass parameters to LuxorClient methods

**Files Modified:**
- `src/app/api/luxor/route.ts`

**Success Criteria:**
- All 5 site operations proxied correctly
- Parameters extracted and passed properly
- Error handling implemented

**Blockers:** None

---

### Task 5.3: Refactor Groups Page to Sites Page

| Attribute | Details |
|-----------|---------|
| **Task ID** | 5.3 |
| **Task Name** | Rename and refactor groups management page to sites management |
| **Type** | Frontend |
| **Scope** | `src/app/(manage)/groups/page.tsx` |
| **Dependencies** | Task 5.1, Task 5.2 |
| **Effort** | 3-4 hours |
| **Risk** | 🔴 **CRITICAL** (entire page refactoring) |

**Changes Required:**

**Option A: Direct Migration (Recommended)**

**File Rename:**
- Rename `src/app/(manage)/groups/page.tsx` → `src/app/(manage)/sites/page.tsx`
- Update route path: `/groups` → `/sites`

**Line 227: Create Operation**
- Update fetch call from `/workspace/groups` to `/workspaces/sites`
- Update request body to match Sites API
- Update UI labels: "Create Group" → "Create Site"

**Line 309: Update Operation**
- Update fetch call to use `PUT /workspaces/sites/{site_id}`
- Update parameter from `groupId` to `site_id`
- Update UI labels: "Update Group" → "Update Site"

**Line 377: Delete Operation**
- Update fetch call to `DELETE /workspaces/sites/{site_id}`
- Update parameter from `groupId` to `site_id`

**Page UI Updates:**
- Change page title: "Groups Management" → "Sites Management"
- Update all button labels
- Update table headers
- Update form labels
- Update success/error messages

**Navigation Updates:**
- Update sidebar menu: "Groups" → "Sites"
- Update any breadcrumbs
- Update route references in other components

**Files Modified:**
- `src/app/(manage)/groups/page.tsx` → `src/app/(manage)/sites/page.tsx`
- `src/components/Sidebar.tsx` (navigation menu)
- Any other files referencing `/groups` route

**Option B: Keep Groups as Abstraction Layer** (Not Recommended)
- Keep groups page as-is
- Create adapter layer that translates Groups ↔ Sites
- More complex, harder to maintain

**Success Criteria:**
- Sites page loads without errors
- Create site operation works
- Update site operation works
- Delete site operation works
- All UI labels updated
- Navigation updated

**Blockers:**
- ⚠️ Requires complete Sites API documentation
- ⚠️ May require database migration if groups are stored locally
- ⚠️ Must communicate to users that "Groups" are now "Sites"

**Testing:**
- Load sites management page
- Create new site
- Update existing site
- Delete site
- Verify all operations succeed

---

## PHASE 6: PAYMENT SETTINGS (Backend + Frontend)

**Goal:** Update payment settings functionality with wallet_id requirement.

**Frontend Impact:** ⚠️ Conditional (if payment settings UI exists)

### Task 6.1: Update Payment Settings Forms

| Attribute | Details |
|-----------|---------|
| **Task ID** | 6.1 |
| **Task Name** | Add wallet_id field to payment settings forms |
| **Type** | Frontend |
| **Scope** | Payment settings pages/components |
| **Dependencies** | Phase 1 complete, Task 0.2 (wallet_id clarity) |
| **Effort** | 1 hour |
| **Risk** | 🟡 Medium |

**Actions:**
- Search for payment settings forms: `grep -r "payment-settings" src/`
- Identify create/update payment settings forms
- Add wallet_id input field
- Add validation for wallet_id (required)
- Update form submission to include wallet_id

**Files to Check:**
- `src/app/(manage)/payment-settings/` (if exists)
- `src/components/*PaymentSettings*.tsx` (if exists)
- Any pages making payment settings API calls

**UI Updates:**
- Add wallet_id input field (text or number input)
- Add field label and help text
- Add validation error messages
- Update form schema if using form validation library

**Success Criteria:**
- wallet_id field added to all payment settings forms
- Form validation includes wallet_id
- Form submission includes wallet_id parameter
- No console errors

**Blockers:**
- ⚠️ Depends on Task 0.2 (wallet_id structure clarity)
- If no payment settings UI exists, this task is N/A

**Testing:**
- Open payment settings form
- Verify wallet_id field is present
- Submit form without wallet_id (should fail validation)
- Submit form with wallet_id (should succeed)

---

### Task 6.2: Test Payment Settings Operations

| Attribute | Details |
|-----------|---------|
| **Task ID** | 6.2 |
| **Task Name** | Integration testing for payment settings with wallet_id |
| **Type** | Testing |
| **Scope** | Backend + Frontend |
| **Dependencies** | Task 6.1, Phase 1 complete |
| **Effort** | 30 minutes |
| **Risk** | 🟢 Low |

**Test Cases:**
1. GET payment settings (verify v2 response)
2. GET subaccount payment settings (verify v2 response)
3. POST create payment settings with wallet_id (verify creation)
4. PUT update payment settings with wallet_id (verify HTTP method works)
5. Verify error handling if wallet_id is missing

**Success Criteria:**
- All test cases pass
- Payment settings operations work correctly
- wallet_id properly included in requests

**Blockers:** None

---

## PHASE 7: TESTING & DEPLOYMENT

**Goal:** Comprehensive testing and production deployment.

**Frontend Impact:** ✅ Yes (all pages)

### Task 7.1: Comprehensive Integration Testing

| Attribute | Details |
|-----------|---------|
| **Task ID** | 7.1 |
| **Task Name** | Full application testing with v2 API |
| **Type** | Testing |
| **Scope** | All pages and features |
| **Dependencies** | All previous phases complete |
| **Effort** | 2 hours |
| **Risk** | 🟡 Medium |

**Test Plan:**

**Reporting Endpoints:**
- ✅ Active workers page loads and displays data
- ✅ Hashrate efficiency chart displays correctly
- ✅ Workers list loads with correct data
- ✅ Transactions history displays
- ✅ Admin dashboard shows correct metrics

**Workspace & Subaccounts:**
- ✅ Workspace loads with sites structure
- ✅ Subaccounts list loads from separate endpoint
- ✅ Create subaccount with site selection works
- ✅ Update subaccount works (new feature)
- ✅ Delete subaccount works

**Sites Management:**
- ✅ Sites page loads
- ✅ Create site works
- ✅ Update site works
- ✅ Delete site works
- ✅ Navigation updated to "Sites"

**Payment Settings:**
- ✅ Get payment settings works
- ✅ Create payment settings with wallet_id works
- ✅ Update payment settings with PUT method works

**Error Handling:**
- ✅ Invalid tick_size shows error
- ✅ Missing site_id shows error
- ✅ Missing wallet_id shows error
- ✅ API errors handled gracefully

**Cross-Browser Testing:**
- ✅ Chrome
- ✅ Firefox
- ✅ Safari

**Success Criteria:**
- All pages load without errors
- All CRUD operations work correctly
- No console errors or warnings
- All API calls return expected data

**Blockers:** None

---

### Task 7.2: Production Deployment

| Attribute | Details |
|-----------|---------|
| **Task ID** | 7.2 |
| **Task Name** | Deploy v2 migration to production |
| **Type** | Deployment |
| **Scope** | Full application |
| **Dependencies** | Task 7.1 (testing complete) |
| **Effort** | 1 hour |
| **Risk** | 🟡 Medium |

**Deployment Steps:**

1. **Pre-Deployment Checklist:**
   - ✅ All tests passing
   - ✅ Code reviewed
   - ✅ Database backup created (if applicable)
   - ✅ Rollback plan documented
   - ✅ Monitoring in place

2. **Environment Variables:**
   - Update `LUXOR_API_VERSION=v2` (if using variable)
   - Verify v2 API credentials configured

3. **Deployment Process:**
   ```bash
   # Commit all changes
   git add .
   git commit -m "feat: Migrate Luxor API from v1 to v2"
   
   # Create migration tag
   git tag v2-migration-complete
   
   # Push to production branch
   git push origin main
   git push --tags
   
   # Deploy to production
   # (use your deployment method: Vercel, etc.)
   ```

4. **Post-Deployment Verification:**
   - ✅ Health check: verify all endpoints responding
   - ✅ Smoke test: test critical user flows
   - ✅ Monitor error logs for 1 hour
   - ✅ Check API rate limits not exceeded
   - ✅ Verify no 404s for v2 endpoints

5. **Rollback Plan (If Needed):**
   ```bash
   # Revert to pre-migration state
   git revert HEAD
   git push origin main
   
   # Or checkout backup branch
   git checkout backup/v1-stable
   git push -f origin main
   ```

**Success Criteria:**
- Production deployment successful
- All critical flows working
- No errors in production logs
- Users able to use application normally

**Blockers:** None

**Monitoring:**
- Monitor application logs for 24-48 hours post-deployment
- Track API response times
- Monitor error rates
- User feedback

---

## DEPENDENCY GRAPH

```
Phase 0 (Pre-Migration)
  ├── Task 0.1: Git backup ──────────────────────┐
  ├── Task 0.2: wallet_id clarity ───────────────┤
  └── Task 0.3: Test environment ────────────────┤
                                                  ↓
Phase 1 (Core Library) ←───────────────────── [All Phase 0]
  ├── Task 1.1: Base URL ────────────────────────┐
  ├── Task 1.2: Reporting methods ←─────────────┤
  ├── Task 1.3: Workspace/Subaccounts ←─────────┤
  └── Task 1.4: Payment methods ←───────────────┤ + Task 0.2
                                                  ↓
Phase 2 (Proxy Route) ←────────────────────── [All Phase 1]
  ├── Task 2.1: Endpoint mapping ────────────────┐
  ├── Task 2.2: Subaccount handling ←───────────┤
  └── Task 2.3: Payment handling ←──────────────┤
                                                  ↓
Phase 3 (Reporting Frontend) ←──────────────── [All Phase 2]
  ├── Task 3.1: Luxor dashboard ─────────────────┐
  ├── Task 3.2: Client workers ──────────────────┤
  └── Task 3.3: Workers management ──────────────┤
                                                  ↓
Phase 4 (Subaccounts/Workspace Frontend) ←──── [All Phase 2]
  ├── Task 4.1: Subaccounts page ────────────────┐
  ├── Task 4.2: Admin dashboard ─────────────────┤
  ├── Task 4.3: Create user modal ───────────────┤
  └── Task 4.4: Other workspace components ──────┤
                                                  ↓
Phase 5 (Groups → Sites) ←──────────────────── [Phase 1]
  ├── Task 5.1: Sites API methods ───────────────┐
  ├── Task 5.2: Sites proxy ←───────────────────┤
  └── Task 5.3: Groups → Sites page ←───────────┤
                                                  ↓
Phase 6 (Payment Settings) ←──────────────────── [Phase 1 + Task 0.2]
  ├── Task 6.1: Payment forms ───────────────────┐
  └── Task 6.2: Payment testing ←───────────────┤
                                                  ↓
Phase 7 (Testing & Deployment) ←─────────────── [All Previous Phases]
  ├── Task 7.1: Integration testing ─────────────┐
  └── Task 7.2: Production deployment ←──────────┘
```

---

## RISK MATRIX

| Task ID | Task Name | Risk Level | Impact | Mitigation |
|---------|-----------|------------|--------|------------|
| 0.2 | wallet_id clarity | 🟡 Medium | Blocks Phase 6 | Research v2 docs, contact Luxor support |
| 1.3 | Workspace methods | 🟡 Medium | Breaks frontend | Update all workspace usages in Phase 4 |
| 2.2 | Subaccount handling | 🟡 Medium | Breaks subaccount CRUD | Thorough testing, handle site_id requirement |
| 3.1 | Luxor dashboard | 🟡 Medium | Breaks dashboard | Validate tick_size, add aggregation if needed |
| 4.1 | Subaccounts page | 🔴 High | Major UX change | Split fetch, add site selector, extensive testing |
| 5.3 | Groups → Sites page | 🔴 **CRITICAL** | Entire page rewrite | Phased approach, user communication, rollback ready |

---

## EFFORT SUMMARY BY PHASE

| Phase | Backend Effort | Frontend Effort | Total Effort | Complexity |
|-------|----------------|-----------------|--------------|------------|
| **Phase 0** | 1-2 hrs | 0 hrs | 1-2 hrs | Low |
| **Phase 1** | 2-3 hrs | 0 hrs | 2-3 hrs | Low |
| **Phase 2** | 3-4 hrs | 0 hrs | 3-4 hrs | Medium |
| **Phase 3** | 0 hrs | 2-3 hrs | 2-3 hrs | Low-Medium |
| **Phase 4** | 1 hr | 3-4 hrs | 4-5 hrs | High |
| **Phase 5** | 2.5 hrs | 3-4 hrs | 4-6 hrs | **CRITICAL** |
| **Phase 6** | 0 hrs | 1-2 hrs | 1-2 hrs | Medium |
| **Phase 7** | 0 hrs | 2-3 hrs | 2-3 hrs | Medium |
| **TOTAL** | 9.5-12.5 hrs | 11-16 hrs | **18-28 hrs** | High |

---

## CRITICAL PATH

The following tasks are on the critical path and must be completed sequentially:

1. **Task 0.2** - wallet_id clarity (blocks Phase 6)
2. **Phase 1** - Core library updates (blocks all frontend work)
3. **Phase 2** - Proxy route updates (blocks all frontend work)
4. **Task 5.1** - Sites API methods (blocks Task 5.2 and 5.3)
5. **Task 5.3** - Groups → Sites page refactoring (highest risk)

**Estimated Critical Path Duration:** 12-15 hours

---

## SUCCESS CRITERIA (Overall)

✅ All v1 endpoints replaced with v2 equivalents  
✅ All frontend pages load and function correctly  
✅ No console errors or API failures  
✅ Groups successfully migrated to Sites  
✅ Subaccounts work with site_id requirement  
✅ Payment settings work with wallet_id  
✅ Active workers respect tick_size limitations  
✅ All tests passing  
✅ Production deployment successful  
✅ No user-reported issues within 48 hours post-deployment

---

## ROLLBACK CRITERIA

Rollback to v1 if:
- ❌ More than 3 critical bugs found in production
- ❌ API rate limits exceeded due to split fetches
- ❌ User workflows completely broken
- ❌ Data loss or corruption detected
- ❌ Luxor v2 API unavailable or unstable

---

## COMMUNICATION PLAN

**Stakeholders to Notify:**
- Development team
- QA team
- Product owner
- End users (if Groups → Sites impacts UX)

**Communication Timeline:**
- **Pre-Migration:** Notify of upcoming Groups → Sites rename
- **During Migration:** Daily standup updates on progress
- **Post-Deployment:** Announce completion, monitor feedback

**User-Facing Changes:**
- "Groups" renamed to "Sites" in navigation and UI
- Subaccount creation requires site selection
- Payment settings require wallet ID

---

## RECOMMENDED EXECUTION TIMELINE

### Week 1 (Dec 13-17, 2025)
- **Day 1:** Phase 0 (Pre-Migration) - 1-2 hours
- **Day 2:** Phase 1 (Core Library) - 2-3 hours
- **Day 3:** Phase 2 (Proxy Route) - 3-4 hours
- **Day 4:** Phase 3 (Reporting Frontend) - 2-3 hours
- **Day 5:** Buffer / Code Review

### Week 2 (Dec 18-22, 2025)
- **Day 1:** Phase 4 (Subaccounts/Workspace) - 4-5 hours
- **Day 2:** Phase 5 (Groups → Sites) - 4-6 hours
- **Day 3:** Phase 6 (Payment Settings) - 1-2 hours
- **Day 4:** Phase 7 (Testing) - 2 hours
- **Day 5:** Phase 7 (Deployment) - 1 hour + monitoring

**Total Duration:** 8-10 business days (with buffer for issues)

---

## CONCLUSION

This migration plan provides a structured, phase-by-phase approach to migrating from Luxor API v1 to v2. The plan prioritizes:

1. **Backend-first approach** - Core library and proxy updates before frontend
2. **Incremental testing** - Test after each phase
3. **Risk management** - Highest-risk tasks (Groups → Sites) isolated in dedicated phase
4. **Clear dependencies** - No task starts before prerequisites complete
5. **Rollback safety** - Git backup and documented rollback procedure

**Total Estimated Effort:** 18-28 hours (3-4 days of focused work)  
**Risk Level:** Moderate-High (primarily due to Groups → Sites refactoring)  
**Recommendation:** Proceed with migration following this phased approach.

---

**Plan Status:** Ready for Implementation  
**Last Updated:** December 13, 2025  
**Next Step:** Begin Phase 0 - Pre-Migration Setup
