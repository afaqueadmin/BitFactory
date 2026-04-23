# Customer-Facing Pages vs Admin Customer Detail Page - Comparison

## Executive Summary
The customer-facing pages and the admin customer detail page **reuse the same core dashboard cards** (BalanceCard, CostsCard, EstimatedMonthlyCostCard, EstimatedMiningDaysLeftCard) but call the same APIs in different ways. The main difference is that the admin page passes a `customerId` parameter to view any customer's data, while customer-facing pages fetch their own data.

---

## 1. Pages Found and Analyzed

### Customer-Facing Pages
| Page | Location | Purpose |
|------|----------|---------|
| **Dashboard** | `src/app/(auth)/dashboard/page.tsx` | Overview of user's mining operations - shows balance, costs, workers, and earnings |
| **Miners** | `src/app/(auth)/miners/page.tsx` | Detailed mining statistics - hashrate, efficiency, uptime, earnings per pool |
| **Wallet** | `src/app/(auth)/wallet/page.tsx` | Earnings and payout information - summary, 24h revenue, payout settings |
| **Invoices** | `src/app/(auth)/invoices/page.tsx` | User's invoice history |
| **Transactions** | `src/app/(auth)/transaction/page.tsx` | User's transaction history |

### Admin Page
| Page | Location | Purpose |
|------|----------|---------|
| **Customer Detail** | `src/app/(manage)/customers/[id]/page.tsx` | Admin view of any customer's profile and earnings - similar to dashboard but for any customer |

---

## 2. API Routes by Page

### Customer Dashboard Page
```
GET /api/user/balance                    (no params - gets current user's balance)
GET /api/miners/daily-costs              (no params - gets current user's daily costs)
GET /api/workers/stats                   (no params - gets current user's worker stats)
```

### Customer Miners Page
```
GET /api/miners/summary                  (no params - gets current user's miners summary with pool breakdown)
```

### Customer Wallet Page
```
GET /api/wallet/earnings-summary         (no params - gets current user's earnings summary)
GET /api/wallet/revenue-24h              (implied - gets 24h revenue data)
GET /api/wallet/settings?currency=BTC    (gets payout settings)
```

### Admin Customer Detail Page
```
GET /api/user/profile?customerId={id}              (fetch customer profile details)
GET /api/user/balance?customerId={id}              (fetch specific customer's balance)
GET /api/miners/daily-costs?customerId={id}        (fetch specific customer's daily costs)
GET /api/wallet/earnings-summary?customerId={id}   (fetch specific customer's earnings summary)
GET /api/wallet/settings?currency=BTC&customerId={id}  (fetch specific customer's wallet settings)
```

### Key Pattern
- **Customer pages**: All APIs are called **without parameters**, implicitly using the authenticated user's context
- **Admin page**: All APIs are called **with `customerId` parameter**, allowing viewing of any customer's data

---

## 3. Components Used

### Shared Dashboard Cards (Used in BOTH Customer Dashboard and Admin Customer Detail)
| Component | File | Props | Purpose |
|-----------|------|-------|---------|
| **BalanceCard** | `src/components/dashboardCards/BalanceCard.tsx` | `value: number` | Displays user's current balance in USD (formatted as currency) |
| **CostsCard** | `src/components/dashboardCards/CostsCard.tsx` | `value: number` | Displays daily electricity cost in USD |
| **EstimatedMonthlyCostCard** | `src/components/dashboardCards/EstimatedMonthlyCostCard.tsx` | `value: number` | Shows estimated monthly cost (daily cost × days in month) |
| **EstimatedMiningDaysLeftCard** | `src/components/dashboardCards/EstimatedMiningDaysLeftCard.tsx` | `days: number \| string` | Shows days until balance runs out at current daily cost |

### Components Used ONLY in Customer Miners Page
| Component | File | Purpose |
|-----------|------|---------|
| **HashRate24HoursCard** | `src/components/dashboardCards/HashRate24HoursCard.tsx` | Displays 24h hashrate performance |
| **Uptime24HoursCard** | `src/components/dashboardCards/Uptime24HoursCard.tsx` | Shows 24h uptime percentage |
| **ShareEfficiencyCard** | `src/components/dashboardCards/ShareEfficiencyCard.tsx` | Displays share efficiency-5m metric |
| **HashpriceCard** | `src/components/dashboardCards/HashpriceCard.tsx` | Current hashprice value |

### Other Components Used Across Pages
| Component | Pages Using It | Purpose |
|-----------|---|---------|
| **HostedMinersList** | Customer Dashboard, Customer Miners | Lists miners with pool assignment |
| **MiningEarningsChart** | Customer Dashboard | Charts mining earnings over time |
| **ElectricityCostTable** | Customer Dashboard, Admin Customer Detail | Tables showing electricity costs |
| **DashboardHeader** | Customer Dashboard | Page header component |

