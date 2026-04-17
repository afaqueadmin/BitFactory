m# Customer Pages - Pool Usage Analysis

**Analysis Date:** April 11, 2026  
**Status:** Pages Ready for Pool Integration (APIs not yet implemented)

---

## OVERVIEW

All three customer-facing pages (Miners, Wallet, Dashboard) are **architecture-ready** for multi-pool support (Luxor + Braiins). They already have:

✅ Pool mode selector buttons (Total/Luxor/Braiins)  
✅ State management for poolMode  
✅ UI conditionals to show/hide pool-specific data  
✅ Data structures expecting poolBreakdown object  
✅ Helper functions to extract pool-specific values  

❌ **Missing:** Backend API endpoints that return poolBreakdown data

---

## PART 1: MINERS PAGE

**File:** `src/app/(auth)/miners/page.tsx`  
**Type:** Customer pool summary page  
**Purpose:** Show mining performance metrics per pool

### Pool Mode Selection

```typescript
const [poolMode, setPoolMode] = useState<"total" | "luxor" | "braiins">("total");
```

Three buttons with custom styling:
- **Total:** Primary color (blue)
- **Luxor:** `#1565C0` (deep navy with 🔷 emoji)
- **Braiins:** `#FFA500` (orange with 🔶 emoji)

### Data Structure Expected

```typescript
interface MinersSummary {
  totalHashrate: number;        // Aggregated hashrate across all pools
  activeMiners: number;         // Total active miners
  totalRevenue: number;         // Total revenue (BTC)
  hashprice: number;            // Current hashprice
  efficiency_5m: number;        // 5-min efficiency
  uptime_24h: number;           // 24-hour uptime
  pools: {
    luxor: {
      miners: number;           // Number of miners on Luxor
      hashrate: number;         // Luxor hashrate
      activeWorkers: number;    // Active workers on Luxor
      hashprice: number;        // Luxor hashprice
      efficiency_5m: number;    // Luxor 5-min efficiency
      uptime_24h: number;       // Luxor 24-hour uptime
    };
    braiins: {
      miners: number;           // Number of miners on Braiins
      hashrate: number;         // Braiins hashrate
      activeWorkers: number;    // Active workers on Braiins
      hashprice: number;        // Braiins hashprice
      efficiency_5m: number;    // Braiins 5-min efficiency
      uptime_24h: number;       // Braiins 24-hour uptime
    };
  };
}
```

### API Endpoint Expected

**Endpoint:** `GET /api/miners/summary`

**Response:**
```json
{
  "data": {
    "totalHashrate": 5.234,
    "activeMiners": 15,
    "totalRevenue": 0.01523,
    "hashprice": 0.000042,
    "efficiency_5m": 87.5,
    "uptime_24h": 99.8,
    "pools": {
      "luxor": {
        "miners": 10,
        "hashrate": 3.2,
        "activeWorkers": 10,
        "hashprice": 0.000042,
        "efficiency_5m": 87.2,
        "uptime_24h": 99.9
      },
      "braiins": {
        "miners": 5,
        "hashrate": 2.034,
        "activeWorkers": 5,
        "hashprice": 0.000043,
        "efficiency_5m": 88.1,
        "uptime_24h": 99.5
      }
    }
  }
}
```

### Displayed Cards

When poolMode is changed, these cards update with pool-specific data:

1. **Share Efficiency Card** - Shows efficiency_5m%
2. **HashRate 24-Hour Card** - Shows hashrate (PH/s)
3. **Uptime 24-Hour Card** - Shows uptime %
4. **Hashprice Card** - Shows current hashprice

### Value Extraction Logic

```typescript
const getMetric = (metric: "hashrate" | "hashprice" | "efficiency_5m" | "uptime_24h") => {
  if (poolMode === "total") {
    return data[metric];  // From top level
  } else if (poolMode === "luxor") {
    return data.pools?.luxor?.[metric];
  } else {
    return data.pools?.braiins?.[metric];
  }
}
```

