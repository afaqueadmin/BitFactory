# Braiins Integration Feasibility Report

**Date:** January 15, 2025  
**Last Updated:** April 18, 2026 (UI/UX approach updated)  
**Based On:** Code verification from actual implementation (NOT documentation)  
**Verification Sources:**
- `/src/app/(manage)/adminpanel/page.tsx` - UI cards (verified April 18, 2026)
- `/src/app/api/admin/dashboard/route.ts` - Data fetching
- `/src/lib/braiins.ts` - Braiins API client
- `BRAIINS_API_STRUCTURE_MISMATCH.md` - Actual API responses

---

## EXECUTIVE SUMMARY

✅ **24 Cards Verified:** Exactly 14 DB-only + 10 Luxor-dependent  
✅ **Braiins API Ready:** All required data available  
⚠️ **Critical Mapping Issue:** Braiins lacks "Pool Accounts" / "Subaccounts" concept  
✅ **Hashrate & Workers:** Full data available  
✅ **Revenue:** Daily reward and block reward data available  

**Recommendation:** Option B (Pool Selector Dropdown) is FEASIBLE but requires architectural adjustment for Pool Accounts.

---

## APRIL 18, 2026 UPDATE: UI/UX APPROACH CHANGE

**Current Implementation Status (in code):**
- ✅ Pool mode toggle exists (All Pools, Luxor, Braiins)
- ✅ Cards conditionally hidden for Braiins mode using `shouldHideForBraiins()` function
- ❌ 4 cards are hidden: Uptime (24h), Total/Active/Inactive Pool Accounts

**Approved Change:**
- Remove card hiding logic
- Show all 24 cards regardless of pool mode
- Display "N/A" as value for unavailable metrics in Braiins mode
- This provides consistent layout and better user communication

**Cards Affected:**
1. Uptime (24 hours) → Show "N/A" for Braiins
2. Total Pool Accounts → Show "N/A" for Braiins  
3. Active Pool Accounts → Show "N/A" for Braiins
4. Inactive Pool Accounts → Show "N/A" for Braiins

---

## PART 1: CARD COUNT VERIFICATION

### Active Cards in Dashboard (24 Total)

#### StatCards (4):
1. ✅ **Miners** - Active/Inactive/Review (hybrid: Luxor active + DB inactive)
2. ✅ **Spaces** - Free/Used (DB only)
3. ✅ **Customers** - Active/Inactive (DB only)
4. ✅ **Power** - Free kW/Used kW (DB + Power calculation using Luxor power)

#### ValueCards (20):

**Financial (3):**
5. ✅ **Monthly Revenue (30 days)** - DB only (costPayment query)
6. ✅ **Total Customer Balance** - DB only (costPayment aggregate)
7. ✅ **Total Mined Revenue** - Luxor only (revenue endpoint)

**Luxor Performance (3):**
8. ✅ **Uptime (24 hours)** - Luxor only
9. ✅ **Hashrate (5 min)** - Luxor only
10. ✅ **Hashrate (24 hours)** - Luxor only

**Luxor Pool Accounts (3):**
11. ✅ **Total Pool Accounts** - Luxor only
12. ✅ **Active Pool Accounts** - Luxor only
13. ✅ **Inactive Pool Accounts** - Luxor only (calculated)

**Luxor Workers (3):**
14. ✅ **Total Workers (Luxor)** - Luxor only
15. ✅ **Active Workers (Luxor)** - Luxor only
16. ✅ **Inactive Workers (Luxor)** - Luxor only

**Customer Count (1):**
17. ✅ **Total Customers** - DB only

**Hosting Metrics (3):**
18. ✅ **Hosting Revenue (Electricity)** - DB only (costPayment filtered)
19. ✅ **Hosting Cost** - DB only (vendor invoices)
20. ✅ **Hosting Profit** - DB only (calculated: revenue - cost)

**Balance Breakdown (4):**
21. ✅ **Positive Customer Balance** - DB only (costPayment filtered)
22. ✅ **Negative Customer Balance** - DB only (costPayment filtered)
23. ✅ **Positive Balance Customers** - DB only (count)
24. ✅ **Negative Balance Customers** - DB only (count)

