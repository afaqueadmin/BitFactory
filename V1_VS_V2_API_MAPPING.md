# Luxor API V1 vs V2 Mapping

## Current Implementation Status
- **Current Base URL:** `https://app.luxor.tech/api/v1`
- **Target Base URL:** `https://app.luxor.tech/api/v2`
- **Status:** All methods still on V1, ready for V2 migration

---

## API Methods Currently Implemented (V1)

### 1. **Workspace Management**

| V1 Method | V1 Endpoint | Description | V2 Endpoint | V2 Status |
|-----------|-------------|-------------|-------------|-----------|
| `getWorkspace()` | `GET /workspace` | Get workspace with groups | `GET /workspace` | ⚠️ **CHANGED** - Returns sites instead of groups |

**V1 Response:**
```json
{
  "id": "workspace-id",
  "name": "My Workspace",
  "products": ["POOL"],
  "groups": [...]
}
```

**V2 Response:**
```json
{
  "id": "workspace-id",
  "name": "My Workspace",
  "products": ["POOL"],
  "sites": [
    {
      "id": "site-uuid",
      "name": "My Site"
    }
  ]
}
```

---

### 2. **Group Management** (V1 ONLY - NO V2 EQUIVALENT)

| V1 Method | V1 Endpoint | Description | V2 Status |
|-----------|-------------|-------------|-----------|
| `createGroup(name)` | `POST /workspace/groups` | Create a group | ❌ **NOT SUPPORTED IN V2** |
| `updateGroup(id, name)` | `PATCH /workspace/groups/{id}` | Update group name | ❌ **NOT SUPPORTED IN V2** |
| `deleteGroup(id)` | `DELETE /workspace/groups/{id}` | Delete a group | ❌ **NOT SUPPORTED IN V2** |
| `getGroup(id)` | `GET /workspace/groups/{id}` | Get group details | ❌ **NOT SUPPORTED IN V2** |

**Note:** Groups are completely replaced by Sites in V2. Groups concept no longer exists.

---

### 3. **Subaccount Management**

| V1 Method | V1 Endpoint | V1 Usage | V2 Endpoint | V2 Signature | Status |
|-----------|-------------|----------|-------------|-------------|--------|
| `getSubaccount(groupId, name)` | `GET /pool/groups/{groupId}/subaccounts/{name}` | Get single subaccount | `GET /pool/subaccounts/{name}` | `getSubaccount(name)` | ⚠️ **CHANGED** |
| `listSubaccounts(groupId)` | `GET /pool/groups/{groupId}/subaccounts` | List subaccounts in group | `GET /pool/subaccounts?site_id={siteId}` | `listSubaccounts(siteId?)` | ⚠️ **CHANGED** |
| `addSubaccount(groupId, name)` | `POST /pool/groups/{groupId}/subaccounts` | Add subaccount to group | `POST /pool/subaccounts` | `createSubaccount(name, siteId)` | ⚠️ **CHANGED** |
| `removeSubaccount(groupId, name)` | `DELETE /pool/groups/{groupId}/subaccounts/{name}` | Remove from group | `DELETE /pool/subaccounts/{name}` | `deleteSubaccount(name)` | ⚠️ **CHANGED** |

**Key Changes:**
- ✅ `groupId` parameter **REMOVED** from all methods
- ✅ `siteId` parameter **ADDED** (required for create, optional for list)
- ✅ Response now includes `site` object with site details

---

### 4. **Payment Settings**

| V1 Method | V1 Endpoint | Description | V2 Endpoint | Status |
|-----------|-------------|-------------|-------------|--------|
| `getPaymentSettings(currency, params?)` | `GET /pool/payment-settings/{currency}` | Get payment settings | `GET /pool/payment-settings/{currency}` | ✅ **UNCHANGED** |
| `getSubaccountPaymentSettings(currency, name)` | `GET /pool/payment-settings/{currency}/{name}` | Get subaccount settings | `GET /pool/payment-settings/{currency}/{name}` | ✅ **UNCHANGED** |
| `createPaymentSettings(currency, name, settings)` | `POST /pool/payment-settings/{currency}/{name}` | Create settings | `POST /pool/payment-settings/{currency}/{name}` | ✅ **UNCHANGED** |
| `updatePaymentSettings(currency, name, settings)` | `PUT /pool/payment-settings/{currency}/{name}` | Update settings | `PUT /pool/payment-settings/{currency}/{name}` | ✅ **UNCHANGED** |

