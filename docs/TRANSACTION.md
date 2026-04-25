# Transaction History Page - Technical Documentation

## Overview

The Transaction History page provides a comprehensive and detailed view of all mining transactions across **Luxor** and **Braiins** pools. Users can browse, filter, and analyze their complete transaction records with support for advanced filtering by date range and pool. The page leverages the unified PoolAuth architecture to seamlessly aggregate transactions from multiple pools into a single, coherent transaction history.

---

## ⚠️ Known Limitations & Implementation Status

### Transaction Type Filtering (API Ready, UI Not Implemented)

**Current Status:** 
- ✅ **API Support:** The backend `/api/wallet/transactions` endpoint fully supports transaction type filtering via the `type` query parameter (all, credit, debit)
- ❌ **UI Not Implemented:** The user interface does not yet expose controls to filter by transaction type
- 📋 **Code State:** The `typeFilter` state variable exists in the page component but is hardcoded to `"all"` and never changed by user interaction

**Details:**
- Users can **only view all transactions** (combined credit and debit)
- There is no dropdown, button, or toggle to filter to credits-only or debits-only
- The API capability exists and works (can be tested via direct API calls), but frontend UI controls are missing
- Filtering by pool (Luxor/Braiins) is available and works correctly

**Workaround:**
- Manually call the API with `type=credit` or `type=debit` parameter to test filtering
- Contact admin for custom reports filtered by transaction type

**Future Work:**
- Add transaction type filter dropdown/buttons after the date range filter section
- Update UI components and layout to match existing filter patterns
- Wire up `typeFilter` state changes to trigger new API calls

---

## Components & Layout

### Page Location
`src/app/(auth)/transaction/page.tsx`

### Key Components
1. **Header with Title** - "Transaction History" heading with descriptive tagline
2. **Pool Mode Toggle** - Select view: Total, Luxor, or Braiins (client-side filtering)
3. **Advanced Date Range Filter** - Dual-mode filtering (Preset/Custom)
   - Preset Mode: Quick selection (Last 30 Days, Last 90 Days, All Time)
   - Custom Mode: Date picker for precise date ranges
4. **Transaction Table** - Paginated table with comprehensive transaction details
5. **Pagination Controls** - Navigate through transaction pages (25 items per page)

---

## State Management

### Page State Variables

| State | Type | Purpose |
|-------|------|---------|
| `poolMode` | "total" \| "luxor" \| "braiins" | Selected pool view mode (client-side filtering) |
| `currentPage` | number | Current pagination page |
| `pageSize` | number | Items per page (constant: 25) |
| `dateMode` | "preset" \| "custom" | Date range filter mode |
| `presetRange` | "30d" \| "90d" \| "all" | Selected preset range |
| `startDate` | string | Custom start date (YYYY-MM-DD format) |
| `endDate` | string | Custom end date (YYYY-MM-DD format) |
| `data` | TransactionResponse \| null | Server response with transactions and pagination |
| `isLoading` | boolean | Loading state during API fetch |
| `error` | string \| null | Error message if fetch fails |
| `copiedId` | string \| null | Transaction ID that was just copied (flash state) |
| `typeFilter` | "all" (hardcoded) | ⚠️ **Not implemented** - Always "all", UI controls missing (see Known Limitations) |

### Data Interfaces

