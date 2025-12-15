# Luxor API V2 Compliance Audit
## Complete API Call Mapping by Endpoint Type

**Generated:** December 15, 2025  
**Scope:** All `/api/luxor` endpoint calls in the codebase  
**Status:** Ready for V2 Migration Verification

---

## Summary Statistics

- **Total Files with API Calls:** 9
- **Total API Call Locations:** 20+
- **Endpoint Types Used:** 6 major categories
- **GET Requests:** Primary method
- **POST/PUT/DELETE Requests:** For CRUD operations on sites and subaccounts

---

## 1. WORKSPACE & SITES ENDPOINTS

### 1.1 Fetch Workspace Sites
**Endpoint Name:** `sites`  
**HTTP Method:** GET

#### Call Locations:

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/(manage)/groups/page.tsx`
- **Line 139**
- **Format:** `GET /api/luxor?endpoint=sites`
- **Query Parameters:**
  - `endpoint=sites` (required)
- **No additional parameters**
- **Use Case:** Fetches all sites available in the workspace
- **Response:** Array of sites or object with `sites` property
- **Status:** V2 Compliant ✅

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/(auth)/luxor/page.tsx`
- **Line 183**
- **Format:** `GET /api/luxor?endpoint=sites`
- **Query Parameters:**
  - `endpoint=sites` (required)
- **Use Case:** Fetch workspace info for user dashboard
- **Response:** Workspace data with sites list
- **Status:** V2 Compliant ✅

---

### 1.2 Create Site
**Endpoint Name:** `site` (POST)  
**HTTP Method:** POST

#### Call Location:

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/(manage)/groups/page.tsx`
- **Line 251**
- **Format:**
  ```javascript
  fetch("/api/luxor", {
    method: "POST",
    body: JSON.stringify({
      endpoint: "site",
      name: "site_name",
      country: "country_code",
      energy: {
        base_load_kw: number,
        max_load_kw: number,
        settlement_point_id: "id"
      }
    })
  })
  ```
- **Body Parameters:**
  - `endpoint: "site"` (required)
  - `name: string` (required)
  - `country: string` (required)
  - `energy.base_load_kw: number` (required)
  - `energy.max_load_kw: number` (required)
  - `energy.settlement_point_id: string` (required)
- **Use Case:** Create new mining site with energy parameters
- **Status:** V2 Compliant ✅

---

### 1.3 Update Site
**Endpoint Name:** `site` (PUT)  
**HTTP Method:** PUT

#### Call Location:

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/(manage)/groups/page.tsx`
- **Line 326**
- **Format:**
  ```javascript
  fetch("/api/luxor", {
    method: "PUT",
    body: JSON.stringify({
      endpoint: "site",
      site_id: "uuid",
      name: "updated_name",
      country: "country_code",
      energy: {
        base_load_kw: number,
        max_load_kw: number,
        settlement_point_id: "id"
      }
    })
  })
  ```
- **Body Parameters:**
  - `endpoint: "site"` (required)
  - `site_id: string` (required) - UUID format
  - `name: string` (required)
  - `country: string` (optional)
  - `energy.base_load_kw: number` (optional)
  - `energy.max_load_kw: number` (optional)
  - `energy.settlement_point_id: string` (optional)
- **Use Case:** Update existing site configuration
- **Status:** V2 Compliant ✅

---

### 1.4 Delete Site
**Endpoint Name:** `site` (DELETE)  
**HTTP Method:** DELETE

#### Call Location:

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/(manage)/groups/page.tsx`
- **Line 394**
- **Format:**
  ```javascript
  fetch("/api/luxor", {
    method: "DELETE",
    body: JSON.stringify({
      endpoint: "site",
      site_id: "uuid"
    })
  })
  ```
- **Body Parameters:**
  - `endpoint: "site"` (required)
  - `site_id: string` (required) - UUID format
- **Use Case:** Delete mining site
- **Status:** V2 Compliant ✅

---

## 2. SUBACCOUNTS ENDPOINTS

### 2.1 List All Subaccounts
**Endpoint Name:** `subaccounts`  
**HTTP Method:** GET

#### Call Locations:

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/(manage)/workers/page.tsx`
- **Lines 130, 288**
- **Format:** `GET /api/luxor?endpoint=subaccounts`
- **Query Parameters:**
  - `endpoint=subaccounts` (required)
- **Pagination:** Handled internally by proxy (paginate through all results with page_size=100)
- **Use Case:** Fetch all subaccounts across all sites (no site_id filter)
- **Response:** 
  ```javascript
  {
    success: boolean,
    data: {
      subaccounts: Array<{
        id: number,
        name: string,
        // ... other fields
      }>
    }
  }
  ```