---

## 4. Data Display Comparison

### Admin Customer Detail Page - What It Displays
```
1. Customer Profile Information
   - Name, Email, Role, Company
   - City, Country, Street Address, Phone
   - Luxor Subaccount Name
   - Join Date, 2FA Status, Account Status

2. Mining Overview (Using Shared Cards)
   - Balance (via BalanceCard)        ← SHARED COMPONENT
   - Daily Cost (via CostsCard)       ← SHARED COMPONENT
   - Estimated Monthly Cost           ← SHARED COMPONENT
   - Estimated Mining Days Left       ← SHARED COMPONENT

3. Mining Details
   - Earnings Summary (Total, Pending, Current)
   - Wallet Settings (Payout date, frequency)
   - Hosted Miners List
   - Electricity Cost Table

4. Pool-Specific Data
   - Luxor pool earnings
   - Braiins pool earnings
```

### Customer Dashboard Page - What It Displays
```
1. Welcome Header
   - User's name and greeting
   - Last sync information

2. Mining Overview (Using Shared Cards - IDENTICAL LAYOUT)
   - Balance (via BalanceCard)        ← SAME COMPONENT
   - Daily Cost (via CostsCard)       ← SAME COMPONENT
   - Estimated Monthly Cost           ← SAME COMPONENT
   - Estimated Mining Days Left       ← SAME COMPONENT

3. Mining Chart
   - Earnings chart with pool breakdown (Luxor vs Braiins)
   - Selectable view modes (Total, Luxor, Braiins, Side-by-side)

4. Mining Summary
   - Workers stats (active/inactive, by pool)
   - Miners by pool (Luxor/Braiins count)

5. Other Cards
   - HostedMinersCard
   - MarketplaceCard
```

### Customer Miners Page - What It Displays
```
1. Pool-Specific Metrics (NOT in Admin Page)
   - HashRate24Hours (per pool)        ← Customer-only
   - Uptime24Hours (per pool)          ← Customer-only
   - ShareEfficiency (per pool)        ← Customer-only
   - Hashprice (per pool)              ← Customer-only

2. Hosted Miners List
   - Filter by pool (All, Luxor, Braiins)
   - Miner details table

3. Mining Summary
   - Total/Pool-specific hashrate
   - Revenue numbers
   - Active miner counts
```

### Customer Wallet Page - What It Displays
```
1. Earnings Summary
   - Total earnings (BTC + USD)
   - Pending payouts (BTC + USD)
   - Current balance (BTC + USD)

2. 24h Revenue
   - Revenue in last 24 hours
   - Pool breakdown (Luxor vs Braiins)

3. Wallet Settings
   - Payout frequency (Daily/Weekly/Monthly)
   - Payout address
   - Next payout date/time

4. Statement Download
   - Date range picker
   - Download historical statements

5. Electricity Cost Table
   - Detailed cost breakdown per mining machine
```

---

## 5. Shared Components Analysis

### Components Used in BOTH Admin and Customer Views

#### BalanceCard
```typescript
// Props: { value: number }
// Used In:
//   - Admin Customer Detail Page (shows customer's balance)
//   - Customer Dashboard Page (shows own balance)
//
// Displays: Balance formatted as currency with gradient background (blue gradient)
// Data Source: Different APIs but same structure
```

#### CostsCard
```typescript
// Props: { value: number }
// Used In:
//   - Admin Customer Detail Page (shows customer's daily cost)
//   - Customer Dashboard Page (shows own daily cost)
//
// Displays: Daily cost formatted as currency with gradient background (teal gradient)
// Data Source: Different APIs but same structure
```

#### EstimatedMonthlyCostCard
```typescript
// Props: { value: number }
// Used In:
//   - Admin Customer Detail Page
//   - Customer Dashboard Page
//
// Displays: Estimated monthly cost (daily × days in month) with gradient (orange gradient)
// Calculation: dailyCost × getDaysInCurrentMonth()
```

#### EstimatedMiningDaysLeftCard
```typescript
// Props: { days: number | string }
// Used In:
//   - Admin Customer Detail Page
//   - Customer Dashboard Page
//
// Displays: Days until mining stops at current cost (or "∞" if daily cost is 0)
// Calculation: balance / dailyCost
```

---

## 6. Key Differences Matrix

