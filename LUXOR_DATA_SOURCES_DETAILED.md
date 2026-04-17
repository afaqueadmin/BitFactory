# Luxor API Data Sources - Complete Code Analysis

**Understanding how dashboard metrics are fetched and calculated from Luxor APIs**

---

## ARCHITECTURAL OVERVIEW

```
Dashboard Page (/src/app/(manage)/adminpanel/page.tsx)
        ↓
Admin Dashboard API Endpoint (/src/app/api/admin/dashboard/route.ts)
        ↓
Luxor Proxy Route (/src/app/api/luxor/route.ts)
        ↓
Luxor API V2 Client (/src/lib/luxor.ts)
        ↓
Luxor Mining API (https://app.luxor.tech/api/v2)
```

---

## PART 1: SUBACCOUNTNAMES DEPENDENCY

### Initial Fetch: `getAllSubaccountNames()`

**File:** `route.ts` line 62-110

**What it does:**
- Calls `/api/luxor?endpoint=subaccounts` internally
- Parses response to extract `subaccount.name` array
- Returns list of subaccount names like `["saima", "testpool", "mining2"]`

**Code:**
```javascript
async function getAllSubaccountNames(request: NextRequest): Promise<string[]> {
  // 1. Call /api/luxor?endpoint=subaccounts
  const url = new URL("/api/luxor?endpoint=subaccounts", request.url);
  const response = await fetch(...);  // Uses LuxorClient.listSubaccounts()
  
  // 2. Extract subaccount names
  if (result.success && result.data?.subaccounts) {
    const subaccounts = result.data.subaccounts as Array<{id, name}>;
    const subaccountNames = subaccounts.map((s) => s.name);
    // Returns: ["saima", "testpool"]
  }
  
  // 3. FALLBACK to database if API returns empty
  // Queries: SELECT luxorSubaccountName FROM users WHERE luxorSubaccountName IS NOT NULL
}
```

**Luxor API Endpoint Called:**
```
GET https://app.luxor.tech/api/v2/pool/subaccounts
  ↓
LuxorClient.listSubaccounts()  // in route.ts case "subaccounts"
```

**Response Structure from Luxor:**
```json
{
  "subaccounts": [
    {
      "id": 12345,
      "name": "saima",
      "site": {"id": "site-uuid", "name": "SiteA"}
    },
    {
      "id": 12346,
      "name": "testpool",
      "site": {"id": "site-uuid", "name": "SiteA"}
    }
  ],
  "pagination": {...}
}
```

**Critical Dependency:** All 10 Luxor-dependent cards depend on `subaccountNames.length > 0`. If empty, they show 0 with warning.

---

## PART 2: WORKERS DATA SOURCE

### Fetch Function: `fetchAllWorkers()`

**File:** `route.ts` line 175-223

**What it does:**
1. Takes `subaccountNames` array as input
2. Calls `/api/luxor?endpoint=workers&...` with site_id
3. Returns:
   - `active: number` (from `data.total_active`)
   - `inactive: number` (from `data.total_inactive`)
   - `total: number` (sum of both)
   - `activeHashrate: number` (summed from workers array)
   - `inactiveHashrate: number` (summed from workers array)

**Code:**
```javascript
async function fetchAllWorkers(
  request: NextRequest,
  subaccountNames: string[],
): Promise<{active, inactive, total, activeHashrate, inactiveHashrate} | null> {
  
  // 1. Build URL with parameters
  const url = new URL("/api/luxor", request.url);
  url.searchParams.set("endpoint", "workers");
  url.searchParams.set("currency", "BTC");
  url.searchParams.set("page_number", "1");
  url.searchParams.set("page_size", "1000");
  url.searchParams.set("site_id", process.env.LUXOR_FIXED_SITE_ID || "");
  
  // NOTE: Does NOT pass subaccount_names here!
  // This is a global site-level workers call
  
  const response = await fetch(luxorRequest);
  const result = await response.json();
  
  // 2. Parse response
  if (result.success && result.data) {
    const data = result.data as WorkersResponse;
    
    // Get total_active and total_inactive (aggregated counts)
    return {
      active: data.total_active || 0,        // e.g., 42
      inactive: data.total_inactive || 0,    // e.g., 5
      total: (data.total_active || 0) + (data.total_inactive || 0),  // 47
      activeHashrate: 0,     // Calculated from workers array
      inactiveHashrate: 0    // Calculated from workers array
    };
  }
}
```

