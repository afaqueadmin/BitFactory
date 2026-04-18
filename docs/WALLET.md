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

**API Calculation Details:**
- **Luxor:** Uses `getTransactions()` API with `transaction_type: "credit"` → sums all earnings transactions (all-time)
- **Braiins:** Uses `getPayouts()` API → sums payout amounts from on-chain payouts (historical, confirmed/queued)

**Per Braiins Academy - Payouts API Response:**
```
Payouts API returns two arrays:
- onchain: Array of on-chain Bitcoin transactions with fields:
  - amount_sats: Amount in satoshis (converted to BTC by dividing by 100,000,000)
  - status: "queued", "confirmed", or "failed"
  - destination: Bitcoin address where payout was sent
  - resolved_at_ts: When the payout was confirmed
  
- lightning: (Optional) Array of Lightning Network payouts with same structure
```

**Data Conversion:**
- Braiins API returns amounts in **satoshis** (1 BTC = 100,000,000 sats)
- Code converts to BTC: `amount_sats / 100,000,000 = BTC amount`
- Example: 50,000 sats = 0.0005 BTC

**⚠️ Important Data Source Differences:**
- **Luxor:** Shows *all earnings credits* via transaction records (all-time transactions)
- **Braiins:** Shows only *completed/queued payouts* via payout records
- Payouts API only includes transactions that have been explicitly sent (status: confirmed/queued/failed)
- **Known Limitation:** Braiins Total Earnings does NOT include earnings that haven't been confirmed as payouts yet

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
Braiins API does not provide a payment settings endpoint:
- **Luxor:** Returns wallet addresses and revenue allocation via `getSubaccountPaymentSettings()` endpoint
- **Braiins:** No equivalent endpoint for payment settings/wallet address configuration
- Braiins Payouts API includes `destination` field (where payout was sent), but not as an editable user setting
- Per Braiins Academy documentation, Braiins does not expose wallet/payment management APIs to end users

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
- **Luxor:** Uses `getTransactions()` API with `transaction_type: "credit"` → sums credit transactions in last 24h
- **Braiins:** Uses `getDailyRewards()` API → sums `total_reward` field from daily reward records

**Per Braiins Academy - Daily Reward API Response Structure:**
```
Fields in daily rewards:
- total_reward: The sum of all reward types for the day
- mining_reward: The standard mining reward
- bos_plus_reward: The amount refunded (pool fee refund for mining with Braiins OS)
- referral_bonus: Bonus received by being referred to Braiins OS
- referral_reward: Reward earned by referring others to Braiins OS
```

**⚠️ Important Data Source Difference from Total Earnings:**
- **Total Earnings** uses `getPayouts()` API (actual payout transactions)
- **Revenue (24H)** uses `getDailyRewards()` API (earned rewards daily)
- These are different APIs with different semantics: Payouts = paid out, Daily Rewards = earned (may not be paid yet)
- **Why the difference?** Daily Rewards captures what was earned today; Payouts captures historical confirmed payments

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
- **Luxor:** Fetches from `getSubaccountPaymentSettings()` which returns current pending balance
- **Braiins:** Fetches from `getUserProfile()` → `btc.current_balance` field (current reward balance / pending payouts)

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

**Why Luxor Only?**
Braiins API does not expose payment scheduling configuration:
- **Luxor:** Provides `payment_frequency` and `day_of_week` via `getSubaccountPaymentSettings()` endpoint
- **Braiins:** No API endpoint for payment frequency settings
- Braiins Pool uses automatic daily payouts (not configurable)
- No equivalent scheduling endpoint in Braiins Pool API
- Per Braiins Academy documentation, payment frequency is not user-manageable through the API

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

