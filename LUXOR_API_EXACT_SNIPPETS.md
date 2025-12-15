# Luxor API V2 Calls - Exact Code Snippets

## 1. SITES OPERATIONS

### 1.1 Fetch All Sites (GET)
**Location:** `src/app/(manage)/groups/page.tsx` - Line 139, 183  
**Status:** ✅ V2 Compliant

```typescript
// Exact call from groups/page.tsx
const response = await fetch("/api/luxor?endpoint=sites");

if (!response.ok) {
  throw new Error(`API returned status ${response.status}`);
}

const data: ProxyResponse<Record<string, unknown>> =
  await response.json();

if (!data.success) {
  throw new Error(data.error || "Failed to fetch sites");
}

const responseData = data.data as
  | Record<string, unknown>
  | Array<unknown>;
let sitesList: Site[] = [];

if (Array.isArray(responseData)) {
  sitesList = responseData as Site[];
} else if (
  responseData &&
  typeof responseData === "object" &&
  Array.isArray(responseData.sites)
) {
  sitesList = responseData.sites as Site[];
}
```

---

### 1.2 Create Site (POST)
**Location:** `src/app/(manage)/groups/page.tsx` - Line 251  
**Status:** ✅ V2 Compliant

```typescript
const response = await fetch("/api/luxor", {
  method: "POST",
  body: JSON.stringify({
    endpoint: "site",
    name: dialog.formData.name,                    // string
    country: dialog.formData.country,              // string
    energy: {
      base_load_kw: dialog.formData.base_load_kw,  // number
      max_load_kw: dialog.formData.max_load_kw,    // number
      settlement_point_id: dialog.formData.settlement_point_id, // string
    },
  }),
});

const data: ProxyResponse<Site> = await response.json();

if (!response.ok || !data.success) {
  const errorMsg = data.error || `API returned status ${response.status}`;
  throw new Error(errorMsg);
}
```

---

### 1.3 Update Site (PUT)
**Location:** `src/app/(manage)/groups/page.tsx` - Line 326  
**Status:** ✅ V2 Compliant

```typescript
const siteId = dialog.selectedSite.id;  // uuid

const response = await fetch("/api/luxor", {
  method: "PUT",
  body: JSON.stringify({
    endpoint: "site",
    site_id: siteId,                              // uuid
    name: dialog.formData.name,                   // string
    country: dialog.formData.country,             // string
    energy: {
      base_load_kw: dialog.formData.base_load_kw,  // number
      max_load_kw: dialog.formData.max_load_kw,    // number
      settlement_point_id: dialog.formData.settlement_point_id, // string
    },
  }),
});

const data: ProxyResponse<Site> = await response.json();

if (!response.ok || !data.success) {
  const errorMsg = data.error || `API returned status ${response.status}`;
  throw new Error(errorMsg);
}
```

---

### 1.4 Delete Site (DELETE)
**Location:** `src/app/(manage)/groups/page.tsx` - Line 394  
**Status:** ✅ V2 Compliant

```typescript
const siteId = dialog.selectedSite.id;  // uuid

const response = await fetch("/api/luxor", {
  method: "DELETE",
  body: JSON.stringify({
    endpoint: "site",
    site_id: siteId,  // uuid
  }),
});

const data: ProxyResponse<Record<string, unknown>> =
  await response.json();

if (!response.ok || !data.success) {
  const errorMsg = data.error || `API returned status ${response.status}`;
  throw new Error(errorMsg);
}
```

---

## 2. SUBACCOUNTS OPERATIONS

### 2.1 List All Subaccounts (GET)
**Locations:**
- `src/app/(manage)/workers/page.tsx` - Lines 130, 288
- `src/app/(manage)/subaccounts/page.tsx` - Line 153
- `src/components/CreateUserModal.tsx` - Line 131
- `src/app/api/admin/dashboard/route.ts` - Line 79

**Status:** ✅ V2 Compliant  
**Note:** Proxy automatically paginates through all results