### How to Query PoolAuth for This Page

```typescript
// Backend logic:
// 1. Get user from JWT token
// 2. Query PoolAuth records:
const luxorAuth = await prisma.poolAuth.findUnique({
  where: { poolId_userId: { userId, poolId: LUXOR_POOL_ID } }
});

const braiinsAuth = await prisma.poolAuth.findUnique({
  where: { poolId_userId: { userId, poolId: BRAIINS_POOL_ID } }
});

// 3. Use authKey to fetch from respective pools:
// - If luxorAuth exists: Fetch Luxor data
// - If braiinsAuth exists: Fetch Braiins data
// 4. Aggregate and return
```

---

## PART 2: WALLET PAGE

**File:** `src/app/(auth)/wallet/page.tsx`  
**Type:** Customer financial page  
**Purpose:** Show earnings, payouts, and wallet configuration per pool

### Pool Mode Selection

```typescript
const [poolMode, setPoolMode] = useState<"total" | "luxor" | "braiins">("total");
```

Three buttons (visual styling similar to Miners page)

### Data Structures Expected

```typescript
interface PoolBreakdown {
  totalEarnings: number;   // BTC
  pendingPayouts: number;  // BTC
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

### API Endpoints Expected

**Endpoint 1:** `GET /api/wallet/earnings-summary`

**Response:**
```json
{
  "totalEarnings": { "btc": 0.5234, "usd": 21398.42 },
  "pendingPayouts": { "btc": 0.0234, "usd": 952.16 },
  "currency": "BTC",
  "dataSource": "Luxor + Braiins",
  "timestamp": "2026-04-11T10:30:00Z",
  "subaccountCount": 2,
  "poolBreakdown": {
    "luxor": {
      "totalEarnings": 0.3234,
      "pendingPayouts": 0.0134
    },
    "braiins": {
      "totalEarnings": 0.2,
      "pendingPayouts": 0.01
    }
  }
}
```

**Endpoint 2:** `GET /api/wallet/earnings-24h`

**Response:**
```json
{
  "revenue24h": { "btc": 0.00523, "usd": 213.19 },
  "currency": "BTC",
  "timestamp": "2026-04-11T10:30:00Z",
  "dataSource": "Luxor + Braiins",
  "poolBreakdown": {
    "luxor": { "btc": 0.00323, "usd": 131.73 },
    "braiins": { "btc": 0.002, "usd": 81.46 }
  }
}
```

### Displayed Cards (6 Cards)

1. **Total Earnings** - Uses `getTotalEarnings()` which checks poolBreakdown
2. **Primary Wallet Address** - From `walletSettings` (Luxor only currently)
3. **Revenue (24 Hours)** - Uses `getRevenue24h()` which checks poolBreakdown
4. **Pending Payouts** - Uses `getPendingPayouts()` which checks poolBreakdown
5. **Payment Frequency** - From `walletSettings` (Luxor only currently)
6. **Next Payout** - From `walletSettings` (Luxor only currently)

### Value Extraction Logic

```typescript
const getTotalEarnings = (): number => {
  if (!summary) return 0;
  if (poolMode === "total") return summary.totalEarnings.btc;
  if (poolMode === "luxor") return summary.poolBreakdown?.luxor.totalEarnings ?? 0;
  if (poolMode === "braiins") return summary.poolBreakdown?.braiins.totalEarnings ?? 0;
  return 0;
};

const getPendingPayouts = (): number => {
  if (!summary) return 0;
  if (poolMode === "total") return summary.pendingPayouts.btc;
  if (poolMode === "luxor") return summary.poolBreakdown?.luxor.pendingPayouts ?? 0;
  if (poolMode === "braiins") return summary.poolBreakdown?.braiins.pendingPayouts ?? 0;
  return 0;
};

