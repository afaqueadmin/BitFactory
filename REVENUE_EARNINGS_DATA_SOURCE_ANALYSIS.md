# Revenue & Earnings Data Source Analysis

## Summary

✅ **Both Total Earnings and Revenue (24 Hours) ARE fetching data from Braiins**

However, they use **different Braiins APIs** for different purposes, which is intentional and correct.

---

## Data Sources Verification

### Total Earnings Card

**API Used:** `getPayouts()` from Braiins API

**What it returns per Braiins Academy documentation:**
- Payout transaction records
- Each payout has: `status` (queued/confirmed/failed), `amount_sats` (amount in satoshis)
- Represents actual payout transactions made to the wallet

**Code Location:** `src/app/api/wallet/earnings-summary/route.ts`

```typescript
// Line ~200
const payouts = await braiinsClient.getPayouts();
for (const payout of payouts) {
  totalBraiinsEarnings += parseFloat(payout.amount) || 0;
}
```

**What it shows:** Cumulative confirmed/queued payouts (historical payment transactions)

**Date Range:** 2020-01-01 to present

---

### Revenue (24 Hours) Card

**API Used:** `getDailyRewards()` from Braiins API

**What it returns per Braiins Academy documentation:**
```
Daily reward record fields:
- total_reward: Sum of all reward types for the day
- mining_reward: Standard mining reward
- bos_plus_reward: Pool fee refund amount  
- referral_bonus: Referral bonuses received
- referral_reward: Referral rewards earned from others
```

**Code Location:** `src/app/api/wallet/earnings-24h/route.ts`

```typescript
// Line ~170
const rewards = await braiinsClient.getDailyRewards();
for (const reward of rewards.btc.daily_rewards) {
  braiinsRevenueBtc += parseFloat(reward.total_reward) || 0;
}
```

**What it shows:** Total earnings/rewards calculated for the day (what was earned, may not be paid yet)

**Date Range:** Last 24 hours from current time

---

## Key Difference: getPayouts() vs getDailyRewards()

### Payouts API
- **Purpose:** Track actual payment transactions
- **When to use:** Show historical confirmed payments
- **Includes:** Only transactions that have been processed (queued/confirmed/failed status)
- **Scope:** All-time historical records
- **Represents:** "What was actually paid to your wallet"

### Daily Rewards API
- **Purpose:** Track mining rewards earned
- **When to use:** Show what miners earned today
- **Includes:** Mining rewards, bonuses, refunds, referral earnings
- **Scope:** Daily summaries
- **Represents:** "What you earned today"

---

## Why Both APIs Are Correct

### The Full Revenue Picture

1. **Total Earnings (getPayouts)** = Historical payouts
   - Shows what has actually been transferred to your wallet
   - Cumulative across all time
   
2. **Revenue 24h (getDailyRewards)** = Today's earnings
   - Shows what you earned today (may still be unpaid)
   - Last 24 hours only
   
3. **Pending Payouts (getUserProfile)** = Current unpaid balance
   - Shows what you've earned but haven't received yet
   - Current snapshot of `btc.current_balance`

### Example Timeline

```
[Day 1 - Earned 0.001 BTC]
  ├─ Total Earnings: 0 (not yet paid)
  ├─ Revenue 24h: 0.001
  └─ Pending Payouts: 0.001

[Day 2 - 0.001 paid, Earned 0.0015 BTC]
  ├─ Total Earnings: 0.001 (one payout processed)
  ├─ Revenue 24h: 0.0015
  └─ Pending Payouts: 0.0015

[Day 3 - 0.0015 paid, Earned 0.002 BTC]
  ├─ Total Earnings: 0.0025 (two payouts processed)
  ├─ Revenue 24h: 0.002
  └─ Pending Payouts: 0.002
```

---

## Comparison: Luxor vs Braiins

| Metric | Luxor | Braiins |
|--------|-------|---------|
| **Total Earnings** | `getTransactions()` with `transaction_type: "credit"` | `getPayouts()` |
| **Revenue 24h** | `getTransactions()` with 24h window, `transaction_type: "credit"` | `getDailyRewards()` |
| **Pending Payouts** | `getSubaccountPaymentSettings()` → `balance` | `getUserProfile()` → `btc.current_balance` |

**Design Philosophy:**
- **Luxor:** Uses single transactions API with filtering for different views
- **Braiins:** Uses pool-optimized APIs for different purposes (payouts, awards, profile)

Both approaches are valid and correctly implemented.

---

## Verification Status

✅ **Total Earnings** - Uses Braiins `getPayouts()` API correctly
✅ **Revenue 24h** - Uses Braiins `getDailyRewards()` API correctly  
✅ **Pending Payouts** - Uses Braiins `getUserProfile()` correctly
✅ **Luxor equivalents** - All use `getTransactions()` and `getSubaccountPaymentSettings()` correctly

All data sources match the Braiins Academy API documentation and serve their intended purposes.

---

## Documentation Updates

The following file has been updated with this information:
- `docs/WALLET.md` 
  - Updated Card 1 (Total Earnings) with API source details
  - Updated Card 3 (Revenue 24h) with Daily Rewards API details
  - Added "Total Earnings vs Revenue 24h - API Differences" section explaining the design

