# Admin Dashboard Stats Mapping

## Overview
This document maps every stat displayed on the admin dashboard (`/manage/adminpanel`) to its data source, calculation method, and fallback behavior.

**Last Updated**: December 2025  
**Total Stats Tracked**: 27 metrics across 5 categories

---

## Category 1: Local Infrastructure (Database-Backed)

| Stat | Source | Calculation | Data Type | Fallback |
|------|--------|-------------|-----------|----------|
| **Miners - Active** | `Prisma.miner.count({ status: "ACTIVE" })` | Count of miners with ACTIVE status | Integer | 0 |
| **Miners - Inactive** | `Prisma.miner.count({ status: "INACTIVE" })` | Count of miners with INACTIVE status | Integer | 0 |
| **Spaces - Free** | `Prisma.space.count({ status: "AVAILABLE" })` | Count of spaces marked AVAILABLE | Integer | 0 |
| **Spaces - Used** | `Prisma.space.count({ status: "OCCUPIED" })` | Count of spaces marked OCCUPIED | Integer | 0 |
| **Power - Used (kW)** | `Prisma.miner.aggregate({ _sum: powerUsage })` | Sum of powerUsage from ACTIVE miners | Float | 0 |
| **Power - Free (kW)** | `(Total Space Power) - (Used Miner Power)` | Total from spaces minus used from miners | Float | 0 |

---

## Category 2: Customers (Database + Luxor Hybrid)

| Stat | Source | Calculation | Data Type | Fallback |
|------|--------|-------------|-----------|----------|
| **Customers - Total** | `Prisma.user.count({ role: "CLIENT" })` | Count all users with CLIENT role | Integer | 0 |
| **Customers - Active** | Estimated from Luxor workers | `ceil(activeWorkers / 2)` (estimated 2 workers per active customer) | Integer | 0 if no workers |
| **Customers - Inactive** | Calculated from active | `Total - Active` | Integer | Total if no active workers |

**Note**: Customer activity is estimated based on worker activity on Luxor, as Luxor doesn't directly track which subaccount belongs to which customer.

---

## Category 3: Luxor Pool Operations (Luxor API)

### Workers Statistics
| Stat | Source | Calculation | Data Type | Fallback | Endpoint |
|------|--------|-------------|-----------|----------|----------|
| **Active Workers** | `/api/luxor?endpoint=workers&currency=BTC` | Sum of `total_active` from WorkersResponse | Integer | 0 | `/pool/workers/BTC` |
| **Inactive Workers** | `/api/luxor?endpoint=workers&currency=BTC` | Sum of `total_inactive` from WorkersResponse | Integer | 0 | `/pool/workers/BTC` |
| **Total Workers** | `/api/luxor?endpoint=workers&currency=BTC` | `active + inactive` | Integer | 0 | `/pool/workers/BTC` |

### Hashrate Metrics
| Stat | Source | Calculation | Data Type | Fallback | Endpoint |
|------|--------|-------------|-----------|----------|----------|
| **Actual Hash Rate (TH/s)** | `/api/luxor?endpoint=hashrate-history&currency=BTC` | Latest hashrate value from last 7 days | Float | 0 | `/pool/hashrate-efficiency` |
| **Average Hash Rate (TH/s)** | `/api/luxor?endpoint=hashrate-history&currency=BTC` | Mean of hashrate values over 7 days | Float | 0 | `/pool/hashrate-efficiency` |

**Parameters**: 
- `subaccount_names`: Comma-separated list of all subaccount names
- `start_date`: 7 days ago (ISO format)
- `end_date`: Today (ISO format)
- `tick_size`: "1d" (daily granularity)

### Efficiency Metrics
| Stat | Source | Calculation | Data Type | Fallback | Endpoint |
|------|--------|-------------|-----------|----------|----------|
| **Current Efficiency (%)** | `/api/luxor?endpoint=hashrate-history&currency=BTC` | Latest efficiency value from last 7 days | Float | 0 | `/pool/hashrate-efficiency` |
| **Average Efficiency (%)** | `/api/luxor?endpoint=hashrate-history&currency=BTC` | Mean of efficiency values over 7 days | Float | 0 | `/pool/hashrate-efficiency` |

---

## Category 4: Luxor Pool Accounts (Workspace)