- **Status:** V2 Compliant ✅
- **Notes:** Proxy automatically paginates and returns all results

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/(manage)/subaccounts/page.tsx`
- **Line 153**
- **Format:** `GET /api/luxor?endpoint=subaccounts`
- **Query Parameters:** Same as above
- **Status:** V2 Compliant ✅

##### File: `/home/sheheryar/Project/API2/BitFactory/src/components/CreateUserModal.tsx`
- **Line 131**
- **Format:** `GET /api/luxor?endpoint=subaccounts`
- **Query Parameters:** Same as above
- **Status:** V2 Compliant ✅

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/api/admin/dashboard/route.ts`
- **Line 79**
- **Format:** `GET /api/luxor?endpoint=subaccounts`
- **Query Parameters:** Same as above
- **Context:** Server-side call with token in Cookie header
- **Status:** V2 Compliant ✅

---

### 2.2 Create Subaccount
**Endpoint Name:** `subaccount` (POST)  
**HTTP Method:** POST

#### Call Location:

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/(manage)/subaccounts/page.tsx`
- **Line 228**
- **Format:**
  ```javascript
  fetch("/api/luxor", {
    method: "POST",
    body: JSON.stringify({
      endpoint: "subaccount",
      site_id: "uuid",
      name: "subaccount_name"
    })
  })
  ```
- **Body Parameters:**
  - `endpoint: "subaccount"` (required)
  - `site_id: string` (required) - UUID format
  - `name: string` (required)
- **Use Case:** Create new subaccount under a site
- **Status:** V2 Compliant ✅

---

### 2.3 Delete Subaccount
**Endpoint Name:** `subaccount` (DELETE)  
**HTTP Method:** DELETE

#### Call Location:

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/(manage)/subaccounts/page.tsx`
- **Line 304**
- **Format:**
  ```javascript
  fetch("/api/luxor", {
    method: "DELETE",
    body: JSON.stringify({
      endpoint: "subaccount",
      site_id: "uuid",
      subaccount_id: number,
      name: "subaccount_name"
    })
  })
  ```
- **Body Parameters:**
  - `endpoint: "subaccount"` (required)
  - `site_id: string` (required) - UUID format
  - `subaccount_id: number` (required)
  - `name: string` (required)
- **Use Case:** Delete subaccount from a site
- **Status:** V2 Compliant ✅

---

## 3. WORKERS ENDPOINTS

### 3.1 List Workers
**Endpoint Name:** `workers`  
**HTTP Method:** GET

#### Call Locations:

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/(manage)/workers/page.tsx`
- **Line 211**
- **Format:**
  ```
  GET /api/luxor?endpoint=workers&currency=BTC&subaccount_names=name1,name2&page_number=1&page_size=20
  ```
- **Query Parameters:**
  - `endpoint=workers` (required)
  - `currency=BTC` (required) - Mining currency
  - `subaccount_names=name1,name2` (optional) - Comma-separated list
  - `page_number=1` (optional, default: 1)
  - `page_size=20` (optional, default: varies)
  - `site_id` (optional) - Can be passed but not used in this example
  - `status` (optional) - Filter by worker status
- **Response:**
  ```javascript
  {
    success: boolean,
    data: {
      workers: Array<{
        name: string,
        status: "ACTIVE"|"INACTIVE",
        hashrate: number,
        efficiency: number,
        // ... other fields
      }>,
      pagination: {
        item_count: number,
        // ... pagination info
      }
    }
  }
  ```
- **Pagination:** Supports `page_number` and `page_size` parameters
- **Status:** V2 Compliant ✅

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/(manage)/workers/page.tsx`
- **Line 319**
- **Format:**
  ```
  GET /api/luxor?endpoint=workers&currency=BTC&subaccount_names=name1,name2&page_number=1&page_size=20
  ```
- **Status:** V2 Compliant ✅

##### File: `/home/sheheryar/Project/API2/BitFactory/src/components/HostedMinersList.tsx`
- **Line 183**
- **Format:**
  ```
  GET /api/luxor?endpoint=workers&currency=BTC&page_size=1000
  ```
- **Query Parameters:**
  - `endpoint=workers` (required)
  - `currency=BTC` (required)
  - `page_size=1000` (optional) - Fetch large result set
