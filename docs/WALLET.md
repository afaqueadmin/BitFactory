# Wallet Page - Technical Documentation

## Overview

The Wallet page provides comprehensive earnings, payment, and financial tracking for mining operations with **multi-pool support** for both Luxor and Braiins. Users can view earnings, pending payouts, payment settings, and download account statements. The page features a smart pool mode selector that allows users to toggle between Total (aggregated), Luxor, and Braiins pool-specific metrics.

---

## Components & Layout

### Page Location
`src/app/(auth)/wallet/page.tsx`

### Key Components
1. **Header with Pool Mode Selector** - Toggle: Total, Luxor, Braiins
2. **BTC Live Price Component** - Real-time BTC/USD exchange rate
3. **Six Metric Cards** (displayed in 3x2 grid):
   - Total Earnings
   - Primary Wallet Address
   - Revenue (24 Hours)
   - Pending Payouts
   - Payment Frequency
   - Next Payout
4. **Statement Download Section** - PDF generation with date range picker

---

## State Management

### Page State Variables

| State | Type | Purpose |
|-------|------|---------|
| `summary` | EarningsSummary \| null | Total earnings and pending payouts data |
| `revenue24h` | Revenue24h \| null | Last 24-hour revenue breakdown |
| `walletSettings` | LuxorPaymentSettings \| null | Payment settings (Luxor only) |
| `poolMode` | "total" \| "luxor" \| "braiins" | Selected pool view mode |
| `isLoading` | boolean | Loading state for earnings summary |
| `revenue24hLoading` | boolean | Loading state for 24h revenue |
| `walletLoading` | boolean | Loading state for wallet settings |
| `error` | string \| null | Error for earnings summary |
| `revenue24hError` | string \| null | Error for 24h revenue |
| `walletError` | string \| null | Error for wallet settings |
| `statementStartDate` | string | Start date for PDF statement |
| `statementEndDate` | string | End date for PDF statement |
| `statementError` | string \| null | Error for statement generation |
| `statementDownloading` | boolean | Loading state for PDF download |

### Data Interfaces

```typescript
interface PoolBreakdown {
  totalEarnings: number;
  pendingPayouts: number;
}

interface EarningsSummary {
  totalEarnings: { btc: number; usd: number };
  pendingPayouts: { btc: number; usd: number };
  currency: string;
  dataSource: string;
  timestamp: string;
  subaccountCount: number;
  poolBreakdown?: {
    luxor: PoolBreakdown;
    braiins: PoolBreakdown;
  };
}

interface Revenue24h {
  revenue24h: { btc: number; usd: number };
  currency: string;
  timestamp: string;
  dataSource: string;
  poolBreakdown?: {
    luxor: { btc: number; usd: number };
    braiins: { btc: number; usd: number };
  };
}
```

---

## The Six Metric Cards