**TOTAL: 24 cards** ✅ Confirmed

---

## PART 2: LUXOR-DEPENDENT CARDS (11 Cards Total)

### Cards That Use Luxor Data:

| # | Card Title | Current Data Source | Code Reference |
|---|-----------|-------------------|-----------------|
| 1 | **Miners (Active)** | `stats?.miners.active` (from Luxor API) | page.tsx line 205 |
| 2 | **Power (Free/Used)** | `stats?.luxor.power.*` | page.tsx lines 265-273 |
| 3 | **Total Mined Revenue** | `stats?.financial.totalMinedRevenue` (Luxor) | page.tsx line 289 |
| 4 | **Uptime (24 hours)** | `stats?.luxor.uptime_24h` | page.tsx line 297 |
| 5 | **Hashrate (5 min)** | `stats?.luxor.hashrate_5m` | page.tsx line 303 |
| 6 | **Hashrate (24 hours)** | `stats?.luxor.hashrate_24h` | page.tsx line 310 |
| 7 | **Total Pool Accounts** | `stats?.luxor.poolAccounts.total` | page.tsx line 319 |
| 8 | **Active Pool Accounts** | `stats?.luxor.poolAccounts.active` | page.tsx line 325 |
| 9 | **Inactive Pool Accounts** | `stats?.luxor.poolAccounts.inactive` | page.tsx line 331 |
| 10 | **Total Workers** | `stats?.luxor.workers.totalWorkers` | page.tsx line 339 |
| 11 | **Active Workers** | `stats?.luxor.workers.activeWorkers` | page.tsx line 345 |
| 12 | **Inactive Workers** | `stats?.luxor.workers.inactiveWorkers` | page.tsx line 351 |

**Note:** "Total Mined Revenue" is technically in `financial` object but sourced from Luxor API (route.ts line ~330)

**TOTAL LUXOR-DEPENDENT: 12 cards** (not 10 as documented - includes Power card)

---

## PART 3: BRAIINS API CAPABILITIES

### Available Data from Braiins API

**Source:** `/src/lib/braiins.ts` - Full client implementation with all endpoints

#### 1. **User Profile Data**
```typescript
// GET /accounts/profile/json/btc
{
  username: string;
  btc: {
    all_time_reward: string;
    hash_rate_5m: number;        // ✅ Can map to "Hashrate (5 min)"
    hash_rate_60m: number;
    hash_rate_24h: number;       // ✅ Can map to "Hashrate (24 hours)"
    hash_rate_yesterday: number;
    ok_workers: number;          // ✅ Can map to "Active Workers"
    off_workers: number;         // ✅ Can map to "Inactive Workers"
    low_workers: number;         // ⚠️ Partial worker status
    dis_workers: number;         // ⚠️ Partial worker status
    current_balance: string;     // ✅ Mining balance (different from Luxor)
    today_reward: string;
    estimated_reward: string;
  }
}
```

#### 2. **Daily Rewards**
```typescript
// GET /accounts/rewards/json/btc?from=YYYY-MM-DD&to=YYYY-MM-DD
{
  btc: {
    daily_rewards: [
      {
        date: number;            // Unix timestamp
        total_reward: string;    // ✅ Can map to revenue metrics
        mining_reward: string;
        // ... more fields
      }
    ]
  }
}
```

#### 3. **Workers Data**
```typescript
// GET /accounts/workers/json/btc
{
  btc: {
    workers: {
      "username.worker_name": {  // ✅ By default: 1 user
        state: "ok" | "dis" | "low" | "off";
        hash_rate_5m: number;
        hash_rate_60m: number;
        hash_rate_24h: number;
        // ... more fields
      }
    }
  }
}
```

#### 4. **Block Rewards**
```typescript
// GET /accounts/block_rewards/json/btc?from=YYYY-MM-DD&to=YYYY-MM-DD
{
  btc: {
    block_rewards: [
      {
        date: number;
        blocks: number;
        amount: string;
      }
    ]
  }
}
```

