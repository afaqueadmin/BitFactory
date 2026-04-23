# Customer vs Admin Pages - Quick Visual Reference

## 📊 Component Reuse Matrix

```
┌─────────────────────────────┬──────────┬──────────┬──────────┬────────┐
│ Component                   │Dashboard │ Miners   │ Wallet   │ Admin  │
├─────────────────────────────┼──────────┼──────────┼──────────┼────────┤
│ BalanceCard                 │    ✓     │    ✗     │    ✗     │   ✓    │
│ CostsCard                   │    ✓     │    ✗     │    ✗     │   ✓    │
│ EstimatedMonthlyCostCard    │    ✓     │    ✗     │    ✗     │   ✓    │
│ EstimatedMiningDaysLeftCard │    ✓     │    ✗     │    ✗     │   ✓    │
│ HashRate24HoursCard         │    ✗     │    ✓     │    ✗     │   ✗    │
│ Uptime24HoursCard           │    ✗     │    ✓     │    ✗     │   ✗    │
│ ShareEfficiencyCard         │    ✗     │    ✓     │    ✗     │   ✗    │
│ HashpriceCard               │    ✗     │    ✓     │    ✗     │   ✗    │
│ MiningEarningsChart         │    ✓     │    ✗     │    ✗     │   ✗    │
│ HostedMinersList            │    ✓     │    ✓     │    ✗     │   ✓    │
│ ElectricityCostTable        │    ✓     │    ✗     │    ✓     │   ✓    │
└─────────────────────────────┴──────────┴──────────┴──────────┴────────┘

✓ = Component is used
✗ = Component is not used
```

## 🔗 API Routes by Page

### Customer Pages (Implicit Current User)
```
Dashboard         → /api/user/balance, /api/miners/daily-costs, /api/workers/stats
Miners            → /api/miners/summary
Wallet            → /api/wallet/earnings-summary, /api/wallet/settings
Invoices          → [invoices endpoint]
Transactions      → [transactions endpoint]
```

### Admin Page (Explicit Customer ID)
```
Customer [id]     → /api/user/profile?customerId=X
                  → /api/user/balance?customerId=X
                  → /api/miners/daily-costs?customerId=X
                  → /api/wallet/earnings-summary?customerId=X
                  → /api/wallet/settings?customerId=X
```

## 📍 File Locations

```
src/app/
├── (auth)/              ← Customer pages
│   ├── dashboard/page.tsx
│   ├── miners/page.tsx
│   ├── wallet/page.tsx
│   ├── invoices/page.tsx
│   └── transaction/page.tsx
│
└── (manage)/            ← Admin pages
    └── customers/[id]/page.tsx

src/components/
├── dashboardCards/      ← Reusable cards
│   ├── BalanceCard.tsx              (shared with admin)
│   ├── CostsCard.tsx                (shared with admin)
│   ├── EstimatedMonthlyCostCard.tsx (shared with admin)
│   ├── EstimatedMiningDaysLeftCard.tsx (shared with admin)
│   ├── HashRate24HoursCard.tsx      (customer only)
│   ├── Uptime24HoursCard.tsx        (customer only)
│   ├── ShareEfficiencyCard.tsx      (customer only)
│   └── HashpriceCard.tsx            (customer only)
└── [other shared components]
```

## 🎯 Data Display Comparison (High Level)

```
┌──────────────────┬─────────────────────────────┬─────────────────────────────┐
│ Feature          │ Customer Dashboard          │ Admin Customer Detail       │
├──────────────────┼─────────────────────────────┼─────────────────────────────┤
│ Balance Display  │ Via BalanceCard ✓           │ Via BalanceCard ✓           │
│ Cost Display     │ Via CostsCard ✓             │ Via CostsCard ✓             │
│ Earnings Chart   │ Yes (Visual)                │ No (Table-based view)       │
│ Profile Info     │ Not shown                   │ Full profile (name, email..)│
│ Pool Breakdown   │ Via chart selector          │ Via table                   │
│ Wallet Settings  │ No                          │ Yes (payout dates, etc.)    │
│ User Perspective │ Their own data              │ Any customer's data         │
└──────────────────┴─────────────────────────────┴─────────────────────────────┘
```

## 🔍 Key Insight

```
The system uses a PARAMETER-BASED ACCESS PATTERN:

Same API endpoints can serve both customer and admin requests:
  
  Customer → GET /api/wallet/earnings-summary
  Admin    → GET /api/wallet/earnings-summary?customerId=CUSTOMER_ID

This is elegant because:
  ✓ No code duplication
  ✓ Backend handles permission checks
  ✓ Reusable components across views
  ✓ Same data structure for both views
```

## 📋 Shared Card Details

### BalanceCard
- **Component**: `src/components/dashboardCards/BalanceCard.tsx`
- **Props**: `{ value: number }`
- **Style**: Blue gradient background
- **Display**: Currency formatted balance
- **Used in**: Dashboard (customer), Customer Detail (admin)

### CostsCard
- **Component**: `src/components/dashboardCards/CostsCard.tsx`
- **Props**: `{ value: number }`
- **Style**: Teal gradient background
- **Display**: Daily electricity cost
- **Used in**: Dashboard (customer), Customer Detail (admin)

### EstimatedMonthlyCostCard
- **Component**: `src/components/dashboardCards/EstimatedMonthlyCostCard.tsx`
- **Props**: `{ value: number }`
- **Style**: Orange/yellow gradient
- **Display**: dailyCost × daysInMonth
- **Used in**: Dashboard (customer), Customer Detail (admin)

### EstimatedMiningDaysLeftCard
- **Component**: `src/components/dashboardCards/EstimatedMiningDaysLeftCard.tsx`
- **Props**: `{ days: number | string }`
- **Style**: Blue gradient
- **Display**: balance / dailyCost (or "∞" if cost=0)
- **Used in**: Dashboard (customer), Customer Detail (admin)

## 🎨 Visual Data Flow

```
                          ┌─────────────┐
                          │ API Servers │
                          └──────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ↓            ↓            ↓
            [User balance]  [Daily costs]  [Earnings]
                    │            │            │
                    └────────────┼────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                        │
            [Customer sees own]    [Admin sees with ?customerId=X]
                    │                        │
        ┌───────────┼───────────┐    ┌──────────────────┐
        ↓           ↓           ↓    ↓                  ↓
    Dashboard   Miners      Wallet  Customer Detail    Other Admin
                                     (for any customer) Pages
        │           │           │         │             │
        └───────────┘───────────┴─────────┴─────────────┘
                    │
                    ↓
            Reused BalanceCard
            Reused CostsCard
            Reused EstimatedCards
```

## ✅ Verification Checklist

- [x] Identified all customer-facing pages (Dashboard, Miners, Wallet, Invoices, Transactions)
- [x] Located admin customer detail page
- [x] Found shared UI components (4 card components)
- [x] Documented API calling patterns
- [x] Compared data display layouts
- [x] Verified component reuse across views
- [x] Documented parameter-based access pattern

## 🎓 What This Architecture Enables

```
✓ Code reusability (shared card components)
✓ Consistent data representation (same components = same display)
✓ Reduced maintenance (single source of truth for card UI)
✓ Flexible access control (permissioned via customerId parameter)
✓ Clean separation (customer view vs admin view)
```

---

**Generated**: April 23, 2026 | **Source**: Workspace analysis with semantic search