```typescript
// Client-side call
const response = await fetch("/api/luxor?endpoint=subaccounts");

if (!response.ok) {
  throw new Error(`API returned status ${response.status}`);
}

const data: ProxyResponse<SubaccountListData> = await response.json();

if (!data.success) {
  throw new Error(data.error || "Failed to fetch subaccounts");
}

const subaccountsList =
  (data.data as SubaccountListData)?.subaccounts || [];

// Server-side call (admin/dashboard/route.ts)
const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
const response = await fetch(`${baseUrl}/api/luxor?endpoint=subaccounts`, {
  method: "GET",
  headers: {
    Cookie: `token=${token}`,
  },
});

if (!response.ok) {
  console.error("[Admin Dashboard] Subaccounts fetch failed:", response.status);
  return null;
}

const result = await response.json();
if (result.success && result.data?.subaccounts) {
  const subaccounts = result.data.subaccounts as Array<{
    id: number;
    name: string;
  }>;
  return {
    total: subaccounts.length,
    active: subaccounts.length,
    inactive: 0,
  };
}
```

---

### 2.2 Create Subaccount (POST)
**Location:** `src/app/(manage)/subaccounts/page.tsx` - Line 228  
**Status:** ✅ V2 Compliant

```typescript
const FIXED_SITE_ID = "497f6eca-6276-4993-bfeb-53cbbbba6f08";  // uuid

const response = await fetch("/api/luxor", {
  method: "POST",
  body: JSON.stringify({
    endpoint: "subaccount",
    site_id: FIXED_SITE_ID,           // uuid
    name: dialog.formData.name,        // string
  }),
});

const data: ProxyResponse<Subaccount> = await response.json();

if (!response.ok || !data.success) {
  const errorMsg = data.error || `API returned status ${response.status}`;
  throw new Error(errorMsg);
}
```

---

### 2.3 Delete Subaccount (DELETE)
**Location:** `src/app/(manage)/subaccounts/page.tsx` - Line 304  
**Status:** ✅ V2 Compliant

```typescript
const FIXED_SITE_ID = "497f6eca-6276-4993-bfeb-53cbbbba6f08";  // uuid
const subaccountName = dialog.selectedSubaccount.name;         // string
const subaccountId = dialog.selectedSubaccount.id;             // number

const requestBody = {
  endpoint: "subaccount",
  site_id: FIXED_SITE_ID,           // uuid
  subaccount_id: subaccountId,       // number
  name: subaccountName,              // string
};

const response = await fetch("/api/luxor", {
  method: "DELETE",
  body: JSON.stringify(requestBody),
});

const data: ProxyResponse = await response.json();

if (!response.ok || !data.success) {
  const errorMsg = data.error || `API returned status ${response.status}`;
  throw new Error(errorMsg);
}
```

---

## 3. WORKERS OPERATIONS

### 3.1 List Workers with Pagination (GET)
**Locations:**
- `src/app/(manage)/workers/page.tsx` - Lines 211, 319
- `src/components/HostedMinersList.tsx` - Line 183
- `src/app/api/admin/dashboard/route.ts` - Line 150

**Status:** ✅ V2 Compliant

```typescript
// workers/page.tsx - Lines 211-220
const subaccountNames = ["worker1", "worker2", "worker3"];  // string[]
const currency = "BTC";
const pageNumber = 1;
const pageSize = 20;

const subaccountNamesParam = subaccountNames.join(",");
// Result: "worker1,worker2,worker3"

const response = await fetch(
  `/api/luxor?endpoint=workers&currency=${currency}&subaccount_names=${subaccountNamesParam}&page_number=${pageNumber}&page_size=${pageSize}`,
);

if (!response.ok) {
  throw new Error(`API returned status ${response.status}`);
}

const data: ProxyResponse<WorkersResponse> = await response.json();

if (!data.success) {
  throw new Error(data.error || "Failed to fetch workers");
}

const workersData = (data.data as WorkersResponse) || {};
const workersList = workersData.workers || [];
const totalItems = workersData.pagination?.item_count || 0;
```

```typescript
// HostedMinersList.tsx - Line 183
const luxorResponse = await fetch(
  "/api/luxor?endpoint=workers&currency=BTC&page_size=1000",
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  },
);

if (luxorResponse.ok) {
  const luxorData = await luxorResponse.json();
  if (
    luxorData.success &&
    luxorData.data?.workers &&
    Array.isArray(luxorData.data.workers)
  ) {
    // Process workers array
  }
}
```

```typescript
// admin/dashboard/route.ts - Lines 150-160
const siteId = process.env.LUXOR_SITE_ID;
const params = new URLSearchParams({
  endpoint: "workers",
  currency: "BTC",
  subaccount_names: subaccountNames.join(","),  // comma-separated
  page_number: "1",
  page_size: "1000",
});

if (siteId) {
  params.append("site_id", siteId);
}

const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
const response = await fetch(`${baseUrl}/api/luxor?${params.toString()}`, {
  method: "GET",
  headers: {
    Cookie: `token=${token}`,
  },
});
```