---

### 5. **Transactions**

| V1 Method | V1 Endpoint | Description | V2 Endpoint | Status |
|-----------|-------------|-------------|-------------|--------|
| `getTransactions(currency, params?)` | `GET /pool/transactions/{currency}` | Get transactions | `GET /pool/transactions/{currency}` | ✅ **UNCHANGED** |

**Supported Params:**
- `start_date` ✅
- `end_date` ✅
- `transaction_type` ✅
- `page_number` ✅
- `page_size` ✅
- `subaccount_names` ✅
- `group_id` ❌ → Use `site_id` in V2

---

## NEW V2 APIs (Not Yet Implemented)

### 1. **Site Management** (NEW IN V2)

| V2 Method | V2 Endpoint | Description | Implementation |
|-----------|-------------|-------------|-----------------|
| `getSites()` | `GET /workspace/sites` | List all sites | ⏳ **TODO** |
| `getSite(siteId)` | `GET /workspace/sites/{siteId}` | Get single site | ⏳ **TODO** |

**Response Structure:**
```json
{
  "sites": [
    {
      "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
      "name": "My Site",
      "country": "USA",
      "energy": {
        "base_load_kw": 100,
        "max_load_kw": 1000,
        "min_load_kw": 0,
        "settlement_point_id": "123e4567-e89b-12d3-a456-426614174000",
        "settlement_point_name": "LZ_NORTH",
        "power_market": "ERCOT"
      },
      "pool": {
        "subaccounts": [
          {
            "id": 0,
            "name": "my_subaccount"
          }
        ]
      }
    }
  ]
}
```

---

### 2. **Workers** (V2 Endpoint Signature Changed)

| V1 Method | V1 Endpoint | V2 Endpoint | Key Changes |
|-----------|-------------|-------------|------------|
| Generic request | `GET /pool/workers/{currency}` | `GET /pool/workers/{currency}` | ✅ Unchanged |

**But supports NEW params in V2:**
- `site_id` - NEW parameter to filter by site
- `subaccount_names` - Comma-separated list

**V2 Response includes:**
```json
{
  "subaccounts": [
    {
      "id": 0,
      "name": "my_subaccount",
      "site": {
        "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
        "name": "My Site"
      },
      ...
    }
  ],
  "workers": [...]
}
```

---

### 3. **Revenue** (NEW IN V2)

| Method | V2 Endpoint | Description | Parameters | Status |
|--------|-------------|-------------|------------|--------|
| `getRevenue()` | `GET /pool/revenue/{currency}` | Get revenue data | `subaccount_names`, `site_id`, `start_date`, `end_date` | ⏳ **TODO** |

**Endpoint:**
```
GET https://app.luxor.tech/api/v2/pool/revenue/BTC
?subaccount_names=my_subaccount,another_subaccount
&site_id=b0a5fad8-0e09-4f10-ac20-ccd80fb2d138
&start_date=2025-01-01
&end_date=2025-01-31
```

**Response:**
```json
{
  "currency_type": "BTC",
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "subaccounts": [
    {
      "id": 0,
      "name": "my_subaccount",
      "site": {
        "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
        "name": "My Site"
      },
      "created_at": "2019-08-24T14:15:22Z",
      "url": "string"
    }
  ],
  "revenue": [
    {
      "date_time": "2019-08-24T14:15:22Z",
      "revenue": {
        "currency_type": "BTC",
        "revenue_type": "MINING",
        "revenue": 0.00066154
      }
    }
  ]
}
```

---

### 4. **Active Workers History** (V2 Signature Changed)

| V1 | V2 | Key Changes |
|----|----|------------|
| `GET /pool/active-workers/{currency}` | `GET /pool/active-workers/{currency}` | ✅ Endpoint unchanged |

**New V2 Parameters:**
- `site_id` - NEW parameter
- `subaccount_names` - Comma-separated list
- `start_date`, `end_date` - Time range
- `tick_size` - Granularity (5m, 1h, 1d, 1w, 1M)