| Aspect | Customer Dashboard | Customer Miners | Customer Wallet | Admin Customer Detail |
|--------|---|---|---|---|
| **Target User** | Self | Self | Self | Admin viewing any customer |
| **Shared Cards Used** | ✅ (4 cards) | ❌ | ❌ | ✅ (4 cards) |
| **Pool-Specific Metrics** | Via Chart & Summary | ✅ (Cards + List) | ✅ (Earnings) | Via Table |
| **Authentication** | Current User | Current User | Current User | `customerId` param |
| **API Calls Use Custom ID** | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **Electricity Costs** | Implied in calculation | Not shown | Via table | Via ElectricityCostTable |
| **Payout Settings** | Not shown | Not shown | ✅ Detailed | ✅ Detailed |
| **User Profile Info** | Implied | Not shown | Not shown | ✅ Full profile |

---

## 7. API Endpoint Design Pattern

### Pattern: Passthrough `customerId` for Admin Access

All API endpoints follow a consistent pattern that allows both customer and admin access:

```
// Customer (authenticated - auto-determined)
GET /api/user/balance
GET /api/miners/daily-costs
GET /api/wallet/earnings-summary

// Admin (explicitly specified)
GET /api/user/balance?customerId={id}
GET /api/miners/daily-costs?customerId={id}
GET /api/wallet/earnings-summary?customerId={id}
```

This suggests the backend:
1. Checks for `customerId` query parameter
2. If present and user is admin → fetch that customer's data
3. If absent → fetch authenticated user's data (with permission check)

---

## 8. Recommendations for Consistency

### Already Well-Designed ✅
1. **Card Reusability**: BalanceCard, CostsCard, and similar cards are properly abstracted and reused across views
2. **API Pattern**: The `customerId` passthrough pattern is clean and scalable
3. **Separation of Concerns**: Customer pages show what's relevant to users; admin page focuses on administrative details

### Potential Improvements
1. **Dashboard Details for Admin**: The admin customer detail page doesn't show the mining earnings chart that the customer sees - consider adding for better visibility
2. **Miners Card to Admin**: Consider using the hashrate/uptime/efficiency cards in the admin view for a more complete picture
3. **Component Documentation**: Add JSDoc to shared cards documenting the expected data format

---

## 9. File Locations Summary

### Customer Pages Directory
```
src/app/(auth)/
├── dashboard/page.tsx          ← Overview dashboard
├── miners/page.tsx             ← Mining details
├── wallet/page.tsx             ← Earnings & payouts
├── invoices/page.tsx           ← Invoice history
└── transaction/page.tsx        ← Transaction history
```

### Admin Pages Directory
```
src/app/(manage)/
├── customers/
│   └── [id]/
│       └── page.tsx            ← Customer detail view
```

### Shared Components Directory
```
src/components/
├── dashboardCards/
│   ├── BalanceCard.tsx                      ← SHARED
│   ├── CostsCard.tsx                        ← SHARED
│   ├── EstimatedMonthlyCostCard.tsx         ← SHARED
│   ├── EstimatedMiningDaysLeftCard.tsx      ← SHARED
│   ├── HashRate24HoursCard.tsx              ← Customer only
│   ├── Uptime24HoursCard.tsx                ← Customer only
│   ├── ShareEfficiencyCard.tsx              ← Customer only
│   └── HashpriceCard.tsx                    ← Customer only
├── ElectricityCostTable.tsx                 ← Shared
├── HostedMinersList.tsx                     ← Shared
└── MiningEarningsChart.tsx                  ← Customer only
```

---

## 10. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     API Layer                               │
├─────────────────────────────────────────────────────────────┤
│  /api/user/balance                                          │
│  /api/miners/daily-costs                                    │
│  /api/miners/summary                                        │
│  /api/wallet/earnings-summary                               │
│  /api/wallet/settings                                       │
│  /api/workers/stats                                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ↓                   ↓                   ↓
   ┌─────────────┐    ┌──────────────┐    ┌────────────┐
   │  Dashboard  │    │    Miners    │    │   Wallet   │
   │   (Auth)    │    │   (Auth)     │    │   (Auth)   │
   └──────┬──────┘    └──────┬───────┘    └─────┬──────┘
          │                  │                   │
          ├──Shared Cards────┤                   │
          │ BalanceCard,     │                   │
          │ CostsCard, etc.  │                   │
          │                  │                   │
          └──────────┬───────┴───────────────────┘
                     │
                     ↓
            ┌────────────────────┐
            │  Admin Customer    │
            │  Detail Page       │
            │  (uses same cards  │
            │   + customerId)    │
            └────────────────────┘
```

---

## Conclusion

**Finding**: The architecture effectively reuses UI components (BalanceCard, CostsCard, etc.) between customer and admin views through a **parameter-based access pattern**. All pages call the same underlying APIs; the difference is whether they include a `customerId` parameter for admin cross-customer access.

**Quality Assessment**: ⭐⭐⭐⭐ (Good separation, good reusability, consistent patterns)