**Why Luxor Only?**
Braiins API does not provide next payout scheduling information:
- **Luxor:** Provides `next_payout_at` timestamp via `getSubaccountPaymentSettings()` endpoint
- **Braiins:** No API endpoint for next payout scheduling
- Braiins processes automatic daily payouts but doesn't expose scheduled payout times to users
- No way to determine "next payout" window via Braiins Pool API
- Per Braiins Academy, scheduled payout information is not available through the API

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
  "revenue24h": {
    "btc": 0.00145234,
    "usd": 45.67
  },
  "currency": "BTC",
  "timestamp": "2026-04-10T14:32:45Z",
  "dataSource": "both",
  "activePoolNames": ["Luxor", "Braiins"],
  "poolBreakdown": {
    "luxor": {
      "btc": 0.00089234,
      "usd": 28.45
    },
    "braiins": {
      "btc": 0.00056000,
      "usd": 0
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
    "currency_type": "BTC",
    "subaccount": {
      "id": 12345,
      "name": "my_subaccount",
      "created_at": "2025-01-01T00:00:00Z",
      "url": "https://app.luxor.tech/"
    },
    "balance": 0.15234567,
    "status": "active",
    "wallet_id": 999,
    "payment_frequency": "WEEKLY",
    "day_of_week": "MONDAY",
    "addresses": [
      {
        "address_id": 1,
        "address_name": "Primary",
        "external_address": "bc1q...",
        "revenue_allocation": 100
      }
    ],
    "next_payout_at": "2026-04-14T14:00:00Z",
    "frozen_until": null
  },
  "timestamp": "2026-04-10T14:32:45Z"
}
```

**Note:** Braiins API does not provide equivalent endpoint. This endpoint is Luxor-only.

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
Located in page header next to BTC price (only visible when user has 2+ pools):

```
[Total] [Luxor] [Braiins]
```

**Visibility:**
- Only appears if `activePoolNames.length > 1`
- If user has only one pool (Luxor OR Braiins), no toggle is shown
- If user has no miners, no toggle is shown

**Behavior:**
- Clicking updates `poolMode` state
- All data-fetching helper functions respond to state change
- Cards that support multiple pools update instantly
- Cards with Luxor-only data disable (opacity 0.6) when Braiins selected
- **Auto-reset:** If selected pool is removed (e.g., all Luxor miners deleted), poolMode automatically resets to "total"

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

## Auto-Reset Behavior

The page implements an auto-reset mechanism that ensures poolMode is always valid:

```typescript
// Auto-reset poolMode if selected pool is not in activePoolNames
useEffect(() => {
  if (activePoolNames.length > 0 && poolMode !== "total" && !activePoolNames.includes(poolMode)) {
    setPoolMode("total");
  }
}, [activePoolNames]);
```

**When it triggers:**
- User is viewing "Luxor" mode
- All Luxor miners are removed/deleted from the system
- `activePoolNames` no longer includes "Luxor"
- Page automatically switches to "total" mode

**Rationale:** Prevents displaying selected pool that no longer has data

---

## Braiins API Features

### Pending Payouts Implementation

**Status:** ✅ **Fully Implemented**

**How it works:**

Per **Braiins Academy** (https://academy.braiins.com/en/braiins-pool/monitoring/), the User Profile API provides:

```
| current_balance | string | current reward balance |
```

This field represents the **accumulated, unpaid mining rewards** - exactly what represents "pending payouts".

**Implementation:**

In the earnings-summary API endpoint:

```typescript
// Get user profile to fetch current pending balance
const profile = await braiinsClient.getUserProfile();
totalBraiinsPending += parseFloat(profile.btc.current_balance) || 0;
```

**Field Semantics:**
- **Braiins `current_balance`** = Accumulated unconfirmed/unpaid rewards (pending payouts)
- **Luxor `balance`** = Current pending payout balance (pending payouts)
- Both represent the same thing: earned but not yet paid out

**Comparison:**

| Aspect | Luxor | Braiins |
|--------|-------|---------|
| API for pending | `getSubaccountPaymentSettings()` | `getUserProfile()` |
| Field name | `balance` | `btc.current_balance` |
| Status | ✅ Implemented | ✅ Implemented |
| Data type | `number` | `string` (parsed to number) |

---

### Total Earnings vs Revenue 24h - API Differences

**Important:** The wallet uses *different Braiins APIs* for different metrics:

| Metric | API Used | Returns | Used For |
|--------|----------|---------|----------|
| **Total Earnings** | `getPayouts()` | Payout transaction records with `status` and `amount_sats` | Actual confirmed/queued payouts (historical) |
| **Revenue 24h** | `getDailyRewards()` | Daily rewards summary with `total_reward`, `mining_reward`, `bos_plus_reward` | What was earned today (includes all reward types) |
| **Pending Payouts** | `getUserProfile()` | Current balance with `btc.current_balance` | Unpaid accumulated rewards |

**Design Rationale:**
- **Total Earnings** = Historical payouts (what was actually paid out in transactions)
- **Revenue 24h** = Today's earnings (what was earned, which may still be pending)
- **Pending Payouts** = Current unpaid balance (what you have earned but not received)

This design allows users to see:
1. What they've been historically paid (Total Earnings)
2. What they earned today (Revenue 24h)
3. What they're waiting to receive (Pending Payouts)

**Comparison with Luxor:**
- Luxor uses `getTransactions()` for both Total Earnings and Revenue 24h (with different date ranges)
- Braiins uses different APIs optimized for different use cases
- Both approaches work; Braiins leverages pool-specific API designs

---

## Braiins Payouts API Implementation Details

### Satoshis to BTC Conversion

**Data Structure Change:**
The Braiins Payouts API response was updated to match the actual API format:

**Old (Incorrect) Structure:**
```typescript
payouts.btc.payouts[].amount // Field didn't exist in API
```

**New (Correct) Structure:**
```typescript
payouts.onchain[].amount_sats // Actual API response field
// Convert: amount_sats / 100,000,000 = BTC amount
```

**Implementation in earnings-summary route:**
```typescript
const payouts = await braiinsClient.getPayouts({
  from: formatDate(startDate),
  to: formatDate(endDate),
});

