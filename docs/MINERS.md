# Miners Page - Technical Documentation

## Overview

The Miners page provides detailed insights into mining operations with **multi-pool support** for both Luxor and Braiins. Users can toggle between aggregated metrics (Total), individual pool metrics (Luxor/Braiins), and view their complete miner inventory with real-time status information.

---

## Components & Layout

### Page Location
`src/app/(auth)/miners/page.tsx`

### Key Components
1. **Miners Title & Pool Mode Toggle** - Select view: Total, Luxor, or Braiins
2. **HostedMinersList** - Displays all miners with pool affiliation and status
3. **Four Metric Cards** (Dynamic based on poolMode):
   - HashRate24HoursCard
   - ShareEfficiencyCard
   - Uptime24HoursCard
   - HashpriceCard

---

## State Management

### Page State Variables

| State | Type | Purpose |
|-------|------|---------|
| `poolMode` | "total" \| "luxor" \| "braiins" | Selected pool view mode |
| `minerFilter` | "all" \| "luxor" \| "braiins" | Filter miners list by pool |

### minersSummary Interface
```typescript
interface MinersSummary {
  totalHashrate: number;
  activeMiners: number;
  totalRevenue: number;
  hashprice: number;
  efficiency_5m: number;
  uptime_24h: number;
  
  pools: {
    luxor: {
      miners: number;
      hashrate: number;
      activeWorkers: number;
      hashprice: number;
      efficiency_5m: number;
      uptime_24h: number;
    };
    braiins: {
      miners: number;
      hashrate: number;
      activeWorkers: number;
      hashprice: number;
      efficiency_5m: number;
      uptime_24h: number;
    };
  };
}
```

---

## API Endpoints

### 1. Miners Summary
**Endpoint:** `GET /api/miners/summary`

**Purpose:** Fetch aggregated mining metrics for all miners with pool breakdown

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "totalHashrate": 1500000000000,
    "activeMiners": 12,
    "totalRevenue": 0.0125,
    "hashprice": 0.0000000089,
    "efficiency_5m": 98.5,
    "uptime_24h": 99.2,
    "pools": {
      "luxor": {
        "miners": 8,
        "hashrate": 800000000000,
        "activeWorkers": 7,
        "hashprice": 0.0000000090,
        "efficiency_5m": 99.1,
        "uptime_24h": 99.5
      },
      "braiins": {
        "miners": 4,
        "hashrate": 700000000000,
        "activeWorkers": 4,
        "hashprice": 0.0000000088,
        "efficiency_5m": 97.8,
        "uptime_24h": 98.8
      }
    }
  }
}
```

**Data Aggregation Logic:**
- **Total metrics** = Sum of Luxor + Braiins metrics
- **Pool-specific metrics** = Individual pool API responses combined
- Updated in real-time via TanStack Query

---

## Metric Cards Explained

### 1. Hash Rate 24 Hours
**Card Component:** `HashRate24HoursCard`

**What it shows:**
- Mining power in Terahash/second (TH/s)
- Current 24-hour average hashrate

**Display Rule:**
```typescript
if (poolMode === "total") {
  showMetric = data.totalHashrate;
} else if (poolMode === "luxor") {
  showMetric = data.pools.luxor.hashrate;
} else {
  showMetric = data.pools.braiins.hashrate;
}
```

**Formatting:**
```typescript
formatHashrate(value) // Converts to readable format (TH/s, GH/s, etc.)
```

---

### 2. Share Efficiency
**Card Component:** `ShareEfficiencyCard`

**What it shows:**
- Percentage of valid shares submitted vs total work sent
- Higher = Better (target: 95%+)

**Display Rule:**
```typescript
if (poolMode === "total") {
  showMetric = data.efficiency_5m;
} else if (poolMode === "luxor") {
  showMetric = data.pools.luxor.efficiency_5m;
} else {
  showMetric = data.pools.braiins.efficiency_5m;
}
```

**Data Source:** Last 5-minute efficiency from pool APIs

---

### 3. Uptime 24 Hours
**Card Component:** `Uptime24HoursCard`

**What it shows:**
- Percentage of time miners were online and reporting in last 24 hours
- Higher = More reliable (target: 99%+)

**Display Rule:**
```typescript
if (poolMode === "total") {
  showMetric = data.uptime_24h;
} else if (poolMode === "luxor") {
  showMetric = data.pools.luxor.uptime_24h;
} else {
  showMetric = data.pools.braiins.uptime_24h;
}
```

**Data Source:** Last 24-hour uptime from pool APIs

---

### 4. Hashprice
**Card Component:** `HashpriceCard`

**What it shows:**
- BTC earned per unit of hashrate
- Important for profitability assessment
- Value in satoshis per terahash per day (sats/TH/day)

**Display Rule:**
```typescript
if (poolMode === "total") {
  showMetric = data.hashprice;
} else if (poolMode === "luxor") {
  showMetric = data.pools.luxor.hashprice;
} else {
  showMetric = data.pools.braiins.hashprice;
}
```

---

## Pool Mode Selection

### Toggle Button Group
Located at top of page with 3 options:
- **Total** - Aggregated across all miners
- **Luxor** - Luxor pool metrics only
- **Braiins** - Braiins pool metrics only

**Implementation:**
```typescript
<ToggleButtonGroup
  value={poolMode}
  exclusive
  onChange={(e, newMode) => setPoolMode(newMode)}