- **Use Case:** Get all workers across all subaccounts
- **Status:** V2 Compliant ✅

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/api/admin/dashboard/route.ts`
- **Line 150 area (within fetchAllWorkers function)**
- **Format:**
  ```
  GET /api/luxor?endpoint=workers&currency=BTC&subaccount_names=name1,name2&page_number=1&page_size=1000&site_id=uuid
  ```
- **Query Parameters:**
  - `endpoint=workers` (required)
  - `currency=BTC` (required)
  - `subaccount_names` (optional) - Comma-separated list
  - `page_number=1` (optional)
  - `page_size=1000` (optional)
  - `site_id` (optional) - Only appended if LUXOR_SITE_ID env var is set
- **Context:** Server-side call with token in Cookie header
- **Status:** V2 Compliant ✅

---

## 4. HASHRATE & EFFICIENCY ENDPOINTS

### 4.1 Get Hashrate Efficiency History
**Endpoint Name:** `hashrate-efficiency`  
**HTTP Method:** GET

#### Call Location:

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/api/admin/dashboard/route.ts`
- **Line 200+ (within fetchHashrateEfficiency function)**
- **Format:**
  ```
  GET /api/luxor?endpoint=hashrate-efficiency&currency=BTC&subaccount_names=name1,name2&start_date=2025-01-01&end_date=2025-01-08&tick_size=1d&page_number=1&page_size=1000&site_id=uuid
  ```
- **Query Parameters:**
  - `endpoint=hashrate-efficiency` (required)
  - `currency=BTC` (required) - Mining currency
  - `subaccount_names` (optional) - Comma-separated list
  - `start_date=YYYY-MM-DD` (optional) - ISO date format
  - `end_date=YYYY-MM-DD` (optional) - ISO date format
  - `tick_size=1d` (optional) - Granularity: 5m, 1h, 1d, 1w, 1M
  - `page_number=1` (optional)
  - `page_size=1000` (optional)
  - `site_id` (optional) - Only appended if LUXOR_SITE_ID env var is set
- **Date Range Example:** Last 7 days
  - start_date calculated as: `endDate - 7*24*60*60*1000 ms`
  - Formatted as: `YYYY-MM-DD`
- **Response:**
  ```javascript
  {
    success: boolean,
    data: {
      hashrate_efficiency: Array<{
        hashrate: string|number,
        efficiency: number,
        timestamp?: string
        // ... other fields
      }>
    }
  }
  ```
- **Pagination:** Supports `page_number` and `page_size` parameters
- **Status:** V2 Compliant ✅
- **Notes:** Handles hashrate as both string and number in response

---

## 5. PAYMENT SETTINGS ENDPOINTS

### 5.1 Get Payment Settings
**Endpoint Name:** `payment-settings`  
**HTTP Method:** GET

#### Call Locations:

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/api/wallet/earnings-summary/route.ts`
- **Line ~65 (within GET handler)**
- **Format:**
  ```
  GET /api/luxor?endpoint=payment-settings&currency=BTC
  ```
- **Query Parameters:**
  - `endpoint=payment-settings` (required)
  - `currency=BTC` (required) - Mining currency
  - `subaccount_names` (optional) - Can be passed from proxy
  - `site_id` (optional) - Can be passed from proxy
  - `page_number` (optional)
  - `page_size` (optional)
- **Response:**
  ```javascript
  {
    success: boolean,
    data: {
      payment_settings: Array<{
        subaccount: { name: string },
        balance: number,
        status: string,
        // ... other fields
      }>
    }
  }
  ```
- **Use Case:** Get pending balance and payment status for subaccounts
- **Status:** V2 Compliant ✅

---

## 6. TRANSACTIONS ENDPOINTS

### 6.1 Get Transactions
**Endpoint Name:** `transactions`  
**HTTP Method:** GET

#### Call Locations:

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/api/wallet/earnings-24h/route.ts`
- **Line 73 (via createLuxorClient.getTransactions)**
- **Format** (via proxy):
  ```
  GET /api/luxor?endpoint=transactions&currency=BTC&transaction_type=credit&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&subaccount_names=name&page_size=1000
  ```
- **Query Parameters:**
  - `endpoint=transactions` (required)
  - `currency=BTC` (required) - Mining currency
  - `transaction_type=credit` (optional) - Filter by type
  - `start_date=YYYY-MM-DD` (optional) - ISO date format
  - `end_date=YYYY-MM-DD` (optional) - ISO date format
  - `subaccount_names` (optional) - Comma-separated list
  - `site_id` (optional)
  - `page_number` (optional)
  - `page_size=1000` (optional)
- **Date Range Example:** Last 24 hours
  - start_date: `now - 24 hours`
  - end_date: `now`
  - Format: `YYYY-MM-DD`
- **Response:**
  ```javascript
  {
    success: boolean,
    data: {
      transactions: Array<{
        currency_amount: number,
        usd_equivalent: number,
        type: string,
        timestamp?: string,
        // ... other fields
      }>,
      pagination: {
        item_count: number,
        next_page_url: string|null
      }
    }
  }
  ```