**Luxor API Endpoint Called:**
```
GET https://app.luxor.tech/api/v2/pool/workers
  ↓
LuxorClient.getWorkers(currency, {site_id, ...})
  ↓  (in route.ts case "workers")
```

**Request Parameters:**
- `endpoint=workers`
- `currency=BTC`
- `page_number=1`
- `page_size=1000`
- `site_id={LUXOR_FIXED_SITE_ID}` (from env var, NOT subaccount_names!)

**Response Structure:**
```json
{
  "currency_type": "BTC",
  "subaccounts": [...],
  "total_active": 42,
  "total_inactive": 5,
  "workers": [
    {
      "id": "worker-1",
      "name": "miner1",
      "status": "ACTIVE",
      "hashrate": 2500000000000000,  // in H/s
      "efficiency": 85.5,
      "last_share_time": "2025-01-15T12:34:56Z",
      ...
    },
    ...
  ],
  "pagination": {...}
}
```

**Where it's used:**
1. **Miners (Active card):** `activeMinersCount = workersData.active`
2. **Miners (Inactive card):** `inactiveMiners = [from DB, different calculation]`
3. **Total Workers card:** `luxor.workers.activeWorkers = workersData.active`
4. **Active Workers card:** `luxor.workers.inactiveWorkers = workersData.inactive`
5. **Inactive Workers card:** `luxor.workers.totalWorkers = workersData.total`

---

## PART 3: SUBACCOUNTS DATA SOURCE (Pool Accounts)

### Fetch Function: `fetchSubaccountStats()`

**File:** `route.ts` line 145-173

**What it does:**
1. Calls `/api/luxor?endpoint=subaccounts` (same as `getAllSubaccountNames()`)
2. Counts total subaccounts: `subaccounts.length`
3. Filters for active: `subaccounts.filter(s => !s.name.includes("_test")).length`
4. Calculates inactive: `total - active`

**Code:**
```javascript
async function fetchSubaccountStats(
  request: NextRequest,
): Promise<{total, active, inactive} | null> {
  
  // 1. Fetch subaccounts from Luxor
  const url = new URL("/api/luxor?endpoint=subaccounts", request.url);
  const response = await fetch(luxorRequest);
  const result = await response.json();
  
  // 2. Count and filter
  if (result.success && result.data?.subaccounts) {
    const subaccounts = result.data.subaccounts as Array<{id, name}>;
    
    const totalSubaccounts = subaccounts.length;  // e.g., 5
    
    const activeSubaccounts = subaccounts.filter(
      ({ name }) => !name.includes("_test")  // Filters out test accounts
    ).length;  // e.g., 3
    
    return {
      total: totalSubaccounts,                    // 5
      active: activeSubaccounts,                  // 3
      inactive: totalSubaccounts - activeSubaccounts,  // 2
    };
  }
}
```

**Luxor API Endpoint Called:**
```
GET https://app.luxor.tech/api/v2/pool/subaccounts
  ↓
LuxorClient.listSubaccounts()
  ↓  (in route.ts case "subaccounts")
```

**Logic:**
- **Active:** Subaccounts WITHOUT `_test` in the name
  - Example: "saima", "mining_pool", "main" are active
  - Example: "saima_test", "testpool", "debug_test" are NOT active
- **Inactive:** Subaccounts WITH `_test` in name
- **Total:** All subaccounts regardless of name

**Where it's used:**
1. **Total Pool Accounts card:** `luxor.poolAccounts.total`
2. **Active Pool Accounts card:** `luxor.poolAccounts.active`
3. **Inactive Pool Accounts card:** `luxor.poolAccounts.inactive` (calculated)

---

## PART 4: HASHRATE & UPTIME DATA SOURCE

### Fetch Function: `fetchSummary()`

**File:** `route.ts` line 290-365

**What it does:**
1. Takes `subaccountNames` array (e.g., `["saima", "mining2"]`)
2. Calls `/api/luxor?endpoint=summary&currency=BTC&subaccount_names=saima,mining2`
3. Returns aggregated metrics for ALL provided subaccounts combined:
   - `hashrate_5m: number` (in PH/s, converted from H/s)
   - `hashrate_24h: number` (in PH/s, converted from H/s)
   - `uptime_24h: number` (as percentage 0-100)