| Stat | Source | Calculation | Data Type | Fallback | Endpoint |
|------|--------|-------------|-----------|----------|----------|
| **Total Pool Accounts** | `/api/luxor?endpoint=workspace` | Sum of subaccounts across all groups | Integer | 0 | `/workspace` |
| **Active Pool Accounts** | `/api/luxor?endpoint=workspace` | Count subaccounts with active workers | Integer | Same as total if workers fetch fails | `/workspace` |
| **Inactive Pool Accounts** | `/api/luxor?endpoint=workspace` | `Total - Active` | Integer | 0 | Calculated |

**Workspace Response Structure**:
```json
{
  "groups": [
    {
      "id": "uuid",
      "name": "Group Name",
      "subaccounts": [
        { "id": 123, "name": "subaccount_name", "created_at": "..." }
      ]
    }
  ]
}
```

---

## Category 5: Financial Metrics

### Revenue
| Stat | Source | Calculation | Data Type | Fallback | Time Range |
|------|--------|-------------|-----------|----------|------------|
| **Monthly Revenue ($)** | `Prisma.costPayment.aggregate()` | Sum of all PAYMENT type entries | Float | 0 | Last 30 days |
| **Total Mined Revenue (₿)** | Not yet implemented | N/A | String "N/A" | - | - |

**Monthly Revenue Query**:
```typescript
CostPayment.aggregate({
  where: {
    type: "PAYMENT",
    createdAt: { gte: thirtyDaysAgo }
  },
  _sum: { amount: true }
})
```

### Customer Balance
| Stat | Source | Calculation | Data Type | Fallback |
|------|--------|-------------|-----------|----------|
| **Total Customer Balance ($)** | Latest CostPayment per customer | Sum of all `balance` fields | Float | 0 |
| **Positive Balance ($)** | Filter by balance > 0 | Sum of positive balances only | Float | 0 |
| **Negative Balance ($)** | Filter by balance < 0 | Sum of abs(negative balances) | Float | 0 |
| **Negative Balance Customers** | Not yet implemented | Count of customers with balance < 0 | String "N/A" | - |

---

## Category 6: Future/Reserved Stats

These stats are displayed as "N/A" pending Luxor API endpoint availability or business logic implementation:

| Stat | Status | Notes |
|------|--------|-------|
| **Total Blocked Deposit** | Not Implemented | Awaiting Luxor API endpoint or custom logic |
| **Open Orders** | Not Implemented | May require derivatives API integration |
| **Hosting Revenue** | Not Implemented | Requires hosted mining feature development |
| **Hosting Profit** | Not Implemented | Requires hosted mining feature development |
| **Est Monthly Hosting Revenue** | Not Implemented | Requires hosted mining feature development |
| **Est Monthly Hosting Profit** | Not Implemented | Requires hosted mining feature development |
| **Est Yearly Hosting Revenue** | Not Implemented | Requires hosted mining feature development |
| **Est Yearly Hosting Profit** | Not Implemented | Requires hosted mining feature development |

---

## API Routes Used

### Direct Internal APIs Called
1. **`GET /api/admin/dashboard`** - Main aggregation endpoint that calls other APIs
   - Fetches all stats and returns combined response
   - Uses other APIs internally (fetches workspace, workers, hashrate)

### Internal APIs Called by Dashboard Route
2. **`GET /api/luxor?endpoint=workspace`** - Fetch workspace groups and subaccounts
3. **`GET /api/luxor?endpoint=workers&currency=BTC&subaccount_names=...`** - Fetch worker details
4. **`GET /api/luxor?endpoint=hashrate-history&currency=BTC&subaccount_names=...`** - Fetch hashrate/efficiency

### External Luxor APIs Called (via proxy)
- `GET /workspace` - Workspace information with groups
- `GET /pool/workers/BTC` - Worker list and status
- `GET /pool/hashrate-efficiency` - Hashrate and efficiency metrics

---

## Data Refresh and Caching

**Current Behavior**: 
- Dashboard fetches fresh data on each page load
- No caching layer implemented
- Luxor API calls may take 1-2 seconds per endpoint

**Recommended Future Improvements**:
1. Add Redis caching with 5-minute TTL
2. Implement background refresh job
3. Add "Last Updated" timestamp to response
4. Implement incremental updates (only fetch changed stats)