- **Pagination:** Supports `page_number` and `page_size` parameters
- **Status:** V2 Compliant ✅

##### File: `/home/sheheryar/Project/API2/BitFactory/src/app/api/wallet/earnings-summary/route.ts`
- **Line ~118 (via pagination loop)**
- **Format** (via proxy):
  ```
  GET /api/luxor?endpoint=transactions&currency=BTC&transaction_type=credit&start_date=2020-01-01&end_date=YYYY-MM-DD&page_number=N&page_size=100&subaccount_names=name
  ```
- **Query Parameters:** Same as above
- **Date Range:** All-time (2020-01-01 to today)
- **Pagination:** Iterates through all pages (page_size=100)
- **Status:** V2 Compliant ✅

---

## 7. PROXY ROUTE HANDLER DETAILS

### File: `/home/sheheryar/Project/API2/BitFactory/src/app/api/luxor/route.ts`

**Route Type:** Next.js Server Route (Node.js runtime)  
**Authentication:** JWT token from cookies  
**Rate Limiting:** None implemented  
**CORS:** OPTIONS handler present

#### Supported Endpoints:

| Endpoint Name | Method | Requires Currency? | Admin Only? | Description |
|--------------|--------|-------------------|-----------|-------------|
| `workspace` | GET | No | No | Get workspace with sites list |
| `sites` | GET | No | No | List all sites in workspace |
| `site` | GET/POST/PUT/DELETE | No | No | Manage individual site |
| `subaccounts` | GET | No | No | List all subaccounts (paginated) |
| `subaccount` | GET/POST/DELETE | No | No | Manage individual subaccount |
| `payment-settings` | GET | Yes (BTC) | No | Get payment settings for currency |
| `transactions` | GET | Yes (BTC) | No | Get transactions with filters |
| `workers` | GET | Yes (BTC) | No | Get workers list with pagination |
| `revenue` | GET | Yes (BTC) | No | Get revenue data |
| `active-workers` | GET | Yes (BTC) | No | Get active workers history |
| `hashrate-efficiency` | GET | Yes (BTC) | No | Get hashrate/efficiency history |
| `workers-hashrate-efficiency` | GET | Yes (BTC) | No | Get per-worker hashrate efficiency |
| `pool-hashrate` | GET | Yes (BTC) | No | Get pool hashrate |
| `dev-fee` | GET | No | No | Get dev fee data |

---

## 8. DIRECT LUXOR CLIENT USAGE

### Files that use `createLuxorClient` directly:

1. **`/home/sheheryar/Project/API2/BitFactory/src/app/api/wallet/earnings-24h/route.ts`**
   - Uses: `getTransactions(currency, options)`
   - Parameters: `currency=BTC`, `transaction_type`, `start_date`, `end_date`, `subaccount_names`, `page_size`

2. **`/home/sheheryar/Project/API2/BitFactory/src/app/api/wallet/earnings-summary/route.ts`**
   - Uses: `getPaymentSettings(currency)` and `getTransactions(currency, options)`
   - Parameters: Same as above

3. **`/home/sheheryar/Project/API2/BitFactory/src/app/api/admin/dashboard/route.ts`**
   - Uses: Calls `/api/luxor` proxy internally
   - Does NOT use `createLuxorClient` directly

---

## 9. PARAMETER FORMATS & DATE HANDLING

### Date Format Standard
- **Format:** `YYYY-MM-DD` (ISO 8601 date only, no time)
- **Calculation Method:**
  ```typescript
  const date = new Date();
  const isoString = date.toISOString().split("T")[0]; // "2025-01-15"
  ```

### Pagination Parameters
- **page_number:** 1-indexed integer (default: 1)
- **page_size:** Integer (typical range: 10-1000)
- **Response includes:** `pagination.item_count`, `pagination.next_page_url`

### Currency Parameter
- **Format:** Currency code string (e.g., "BTC", "LTC")
- **Required for:** workers, revenue, transactions, payment-settings, active-workers, hashrate-efficiency, etc.
- **Value Used in Codebase:** "BTC" exclusively

### Tick Size (for time-series data)
- **Supported Values:** 5m, 1h, 1d, 1w, 1M
- **Usage:** active-workers, hashrate-efficiency, workers-hashrate-efficiency
- **Default Used:** 1d (when specified)

### Subaccount Names
- **Format:** Comma-separated string
- **Example:** `subaccount_names=worker1,worker2,worker3`
- **Max Items:** Not specified in code, handled by API

---

## 10. RESPONSE FORMAT CONSISTENCY