**Code:**
```javascript
async function fetchSummary(
  request: NextRequest,
  subaccountNames: string[],  // e.g., ["saima", "mining2"]
): Promise<{hashrate_5m, hashrate_24h, uptime_24h} | null> {
  
  if (subaccountNames.length === 0) {
    return { hashrate_5m: 0, hashrate_24h: 0, uptime_24h: 0 };
  }
  
  // 1. Build URL with SUBACCOUNT NAMES (NOT site_id)
  const url = new URL("/api/luxor", request.url);
  url.searchParams.set("endpoint", "summary");
  url.searchParams.set("currency", "BTC");
  url.searchParams.set("subaccount_names", subaccountNames.join(","));
  // Result: subaccount_names=saima,mining2
  
  const response = await fetch(luxorRequest);
  const result = await response.json();
  
  // 2. Parse and convert units
  if (result.success && result.data) {
    const data = result.data as SummaryResponse;
    
    return {
      // Convert from H/s to PH/s (divide by 10^15)
      hashrate_5m: (parseFloat(data.hashrate_5m) || 0) / 1000000000000000,
      hashrate_24h: (parseFloat(data.hashrate_24h) || 0) / 1000000000000000,
      
      // Convert from decimal (0-1) to percentage (0-100)
      uptime_24h: (data.uptime_24h || 0) * 100,
    };
  }
}
```

**Luxor API Endpoint Called:**
```
GET https://app.luxor.tech/api/v2/pool/summary/{currency}
  ↓
LuxorClient.getSummary(currency, {subaccount_names})
  ↓  (in route.ts case "summary")
```

**Request Parameters:**
- `endpoint=summary`
- `currency=BTC`
- `subaccount_names=saima,mining2` (JOINED by comma!)

**Request URL Built:**
```
/api/luxor?endpoint=summary&currency=BTC&subaccount_names=saima,mining2
```

**Response Structure from Luxor API:**
```json
{
  "currency_type": "BTC",
  "subaccounts": [
    {"id": 123, "name": "saima", "site": {...}},
    {"id": 124, "name": "mining2", "site": {...}}
  ],
  "hashrate_5m": "5234000000000000",    // String in H/s (5.234 PH/s)
  "hashrate_24h": "5100000000000000",   // String in H/s (5.1 PH/s)
  "efficiency_5m": 0.875,                // 87.5%
  "uptime_24h": 0.998,                   // 0.1 to 1.0 decimal
  "active_miners": 42,
  "revenue_24h": [
    {"currency_type": "BTC", "revenue_type": "MINING", "revenue": 0.00125}
  ],
  "revenue_all_time": [...],
  "hashprice": {...},
  "balance": {...}
}
```

**Unit Conversions in Code:**

| Field | Luxor Returns | Code Does | Result |
|-------|---------------|-----------|--------|
| `hashrate_5m` | `"5234000000000000"` (H/s) | parseFloat() / 10^15 | `5.234` PH/s |
| `hashrate_24h` | `"5100000000000000"` (H/s) | parseFloat() / 10^15 | `5.1` PH/s |
| `uptime_24h` | `0.998` (decimal 0-1) | × 100 | `99.8%` |

**Where it's used:**
1. **Hashrate (5 min) card:** `luxor.hashrate_5m` (in PH/s)
2. **Hashrate (24 hours) card:** `luxor.hashrate_24h` (in PH/s)
3. **Uptime (24 hours) card:** `luxor.uptime_24h` (as percentage)

**Key Difference:** Uses `subaccount_names` parameter, not `site_id`, to aggregate data for specific accounts

---

## PART 5: REVENUE DATA SOURCE

### Fetch Function: `fetchTotalRevenue()`

**File:** `route.ts` line 242-288

**What it does:**
1. Takes `subaccountNames` array
2. Calls `/api/luxor?endpoint=revenue&...&start_date=2025-01-01&end_date=TODAY`
3. Iterates through all daily revenue objects
4. Sums all revenue values: `sum(revenue[].revenue.revenue)`