```typescript
interface Transaction {
  pool: "Luxor" | "Braiins";
  currency_type: string;           // e.g., "BTC", "DOGE"
  date_time: string;               // ISO 8601 datetime
  address_name: string;            // Wallet address identifier
  subaccount_name: string;         // Pool subaccount name
  transaction_category: string;    // e.g., "Mining Reward", "Payout"
  currency_amount: number;         // Amount in BTC (8 decimal precision)
  usd_equivalent: number;          // Amount in USD
  transaction_id: string;          // Unique transaction identifier
  transaction_type: "credit" | "debit"; // Income or payout
}

interface TransactionResponse {
  transactions: Transaction[];      // Array of transaction objects
  pagination: {
    pageNumber: number;            // Current page (1-indexed)
    pageSize: number;              // Items per page
    totalItems: number;            // Total transaction count
    totalPages: number;            // Total number of pages
    hasNextPage: boolean;          // True if more pages exist
    hasPreviousPage: boolean;      // True if previous pages exist
  };
  summary: {
    totalCredits: number;          // Sum of all credits (BTC)
    totalDebits: number;           // Sum of all debits (BTC)
    netAmount: number;             // totalCredits - totalDebits (BTC)
    totalCreditsUsd: number;       // totalCredits in USD
    totalDebitsUsd: number;        // totalDebits in USD
    netAmountUsd: number;          // netAmount in USD
  };
  poolBreakdown?: {
    luxor: {
      count: number;               // Transaction count
      totalCredits: number;        // Sum of credits (BTC)
      totalDebits: number;         // Sum of debits (BTC)
      netAmount: number;           // Net BTC
      totalCreditsUsd: number;     // Credits in USD
      totalDebitsUsd: number;      // Debits in USD
      netAmountUsd: number;        // Net USD
    };
    braiins: {
      count: number;
      totalCredits: number;
      totalDebits: number;
      netAmount: number;
      totalCreditsUsd: number;
      totalDebitsUsd: number;
      netAmountUsd: number;
    };
  };
}
```

---

## API Endpoints

### 1. Transaction History
**Endpoint:** `GET /api/wallet/transactions`

**Purpose:** Fetch paginated transaction history with filtering and pool breakdown

**Authentication:** JWT token in cookies

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Items per page (max: 100) |
| `page` | number | 1 | Page number (1-indexed) |
| `type` | string | "all" | Filter: "all", "credit", or "debit" |
| `start_date` | string (YYYY-MM-DD) | "2020-01-01" | Transaction start date |
| `end_date` | string (YYYY-MM-DD) | Today | Transaction end date |

**Example Request:**
```
GET /api/wallet/transactions?page=1&limit=25&type=all&start_date=2026-03-01&end_date=2026-04-23
```

**Response Structure:**
```json
{
  "success": true,
  "transactions": [
    {
      "pool": "Luxor",
      "currency_type": "BTC",
      "date_time": "2026-04-23T14:32:45Z",
      "address_name": "Primary Wallet",
      "subaccount_name": "john-mining-1",
      "transaction_category": "Mining Reward",
      "currency_amount": 0.00045678,
      "usd_equivalent": 18.75,
      "transaction_id": "txid_abc123...def456",
      "transaction_type": "credit"
    },
    ...
  ],
  "pagination": {
    "pageNumber": 1,
    "pageSize": 25,
    "totalItems": 342,
    "totalPages": 14,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "summary": {
    "totalCredits": 2.15847391,
    "totalDebits": 1.50000000,
    "netAmount": 0.65847391,
    "totalCreditsUsd": 88654.32,
    "totalDebitsUsd": 61500.00,
    "netAmountUsd": 27154.32
  },
  "poolBreakdown": {
    "luxor": {
      "count": 256,
      "totalCredits": 1.85000000,
      "totalDebits": 1.00000000,
      "netAmount": 0.85000000,
      "totalCreditsUsd": 76050.00,
      "totalDebitsUsd": 41000.00,
      "netAmountUsd": 35050.00
    },
    "braiins": {
      "count": 86,
      "totalCredits": 0.30847391,
      "totalDebits": 0.50000000,
      "netAmount": -0.19152609,
      "totalCreditsUsd": 12604.32,
      "totalDebitsUsd": 20500.00,
      "netAmountUsd": -7895.68
    }
  }
}
```

**Data Aggregation Logic (Server-side):**
1. Queries miners for current user from database
2. Fetches PoolAuth entries to get API credentials
3. Groups miners by (pool, poolAuth) using `groupMinersByPool()`
4. For each Luxor group:
   - Calls `luxorClient.getTransactions()` with date range and type filter
   - Paginates through results (page_size=100)
   - Sums credits/debits for summary statistics
5. For each Braiins group:
   - Calls `braiinsClient.getTransactions()` or getPayouts API with date range
   - Maps payout objects to transaction format
   - Sums for pool-specific breakdown
6. Aggregates all transactions, sorts by date descending
7. Applies pagination (skip + limit)
8. Returns complete response with summary and pool breakdown

---

## Filtering System