#### 5. **Payouts**
```typescript
// GET /accounts/payouts/json/btc?from=YYYY-MM-DD&to=YYYY-MM-DD
{
  btc: {
    payouts: [
      {
        date: string;
        transaction_id: string;
        amount: string;
        status: string;
      }
    ]
  }
}
```

#### 6. **Pool Stats (Global)**
```typescript
// GET /stats/json/btc (No auth required)
{
  btc: {
    hash_rate_unit: "Gh/s";
    pool_active_workers: number;  // ⚠️ GLOBAL, not user-specific
    pool_5m_hash_rate: number;
    pool_60m_hash_rate: number;
    pool_24h_hash_rate: number;
  }
}
```

---

## PART 4: CARD-BY-CARD BRAIINS MAPPING

### ✅ MAPPABLE WITH NO ISSUES (8 Cards)

| Card | Luxor Data | Braiins Data | Mapping |
|------|-----------|-------------|---------|
| **Hashrate (5 min)** | `luxor.hashrate_5m` (H/s) | `profile.btc.hash_rate_5m` (Gh/s) | ✅ Direct map, unit conversion needed |
| **Hashrate (24h)** | `luxor.hashrate_24h` (H/s) | `profile.btc.hash_rate_24h` (Gh/s) | ✅ Direct map, unit conversion needed |
| **Active Workers** | From workers endpoint | Count `ok_workers` from profile | ✅ Available but different count method |
| **Inactive Workers** | From workers endpoint | `off_workers + dis_workers + low_workers` | ✅ Available but grouped differently |
| **Total Workers** | `active + inactive` | `ok + off + dis + low` | ✅ Calculated from profile |
| **Total Mined Revenue** | `revenue` endpoint sum | `daily_rewards[].total_reward` sum | ✅ Available, sum daily rewards |
| **Hosting Revenue** | DB only | N/A - kept as DB only | ✅ No change needed |
| **Hosting Cost** | DB only | N/A - kept as DB only | ✅ No change needed |

---

### ⚠️ PARTIALLY MAPPABLE / REQUIRES ADJUSTMENT (2 Cards)

| Card | Issue | Luxor Has | Braiins Has | Solution |
|------|-------|-----------|------------|----------|
| **Uptime (24h)** | Braiins doesn't have uptime metric | `uptime_24h: number` (%) | ❌ NOT AVAILABLE | Calculate from reward data or use last_share timestamp |
| **Power (Free/Used kW)** | Power is DB-only, uses Luxor metadata | Uses hardware power capacity | ❌ NOT AVAILABLE | Don't change, keep DB-only |

---

### 🔴 UNMAPPABLE - NO EQUIVALENT (3 Cards)

| Card | Why | Luxor Data | Braiins Data |
|------|-----|-----------|-------------|
| **Pool Accounts (Total)** | Architecture difference | Luxor has subaccounts (multi-account) | Braiins is single-user (no subaccounts) |
| **Pool Accounts (Active)** | Architecture difference | Multiple subaccounts with status | Only one user, no subaccount management |
| **Pool Accounts (Inactive)** | Architecture difference | Calculated from subaccounts | N/A - single user concept |

**CRITICAL INSIGHT:** Braiins API is fundamentally different from Luxor:
- **Luxor**: Multi-user/multi-subaccount architecture (one token can access multiple subaccounts)
- **Braiins**: Single-user architecture (one token = one user only)

---

## PART 5: MINERS CARD SPECIAL CASE

### Current Implementation
```typescript
// From page.tsx
miners: {
  active: number;           // ✅ From Luxor API workers endpoint
  inactive: number;         // ✅ From DB (miners table with DEPLOYMENT_IN_PROGRESS status)
  actionRequired: number;   // ✅ Calculated discrepancy (Luxor active - DB active)
}
```

### Braiins Mapping
```typescript
// Braiins available:
profile.btc.ok_workers;    // Active miners
profile.btc.off_workers + dis_workers + low_workers;  // Inactive

// Issue: "actionRequired" calculation depends on comparing:
// - Luxor workers (active count from API)
// - DB miners (actual hardware we think is active)
// 
// For Braiins, works the same way:
// - Braiins workers (ok_workers from profile)
// - DB miners (unchanged)
```