**Code:**
```javascript
async function fetchTotalRevenue(
  request: NextRequest,
  subaccountNames: string[],
): Promise<{revenue: number} | null> {
  
  if (subaccountNames.length === 0) {
    return { revenue: 0 };
  }
  
  try {
    // 1. Get today's date
    const today = new Intl.DateTimeFormat("en-CA").format(new Date());
    // Result: "2025-01-15"
    
    // 2. Build URL
    const url = new URL("/api/luxor", request.url);
    url.searchParams.set("endpoint", "revenue");
    url.searchParams.set("currency", "BTC");
    url.searchParams.set("start_date", "2025-01-01");  // ALL-TIME since Jan 1, 2025
    url.searchParams.set("end_date", today);           // Up to today
    url.searchParams.set("site_id", process.env.LUXOR_FIXED_SITE_ID || "");
    
    const response = await fetch(luxorRequest);
    const result = await response.json();
    
    // 3. SUM all daily revenue
    if (result.success && result.data) {
      const data = result.data;
      const revenueArray = data.revenue as Array<{
        date_time: string;
        revenue: { revenue: number };
      }>;
      
      return {
        revenue: revenueArray.reduce(
          (sum, dailyRevenueItem) => sum + dailyRevenueItem.revenue.revenue,
          0,  // accumulator starts at 0
        ),
      };
    }
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching revenue:", error);
  }
  return null;
}
```

**Luxor API Endpoint Called:**
```
GET https://app.luxor.tech/api/v2/pool/revenue/{currency}
  ↓
LuxorClient.getRevenue(currency, {start_date, end_date, site_id})
  ↓  (in route.ts case "revenue")
```