### Pool Mode Selection (Client-side)
Located at top of page with 3 toggle buttons:
- **Total** - Show all transactions from both pools
- **Luxor** (🔷) - Show only Luxor transactions
- **Braiins** (🟧) - Show only Braiins transactions

**Implementation:**
```typescript
const filteredTransactions = data?.transactions.filter((tx) => {
  if (poolMode === "total") return true;
  if (poolMode === "luxor") return tx.pool === "Luxor";
  if (poolMode === "braiins") return tx.pool === "Braiins";
  return true;
}) || [];
```

**Key Behavior:**
- Filtering happens on client-side after API response
- All transactions fetched from API (no server filtering by pool)
- Summary statistics dynamically update based on selected pool using `getDisplaySummary()`
- Does NOT require new API call when toggling pool mode

### Date Range Filter (Server-side)
Dual-mode system with smart defaults:

#### Preset Mode (Default)
Quick date range selection:
- **Last 30 Days** - Past 30 days from today
- **Last 90 Days** - Past 90 days from today
- **All Time** - From 2020-01-01 to today (system inception)

**Calculation:**
```typescript
const getDateRange = () => {
  const today = new Date();
  let start: Date;
  
  switch (presetRange) {
    case "30d":
      start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      start = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "all":
    default:
      start = new Date("2020-01-01");
  }
  
  return {
    start_date: start.toISOString().split("T")[0], // YYYY-MM-DD
    end_date: today.toISOString().split("T")[0]    // YYYY-MM-DD
  };
};
```

#### Custom Mode
User-defined date range with date pickers:
```typescript
if (dateMode === "custom" && startDate && endDate) {
  return { start_date: startDate, end_date: endDate };
}
```

**Validation:**
- Both dates required in custom mode
- startDate must be before endDate
- Enforced by HTML5 date input constraints

### Transaction Type Filter ⚠️ NOT IMPLEMENTED
**Status:** Backend API ready, but UI controls not implemented.

**Available at API Level:**
The backend `/api/wallet/transactions` endpoint supports transaction type filtering via the `type` query parameter:
- `type=all` → Include all transactions (credits and debits) - **Currently always used**
- `type=credit` → Only income transactions (mining rewards)
- `type=debit` → Only payout transactions (withdrawals)

**Current UI Limitation:**
- No dropdown, button, or toggle exists for users to change transaction type
- All transactions are currently displayed (equivalent to `type=all`)
- The `typeFilter` state variable exists in code but is hardcoded to `"all"` and never modified

**Planned Implementation:**
A transaction type filter dropdown/buttons will be added in a future update to allow users to:
- Filter to credits only (earnings)
- Filter to debits only (payouts)
- Show all transactions (current default)

See **Known Limitations & Implementation Status** section at the top of this document.

---

## Transaction Table Display

### Columns
1. **Date** - Transaction date in "Mon DD, YYYY" format
2. **Pool** - Pool badge (Luxor = blue, Braiins = orange)
3. **Category** - Type of transaction (Mining Reward, Payout, etc.)
4. **Type** - Transaction indicator:
   - Credit: "+ (Credit)" in green
   - Debit: "- (Debit)" in red
5. **Amount (BTC)** - Transaction amount with 8-decimal precision
6. **USD Equivalent** - Converted USD value
7. **TX ID** - Transaction identifier with copy-to-clipboard

### Copy-to-Clipboard Feature
```typescript
onClick={() => {
  navigator.clipboard.writeText(tx.transaction_id);
  setCopiedId(tx.transaction_id);
  setTimeout(() => setCopiedId(null), 2000); // Reset after 2 seconds
}}
```

**User Experience:**
- Click on TX ID cell to copy full ID to clipboard
- Display changes to "Copied!" in green
- Auto-reverts after 2 seconds
- Truncated display: first 8 characters + "..."

---

## Summary Statistics

### Displayed Below Table
The summary section shows aggregated totals based on selected pool mode:

**Components:**
- **Total Credits** - Sum of all income transactions (BTC + USD)
- **Total Debits** - Sum of all outgoing transactions (BTC + USD)
- **Net Amount** - Credits minus debits (BTC + USD)

**Dynamic Update:**
```typescript
const getDisplaySummary = () => {
  if (!data) return null;
  
  if (poolMode === "total") {
    return data.summary; // Aggregated across all pools
  } else if (poolMode === "luxor") {
    return data.poolBreakdown.luxor; // Luxor only
  } else if (poolMode === "braiins") {
    return data.poolBreakdown.braiins; // Braiins only
  }
  return null;
};
```