**Example:**
```
GET https://app.luxor.tech/api/v2/pool/active-workers/BTC
?subaccount_names=my_subaccount,another_subaccount
&site_id=b0a5fad8-0e09-4f10-ac20-ccd80fb2d138
&start_date=2025-01-01
&end_date=2025-01-31
&tick_size=1d
&page_number=1
&page_size=10
```

---

### 5. **Hashrate History / Efficiency** (V2 Signature Changed)

| V1 | V2 | Key Changes |
|----|----|------------|
| `GET /pool/hashrate-efficiency/{currency}` | `GET /pool/workers-hashrate-efficiency/{currency}/{subaccount}` | ⚠️ **ENDPOINT CHANGED** |

**New V2:**
```
GET https://app.luxor.tech/api/v2/pool/workers-hashrate-efficiency/BTC/my_subaccount
?worker_names=worker_1,worker_2
&tick_size=1d
&start_date=2025-01-01
&end_date=2025-01-31
&page_number=1
&page_size=10
```

**Response:**
```json
{
  "currency_type": "BTC",
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "tick_size": "1d",
  "hashrate_efficiency_revenue": {
    "worker_1": [
      {
        "date_time": "2019-08-24T14:15:22Z",
        "hashrate": "1035827914295214",
        "efficiency": 0.9960606098175049,
        "est_revenue": 0.00066154
      }
    ]
  },
  "pagination": {
    "page_number": 1,
    "page_size": 1,
    "item_count": 0,
    "previous_page_url": null,
    "next_page_url": null
  }
}
```

---

## Migration Priority

### Phase 1: Critical (Blocking UI)
1. ✅ **Site Management** - `getSites()`, `getSite()` → Required for subaccount management
2. ✅ **Subaccount Methods** - All 4 methods updated to use `siteId` instead of `groupId`
3. ✅ **Workspace Endpoint** - Updated to return sites instead of groups

### Phase 2: Important (Dashboard/Analytics)
4. ⏳ **Revenue API** - `getRevenue()` → New endpoint for revenue reporting
5. ⏳ **Active Workers** - Updated signature with `site_id`
6. ⏳ **Hashrate History** - Endpoint changed, signature updated

### Phase 3: Optional (Admin Features)
7. ❌ **Group Management** - All group CRUD operations are NO LONGER SUPPORTED in V2

---

## Files Affected by V2 Migration

| File | Current V1 Usage | V2 Changes Needed |
|------|-----------------|------------------|
| `src/lib/luxor.ts` | All methods use V1 base URL | Update base URL, 4 subaccount methods, add 2 site methods |
| `src/app/api/luxor/route.ts` | Proxy routes for all endpoints | Update subaccount endpoint handlers, add site endpoint |
| `src/app/(manage)/subaccounts/page.tsx` | Fetches groups, calls `addSubaccount(groupId, name)` | Fetch sites, call `createSubaccount(name, siteId)` |
| `src/components/CreateUserModal.tsx` | Group multi-select, `addSubaccount(groupId, name)` | Site single-select, `createSubaccount(name, siteId)` |
| `src/app/api/user/create/route.ts` | Validates `groupIds` array | Validate `siteId` string |
| `src/app/(manage)/workers/page.tsx` | Lists groups, fetches subaccounts | Update to fetch sites for context |
| `src/app/api/wallet/settings/route.ts` | Uses `subaccountName` (unchanged) | No changes needed |
| `src/app/(manage)/admin/dashboard/page.tsx` | May call workers/hashrate | Update params to include `site_id` |

---

## Key Breaking Changes Summary

### ✅ What's Removed (V1 → V2)
- ❌ Groups concept entirely removed
- ❌ `groupId` parameter from all subaccount methods
- ❌ Group CRUD operations (create/update/delete)
- ❌ `group_id` parameter in transaction queries

### ✅ What's Added (V2)
- ✅ Sites as primary organizational unit
- ✅ `siteId` parameter (required for subaccount create)
- ✅ Site management methods (list/get)
- ✅ `site_id` in all major query responses
- ✅ Revenue API endpoint
- ✅ Hashrate/efficiency renamed endpoint

### ✅ What's Unchanged
- ✅ Payment settings endpoints and logic
- ✅ Transactions endpoints
- ✅ Worker query endpoints (just signature changed for site filtering)
- ✅ Subaccount name concept (still primary identifier)