**Request Parameters:**
- `endpoint=revenue`
- `currency=BTC`
- `start_date=2025-01-01` (HARDCODED to all-time since Jan 1, 2025)
- `end_date=2025-01-15` (Today's date, dynamically calculated)
- `site_id={LUXOR_FIXED_SITE_ID}`

**Response Structure:**
```json
{
  "currency_type": "BTC",
  "start_date": "2025-01-01",
  "end_date": "2025-01-15",
  "subaccounts": [
    {"id": 123, "name": "saima", "site": {...}},
    {"id": 124, "name": "mining2", "site": {...}}
  ],
  "revenue": [
    {
      "date_time": "2025-01-01",
      "revenue": {
        "currency_type": "BTC",
        "revenue_type": "MINING",
        "revenue": 0.00102  // BTC for this day
      }
    },
    {
      "date_time": "2025-01-02",
      "revenue": {
        "currency_type": "BTC",
        "revenue_type": "MINING",
        "revenue": 0.00115
      }
    },
    ...
    {
      "date_time": "2025-01-15",
      "revenue": {
        "currency_type": "BTC",
        "revenue_type": "MINING",
        "revenue": 0.00098
      }
    }
  ],
  "pagination": {...}
}
```

**Calculation Logic:**
```
Sum = 0.00102 + 0.00115 + ... + 0.00098
    = 0.01523 BTC  (example)
    
This is the "Total Mined Revenue" displayed on dashboard
```

**Where it's used:**
1. **Total Mined Revenue card:** `financial.totalMinedRevenue` (in BTC, sum of all daily revenue)

**Time Range:**
- **Start:** 2025-01-01 (HARDCODED – "all-time" since new year)
- **End:** Today's date (dynamic)
- **Calculation:** Sum of all days between start and end

---

## PART 6: MINERS CARD - SPECIAL LOGIC

### The Discrepancy Calculation

**Location:** `route.ts` line 379-414

**What it shows:**
- **Active:** From Luxor (`workersData.active`)
- **Inactive:** From Database (`prisma.miner.count(...status: DEPLOYMENT_IN_PROGRESS...)`)
- **Action Required:** Calculated difference = `active - allLocalActiveMiners`

**Code:**
```javascript
let activeMinersCount = 0;
let inactiveMiners = 0;
let actionRequiredMiners = 0;

// 1. ACTIVE: From Luxor workers endpoint
if (subaccountNames.length > 0) {
  const workersData = await fetchAllWorkers(request, subaccountNames);
  if (workersData) {
    activeMinersCount = workersData.active;  // e.g., 42
  }
}

// 2. INACTIVE: From Database (DEPLOYMENT_IN_PROGRESS status only)
inactiveMiners = await prisma.miner.count({
  where: { 
    status: "DEPLOYMENT_IN_PROGRESS",  // Only this status
    isDeleted: false 
  },
});  // e.g., 3

// 3. ACTION REQUIRED: Database AUTO miners vs Luxor active
const allLocalActiveMiners = await prisma.miner.count({
  where: { 
    status: "AUTO",  // Count AUTO status miners
    isDeleted: false 
  },
});  // e.g., 38

actionRequiredMiners = activeMinersCount - allLocalActiveMiners;
// 42 - 38 = 4 miners need attention
```

**The Miners Card Display:**
```
Miners:
├─ Active: 42 (from Luxor workers.total_active)
├─ Inactive: 3 (from DB where status='DEPLOYMENT_IN_PROGRESS')
└─ Review: 4 (calculated: 42 - 38 = difference between Luxor and DB)
```

**What "Action Required" (Review) Means:**
- `positive number` = Database has fewer AUTO miners than Luxor sees (stale/missing DB entries)
- `negative number` = Database has more AUTO miners than Luxor sees (shouldn't happen)
- `zero` = Perfect sync between DB and Luxor

**This is the ONLY hybrid card** that combines Luxor active + DB inactive

---

## PART 7: DATABASE-ONLY METRICS

These do NOT call Luxor API:

### Power Calculation

**Location:** `route.ts` line 434-462

**Logic:**
```javascript
// 1. Total power (from spaces)
const totalSpacePower = await prisma.space.aggregate({
  _sum: { powerCapacity: true }
});
// Result: 50 kW (sum of all space.powerCapacity)

// 2. Used power (from miners + hardware)
const hardwareWithMinerCounts = await prisma.hardware.findMany({
  where: { isDeleted: false },
  select: {
    id: true,
    powerUsage: true,
    miners: {
      where: { status: "AUTO", isDeleted: false },
      select: { id: true }
    }
  }
});

// For each hardware type, multiply powerUsage × count of AUTO miners
let usedMinersPower = 0;
hardwareWithMinerCounts.forEach((hw) => {
  const minerCount = hw.miners.length;
  const powerForThisHardware = hw.powerUsage * minerCount;
  usedMinersPower += powerForThisHardware;
});
// Result: 35 kW (if 7 miners × 5kW each)

// 3. Available power (calculated)
const availablePower = totalPower - usedMinersPower;
// 50 - 35 = 15 kW free
```

**Cards that use it:**
1. Power (Free kW)
2. Power (Used kW)

**Note:** Currently NOT affected by Braiins integration (stays DB-only even in future)

---

### Monthly Revenue (from DB)

**Location:** `route.ts` line 550-558

**Logic:**
```javascript
// Calculate 30 days ago
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

// Sum costPayment.amount where:
// - type is ELECTRICITY_CHARGES or ADJUSTMENT
// - createdAt >= 30 days ago
const monthlyRevenue = await prisma.costPayment.aggregate({
  where: {
    type: { in: ["ELECTRICITY_CHARGES", "ADJUSTMENT"] },
    createdAt: { gte: thirtyDaysAgo }
  },
  _sum: { amount: true }
});

// Multiply by -1 to show as positive (stored as negative in DB)
result = (monthlyRevenue._sum.amount || 0) * (-1)
// e.g., -45289 → 45289 (USD)
```

**Card:** Monthly Revenue (30 days)

**Database Query:** Queries `costPayment` table with filters

**Note:** This is DIFFERENT from "Total Mined Revenue" which comes from Luxor

---

### Customer Metrics (from DB)

**Location:** `route.ts` line 468-492

**Logic:**
```javascript
// Fetch all clients (excluding test accounts)
const totalCustomers = await prisma.user.findMany({
  where: {
    role: "CLIENT",
    isDeleted: false,
    NOT: { luxorSubaccountName: { contains: "_test" } }  // Exclude test
  },
  include: { miners: true }  // Load their miners
});

// Active = those with at least one AUTO miner
const activeCustomerCount = totalCustomers.filter((customer) =>
  customer.miners.filter((miner) => miner.status === "AUTO").length > 0
).length;

const inactiveCustomerCount = totalCustomers.length - activeCustomerCount;
```

**Cards:**
1. Total Customers (total count)
2. Active Customers (those with AUTO miners)
3. Inactive Customers (calculated)

**Database Query:** Queries `user` table with role filter and loads related miners

---

### Customer Balance (from DB)

**Location:** `route.ts` line 494-499

**Logic:**
```javascript
const totalCustomerBalance = await prisma.costPayment.aggregate({
  _sum: { amount: true }
});
// Sums ALL costPayment.amount across all customers
// e.g., 1403.50 USD
```

**Card:** Total Customer Balance

---

## SUMMARY TABLE: API ENDPOINTS USED

| Card(s) | Luxor Endpoint | Function | Parameters | Calculation |
|---------|--------|----------|---------|-------------|
| **Miners (Active)** | `/pool/workers` | `fetchAllWorkers()` | site_id | Direct: `response.total_active` |
| **Total/Active/Inactive Workers** | `/pool/workers` | `fetchAllWorkers()` | site_id | Direct from response |
| **Pool Accounts (3 cards)** | `/pool/subaccounts` | `fetchSubaccountStats()` | none | Count & filter by `_test` |
| **Hashrate (5m, 24h)** | `/pool/summary/{currency}` | `fetchSummary()` | currency, subaccount_names | parseFloat() / 10^15 (H/s to PH/s) |
| **Uptime (24h)** | `/pool/summary/{currency}` | `fetchSummary()` | currency, subaccount_names | × 100 (0-1 to 0-100%) |
| **Total Mined Revenue** | `/pool/revenue/{currency}` | `fetchTotalRevenue()` | currency, start_date, end_date, site_id | Sum all `revenue[].revenue.revenue` |
| **Power (Free/Used)** | None - DB only | - | - | Aggregate space.powerCapacity × hw.powerUsage × miner count |
| **Monthly Revenue** | None - DB only | - | - | Sum costPayment where ELECTRICITY_CHARGES, last 30 days |
| **Customers (3 cards)** | None - DB only | - | - | Count users WHERE role=CLIENT, filter by miners.AUTO status |
| **Customer Balance** | None - DB only | - | - | Sum costPayment.amount |

---

## KEY INSIGHTS FOR BRAIINS INTEGRATION

### 1. Workers Endpoint (No subaccount_names parameter)
**Current Luxor Call:**
```
GET /api/luxor?endpoint=workers&currency=BTC&site_id=...
```

**What it returns:** All workers for the SITE, total_active/total_inactive

**Braiins Equivalent:**
```
GET /accounts/workers/json/btc
```
Returns workers by username.worker_name with state: "ok", "dis", "low", "off"

---

### 2. Summary Endpoint (With subaccount_names parameter)
**Current Luxor Call:**
```
GET /api/luxor?endpoint=summary&currency=BTC&subaccount_names=saima,mining2
```

**What it returns:** Aggregated hashrate + uptime for NAMED subaccounts

**Braiins Equivalent:**
```
GET /accounts/profile/json/btc
```
Returns single user profile (single-user architecture, NO subaccounts)

---

### 3. Revenue Endpoint (All-time aggregation)
**Current Luxor Call:**
```
GET /api/luxor?endpoint=revenue&currency=BTC&start_date=2025-01-01&end_date=TODAY
```

**What it does:** Sums daily revenue for ALL days in range

**Braiins Equivalent:**
```
GET /accounts/rewards/json/btc?from=YYYY-MM-DD&to=YYYY-MM-DD
```
Returns daily_rewards array, need to sum `total_reward` field

---

### 4. The Site ID vs Subaccount Names Pattern

| Endpoint | Uses | For |
|----------|------|-----|
| `workers` | `site_id` | Get ALL workers under a SITE (aggregated) |
| `summary` | `subaccount_names` | Get aggregated stats for SPECIFIC subaccounts |
| `revenue` | `site_id` | Get ALL revenue for a SITE |
| `subaccounts` | NONE | Get list of all subaccounts |

**Braiins has NO site concept** – everything is single-user

---

## FLOW DIAGRAM: FROM API CALL TO CARD VALUE

```
AdminPanel Page
  ↓
useQuery("/api/admin/dashboard")  ← React hook fetches data
  ↓
POST /api/admin/dashboard/route.ts  ← GET handler (despite React useQuery)
  ↓
║─────────────────────────────────────────────────────────────║
║ 1. getAllSubaccountNames()                                  ║
║    → fetch("/api/luxor?endpoint=subaccounts")               ║
║    → LuxorClient.listSubaccounts()                          ║
║    → Returns: ["saima", "mining2"]                          ║
║─────────────────────────────────────────────────────────────║
║ 2. IF subaccountNames.length > 0:                           ║
║    a) fetchSubaccountStats()                                ║
║       → GET /api/luxor?endpoint=subaccounts                 ║
║       → Count + filter by "_test"                           ║
║       → Returns: {total: 5, active: 3, inactive: 2}        ║
║                                                              ║
║    b) fetchAllWorkers()                                      ║
║       → GET /api/luxor?endpoint=workers&site_id=...        ║
║       → Returns: {active: 42, inactive: 5, total: 47}      ║
║                                                              ║
║    c) fetchSummary()                                         ║
║       → GET /api/luxor?endpoint=summary&subaccount_names=.. ║
║       → Convert H/s to PH/s, decimal to %                   ║
║       → Returns: {hashrate_5m: 5.23, hashrate_24h: 5.1,   ║
║                   uptime_24h: 99.8}                         ║
║                                                              ║
║    d) fetchTotalRevenue()                                    ║
║       → GET /api/luxor?endpoint=revenue&start_date=...     ║
║       → Sum all revenue[].revenue.revenue                   ║
║       → Returns: {revenue: 0.01523}  (BTC)                 ║
║─────────────────────────────────────────────────────────────║
║ 3. Parallel DB queries (all happen simultaneously):          ║
║    - Space counts (free/used)                               ║
║    - Power calculation (space sum + hardware iteration)      ║
║    - Customer counts (filter by AUTO miners)                ║
║    - Monthly revenue (costPayment last 30 days)             ║
║    - Miners (DB: DEPLOYMENT_IN_PROGRESS)                    ║
║─────────────────────────────────────────────────────────────║
  ↓
Build DashboardStats object (combines all results)
  ↓
Return NextResponse.json({success: true, data: stats})
  ↓
AdminPanel page receives stats, renders 24 cards
```

---

## FLOW EXAMPLE: HASHRATE CARD

**User sees:** "Hashrate (5 min): 5.23 PH/s"

**Here's what happened:**

1. **AdminPanel page** renders and calls `useQuery("/api/admin/dashboard")`
2. **Admin dashboard API** receives request
3. **Step 1:** Get subaccountNames
   - Fetch `/api/luxor?endpoint=subaccounts`
   - Extract `["saima", "mining2"]`
4. **Step 2:** Call fetchSummary with `["saima", "mining2"]`
   - Build URL: `/api/luxor?endpoint=summary&currency=BTC&subaccount_names=saima,mining2`
   - Send to Luxor Client
5. **Step 3:** Luxor route handles the request
   - Maps `endpoint=summary` → `LuxorClient.getSummary(currency, {subaccount_names})`
   - Calls `getSummary("BTC", {subaccount_names: "saima,mining2"})`
6. **Step 4:** LuxorClient sends to Luxor API
   - `GET https://app.luxor.tech/api/v2/pool/summary/BTC`
   - Headers: `Authorization: Bearer {LUXOR_API_KEY}`
   - Query: `subaccount_names=saima,mining2`
7. **Step 5:** Luxor API returns
   ```json
   {
     "hashrate_5m": "5230000000000000",  // 5.23 PH/s in H/s
     ...
   }
   ```
8. **Step 6:** Dashboard route parses and converts
   ```javascript
   parseFloat("5230000000000000") / 1000000000000000 = 5.23 PH/s
   ```
9. **Step 7:** Dashboard returns to page
   ```json
   {
     "data": {
       "luxor": {
         "hashrate_5m": 5.23,
         ...
       }
     }
   }
   ```
10. **Step 8:** AdminPanel page displays
    - Card shows: "Hashrate (5 min): 5.23 PH/s"

---

## CRITICAL CODE PATTERNS

### Pattern 1: Check for Subaccounts First

```javascript
if (subaccountNames.length === 0) {
  // Return 0 and add warning
  warnings.push("No Luxor subaccounts configured for any users");
  return 0;
}

// Then fetch Luxor data
```

**This prevents API calls if there's nothing to query**

### Pattern 2: Pass Request Context Through

```javascript
async function fetchAllWorkers(
  request: NextRequest,  // ← MUST be NextRequest, not just Request
  subaccountNames: string[],
)
```

**Why:** The request object carries cookies/headers needed for authentication

### Pattern 3: Building URLs with URLSearchParams

```javascript
const url = new URL("/api/luxor", request.url);
url.searchParams.set("endpoint", "workers");
url.searchParams.set("currency", "BTC");
url.searchParams.set("site_id", process.env.LUXOR_FIXED_SITE_ID || "");

const luxorRequest = new NextRequest(url, {
  method: "GET",
  headers: request.headers,  // Pass original headers
});
```

**Why:** Preserves cookies and authentication context

### Pattern 4: Aggregation with Reduce

```javascript
const revenue = revenueArray.reduce(
  (sum, dailyRevenueItem) => sum + dailyRevenueItem.revenue.revenue,
  0,  // Start with 0
);
```

**This sums all daily revenue in one pass**