**Formatting:**
- BTC values: 8 decimal places (e.g., 0.00045678)
- USD values: 2 decimal places (e.g., $18.75)

---

## Pagination

### Pagination Controls
Located below transaction table:
- Page indicator: "Showing X-Y of Z transactions"
- Pagination buttons for easy navigation
- Only displayed if totalPages > 1

**Default Page Size:** 25 transactions per page

**Implementation:**
```typescript
const pageSize = 25; // Fixed
const [currentPage, setCurrentPage] = useState(1);

// On page change
onChange={(e, page) => setCurrentPage(page)}
```

**Behavior:**
- Page number resets to 1 when filters change (date range, type, etc.)
- Each page change triggers new API fetch
- Loading spinner shown during fetch

---

## Data Flow Diagram

```
Transaction History Page
├── Pool Mode Toggle (client-side)
│   └── Filters displayed transactions after API response
│
├── Date Range Filter (server-side)
│   ├── Preset Mode: Quick range selection
│   └── Custom Mode: User-defined date picker
│
├── Fetch /api/wallet/transactions
│   ├── Query params: page, limit, type="all", start_date, end_date
│   ├── Returns: transactions[], pagination, summary, poolBreakdown
│   └── PoolAuth lookup for multi-pool aggregation
│
├── Client-side Processing
│   ├── Apply poolMode filter to transaction list
│   ├── Calculate display summary based on poolMode
│   └── Update pagination info footer
│
└── Display
    ├── Transaction table with 7 columns
    ├── Summary statistics (credits, debits, net)
    └── Pagination controls

Note: Transaction type filtering is not yet implemented in the UI
(see "Known Limitations" section at top of document)
```

---

## Error Handling

### API Fetch Errors
```typescript
if (!response.ok) {
  const errorMessage = `Failed to fetch transactions: ${response.statusText}`;
  setError(errorMessage);
  console.error("[Transaction Page] Error fetching transactions:", error);
}
```

**Display:**
- Alert box with error message above transaction table
- Table shows "Loading transactions..." spinner
- User can retry by adjusting filters or changing page

### Authentication Errors
```typescript
if (!user) {
  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="error">User not authenticated</Alert>
    </Box>
  );
}
```

### Empty Results
```typescript
if (filteredTransactions.length === 0) {
  <Box sx={{ p: 3, textAlign: "center" }}>
    <Typography color="text.secondary">
      No transactions found
    </Typography>
  </Box>
}
```

**Reasons for Empty Results:**
- Date range has no transactions
- Pool selected has no transactions
- User has no miners (no transactions possible)
- (Transaction type filtering not yet available in UI - see Known Limitations)

---

## Helper Functions

### getDateRange()
Calculates date range object based on current filter state:
```typescript
// Returns: { start_date: "YYYY-MM-DD", end_date: "YYYY-MM-DD" }
```

**Used in:** API URL parameter construction in `fetchTransactions()`

### getDisplaySummary()
Selects appropriate summary data based on active pool mode:
```typescript
// Returns summary object matching selected pool (total/luxor/braiins)
```

**Used in:** Conditional rendering of summary statistics

### formatDate()
Converts ISO datetime string to readable local date format:
```typescript
// Example: "2026-04-23T14:32:45Z" → "Apr 23, 2026"
```

**Used in:** Date column in transaction table

### getTransactionColor()
Returns color variant for transaction type chip:
```typescript
// Returns: "success" (credit) or "error" (debit)
```

**Used in:** Chip styling for transaction type indicators

### getTransactionLabel()
Returns formatted label for transaction type:
```typescript
// Returns: "+ (Credit)" or "- (Debit)"
```

**Used in:** Chip labels in Type column

### getPoolColor()
Returns color variant for pool identifier chip:
```typescript
// Returns: "primary" (Luxor) or "info" (Braiins)
```

**Used in:** Chip styling for pool indicators

---

## Logging & Debugging

### Console Logs
```typescript
// On transaction data loaded
console.log("[Transaction Page] Data loaded:", txData);

// On error
console.error("[Transaction Page] Error fetching transactions:", error);
```