const getRevenue24h = (): number => {
  if (!revenue24h) return 0;
  if (poolMode === "total") return revenue24h.revenue24h.btc;
  if (poolMode === "luxor") return revenue24h.poolBreakdown?.luxor.btc ?? 0;
  if (poolMode === "braiins") return revenue24h.poolBreakdown?.braiins.btc ?? 0;
  return 0;
};
```

### How to Query PoolAuth for This Page

```typescript
// Backend logic:
// 1. Get user from JWT token
// 2. Query PoolAuth for both pools:
const poolAuths = await prisma.poolAuth.findMany({
  where: { userId }
});

// 3. For each PoolAuth entry, fetch earnings:
// - If poolId = LUXOR: Use authKey with Luxor API
// - If poolId = BRAIINS: Use authKey with Braiins API
// 4. Calculate totals and return

// Example for earnings:
const luxorEarnings = luxorAuth 
  ? await fetchLuxorEarnings(luxorAuth.authKey)
  : 0;
const braiinsEarnings = braiinsAuth 
  ? await fetchBraiinsEarnings(braiinsAuth.authKey)
  : 0;

return {
  totalEarnings: { btc: luxorEarnings + braiinsEarnings },
  poolBreakdown: {
    luxor: { totalEarnings: luxorEarnings },
    braiins: { totalEarnings: braiinsEarnings }
  }
}
```

---

## PART 3: DASHBOARD PAGE

**File:** `src/app/(auth)/dashboard/page.tsx`  
**Type:** Customer overview dashboard  
**Purpose:** High-level summary with worker stats and earnings chart

### Chart Mode Selection (NOT Pool Mode)

```typescript
const [chartMode, setChartMode] = useState<
  "total" | "luxor" | "braiins" | "stacked"
>("total");
```

**Difference from Miners/Wallet:** This page uses `chartMode` not `poolMode`, with 4 options:
- **total:** Aggregated earnings
- **luxor:** Luxor-only earnings
- **braiins:** Braiins-only earnings
- **stacked:** Side-by-side comparison

### Data Structure Expected

```typescript
// Workers stats response
{
  success: true,
  data: {
    activeWorkers: 15,        // Total active
    inactiveWorkers: 3,       // Total inactive
    poolBreakdown: {          // Pool-specific breakdown
      luxor: {
        activeWorkers: 10,
        inactiveWorkers: 1
      },
      braiins: {
        activeWorkers: 5,
        inactiveWorkers: 2
      }
    }
  }
}
```

### API Endpoints Expected

**Endpoint 1:** `GET /api/user/balance`

**Purpose:** Current account balance (USD)

**Response:**
```json
{
  "balance": 1234.56
}
```

**Info:** This is DB-only, NOT pool-dependent (aggregates all customers' costs paid)

---

**Endpoint 2:** `GET /api/miners/daily-costs`

**Purpose:** Daily operating costs for user's miners

**Response:**
```json
{
  "totalDailyCost": 45.67
}
```

**Info:** This is DB-only (hardware power × electricityRate), NOT pool-dependent

---

**Endpoint 3:** `GET /api/workers/stats`

**Purpose:** Worker/miner status with pool breakdown

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

### Displayed Components

1. **HostedMinersCard** - Shows active/inactive worker counts
   - Receives `poolBreakdown` prop
   - Can filter by pool if needed

2. **MiningEarningsChart** - Visualization component
   - Accepts `chartMode` prop to filter earnings data
   - Supports 4 views: total, luxor, braiins, stacked

3. **Four Stat Cards** (using DB-only data):
   - BalanceCard
   - CostsCard
   - EstimatedMonthlyCostCard
   - EstimatedMiningDaysLeftCard

### How to Query PoolAuth for This Page

```typescript
// For /api/workers/stats (POOL-DEPENDENT):
const poolAuths = await prisma.poolAuth.findMany({ where: { userId } });

const luxorAuth = poolAuths.find(pa => pa.poolId === LUXOR_POOL_ID);
const braiinsAuth = poolAuths.find(pa => pa.poolId === BRAIINS_POOL_ID);