// Process on-chain payouts
if (payouts?.onchain) {
  for (const payout of payouts.onchain) {
    // Convert satoshis to BTC: 1 BTC = 100,000,000 satoshis
    const btcAmount = payout.amount_sats / 100_000_000;
    totalBraiinsEarnings += btcAmount;
  }
}

// Also process Lightning payouts if present
if (payouts?.lightning) {
  for (const payout of payouts.lightning) {
    const btcAmount = payout.amount_sats / 100_000_000;
    totalBraiinsEarnings += btcAmount;
  }
}
```

**Why Both Onchain and Lightning?**
- **Onchain:** Bitcoin blockchain transfers (most common)
- **Lightning:** Lightning Network transfers (faster, lower fees)
- Total earnings includes both payout types

### API Response Fields Reference

Per Braiins Academy, each payout record contains:

| Field | Type | Description |
|-------|------|-------------|
| `amount_sats` | number | Payout amount in satoshis (1 BTC = 100M sats) |
| `status` | string | "queued", "confirmed", or "failed" |
| `requested_at_ts` | number | Unix timestamp when payout was initiated |
| `resolved_at_ts` | number | Unix timestamp when payout completed |
| `destination` | string | Bitcoin address or Lightning invoice address |
| `tx_id` | string | On-chain transaction ID (on-chain only) |
| `fee_sats` | number | Transaction fee in satoshis |

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
2. Toggle only appears because user has 2+ pools
3. User clicks "Luxor" in toggle
4. poolMode state → "luxor"
5. getTotalEarnings() returns luxor.totalEarnings
6. Card shows: "₿ 1.52847621 (LUXOR)"
7. Wallet Address, Payment Frequency, Next Payout cards display Luxor data (not disabled)

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