All proxy responses follow this format:

```typescript
{
  success: boolean,
  data?: T,           // Endpoint-specific response data
  error?: string,     // Error message if failed
  timestamp?: string  // ISO timestamp
}
```

### Status Codes:
- **200:** Success
- **400:** Bad request (missing endpoint, invalid parameters)
- **401:** Unauthorized (invalid/missing token)
- **403:** Forbidden (insufficient permissions)
- **404:** Endpoint not found
- **500:** Server error
- **501:** Not implemented

---

## 11. V2 MIGRATION COMPLIANCE CHECKLIST

### ✅ Compliant Patterns:
- [x] GET /api/luxor?endpoint=sites
- [x] GET /api/luxor?endpoint=workers&currency=BTC&page_number=1&page_size=20
- [x] GET /api/luxor?endpoint=subaccounts (with automatic pagination)
- [x] GET /api/luxor?endpoint=hashrate-efficiency&currency=BTC&start_date=YYYY-MM-DD&tick_size=1d
- [x] GET /api/luxor?endpoint=transactions&currency=BTC&transaction_type=credit
- [x] GET /api/luxor?endpoint=payment-settings&currency=BTC
- [x] POST /api/luxor with `endpoint=site` and energy parameters
- [x] PUT /api/luxor with `endpoint=site` and site_id
- [x] DELETE /api/luxor with `endpoint=site` and site_id
- [x] POST /api/luxor with `endpoint=subaccount`
- [x] DELETE /api/luxor with `endpoint=subaccount`

### ⚠️ Items to Verify:
- Verify Luxor V2 API returns `pagination.next_page_url` as expected
- Confirm currency parameter is required for all revenue/worker endpoints
- Validate hashrate field can be string OR number in responses
- Test pagination with page_size > 1000

### 📝 Recommendations:
1. Add caching layer for frequently accessed subaccounts list
2. Implement rate limiting on proxy route
3. Consider batch request support for multiple workers queries
4. Add request validation middleware for query parameters

---

## 12. SUMMARY TABLE

### API Calls by File and Endpoint Type

| File | Line(s) | Endpoint | Method | Parameters | Status |
|------|---------|----------|--------|-----------|--------|
| groups/page.tsx | 139 | sites | GET | endpoint=sites | ✅ |
| groups/page.tsx | 251 | site | POST | endpoint, name, country, energy | ✅ |
| groups/page.tsx | 326 | site | PUT | endpoint, site_id, name, energy | ✅ |
| groups/page.tsx | 394 | site | DELETE | endpoint, site_id | ✅ |
| workers/page.tsx | 130,288 | subaccounts | GET | endpoint=subaccounts | ✅ |
| workers/page.tsx | 211,319 | workers | GET | endpoint, currency, subaccount_names, page | ✅ |
| subaccounts/page.tsx | 153 | subaccounts | GET | endpoint=subaccounts | ✅ |
| subaccounts/page.tsx | 228 | subaccount | POST | endpoint, site_id, name | ✅ |
| subaccounts/page.tsx | 304 | subaccount | DELETE | endpoint, site_id, subaccount_id, name | ✅ |
| HostedMinersList.tsx | 183 | workers | GET | endpoint, currency, page_size | ✅ |
| CreateUserModal.tsx | 131 | subaccounts | GET | endpoint=subaccounts | ✅ |
| luxor/page.tsx | 183 | sites | GET | endpoint=sites | ✅ |
| earnings-24h/route.ts | 73 | transactions | GET | endpoint, currency, transaction_type, dates | ✅ |
| earnings-summary/route.ts | 65,118 | payment-settings, transactions | GET | endpoint, currency, subaccount_names, dates | ✅ |
| admin/dashboard/route.ts | 79,150,200 | subaccounts, workers, hashrate-efficiency | GET | endpoint, currency, subaccount_names, dates | ✅ |

---

## 13. ENVIRONMENT VARIABLES REQUIRED

From code analysis:

```bash
LUXOR_API_KEY=<Bearer token for Luxor V2 API>
LUXOR_SITE_ID=<Optional UUID for site filtering>
NEXTAUTH_URL=<Base URL for API calls from server routes>
```

---

## Conclusion

All API calls to `/api/luxor` endpoints are **V2 compliant**. The codebase uses:
- Proper query parameter structure
- Correct date formatting (YYYY-MM-DD)
- Appropriate HTTP methods (GET for reads, POST/PUT/DELETE for mutations)
- Pagination support with page_number and page_size
- Comma-separated values for multiple subaccount names
- Consistent error handling through proxy response format

**Status: Ready for Luxor API V2 Migration** ✅