---

## 4. HASHRATE & EFFICIENCY

### 4.1 Get Hashrate Efficiency History (GET)
**Location:** `src/app/api/admin/dashboard/route.ts` - Line 200+  
**Status:** ✅ V2 Compliant

```typescript
// Calculate date range
const endDate = new Date();
const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);  // 7 days ago

const formatDate = (date: Date) => date.toISOString().split("T")[0];
// Result: "2025-12-08" to "2025-12-15"

const siteId = process.env.LUXOR_SITE_ID;
const params = new URLSearchParams({
  endpoint: "hashrate-efficiency",
  currency: "BTC",
  subaccount_names: subaccountNames.join(","),      // comma-separated
  start_date: formatDate(startDate),                 // "2025-12-08"
  end_date: formatDate(endDate),                     // "2025-12-15"
  tick_size: "1d",                                   // granularity
  page_number: "1",
  page_size: "1000",
});

if (siteId) {
  params.append("site_id", siteId);
}

const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
const response = await fetch(`${baseUrl}/api/luxor?${params.toString()}`, {
  method: "GET",
  headers: {
    Cookie: `token=${token}`,
  },
});

if (!response.ok) {
  console.error("[Admin Dashboard] Hashrate efficiency fetch failed:", response.status);
  return null;
}

const result = await response.json();
if (result.success && result.data) {
  const data = result.data as HashrateEfficiencyResponse;

  if (data.hashrate_efficiency && data.hashrate_efficiency.length > 0) {
    const metrics = data.hashrate_efficiency;
    const currentMetric = metrics[metrics.length - 1];

    // Note: hashrate can be string or number
    const currentHashrate = typeof currentMetric?.hashrate === 'string' 
      ? parseFloat(currentMetric.hashrate) 
      : (currentMetric?.hashrate || 0);

    const avgHashrate =
      metrics.reduce((sum, m) => {
        const hashrate = typeof m.hashrate === 'string' 
          ? parseFloat(m.hashrate) 
          : (m.hashrate || 0);
        return sum + hashrate;
      }, 0) / metrics.length;
  }
}
```

---

## 5. TRANSACTIONS

### 5.1 Get Transactions (GET)
**Locations:**
- `src/app/api/wallet/earnings-24h/route.ts` - Line 73
- `src/app/api/wallet/earnings-summary/route.ts` - Line 118

**Status:** ✅ V2 Compliant

```typescript
// earnings-24h/route.ts - Last 24 hours
const endDate = new Date();
const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);  // 24 hours ago

const formatDate = (date: Date) => date.toISOString().split("T")[0];
// Result: "2025-12-14" to "2025-12-15"

const client = createLuxorClient(user.luxorSubaccountName);

const transactions = await client.getTransactions("BTC", {
  transaction_type: "credit",
  start_date: formatDate(startDate),            // "2025-12-14"
  end_date: formatDate(endDate),                // "2025-12-15"
  subaccount_names: user.luxorSubaccountName,   // string
  page_size: 1000,
});

// Calculate 24-hour revenue
let revenue24hBtc = 0;
let revenue24hUsd = 0;

if (transactions.transactions && transactions.transactions.length > 0) {
  for (const tx of transactions.transactions) {
    revenue24hBtc += tx.currency_amount;
    revenue24hUsd += tx.usd_equivalent;
  }
}

return NextResponse.json({
  revenue24h: {
    btc: Number(revenue24hBtc.toFixed(8)),
    usd: Number(revenue24hUsd.toFixed(2)),
  },
  currency: "BTC",
  timestamp: new Date().toISOString(),
  dataSource: "luxor",
});
```

```typescript
// earnings-summary/route.ts - All-time with pagination
const endDate = new Date();
const startDate = new Date("2020-01-01");  // Far back date

const formatDate = (date: Date) => date.toISOString().split("T")[0];

const client = createLuxorClient(user.luxorSubaccountName);

// First page to establish baseline
let currentPage = 1;
let hasMore = true;
const pageSize = 100;

let totalEarningsBtc = 0;
let totalEarningsUsd = 0;

while (hasMore) {
  const pageTransactions = await client.getTransactions("BTC", {
    transaction_type: "credit",
    page_number: currentPage,
    page_size: pageSize,
    start_date: formatDate(startDate),         // "2020-01-01"
    end_date: formatDate(endDate),             // "2025-12-15"
    subaccount_names: user.luxorSubaccountName, // string
  });

  for (const tx of pageTransactions.transactions) {
    totalEarningsBtc += tx.currency_amount;
    totalEarningsUsd += tx.usd_equivalent;
  }

  hasMore = pageTransactions.pagination.next_page_url !== null;
  currentPage++;
}
```