---

## Error Handling and Fallbacks

### When Luxor API Fails
1. If `fetchWorkspaceInfo()` fails → Returns `null`, pool account stats show 0
2. If `fetchAllWorkers()` fails → Returns `null`, worker stats show 0
3. If `fetchHashrateEfficiency()` fails → Returns `null`, hashrate/efficiency show 0
4. A warning is added to `warnings` array displayed in UI

### When Database Query Fails
- Endpoint returns 500 error
- Error details included in response for debugging
- Client shows error alert with message

### Warning Messages Displayed to Admin
- "No Luxor subaccounts configured for any users" - If no users have `luxorSubaccountName` set
- "Failed to fetch Luxor statistics - showing database values only" - If Luxor API calls encounter errors

---

## Data Types and Formats

### Input Parameters (to Luxor API)
```typescript
{
  currency: "BTC",  // Mining currency (BTC, LTC, etc.)
  subaccount_names: "user1,user2,user3",  // Comma-separated
  start_date: "2025-11-23",  // ISO date format (YYYY-MM-DD)
  end_date: "2025-11-30",
  tick_size: "1d",  // Granularity: 5m, 1h, 1d, 1w, 1M
  page_number: 1,
  page_size: 1000
}
```

### Output Format (Dashboard Response)
```typescript
{
  success: boolean,
  data: {
    miners: { active: number, inactive: number },
    spaces: { free: number, used: number },
    customers: { total: number, active: number, inactive: number },
    luxor: {
      poolAccounts: { total: number, active: number, inactive: number },
      workers: { activeWorkers: number, inactiveWorkers: number, totalWorkers: number },
      hashrate: { currentHashrate: number, averageHashrate: number },
      efficiency: { currentEfficiency: number, averageEfficiency: number },
      power: { totalPower: number, availablePower: number }
    },
    financial: {
      totalCustomerBalance: number,
      monthlyRevenue: number,
      totalMinedRevenue: number
    },
    warnings: string[]
  },
  timestamp: string  // ISO timestamp
}
```

---

## Key Implementation Details

### Subaccount Name Resolution
- Fetches all users with non-null `luxorSubaccountName` from database
- Uses comma-separated list for Luxor API queries
- Allows dashboard to show aggregated stats across all subaccounts

### Fallback Chain
1. **Try Luxor API** → If successful, use live data
2. **If Luxor API fails** → Return null for that stat category
3. **Display N/A or 0** → Depending on stat type
4. **Add warning** → Inform admin of data unavailability

### Active Customer Estimation
- Current logic: `active_customers = ceil(active_workers / 2)`
- Assumption: Average 2 workers per active customer
- Could be improved with direct Luxor customer/account data if available

---

## Testing Scenarios

### Scenario 1: All Systems Working
- All Luxor APIs return data
- All database queries succeed
- Dashboard shows complete stats
- No warnings displayed

### Scenario 2: Luxor API Failure (Network Issue)
- Database stats show correctly (miners, spaces, customers)
- Luxor stats show 0
- Warning displayed: "Failed to fetch Luxor statistics..."
- Admin can still see local infrastructure metrics

### Scenario 3: No Subaccounts Configured
- All stats show 0 (except local infrastructure)
- Warning displayed: "No Luxor subaccounts configured..."
- Admin prompted to create users (which triggers subaccount creation)

### Scenario 4: Database Failure
- Endpoint returns 500 error
- Client shows error alert
- User can retry or check server logs

---

## Future API Endpoints to Integrate

Once Luxor releases or if custom APIs are built:
- Revenue/Earnings breakdown by currency
- Pool contribution statistics
- Mining difficulty trends
- Hosted mining operations
- Derivatives trading data
- Energy efficiency metrics

---

## Conclusion

The admin dashboard now fetches real data from:
1. **PostgreSQL Database** - Local infrastructure (miners, spaces, customers)
2. **Luxor API** - Mining pool operations (workers, hashrate, efficiency, accounts)
3. **Calculated Fields** - Derived metrics (balance aggregations, monthly revenue)

All hardcoded dummy data has been removed. Missing future stats are clearly marked as "N/A" with implementation notes for developers.
