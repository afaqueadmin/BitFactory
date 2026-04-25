# Braiins Workers Management Page

## Page Overview

**Location:** `src/app/(manage)/braiins-workers/page.tsx`

**Route:** `/braiins-workers`

**Access Level:** Admin-only (requires ADMIN or SUPER_ADMIN role)

**Purpose:** Display and manage Braiins mining pool workers for a selected customer. The page provides real-time worker statistics, detailed worker information in a filterable table, and operational insights into mining hardware performance.

## Page Architecture

### Components & Features

#### 1. **Page Title Section**
- Displays "Braiins Workers Management" heading
- Includes a refresh button to manually reload worker data
- Button is disabled until a customer is selected

#### 2. **Statistics Cards** (Only visible when customer selected)
Displays 4 key performance metrics:
- **Total Workers**: Count of all workers (active + inactive)
- **Active Workers**: Count of workers with status "ok" (healthy, mining)
- **Inactive Workers**: Count of workers with status "low", "dis", or "off"
- **Avg Hashrate (5M)**: Average hashrate based on 5-minute metrics (active & low status workers only)

#### 3. **Customer Selection Panel**
- Dropdown selector to choose which Braiins customer to view
- Data source: `/api/braiins-customers` (queries local PoolAuth database)
- Displays customer name and email for identification
- Selecting a customer triggers automatic worker data fetch
- Empty state message if no customer selected

#### 4. **Workers Table**
Displays detailed information for each worker with the following columns:

| Column | Data | Notes |
|---|---|---|
| Worker Name | Username.WorkerName | Split from API response full name |
| Hashrate (5m) | in TH/s | Converted from Gh/s → TH/s |
| Hashrate (24h) | in TH/s | 24-hour average hashrate |
| Shares (5m) | Count | Number of shares in last 5 minutes |
| Shares (24h) | Count | Number of shares in last 24 hours |
| Status | Chip badge | Color-coded status indicator |
| Last Share | Formatted timestamp | Human-readable time of last submitted share |

**Table Features:**
- Sortable columns: Worker Name, Hashrate (5m), Status, Last Share
- Pagination: 20 workers per page
- Hover effect for better UX
- Alternating row colors for readability
- Empty state messages for no workers found

## Data Flow

### 1. Component Initialization
```
Component Mount
    ↓
Fetch Customers from /api/braiins-customers
    ↓
Populate Customer Dropdown
    ↓
Ready for User Selection
```

### 2. Worker Data Fetch
```
User Selects Customer
    ↓
Fetch Workers from /api/braiins-workers?poolAuthId={id}
    ↓
Transform & Calculate Stats
    ↓
Display Stats Cards & Worker Table
```

## Worker Status Mapping

Braiins API returns worker `state` in 4 possible values. These are mapped to user-friendly labels and colors:

### Status Definitions

| API State | Frontend Label | Color | Meaning |
|---|---|---|---|
| `"ok"` | **Active** | **Green** (success) | Worker is online and operating normally with healthy hashrate. Machine is mining and submitting shares regularly. |
| `"low"` | **Low** | **Orange** (warning) | Worker is online but experiencing degraded/low hashrate. Possible causes: hardware issue, network latency, underperformance, or mining difficulty increase. Attention may be required. |
| `"dis"` | **Disabled** | **Gray** (default) | Worker is manually disabled (stopped by user or admin). Still connected to pool but not actively mining. Can be re-enabled. |
| `"off"` | **Offline** | **Red** (error) | Worker is offline/disconnected from the pool. No connection attempts detected. Not submitting any shares. |

### Status Hierarchy (Health)
Best → Worst:
1. ✅ `"ok"` - Actively mining
2. ⚠️ `"low"` - Online but degraded
3. ⏸️ `"dis"` - Paused/disabled
4. ❌ `"off"` - Disconnected