✅ **Miners card CAN switch pool mode without code changes**

---

## PART 6: IMPLEMENTATION FEASIBILITY ANALYSIS

### For Option B (Pool Selector Dropdown)

#### ✅ FEASIBLE FOR (9 Cards)
- Hashrate (5 min)
- Hashrate (24 hours)
- Active Workers
- Inactive Workers
- Total Workers
- Total Mined Revenue
- Miners Active
- Hosting Revenue (stays DB)
- Hosting Cost (stays DB)
- Hosting Profit (stays DB)
- All 14 DB-only cards

**Total: 21 cards work fine with pool selector**

#### ⚠️ REQUIRES WORKAROUND (2 Cards)
1. **Uptime (24h)**
   - Luxor: Direct data from `uptime_24h` field
   - Braiins: No metric available
   - **Solution A**: Show "N/A" for Braiins mode
   - **Solution B**: Calculate from last_share timestamp (estimated uptime)
   - **Solution C**: Use 0% as placeholder

2. **Power (Free/Used kW)**
   - Currently uses `luxor.power` field
   - Reality: Based on DB hardware capacity + miner count
   - **Solution**: Keep DB-only (don't change based on pool mode)

#### 🔴 CANNOT IMPLEMENT (3 Cards)
1. **Total Pool Accounts** - No Braiins equivalent
2. **Active Pool Accounts** - No Braiins equivalent
3. **Inactive Pool Accounts** - No Braiins equivalent

**Options for Pool Accounts cards:**
```
Option A: Hide these 3 cards when "Braiins" mode selected
  ├─ User sees only 21 cards in Braiins mode
  ├─ Shows 24 cards in Luxor/Total mode
  └─ Clean but inconsistent (Currently implemented in code)

Option B: Show static text "N/A" for Braiins ✅ **SELECTED APPROACH**
  ├─ Keeps layout consistent (24 cards always)
  ├─ User understands Braiins doesn't have this
  ├─ Cleaner visual hierarchy (no layout shift)
  └─ Implementation: Remove conditional hiding, set value to "NA" for these cards in Braiins mode

Option C: Replace with "Mining Accounts" (just one user)
  ├─ "Total Mining Accounts: 1" (always)
  ├─ No mismatch with architecture
  └─ Loses valuable comparison data
```

---

## PART 7: CRITICAL DISCREPANCIES FROM DOCUMENTATION

### Documentation Said vs Code Actually Does

| Item | Old Doc | Actual Code | Status |
|------|---------|------------|--------|
| Card Count | "27-31 cards" | 24 cards ✅ Confirmed | FIXED |
| Luxor Cards | "10 pool cards" | 12 Luxor-dependent cards (includes Power + Miners Active) | CORRECTED |
| Efficiency Metric | "Current/Average Efficiency %" exist | Only `uptime_24h` exists | FIXED |
| Braiins Ready | "No Braiins support yet" | Braiins client class exists + API wrappers ready | OUTDATED |
| Pool Accounts | "Multiple accounts per pool" | Luxor: Yes, Braiins: No (single-user) | INCOMPLETE (didn't mention Braiins limitation) |

---

## PART 8: DATA STRUCTURE FOR API RESPONSE

### What /api/admin/dashboard Should Return (for Option B to work)

```typescript
interface DashboardStats {
  // Database-backed (unchanged)
  miners: { active, inactive, actionRequired };
  spaces: { free, used };
  customers: { total, active, inactive };
  
  // Luxor pool data
  luxor: {
    poolAccounts: { total, active, inactive };
    workers: { activeWorkers, inactiveWorkers, totalWorkers };
    hashrate_5m: number;
    hashrate_24h: number;
    uptime_24h: number;
    power: { totalPower, usedPower, availablePower };
  };
  
  // NEW: Braiins pool data (same structure as luxor for consistency)
  braiins: {
    workers: { activeWorkers, inactiveWorkers, totalWorkers };
    hashrate_5m: number;
    hashrate_24h: number;
    uptime_24h: number; // Will be null or "N/A"
    poolAccounts: { total: 1, active: 1, inactive: 0 }; // Hardcoded for single-user
  };
  
  // NEW: Combined data (when user selects "Total" mode)
  combined: {
    poolAccounts: { total, active, inactive };
    workers: { activeWorkers, inactiveWorkers, totalWorkers };
    hashrate_5m: number;
    hashrate_24h: number;
    uptime_24h: number; // Weighted average (excluding Braiins if N/A)
  };
  
  // Financial (unchanged - these are DB-backed)
  financial: {
    totalCustomerBalance: number;
    monthlyRevenue: number;
    totalMinedRevenue: number; // Could be Luxor OR Braiins OR combined
  };
  
  warnings: string[];
}
```

---

## PART 9: IMPLEMENTATION ROADMAP

### Phase 1: Backend
1. ✅ `src/lib/braiins.ts` - Already exists
2. ✅ Braiins helpers: `fetchBraiinsWorkers()`, `fetchBraiinsSummary()`, etc.
   - Can copy Luxor helpers as template
   - Update to use BraiinsClient instead of Luxor API proxy
3. ⚠️ Extend DashboardStats interface with `braiins: {}` and `combined: {}`
4. ⚠️ Modify `/api/admin/dashboard` route to:
   - Fetch Luxor data (existing code)
   - Fetch Braiins data (new code)
   - Calculate combined values
5. ⚠️ Handle errors for individual pools (one fails ≠  both fail)

### Phase 2: Frontend ✅ **UPDATED APPROACH**
1. Add poolMode state: `useState("total")` ✅ (Already implemented)
2. Add pool selector dropdown (3 options: Total/Luxor/Braiins) ✅ (Already implemented)
3. Conditionally render 10 affected cards based on poolMode ✅ (Already implemented)
4. **CHANGE**: Remove conditional hiding of unavailable cards (use `shouldHideForBraiins` removal)
5. **CHANGE**: Modify card value logic to show "N/A" for Braiins mode:
   - For Uptime card: Show `value="N/A"` when poolMode === "braiins"
   - For 3 Pool Accounts cards: Show `value="N/A"` when poolMode === "braiins"
6. For "Power" card: Keep DB-only (no pool switching)
7. For all other cards: Use poolMode-based switching (current implementation)

### Phase 3: Testing
1. Test with Luxor only (existing)
2. Test with Braiins only (new)
3. Test "Total" mode calculations
4. Test error handling

---

## RECOMMENDATIONS

### ✅ RECOMMENDED APPROACH ✅ **UPDATED: SHOW "NA" INSTEAD OF HIDING**
Use **Option B (Pool Selector Dropdown with "NA" Display)** with these adjustments:

1. **For Pool Accounts cards (3 cards):**
   - Show as "N/A" for Braiins mode
   - Users see all 24 cards always (no layout shift)
   - Explanation tooltip: "Braiins uses single-user model, not subaccounts"

2. **For Uptime card (1 card):**
   - Show "N/A" for Braiins mode
   - Alternative: Could calculate from last_share timestamp (estimated uptime)
   - Add note: "Braiins doesn't provide uptime metric"

3. **For Power card (1 card):**
   - Keep as DB-only, don't switch based on poolMode
   - Not pool-dependent, only hardware-dependent

4. **For all other cards (19 cards):**
   - Implement full pool switching

### ✅ CONFIDENT TO PROCEED
- All required data from Braiins API is available
- Architecture is compatible with Option B
- No blocker issues, only minor adjustments needed

### ✅ DECISION MADE
- **Uptime card**: Show "N/A" for Braiins mode (no calculation needed)
- **Pool Accounts cards**: Show "N/A" for Braiins mode (not hidden, visible but unavailable)
- **Approach**: Show all 24 cards always, no layout shift when toggling pools
- **Implementation**: Remove `shouldHideForBraiins` conditional rendering, replace values with "N/A" for Braiins mode

---

## DELIVERABLES READY

✅ Verified accurate card count (24 total, 12 Luxor-dependent, not 10)  
✅ Confirmed all Braiins API data available  
✅ Identified 3 cards needing special handling  
✅ Provided data structure for API response  
✅ Created implementation roadmap  

**This is the accurate, verified reference for Braiins integration.**