### Card 1: Total Earnings 🔵
**Color Scheme:** Blue gradient (#2196f3 - #1565c0)

**What it shows:**
- Cumulative BTC earned from mining (all time)
- USD equivalent at current BTC/USD rate

**Pool Support:** ✅ **Both Pools Supported**

**Data Source:** `/api/wallet/earnings-summary`

**Display Logic:**
```typescript
if (poolMode === "total") {
  value = summary.totalEarnings.btc;
} else if (poolMode === "luxor") {
  value = summary.poolBreakdown.luxor.totalEarnings;
} else { // braiins
  value = summary.poolBreakdown.braiins.totalEarnings;
}
```

**Formula for USD:**
```typescript
btcAmount × btcLiveData.price = USD amount
```

---

### Card 2: Primary Wallet Address 🟠
**Color Scheme:** Orange gradient (#ffb300 - #ff8f00)

**What it shows:**
- Bitcoin wallet address receiving payouts
- Address with highest revenue allocation percentage
- Monospace font for easy copying

**Pool Support:** ⚠️ **Luxor Only**

**Data Source:** `/api/wallet/settings?currency=BTC`

**Display Logic:**
```typescript
if (poolMode === "braiins") {
  display = "Not available for Braiins";
  opacity = 0.6; // Gray out card
} else {
  // Find wallet with highest revenue_allocation
  primaryAddr = walletSettings.addresses.reduce((prev, current) =>
    current.revenue_allocation > prev.revenue_allocation ? current : prev
  );
}
```

**Why Luxor Only?**
Braiins API does not provide wallet/payment settings equivalent to Luxor

---

### Card 3: Revenue (24 Hours) 🟣
**Color Scheme:** Purple gradient (#9c27b0 - #6a1b9a)

**What it shows:**
- BTC earned in the last 24 hours
- USD equivalent at current BTC/USD rate
- Quick view of daily earnings rate

**Pool Support:** ✅ **Both Pools Supported**

**Data Source:** `/api/wallet/earnings-24h`

**Display Logic:**
```typescript
if (poolMode === "total") {
  value = revenue24h.revenue24h.btc;
} else if (poolMode === "luxor") {
  value = revenue24h.poolBreakdown.luxor.btc;
} else {
  value = revenue24h.poolBreakdown.braiins.btc;
}
```

**API Calculation Details:**
- Queries transactions from last 24 hours
- Sums all credit transactions for each pool
- Aggregates across all subaccounts

---

### Card 4: Pending Payouts 🟢
**Color Scheme:** Green gradient (#4caf50 - #2e7d32)

**What it shows:**
- BTC accumulated but not yet paid out
- Waiting to reach minimum payout threshold or payment schedule
- USD equivalent at current BTC/USD rate

**Pool Support:** ✅ **Both Pools Supported**

**Data Source:** `/api/wallet/earnings-summary`

**Display Logic:**
```typescript
if (poolMode === "total") {
  value = summary.pendingPayouts.btc;
} else if (poolMode === "luxor") {
  value = summary.poolBreakdown.luxor.pendingPayouts;
} else {
  value = summary.poolBreakdown.braiins.pendingPayouts;
}
```

**API Calculation Details:**
- **Luxor:** Fetches from `getSubaccountPaymentSettings()` returns current balance
- **Braiins:** Calculated from unpaid earnings in account profile

---

### Card 5: Payment Frequency 🟠
**Color Scheme:** Orange gradient (#ff6f00 - #e65100)

**What it shows:**
- Schedule pattern for automatic payouts
- Examples: "Daily", "Weekly", "Every Monday"
- For weekly: shows the day of week

**Pool Support:** ⚠️ **Luxor Only**

**Data Source:** `/api/wallet/settings?currency=BTC`

**Display Logic:**
```typescript
if (poolMode === "braiins") {
  display = null; // Card disabled/grayed out
  opacity = 0.6;
} else {
  frequency = toProperCase(walletSettings.payment_frequency);
  // e.g., "DAILY" → "Daily", "WEEKLY" → "Weekly"
  
  if (frequency === "Weekly" && walletSettings.day_of_week) {
    additionalText = `Every ${toProperCase(walletSettings.day_of_week)}`;
  }
}
```

---

### Card 6: Next Payout 🟦
**Color Scheme:** Teal gradient (#00796b - #004d40)

**What it shows:**
- Date of next scheduled payout
- 2-hour time window of payout execution
- Timezone information (e.g., UTC-5)

**Pool Support:** ⚠️ **Luxor Only**

**Data Source:** `/api/wallet/settings?currency=BTC`

**Display Logic:**
```typescript
if (poolMode === "braiins") {
  display = null; // Card disabled/grayed out
  opacity = 0.6;
} else if (walletSettings.next_payout_at) {
  payoutDate = new Date(walletSettings.next_payout_at);
  window = [payoutDate, payoutDate + 2 hours];
  
  // Format: "Mon, Jan 15, 2026"
  dateStr = payoutDate.toLocaleDateString("en-US", {...});
  
  // Format: "14:30 - 16:30 (GMT-5)"
  timeStr = formatTime(payoutDate) + " - " + formatTime(window[1]);
}
```

---

## Helper Functions

### getTotalEarnings()
Extracts total earnings based on poolMode:
```typescript
const getTotalEarnings = (): number => {
  if (!summary) return 0;
  if (poolMode === "total") return summary.totalEarnings.btc;
  if (poolMode === "luxor") return summary.poolBreakdown?.luxor.totalEarnings ?? 0;
  if (poolMode === "braiins") return summary.poolBreakdown?.braiins.totalEarnings ?? 0;
  return 0;
};
```

### getPendingPayouts()
Extracts pending payouts based on poolMode:
```typescript
const getPendingPayouts = (): number => {
  if (!summary) return 0;
  if (poolMode === "total") return summary.pendingPayouts.btc;
  if (poolMode === "luxor") return summary.poolBreakdown?.luxor.pendingPayouts ?? 0;
  if (poolMode === "braiins") return summary.poolBreakdown?.braiins.pendingPayouts ?? 0;
  return 0;
};
```

### getRevenue24h()
Extracts 24-hour revenue based on poolMode:
```typescript
const getRevenue24h = (): number => {
  if (!revenue24h) return 0;
  if (poolMode === "total") return revenue24h.revenue24h.btc;
  if (poolMode === "luxor") return revenue24h.poolBreakdown?.luxor.btc ?? 0;
  if (poolMode === "braiins") return revenue24h.poolBreakdown?.braiins.btc ?? 0;
  return 0;
};
```

### toProperCase()
Formats enum values for display:
```typescript
// "DAILY" → "Daily"
// "WEEKLY" → "Weekly"
// "MONDAY" → "Monday"
const toProperCase = (text: string): string => {
  return text
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
```

---

## API Endpoints

### 1. Earnings Summary
**Endpoint:** `GET /api/wallet/earnings-summary`

**Purpose:** Fetch total earnings and pending payouts with pool breakdown

**Authentication:** JWT token in cookies

**Response:**
```json
{
  "totalEarnings": { "btc": 2.53847621 },
  "pendingPayouts": { "btc": 0.15234567 },
  "currency": "BTC",
  "dataSource": "both",
  "timestamp": "2026-04-10T14:32:45Z",
  "poolBreakdown": {
    "luxor": {
      "totalEarnings": 1.52847621,
      "pendingPayouts": 0.10234567
    },
    "braiins": {
      "totalEarnings": 1.01000000,
      "pendingPayouts": 0.05000000
    }
  }
}
```

**Data Calculation (Server-side):**
- Fetches all miners with pool relationships from DB
- For each Luxor pool: calls getTransactions API, sums credit transactions
- For each Braiins pool: calls getPayouts API, sums completed payouts
- Aggregates across all subaccounts

---

### 2. Revenue 24 Hours
**Endpoint:** `GET /api/wallet/earnings-24h`

**Purpose:** Fetch revenue from last 24 hours with pool breakdown

**Authentication:** JWT token in cookies

**Response:**
```json
{
  "success": true,
  "data": {
    "revenue24h": {
      "btc": 0.00145234
    },
    "currency": "BTC",
    "timestamp": "2026-04-10T14:32:45Z",
    "poolBreakdown": {
      "luxor": {
        "btc": 0.00089234
      },
      "braiins": {
        "btc": 0.00056000
      }
    }
  }
}
```

**Data Calculation (Server-side):**
- Calculates 24-hour window (Now - 24 hours)
- Fetches transactions for each pool in time range
- Sums only transactions from last 24 hours
- Separate totals for Luxor and Braiins

---

### 3. Wallet Settings
**Endpoint:** `GET /api/wallet/settings?currency=BTC`

**Purpose:** Fetch payment settings, wallet addresses, and next payout info (Luxor only)

**Authentication:** JWT token in cookies

**Query Parameters:**
- `currency` (optional): Mining currency (e.g., "BTC", "DOGE"). Default: "BTC"
- `customerId` (optional, admin only): Fetch settings for another user

**Response:**
```json
{
  "success": true,
  "data": {
    "addresses": [
      {
        "external_address": "bc1q...",
        "revenue_allocation": 100,
        "name": "Primary"
      }
    ],
    "payment_frequency": "WEEKLY",
    "day_of_week": "MONDAY",
    "next_payout_at": "2026-04-14T14:00:00Z",
    "minimum_payout_threshold": 0.001,
    "last_payout_at": "2026-04-07T14:15:32Z"
  }
}
```

**Note:** Braiins API does not provide equivalent endpoint

---

### 4. Statement Download
**Endpoint:** `GET /api/wallet/statement?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

**Purpose:** Generate and download account statement as PDF

**Authentication:** JWT token in cookies

**Query Parameters:**
- `startDate` (required): Start date (YYYY-MM-DD format)
- `endDate` (required): End date (YYYY-MM-DD format)

**Validation Rules:**
- startDate must be before endDate
- Maximum date range: 12 months
- End date cannot be in future

**Response:**
- Content-Type: `application/pdf`
- Binary file stream with filename: `account-statement-{startDate}-to-{endDate}.pdf`

**Implementation:**
```typescript
const response = await fetch(`/api/wallet/statement?${params}`);
const blob = await response.blob();
// Create download link and trigger download
```

---

## Pool Mode Selector

### Toggle Button Group
Located in page header next to BTC price:

```
[Total] [Luxor] [Braiins]
```

**Behavior:**
- Clicking updates `poolMode` state
- All data-fetching helper functions respond to state change
- Cards that support multiple pools update instantly
- Cards with Luxor-only data disable (opacity 0.6) when Braiins selected

---

## Statement Download Feature

### Date Range Picker
Two date input fields with validation:
- Start Date input (max: today)
- End Date input (max: today, must be > start date)

### Validation Flow
```typescript
if (!startDate || !endDate) {
  error = "Both dates required";
}

if (new Date(startDate) > new Date(endDate)) {
  error = "Start date must be before end date";
}

const monthsDiff = calculateMonthDifference(startDate, endDate);
if (monthsDiff > 12) {
  error = "Date range cannot exceed 12 months";
}
```

### Download Process
1. User selects date range
2. Click "Download PDF" button
3. API generates statement (server-side PDF generation)
4. File automatically downloads to user's device
5. Filename: `account-statement-{DD}-{MM}-{YYYY}-to-{DD}-{MM}-{YYYY}.pdf`

---

## BTC Live Price Component

Integrated component that displays current BTC/USD rate:
```typescript
const { btcLiveData, BtcLivePriceComponent } = useBitcoinLivePrice();
```

**Used for:**
- Converting BTC amounts to USD in all metric cards
- Formula: `btc * btcLiveData.price = usd`

---

## Data Flow Diagram

```
Wallet Page
├── Fetch /api/wallet/earnings-summary
│   ├── summary state with poolBreakdown
│   ├── Displayed in: Total Earnings, Pending Payouts cards
│   └── Helper: getTotalEarnings(), getPendingPayouts()
│
├── Fetch /api/wallet/earnings-24h
│   ├── revenue24h state with poolBreakdown
│   ├── Displayed in: Revenue 24 Hours card
│   └── Helper: getRevenue24h()
│
├── Fetch /api/wallet/settings (Luxor only)
│   ├── walletSettings state
│   ├── Displayed in: Primary Wallet, Payment Frequency, Next Payout cards
│   └── Helper: getPrimaryWalletAddress()
│
├── poolMode state (total/luxor/braiins)
│   ├── Controls metrics display in 3 pool-aware cards
│   ├── Disables 3 Luxor-only cards when poolMode="braiins"
│   └── Triggers re-render of all 6 cards
│
└── BTC Live Price
    └── Converts all BTC values to USD
```

---

## Error Handling

### Earnings Summary Error
```typescript
if (!response.ok) {
  setError("Failed to fetch earnings summary");
  // Card shows error message instead of data
}
```

### Revenue 24h Error
```typescript
// Separate error state
setRevenue24hError(data.error);
// Revenue card displays error message
```

### Wallet Settings Error
```typescript
// Separate error state
setWalletError(data.error);
// Wallet-related cards show error or "Unable to load"
```

### Statement Generation Error
```typescript
// Catch block handles fetch failure or PDF generation failure
setStatementError("Failed to generate statement");
// Display alert to user
```

---

## Responsive Design

- **Mobile (xs):** Single column card layout, stacked statement inputs
- **Tablet (md):** Two-column card grid, side-by-side statement inputs
- **Desktop (lg):** Full width with 2-column grid for smooth layout

---

## Performance Considerations

1. **Parallel API Calls:** All three main API calls triggered on mount via useEffect
2. **Separate Loading States:** Each API has independent loading/error state
3. **Helper Functions:** Pool-aware calculations done client-side (fast)
4. **BTC Price:** Auto-refreshed via useBitcoinLivePrice hook

---

## Workflow Examples

### Example 1: User views earnings by pool
1. Page loads → fetches earnings summary with poolBreakdown
2. User clicks "Luxor" in toggle
3. poolMode state → "luxor"
4. getTotalEarnings() returns luxor.totalEarnings
5. Card shows: "₿ 1.52847621 (LUXOR)"

### Example 2: User downloads account statement
1. User selects dates: 2026-01-01 to 2026-03-31
2. Clicks "Download PDF"
3. API validates date range (✓ valid, < 12 months)
4. Server generates PDF with transactions in date range
5. File downloads: `account-statement-01-01-2026-to-31-03-2026.pdf`

### Example 3: User switches from Luxor to Braiins
1. User clicks "Braiins" toggle
2. poolMode → "braiins"
3. Cards showing pool data update:
   - Total Earnings: shows braiins amount
   - Revenue 24h: shows braiins amount
   - Pending Payouts: shows braiins amount
4. Luxor-only cards (Wallet Address, Payment Frequency, Next Payout) fade (opacity 0.6)
5. Messages appear: "Not available for Braiins"

---

## Testing Scenarios

1. **Pool Mode Toggle**
   - Verify all 3 data-aware cards update instantly
   - Confirm Luxor-only cards disable for Braiins mode
   - Check "Total" mode aggregates correctly (Luxor + Braiins)

2. **Error Conditions**
   - Test each API failing independently
   - Verify graceful error display
   - Check other APIs not affected

3. **Statement Download**
   - Valid date range → successful PDF download
   - Invalid range (start > end) → error message
   - Range > 12 months → error message
   - Future date → error message

4. **Data Accuracy**
   - Verify BTC/USD conversion is correct
   - Check pool breakdown totals (Luxor + Braiins = Total)
   - Confirm addresses display correctly

5. **Responsiveness**
   - Test on mobile, tablet, desktop
   - Verify cards stack properly
   - Check toggle buttons visibility

---

## Future Enhancements

- [ ] Implement real-time data refresh with React Query
- [ ] Add transaction history table (Luxor & Braiins transactions)
- [ ] Include payment confirmation notifications
- [ ] Add revenue projections based on current hashrate
- [ ] Multi-currency support (BTC, DOGE, new coins)
- [ ] Export statement in multiple formats (CSV, Excel)
- [ ] Wallet address management UI (add/edit/remove)
- [ ] Payment frequency customization interface
- [ ] Historical earnings charts by pool
- [ ] Tax report generation for accounting