---

## 6. PAYMENT SETTINGS

### 6.1 Get Payment Settings (GET)
**Location:** `src/app/api/wallet/earnings-summary/route.ts` - Line 65  
**Status:** ✅ V2 Compliant

```typescript
const client = createLuxorClient(user.luxorSubaccountName);

const paymentSettings = await client.getPaymentSettings("BTC");

// Calculate total pending payouts
let totalPendingBtc = 0;
const subaccountCount = paymentSettings.payment_settings.length;

for (const setting of paymentSettings.payment_settings) {
  console.log(
    `[Earnings Summary API] Subaccount ${setting.subaccount.name} - Balance: ${setting.balance} BTC, Status: ${setting.status}`,
  );
  totalPendingBtc += setting.balance;
}

// setting structure:
// {
//   subaccount: { name: string },
//   balance: number,
//   status: string,
//   ...
// }
```

---

## 7. PROXY ROUTE HANDLER

### Complete Endpoint Validation
**Location:** `src/app/api/luxor/route.ts` - Lines 44-95

```typescript
const endpointMap: Record<
  string,
  {
    method: "GET" | "POST" | "PUT" | "DELETE";
    requiresCurrency?: boolean;
    adminOnly?: boolean;
    description: string;
  }
> = {
  // Workspace & Sites
  workspace: {
    method: "GET",
    description: "Get workspace with sites list",
  },
  sites: {
    method: "GET",
    description: "List all sites in workspace",
  },
  site: {
    method: "GET",
    description: "Get single site by ID",
  },

  // Subaccounts
  subaccounts: {
    method: "GET",
    description: "List subaccounts",
  },
  subaccount: {
    method: "GET",
    description: "Get single subaccount",
  },

  // Payments
  "payment-settings": {
    method: "GET",
    description: "Get payment settings for currency",
  },
  transactions: {
    method: "GET",
    requiresCurrency: true,
    description: "Get transactions",
  },

  // Workers & Analytics
  workers: {
    method: "GET",
    requiresCurrency: true,
    description: "Get workers list",
  },
  revenue: {
    method: "GET",
    requiresCurrency: true,
    description: "Get revenue data",
  },
  "active-workers": {
    method: "GET",
    requiresCurrency: true,
    description: "Get active workers history",
  },
  "hashrate-efficiency": {
    method: "GET",
    requiresCurrency: true,
    description: "Get hashrate efficiency history",
  },
  "workers-hashrate-efficiency": {
    method: "GET",
    requiresCurrency: true,
    description: "Get workers hashrate efficiency history",
  },
  "pool-hashrate": {
    method: "GET",
    requiresCurrency: true,
    description: "Get pool hashrate",
  },
  "dev-fee": {
    method: "GET",
    description: "Get dev fee data",
  },
};
```

---

## 8. PARAMETER BUILD EXAMPLES

### Build Query Parameters
**From:** `src/app/api/luxor/route.ts` - Lines 193-215

```typescript
function buildQueryParams(
  searchParams: URLSearchParams,
  excludeParams: string[] = [],
): Record<string, string | number> {
  const params: Record<string, string | number> = {};

  // Always exclude endpoint parameter (not sent to Luxor API)
  const defaultExclude = ["endpoint", ...excludeParams];

  searchParams.forEach((value, key) => {
    // Skip excluded parameters
    if (defaultExclude.includes(key)) {
      return;
    }

    // Only include non-empty values
    if (value && value.trim()) {
      params[key] = value;
    }
  });

  return params;
}

// Usage in GET handler:
const queryParams = buildQueryParams(searchParams);
const currency = searchParams.get("currency");
const siteId = searchParams.get("site_id");
const subaccountName = searchParams.get("subaccount_name");
```

---

## Summary

**Total Exact API Calls Documented:** 15  
**Call Patterns:** 7  
**Status:** ✅ All V2 Compliant  
**Last Updated:** 2025-12-15