**Enable in browser DevTools** (Console tab) for troubleshooting data flow

---

## Responsive Design

- **Mobile (xs):** 
  - Single column layout
  - Pool toggle wraps vertically
  - Date picker fields stack
  - Table columns may scroll horizontally

- **Tablet (md):** 
  - Flexible layout with adequate spacing
  - Two-column layout for filter controls

- **Desktop (lg):** 
  - Full width optimized layout
  - Horizontal filter controls
  - Table spans full width

---

## Performance Considerations

1. **Server-side Filtering:** Date range filter applied at API level (reduces data transfer). Type filter supported by API but not exposed in UI.
2. **Client-side Filtering:** Pool mode filtered after response (no new API call needed)
3. **Pagination:** Only requested page of 25 transactions loaded
4. **Lazy Loading:** Transaction data loaded on-demand per page click
5. **Copy-to-Clipboard:** Uses browser native Clipboard API (no external library needed)
6. **Summary Caching:** Summary recalculated using `getDisplaySummary()` on poolMode change (no API call)

---

## Interaction Flow Examples

### Example 1: Browse All Transactions
1. User navigates to `/transaction`
2. Page loads with default state:
   - poolMode = "total"
   - dateMode = "preset"
   - presetRange = "all"
   - typeFilter = "all"
3. API fetches all transactions from all time
4. Table displays first 25 transactions
5. User can click pagination to browse pages

### Example 2: Filter to Recent Luxor Transactions
1. User is on transaction page
2. Changes dateMode to "preset" and selects "Last 30 Days"
3. Changes poolMode to "luxor" (button toggle)
4. API fetches transactions with new date range
5. Client-side filter further reduces to only Luxor transactions
6. Table updates with 25 results matching date range and pool filters

**Note:** Transaction type filtering (to show only credits or debits) is not yet implemented in the UI. To filter by transaction type, contact admin for custom report.

### Example 3: Custom Date Range Analysis
1. User switches dateMode to "custom"
2. Enters startDate: "2026-03-01" and endDate: "2026-03-31" (March)
3. API fetches all transactions in March date range
4. Summary shows total earnings and payouts for the month
5. User copies transaction IDs from interesting transactions

**Note:** To filter to payouts only (debits) or earnings only (credits) in March, the transaction type filter will be available after implementation. Currently, all transactions are shown.

### Example 4: Compare Pools
1. User has 2 Luxor pools and 1 Braiins pool
2. Starts with poolMode = "total" (see all)
3. Clicks "Luxor" to see Luxor-specific summary
4. Switches to "Braiins" to see Braiins metrics
5. All table filtering/sorting continues to work within pool context
6. No page reloads required (client-side filtering)

---

## Testing Scenarios

### 1. Initially Load
**Steps:**
- Navigate to `/transaction`
- Observe page loads with all transactions

**Expected Results:**
- ✅ Default values applied (preset all-time, type all, pool total)
- ✅ First page of 25 transactions displayed
- ✅ Summary statistics show aggregated totals
- ✅ All buttons and selectors functional

### 2. Preset Date Range Switching
**Steps:**
- Click "Last 30 Days"
- Wait for API response
- Click "Last 90 Days"
- Click "All Time"

**Expected Results:**
- ✅ API called with new date range each time
- ✅ Transaction count changes accordingly
- ✅ Page reset to 1
- ✅ Summary updates to reflect new range

### 3. Custom Date Range
**Steps:**
- Switch to Custom mode
- Select start date: 2026-03-01
- Select end date: 2026-03-15
- Observe results

**Expected Results:**
- ✅ API called with custom dates
- ✅ Only March 1-15 transactions displayed
- ✅ Summary reflects selected period

### 4. Transaction Type Filter ⚠️ NOT YET IMPLEMENTED
**Status:** This feature is not yet available in the UI.

**Test When Implemented:**
When the transaction type filter UI is added in a future update, test:
- Keep all other filters default
- Select "Credit" from dropdown
- Observe transaction count (should show only earnings)
- Switch to "Debit"
- Observe transaction count (should show only payouts)
- Switch to "All"
- Observe transaction count (should show all)