// Query worker counts for each pool:
const luxorWorkers = luxorAuth 
  ? await fetchLuxorWorkers(luxorAuth.authKey)
  : { active: 0, inactive: 0 };

const braiinsWorkers = braiinsAuth 
  ? await fetchBraiinsWorkers(braiinsAuth.authKey)
  : { active: 0, inactive: 0 };

return {
  activeWorkers: luxorWorkers.active + braiinsWorkers.active,
  inactiveWorkers: luxorWorkers.inactive + braiinsWorkers.inactive,
  poolBreakdown: {
    luxor: luxorWorkers,
    braiins: braiinsWorkers
  }
}

// For /api/user/balance and /api/miners/daily-costs:
// These are DB-only queries, no PoolAuth needed
```

---

## PART 4: PoolAuth INTEGRATION PATTERN

### How Each Page Uses PoolAuth

#### Miners Page Flow

```
1. User calls GET /api/miners/summary
2. Backend:
   - Get userId from JWT
   - SELECT * FROM pool_auths WHERE user_id = userId
   - For each PoolAuth:
     - IF pool.name = "Luxor": 
       - Call Luxor API with authKey (stored in poolAuth.authKey)
       - Extract: hashrate, efficiency, uptime, hashprice
     - IF pool.name = "Braiins":
       - Call Braiins API with authKey (stored in poolAuth.authKey)
       - Extract: hashrate, efficiency, uptime, hashprice
   - Aggregate and return poolBreakdown
3. Frontend:
   - Receives MinersSummary with pools.luxor and pools.braiins
   - User toggles poolMode
   - Cards update to show selected pool metrics
```

#### Wallet Page Flow

```
1. User calls GET /api/wallet/earnings-summary
2. Backend:
   - Get userId from JWT
   - SELECT * FROM pool_auths WHERE user_id = userId
   - For each PoolAuth:
     - IF pool.name = "Luxor":
       - Call Luxor getPaymentSettings(authKey) → Get balance info
     - IF pool.name = "Braiins":
       - Call Braiins getUserProfile(authKey) → Get balance info
   - Sum balances → totalEarnings
   - Aggregate and return poolBreakdown with BTC amounts
3. Frontend:
   - Receives EarningsSummary with poolBreakdown
   - Calculates USD using BTC price
   - User toggles poolMode
   - Cards update to show selected pool earnings
```

#### Dashboard Page Flow

```
1. User calls GET /api/workers/stats
2. Backend:
   - Get userId from JWT
   - SELECT * FROM pool_auths WHERE user_id = userId
   - For each PoolAuth:
     - IF pool.name = "Luxor":
       - Call Luxor getWorkers(authKey) → Count active/inactive
     - IF pool.name = "Braiins":
       - Call Braiins (convert worker states to active/inactive)
   - Return poolBreakdown with worker counts
3. Frontend:
   - Receives worker stats with poolBreakdown
   - HostedMinersCard displays aggregated counts
   - MiningEarningsChart filters by chartMode
```

---

## PART 5: DATABASE FLOW

### Current Schema State

```prisma
model PoolAuth {
  id        String   @id @default(cuid())
  poolId    String
  userId    String
  authKey   String   // ← Stores Luxor token OR Braiins token
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  pool Pool @relation(fields: [poolId], references: [id])
  user User @relation(fields: [userId], references: [id])

  @@unique([poolId, userId])  // One auth per user per pool
  @@map("pool_auths")
}

model Pool {
  id          String   @id @default(cuid())
  name        String   @unique  // "Luxor" or "Braiins"
  apiUrl      String
  description String?

  miners    Miner[]      // Can assign miners to pool
  poolAuths PoolAuth[]   // Users' API tokens for this pool
}