>
  <ToggleButton value="total">Total</ToggleButton>
  <ToggleButton value="luxor">Luxor</ToggleButton>
  <ToggleButton value="braiins">Braiins</ToggleButton>
</ToggleButtonGroup>
```

**On Selection:**
1. State updates to trigger metrics recalculation
2. All 4 cards re-render with new pool data
3. Miners list remains visible for reference

---

## Miners List Component

### HostedMinersList
**Component Location:** `src/components/HostedMinersList.tsx`

**Features:**
- Displays all user's miners with status indicators
- Shows pool affiliation (Luxor or Braiins)
- Real-time worker status from pool APIs
- Supports pool-specific filtering

**Miner Details Displayed:**
- Miner Name
- Model/Hardware
- Status (Active, Inactive, Deployment in Progress)
- Connected Pool (Luxor or Braiins)
- Hashrate (from pool APIs)
- Location
- Firmware version

**Data Sources:**
- Database: Miner configuration (name, model, location)
- Luxor API: Real-time worker status and metrics
- Braiins API: Real-time worker status and metrics

---

## Data Flow Diagram

```
Miners Page
├── poolMode state (Total/Luxor/Braiins)
│   └── Controls metric display in 4 cards
│
├── TanStack Query: Fetch /api/miners/summary
│   └── Returns MinersSummary with pool breakdown
│       ├── HashRate24HoursCard displays based on poolMode
│       ├── ShareEfficiencyCard displays based on poolMode
│       ├── Uptime24HoursCard displays based on poolMode
│       └── HashpriceCard displays based on poolMode
│
└── HostedMinersList
    ├── Fetches /api/miners/user
    │   └── Gets miner list with pool info
    │
    ├── Fetches /api/luxor (for Luxor miners)
    │   └── Gets real-time worker status
    │
    └── Fetches /api/braiins (for Braiins miners)
        └── Gets real-time worker status
```

---

## Helper Function: getMetric()

Used to dynamically select correct value based on poolMode:

```typescript
const getMetric = (
  metric: "hashrate" | "hashprice" | "efficiency_5m" | "uptime_24h"
) => {
  if (poolMode === "total") {
    // Return aggregated metric
  } else if (poolMode === "luxor") {
    // Return Luxor-specific metric
  } else {
    // Return Braiins-specific metric
  }
};
```

**Called by:** Each metric card to fetch appropriate value

---

## Logging & Debugging

### Console Logs
```typescript
// On pool mode change
console.log(`[Miners Page] Pool Mode Changed: ${poolMode}`, {
  hashrate: ...,
  efficiency_5m: ...,
  uptime_24h: ...,
  hashprice: ...
});

// On API response
console.log("[Miners Page] API Response Data:", result.data);
```

**Enable in browser DevTools** for troubleshooting data flow

---

## Error Handling

### API Failures

**Failed Summary Fetch:**
```typescript
if (!response.ok) {
  console.error("Failed to fetch miners summary");
  return { data: {} }; // Return empty to prevent crashes
}
```

**Result:** Cards show "N/A" or 0 values with no data

### Empty State
If no miners exist:
```typescript
// HostedMinersList shows: "No miners assigned"
// Summary cards show: 0 values
```

---

## Responsive Design

- **Mobile (xs):** Single column cards, horizontal scroll for miners list
- **Tablet (md):** Two-column card layout
- **Desktop (lg):** Full width with optimized spacing

---

## Performance Considerations

1. **TanStack Query:** Handles caching and deduplication of API calls
2. **Metrics Calculation:** Done server-side in `/api/miners/summary`
3. **Worker Status:** Fetched on-demand when HostedMinersList renders
4. **Pool Filtering:** Client-side filtering doesn't require new API calls

---

## Workflow Example

**Scenario: User switches from Total to Luxor mode**

1. User clicks "Luxor" ToggleButton
2. `poolMode` state updates to "luxor"
3. All 4 metric cards re-render calling `getMetric()` with poolMode="luxor"
4. Cards display Luxor-only values:
   - HashRate = data.pools.luxor.hashrate
   - Efficiency = data.pools.luxor.efficiency_5m
   - Uptime = data.pools.luxor.uptime_24h
   - Hashprice = data.pools.luxor.hashprice
5. HostedMinersList can optionally filter to show Luxor miners only

---

## Testing Scenarios

1. **Pool Mode Toggle**
   - Verify all 4 cards update when mode changes
   - Confirm correct values displayed for each mode
   - Check "Total" = Luxor + Braiins values

2. **Data Accuracy**
   - Verify metrics match pool dashboards
   - Check aggregation logic (e.g., hashrate is sum, not average)

3. **Error Conditions**
   - Test with missing pool data
   - Verify graceful handling if one pool API fails

4. **Responsiveness**
   - Test on mobile, tablet, desktop
   - Verify metrics cards stack properly

---

## Future Enhancements

- [ ] Implement pool migration recommendations based on hashprice
- [ ] Add profit calculator for each pool
- [ ] Show revenue comparison between pools
- [ ] Add auto-refresh with configurable interval
- [ ] Include profitability trend graphs per pool
- [ ] Add pool performance alerts/notifications