**Code Reference:** [page.tsx line 293-305](../src/app/(manage)/braiins-workers/page.tsx#L293-L305)

```typescript
const getStatusColor = (state: string) => {
  switch (state) {
    case "ok":
      return { color: "success", label: "Active" };
    case "low":
      return { color: "warning", label: "Low" };
    case "dis":
      return { color: "default", label: "Disabled" };
    case "off":
      return { color: "error", label: "Offline" };
    default:
      return { color: "default", label: state };
  }
};
```

## Average Hashrate Calculation

### What is Avg Hashrate (5M)?

The "Avg Hashrate (5M)" statistic represents the **average 5-minute hashrate across all actively mining workers** (excluding disabled and offline hardware).

### Calculation Logic

**Location:** [src/app/api/braiins-workers/route.ts](../src/app/api/braiins-workers/route.ts#L123-L135)

```typescript
// Filter to include only active and low-status workers
const activeAndLowWorkers = transformedWorkers.filter(
  (w) => w.state === "ok" || w.state === "low"
);

// Sum their 5-minute hashrates
const totalHashrate5m = activeAndLowWorkers.reduce(
  (sum, w) => sum + w.hashrate_5m_th,
  0
);

// Calculate average by dividing sum by worker count
const averageHashrate =
  activeAndLowWorkers.length > 0
    ? totalHashrate5m / activeAndLowWorkers.length
    : 0;
```

### Included vs Excluded Workers

**✅ INCLUDED in Calculation:**
- Workers with status `"ok"` (Active)
- Workers with status `"low"` (Low performance but still mining)

**❌ EXCLUDED from Calculation:**
- Workers with status `"dis"` (Disabled/paused)
- Workers with status `"off"` (Offline/disconnected)

### Example Calculation

**Scenario:** 4 workers with 5-minute hashrates:
- Worker 1 (ok): 50 TH/s ✅
- Worker 2 (low): 40 TH/s ✅
- Worker 3 (dis): 60 TH/s ❌
- Worker 4 (off): 45 TH/s ❌

**Calculation:**
```
Total = 50 + 40 = 90 TH/s
Count = 2 workers
Average Hashrate (5M) = 90 / 2 = 45 TH/s
```

### Why 5-Minute Data?

- **Real-time Performance:** 5-minute hashrate reflects current mining performance
- **Quick Response:** Shows recent changes in hardware status
- **Stability:** Less volatile than 1-minute metrics, more responsive than 24-hour
- **Active Mining Focus:** Only includes workers actually contributing to pool

### Why Exclude Disabled/Offline?

- **Relevance:** Disabled and offline workers aren't contributing to actual mining
- **Accuracy:** Average represents real productive hashrate
- **Actionable:** Helps identify if operational workers are underperforming
- **Clarity:** Distinguishes between "hardware that's mining" vs "total hardware"

## Hashrate Unit Conversion

Braiins API returns hashrate values in **Gigahashes per second (Gh/s)**. The page converts and displays these in **Terahashes per second (TH/s)** for consistency with industry standards.

**Conversion Formula:**
```
Hashrate (TH/s) = Hashrate (Gh/s) ÷ 1000
```

**Code Reference:** [src/app/api/braiins-workers/route.ts line 107-108](../src/app/api/braiins-workers/route.ts#L107-L108)

```typescript
hashrate_5m_th: worker.hash_rate_5m / 1000,      // Convert Gh/s to TH/s
hashrate_24h_th: worker.hash_rate_24h / 1000,    // Convert Gh/s to TH/s
```

## API Endpoints

### GET /api/braiins-customers

**Purpose:** Fetch list of all Braiins customers from local database

**Authentication:** Admin-only (JWT token required)

**Response:**
```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "id": "user_123",
        "poolAuthId": "poolauth_456",
        "userId": "user_123",
        "name": "John Doe",
        "email": "john@example.com",
        "hasAuthKey": true,
        "createdAt": "2026-01-15T10:30:00Z"
      }
    ]
  }
}
```

### GET /api/braiins-workers?poolAuthId={id}

**Purpose:** Fetch workers for selected customer + calculate statistics

**Authentication:** Admin-only (JWT token required)

**Query Parameters:**
- `poolAuthId` (required): ID of the PoolAuth record

**Response:**
```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "user_123",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "stats": {
      "totalWorkers": 4,
      "activeWorkers": 3,
      "inactiveWorkers": 1,
      "averageHashrate": 45.50,
      "lowStatusWorkers": 0,
      "disabledWorkers": 1,
      "offlineWorkers": 0
    },
    "workers": [
      {
        "name": "username.worker1",
        "username": "username",
        "workerName": "worker1",
        "state": "ok",
        "hashrate_5m_gh": 50000,
        "hashrate_5m_th": 50.00,
        "hashrate_24h_gh": 48000,
        "hashrate_24h_th": 48.00,
        "shares_5m": 42,
        "shares_24h": 2048,
        "last_share": 1718616500,
        "last_share_formatted": "4/18/2026, 3:35:00 PM"
      }
    ]
  },
  "timestamp": "2026-04-18T15:45:30.123Z"
}
```

## Data Sources

### Customer Data
- **Source:** Local `PoolAuth` database table
- **Query:** Filters by `poolId = "Braiins"`
- **Joined with:** `User` table for customer name/email
- **Why Local DB:** Each Braiins customer has their own API token; stored in PoolAuth

### Worker Data
- **Source:** Braiins Mining Pool API
- **Endpoint:** Per-customer API call using their authKey
- **Method:** `BraiinsClient.getWorkers()`
- **Why Per-Customer:** Braiins API architecture is single-user per token (unlike Luxor's multi-subaccount)

## User Interface Patterns

### Loading State
- Full-page spinner while customers are being fetched on component mount
- Once customers loaded, spinner hidden

### Empty States
Three distinct empty states:
1. **No Customer Selected:** "Please select a customer to view their workers"
2. **No Workers Found:** "No workers found for the selected customer"
3. **Customer/Worker Errors:** Alert banner with error message

### Error Handling
- Failed customer fetch: Displays error message, users can't select customers
- Failed worker fetch: Displays error alert below customer selector
- Invalid poolAuthId: Returns 404 error from API
- Non-Braiins pool: Returns 400 error (safety check)

### Responsive Design
- Statistics cards: Grid layout with `repeat(auto-fit, minmax(200px, 1fr))`
- Adapts from 4 columns (desktop) → 2 columns (tablet) → 1 column (mobile)
- Table: Horizontal scroll on mobile devices

## Security

### Access Control
- **Route Protection:** Middleware checks token and restricts to `/braiins-workers` for admins only
- **API Authentication:** Both endpoints require valid JWT token
- **Role Verification:** Admin or Super Admin role required
- **Data Isolation:** Backend verifies poolAuthId belongs to authenticated user's organization

### Data Privacy
- Customer names/emails visible only to admins
- Sensitive authKey stored securely in database (never exposed to frontend)
- No customer data shared cross-pool

## State Management

### Component State (React Hooks)
```typescript
interface PageState {
  customers: Customer[];           // All Braiins customers
  selectedCustomerId: string | null;  // Currently selected customer's poolAuthId
  workers: Worker[];               // Workers for selected customer
  stats: WorkerStats | null;       // Aggregated statistics
  loading: boolean;                // Initial customers fetch status
  error: string | null;            // Error message (if any)
}
```

### UI-Only State
- `tableCurrentPage`: Current pagination page
- `tableRowsPerPage`: Rows per page (fixed at 20)
- `sortField`: Current sort column
- `sortOrder`: Sort direction (asc/desc)
- `isRefreshing`: Manual refresh button state

## Testing Scenarios

### Happy Path
1. Admin user navigates to `/braiins-workers`
2. Customers list loads from database
3. Admin selects a customer from dropdown
4. Workers fetch from Braiins API via backend
5. Statistics cards display calculated values
6. Worker table shows all workers with correct status colors

### Edge Cases
1. **No workers:** Customer selected but Braiins API returns empty array
2. **All workers offline:** Stats show totalWorkers but activeWorkers = 0, avgHashrate = 0
3. **Single worker:** Average hashrate = that worker's hashrate
4. **API timeout:** Error message displayed, user can retry
5. **Invalid poolAuthId:** 404 error returns from backend

### Error Scenarios
1. Non-admin user tries to access → Blocked by middleware
2. Invalid JWT token → 401 error, user redirected to login
3. Braiins API server down → Catches error, displays message
4. Customer has no authKey → API returns 400 (safety check)

## Performance Considerations

### Data Fetching
- Customers loaded once on component mount
- Workers fetched only when customer selected (not on page load)
- Manual refresh available for stale data

### Rendering
- Pagination limits DOM nodes (20 workers per page)
- Table sorting done client-side (no API call)
- Memoization possible for StatCard components (if performance becomes issue)

### Network
- Two API calls: customers + workers
- Worker API includes all data (no separate detail fetch)
- Consider caching if same customers viewed repeatedly

## Related Files

- **Frontend:** [src/app/(manage)/braiins-workers/page.tsx](../src/app/(manage)/braiins-workers/page.tsx)
- **Backend - Customers API:** [src/app/api/braiins-customers/route.ts](../src/app/api/braiins-customers/route.ts)
- **Backend - Workers API:** [src/app/api/braiins-workers/route.ts](../src/app/api/braiins-workers/route.ts)
- **Braiins Client:** [src/lib/braiins.ts](../src/lib/braiins.ts)
- **Middleware (Route Protection):** [src/middleware.ts](../src/middleware.ts)
- **Navigation:** [src/components/admin/AdminSidebar.tsx](../src/components/admin/AdminSidebar.tsx)
- **Database Schema:** `prisma/schema.prisma` (PoolAuth & User models)

## Future Enhancements

### Potential Improvements
1. **Worker Details Modal:** Click worker to see extended stats
2. **Bulk Actions:** Enable/disable multiple workers at once
3. **Alerts:** Notify when workers go offline
4. **Historical Charts:** Worker hashrate trends over time
5. **Export:** Download worker data as CSV
6. **Search/Filter:** Find specific workers by name
7. **Comparison:** Compare metrics across selected workers
8. **Auto-Refresh:** Poll worker data at intervals (e.g., every 30s)
9. **Worker Commands:** Direct control actions (restart, update) if Braiins API supports
10. **Mobile Optimization:** Collapsible table columns for mobile view

## Troubleshooting

### Workers Not Loading
1. Check JWT token validity in browser DevTools → Cookies
2. Verify customer has valid authKey in database (`PoolAuth.authKey` not null)
3. Check Braiins API status (pool.braiins.com)
4. Check browser console for error messages

### Avg Hashrate Shows 0
1. Verify at least one worker has status "ok" or "low"
2. Check if all workers are disabled/offline
3. Braiins API may not have updated data yet (try refresh)

### Customer Dropdown Empty
1. Verify PoolAuth records exist for Braiins pool in database
2. Check user role is ADMIN or SUPER_ADMIN
3. Try refresh page or clear browser cache

### Status Colors Not Correct
1. Check Braiins API actually returns "ok"/"low"/"dis"/"off" states
2. Verify getStatusColor() function in page.tsx
3. Check Material-UI theme for color definitions

## Version History

| Date | Version | Changes |
|---|---|---|
| 2026-04-18 | 1.0 | Initial release - Braiins workers page with stats, sorting, and pagination |

