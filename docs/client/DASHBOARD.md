# Dashboard Page - Technical Documentation

## Overview

The Dashboard page is the main entry point for authenticated users. It provides a comprehensive overview of mining operations with support for both **Luxor** and **Braiins** mining pools, allowing users to view metrics in different modes:
- **Total Mode**: Aggregated data across all pools
- **Pool-specific Mode**: Individual pool data (Luxor or Braiins)
- **Stacked Mode**: Side-by-side comparison of pools

---

## Components & Layout

### Page Location
`src/app/(auth)/dashboard/page.tsx`

### Key Components
1. **DashboardHeader** - Title and branding
2. **HostedMinersCard** - Shows count of hosted/active miners
3. **MiningEarningsChart** - Visualization of earnings over time with pool filtering
4. **Four Stat Cards**:
   - BalanceCard
   - CostsCard
   - EstimatedMonthlyCostCard
   - EstimatedMiningDaysLeftCard

---

## State Management

### Page State Variables

| State | Type | Purpose |
|-------|------|---------|
| `balance` | number | Current account balance |
| `balanceLoading` | boolean | Loading state for balance fetch |
| `dailyCost` | number | Daily operating cost |
| `dailyCostLoading` | boolean | Loading state for daily costs |
| `workersStats` | object | Active/inactive worker counts with pool breakdown |
| `workersLoading` | boolean | Loading state for worker stats |
| `workersError` | string \| null | Error message if workers fetch fails |
| `chartMode` | "total" \| "luxor" \| "braiins" \| "stacked" | Chart view filter |

### Pool Breakdown Structure
```typescript
poolBreakdown?: {
  luxor: { activeWorkers: number; inactiveWorkers: number };
  braiins: { activeWorkers: number; inactiveWorkers: number };
}
```

---

## API Endpoints

### 1. User Balance
**Endpoint:** `GET /api/user/balance`

**Purpose:** Fetch current account balance (USD)

**Response:**
```json
{
  "balance": 1234.56
}
```

**Used in:** BalanceCard component

---

### 2. Daily Costs
**Endpoint:** `GET /api/miners/daily-costs`

**Purpose:** Fetch total daily operating costs across all miners

**Response:**
```json
{
  "totalDailyCost": 45.67
}
```

**Used in:** 
- CostsCard component
- Estimated Monthly Cost calculation (multiplied by days in month)
- Days Left calculation (balance ÷ daily cost)

---

### 3. Worker Stats
**Endpoint:** `GET /api/workers/stats`

**Purpose:** Fetch worker/miner status with pool breakdown

**Response:**
```json
{
  "success": true,
  "data": {
    "activeWorkers": 15,
    "inactiveWorkers": 3,
    "poolBreakdown": {
      "luxor": {
        "activeWorkers": 10,
        "inactiveWorkers": 1
      },
      "braiins": {
        "activeWorkers": 5,
        "inactiveWorkers": 2
      }
    }
  }
}
```

**Used in:** HostedMinersCard component

---

## Computed Values

### Estimated Monthly Cost
```typescript
estimatedMonthlyCost = dailyCost × getDaysInCurrentMonth()
```
- **Purpose:** Project monthly costs based on daily rate
- **Updated:** When `dailyCost` changes
- **Used in:** EstimatedMonthlyCostCard

### Days Mining Left
```typescript
daysLeft = balance ÷ dailyCost
```
- **Special case:** Returns "∞" if dailyCost is 0 (no costs)
- **Purpose:** Estimate mining runway based on current balance and daily costs
- **Updated:** When `balance` or `dailyCost` change
- **Used in:** EstimatedMiningDaysLeftCard

---

## Chart Modes

The **MiningEarningsChart** component supports 4 different view modes:

| Mode | Description | Data Source |
|------|-------------|-------------|
| `total` | Aggregated earnings across all pools | Calculated total |
| `luxor` | Luxor pool earnings only | Luxor API data |
| `braiins` | Braiins pool earnings only | Braiins API data |
| `stacked` | Side-by-side comparison of both pools | Both APIs combined |

**Implementation:**
```typescript
const [chartMode, setChartMode] = useState<"total" | "luxor" | "braiins" | "stacked">("total");
```

---

## Data Flow Diagram

```
Dashboard Page
├── useUser() [Auth context]
├── Fetch /api/user/balance
│   └── BalanceCard displays balance
├── Fetch /api/miners/daily-costs
│   ├── CostsCard displays daily cost
│   ├── EstimatedMonthlyCostCard computes monthly projection
│   └── EstimatedMiningDaysLeftCard computes runway
├── Fetch /api/workers/stats
│   ├── HostedMinersCard displays worker counts
│   └── (Returns poolBreakdown for potential filtering)
└── MiningEarningsChart
    ├── Filters by chartMode (total/luxor/braiins/stacked)
    └── Displays earnings visualization
```

---

## Error Handling

### Balance Fetch Error
```typescript
if (!response.ok) {
  console.error("Failed to fetch balance");
  setBalance(0); // Default to 0
}
```

### Daily Costs Fetch Error
```typescript
if (!response.ok) {
  console.error("Failed to fetch daily costs");
  setDailyCost(0); // Default to 0
}
```

### Workers Stats Fetch Error
```typescript
// Sets error state with descriptive message
setWorkersError(data.error || "Failed to fetch workers");
setWorkersStats({ activeWorkers: 0, inactiveWorkers: 0 });
```

---

## Interaction Flow

### 1. Page Load
- User navigates to `/dashboard`
- User authentication verified (useUser hook)
- All three data fetches triggered in parallel (useEffect)
- Loading states shown while data arrives

### 2. Chart Mode Selection
- User clicks chart mode button (Total/Luxor/Braiins/Stacked)
- `chartMode` state updates
- MiningEarningsChart re-renders with new filter
- Historical earning data filtered accordingly

### 3. Data Refresh
- Auto-refresh not currently implemented (could be added with React Query)
- Manual refresh via button triggers re-fetch of all APIs

---

## Responsive Design

- **Mobile (xs):** Single column layout, centered titles
- **Tablet (md):** Two-column grid for stat cards
- **Desktop (lg):** Full width with optimized spacing

---

## Performance Considerations

1. **Parallel Data Fetches:** All API calls triggered simultaneously on mount
2. **Computed Values:** Use React.useMemo for expensive calculations
3. **Loading States:** Separate loading state for each data source
4. **Chart Optimization:** MiningEarningsChart handles large datasets efficiently

---

## Testing Scenarios

1. **Initial Load**
   - All three APls should call on mount
   - Loading states should appear
   - Data should populate after successful responses

2. **Error States**
   - Test each API failing independently
   - Verify graceful error handling with defaults

3. **Chart Mode Switching**
   - Verify chart updates when mode changes
   - Confirm data accuracy for each mode

4. **Data Updates**
   - Verify computed values (monthly cost, days left) update correctly when base values change

---

## Future Enhancements

- [ ] Implement auto-refresh with React Query
- [ ] Add date range picker for chart filtering
- [ ] Cache worker stats to reduce API calls
- [ ] Add revenue projections based on hashrate trends
- [ ] Include pool migration suggestions based on profitability