model Miner {
  poolId      String?    // Which pool this miner reports to
  poolAuth    String?    // Unclear - might be for custom auth?
  pool        Pool?      @relation(fields: [poolId], references: [id])
}
```

### Expected Setup

Before customers can use Braiins:

1. **Admin creates Pool record:**
   ```prisma
   await prisma.pool.create({
     data: {
       name: "Braiins",
       apiUrl: "https://pool.braiins.com",
       description: "Braiins AntPool"
     }
   });
   ```

2. **Customer stores Braiins API token in PoolAuth:**
   ```prisma
   await prisma.poolAuth.create({
     data: {
       poolId: "braiins-pool-id",
       userId: "customer-id",
       authKey: "braiins_api_token_xyz"  // Sensitive! Should be encrypted
     }
   });
   ```

3. **Optionally assign miners to Braiins:**
   ```prisma
   await prisma.miner.update({
     where: { id: "miner-1" },
     data: { poolId: "braiins-pool-id" }
   });
   ```

---

## PART 6: IMPLEMENTATION CHECKLIST

### ✅ Frontend (Already Done)

- [x] Miners page with poolMode selector
- [x] Wallet page with poolMode selector  
- [x] Dashboard page with chartMode selector
- [x] MinersSummary interface with pools breakdown
- [x] EarningsSummary interface with pools breakdown
- [x] Revenue24h interface with pools breakdown
- [x] Helper functions for pool-specific value extraction
- [x] Cards that respond to poolMode changes
- [x] Color-coded buttons (#1565C0 for Luxor, #FFA500 for Braiins)

### ❌ Backend (Missing)

- [ ] `GET /api/miners/summary` endpoint
- [ ] `GET /api/wallet/earnings-summary` endpoint
- [ ] `GET /api/wallet/earnings-24h` endpoint
- [ ] `GET /api/workers/stats` endpoint (needs pool breakdown)
- [ ] Query PoolAuth table to find user's pool credentials
- [ ] Fetch Luxor data via LuxorClient if PoolAuth.Luxor exists
- [ ] Fetch Braiins data via BraiinsClient if PoolAuth.Braiins exists
- [ ] Aggregate results from both pools
- [ ] Return poolBreakdown structure to frontend

### 💾 Database

- [x] PoolAuth model exists
- [x] Pool model exists
- [ ] Braiins Pool record needs to be created (admin tool)
- [ ] Users need to add PoolAuth for Braiins (customer UI)

### 🔐 Security

- [ ] Encrypt authKey in database (currently stored plaintext)
- [ ] Create endpoint for customers to update PoolAuth.authKey securely
- [ ] Never return authKey to frontend
- [ ] Validate poolId is valid before querying

---

## PART 7: QUICK REFERENCE - WHAT EACH PAGE NEEDS

| Page | Pools Supported | Data Source | Modes | Cards Affected |
|------|-----------------|-------------|-------|----------------|
| **Miners** | Luxor + Braiins | `/api/miners/summary` | total, luxor, braiins | Efficiency, HashRate, Uptime, Hashprice |
| **Wallet** | Luxor + Braiins | `/api/wallet/earnings-summary` /`/api/wallet/earnings-24h` | total, luxor, braiins | Total Earnings, Revenue 24h, Pending Payouts |
| **Dashboard** | Luxor + Braiins | `/api/workers/stats` | total, luxor, braiins, stacked | HostedMinersCard, MiningEarningsChart |

---

## SUMMARY

Your customer pages are **UI-ready** for Braiins integration. They have:

✅ All UI components built  
✅ All state management in place  
✅ All helper functions to extract pool-specific data  
✅ Correct data structure interfaces defined  
✅ Pool color scheme implemented  

What's missing:

❌ Backend API endpoints that query PoolAuth and aggregate data  
❌ Logic to fetch Braiins data when PoolAuth.Braiins exists  
❌ Pool names must match exactly ("Luxor" and "Braiins")  

The pattern is consistent across all three pages: **Get PoolAuth for user → Fetch from respective API → Aggregate → Return to frontend**