**Expected Results (when implemented):**
- ✅ Each selection triggers API call
- ✅ Transaction counts differ appropriately
- ✅ Summary updates reflect selected type

**Current Behavior:**
- All transactions are always displayed (equivalent to "All" mode)
- No UI controls exist to change this

### 5. Pool Mode Toggle
**Steps:**
- With all transactions loaded
- Click "Luxor" button
- Observe table updates
- Click "Braiins"
- Click "Total"

**Expected Results:**
- ✅ NO new API calls (client-side filtering)
- ✅ Table immediately updates
- ✅ Summary statistics change
- ✅ Transaction count updates in footer

### 6. Pagination
**Steps:**
- Load page with results
- Click next page button (if totalPages > 1)
- Observe page 2
- Go back to page 1
- Try multiple pages

**Expected Results:**
- ✅ Table updates with new transactions
- ✅ Page number updates
- ✅ Footer info shows correct range (e.g., "26-50 of 342")
- ✅ Pagination buttons disabled appropriately

### 7. Copy-to-Clipboard
**Steps:**
- Click on transaction ID in table
- Note it changes to "Copied!"
- Wait 2 seconds
- Click another transaction ID
- Paste clipboard content

**Expected Results:**
- ✅ Clipboard text updated
- ✅ Visual feedback (green "Copied!" text)
- ✅ Auto-reverts after 2 seconds
- ✅ Can paste actual transaction ID

### 8. Error Handling
**Steps:**
- Simulate API failure (developer tools network throttling)
- Select filters that should trigger error
- Observe error alert
- Adjust filters and retry

**Expected Results:**
- ✅ Error message displayed above table
- ✅ Table shows loading state
- ✅ Can retry by changing filters

### 9. Empty Results
**Steps:**
- Select date range with no transactions
- Observe empty message
- Change date range to known transaction period
- Table repopulates

**Expected Results:**
- ✅ "No transactions found" message displayed
- ✅ Pagination hidden
- ✅ Summary shows zero values (or previous data)

### 10. Responsive Design
**Steps:**
- Test on mobile (viewport < 600px)
- Test on tablet (viewport ~800px)
- Test on desktop (viewport > 1200px)
- Verify table scrolls on mobile
- Check filter controls layout

**Expected Results:**
- ✅ All controls accessible on all screen sizes
- ✅ Table scrolls horizontally on mobile
- ✅ Readability maintained
- ✅ No overlapping elements

---

## Future Enhancements

- [ ] Add export to CSV functionality
- [ ] Implement transaction search by ID or address
- [ ] Add transaction categorization/tagging by user
- [ ] Create saved filter presets
- [ ] Add revenue trend chart per pool
- [ ] Implement transaction grouping (daily/weekly/monthly)
- [ ] Add transaction detail modal (click row to expand)
- [ ] Support multiple currencies (BTC, DOGE, etc.)
- [ ] Add email report generation for date ranges
- [ ] Implement real-time transaction updates via WebSocket
- [ ] Add transaction duplicate detection (same amount, date, pool)
- [ ] Create comparison view (compare two date periods)
- [ ] Add profitability analysis (cost vs. earnings by time period)
- [ ] Support admin view for viewing customer transactions

---

## Related Pages

- **Dashboard:** Overview of mining operations
- **Miners:** Detailed miner status and metrics
- **Wallet:** Earnings summary, payouts, and settings
- **Admin Customer Detail:** Admin view with customer transaction history

---

## API Integration Notes

### PoolAuth Architecture
The transaction API leverages the PoolAuth junction table for multi-pool support:
- Each user may have multiple PoolAuth entries
- Each entry: (userId, poolId, authKey) unique constraint
- Enables users to mine on same pool with different subaccounts
- API queries all PoolAuth entries for user and aggregates results

### Pool Aggregation Pattern
1. Query miners by userId from database
2. Extract unique (pool, poolAuth) combinations
3. Group miners by this combination
4. For each group, call pool's API with corresponding authKey
5. Aggregate results across all groups
6. Return unified response with pool breakdown

### Data Accuracy
- **Luxor:** Uses transaction API - provides complete historical records
- **Braiins:** Uses payout API + daily rewards - different semantics than Luxor
- Transactions may not be identical across pools due to different APIs
- Users should reference pool dashboard for official records

