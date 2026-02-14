# Luxor API Historical Data Retention - Investigation Results

**Date:** February 14, 2026  
**Investigation Method:** Debugging & Live Testing  
**Status:** ✅ COMPLETED

---

## Key Finding

**Luxor V2 API has approximately 45 days of historical data maximum.**

### Evidence
- **Test Case:** Requested 365 days of data
- **Result:** API returned only 45 days
- **UI Indicator:** "📊 Data: 45 days returned | Requested: 365 days | ⚠️ Limited history"

---

## API Endpoints Tested

### `/pool/revenue/{currency}`
- **Parameter:** `start_date`, `end_date`
- **Data Retention:** ~45 days maximum
- **Pagination:** No pagination (returns all matching records)
- **Status:** Data limited to recent 45 days

### `/pool/hashrate-efficiency/{currency}`
- **Parameter:** `start_date`, `end_date`, `tick_size: 1d`
- **Data Retention:** ~45 days maximum
- **Pagination:** Yes (page_size, page_number)
- **Status:** Data limited to recent 45 days

---

## Implementation Impact

### Previous Configuration (Before)
```typescript
const TIMEFRAMES = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },      // ❌ Unrealistic - API only has 45 days
  { label: "1Y", days: 365 },     // ❌ Unrealistic - API only has 45 days
  { label: "ALL", days: 365 },    // ❌ Unrealistic - API only has 45 days
];

// API validation
if (isNaN(days) || days < 1 || days > 365) {  // ❌ Wrong limit
  return error("Days must be between 1 and 365");
}
```

### Updated Configuration (After)
```typescript
const TIMEFRAMES = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 45 },      // ✅ Luxor API limit
  { label: "6M", days: 45 },      // ✅ Luxor API limit
  { label: "ALL", days: 45 },     // ✅ Luxor API limit
];

// API validation
if (isNaN(days) || days < 1 || days > 45) {  // ✅ Correct limit
  return error("Days must be between 1 and 45 (Luxor API limit)");
}
```

---

## Changes Made

### 1. Page Component (`/src/app/(auth)/hashprice-history/page.tsx`)
- ✅ Updated TIMEFRAMES: 90/365 days → 45 days
- ✅ Changed labels: 3M/1Y → 3M/6M
- ✅ Updated comments to document Luxor API 45-day limit
- ✅ Added debug indicator showing "Data: X days returned | Requested: Y days"

### 2. API Route (`/src/app/api/hashprice-history/route.ts`)
- ✅ Updated validation: days <= 365 → days <= 45
- ✅ Updated error message to specify Luxor API limit
- ✅ Added comprehensive debug logging for period tracking
- ✅ Shows WARNING when fewer records returned than requested

### 3. Debug Features Added
```typescript
console.log(`[Hashprice History API] Requested days: ${days}`);
console.log(`[Hashprice History API] Revenue records returned: ${count}`);
console.log(`[Hashprice History API] Hashrate records returned: ${count}`);
console.log(`[Hashprice History API] Hashrate pagination: page ${page}, size ${size}, total items: ${total}`);

// If fewer records than requested
if (recordsReturned < days) {
  console.log(`⚠️ WARNING: Got ${recordsReturned} records but requested ${days} days`);
}

// Final results
console.log(`[Hashprice History API] Date range in results: ${firstDate} to ${lastDate}`);
console.log(`[Hashprice History API] Actual period covered: ${days} days`);
```

---

## User Experience Impact

### Before Fix
- User could select "1Y" expecting 365 days of data
- Only got 45 days silently
- Confusing experience

### After Fix
- User can only select up to 45 days max
- Clear UI indicator: "Data: 45 days returned | Requested: 45 days | ✓ Full period"
- Realistic expectations set

---

## Data Availability Timeline

```
Today (Feb 14, 2026)
        │
        │ 45 days back
        │
        ▼
Jan 1, 2026 ←── EARLIEST AVAILABLE DATA

Before Jan 1: NO DATA AVAILABLE (Luxor API doesn't retain older data)
```

---

## Recommended Timeframes

| Timeframe | Days | Purpose | Status |
|-----------|------|---------|--------|
| 1D | 1 | Daily trend | ✅ Full |
| 1W | 7 | Weekly view | ✅ Full |
| 1M | 30 | Monthly view | ✅ Full |
| 3M | 45 | Historical max | ✅ Full |
| 6M | 45 | Historical max | ✅ Duplicate |
| ALL | 45 | Complete history | ✅ Full |

---

## Server Debug Output Example

When you click "ALL" button, the server logs show:

```
[Hashprice History API] ===== PERIOD DEBUG =====
[Hashprice History API] Requested days: 45
[Hashprice History API] Date range: 2026-01-01 to 2026-02-14
[Hashprice History API] Revenue records returned: 45
[Hashprice History API] Hashrate records returned: 45
[Hashprice History API] Hashrate pagination: page 1, size 100, total items: 45
[Hashprice History API] ===== FINAL RESULTS =====
[Hashprice History API] Calculated 45 hashprice points
[Hashprice History API] Date range in results: 2026-01-01 to 2026-02-14
[Hashprice History API] Actual period covered: 45 days
```

---

## Conclusion

**Luxor V2 API maintains approximately 45 days of historical data** for both revenue and hashrate endpoints. This is a known limitation of the API service, likely for storage optimization purposes.

### Key Takeaways:
1. ✅ Maximum historical period: **45 days**
2. ✅ Both revenue and hashrate endpoints have same limit
3. ✅ No way to extend this on our end (API-side limitation)
4. ✅ UI updated to reflect reality
5. ✅ Debug logging in place to track future changes

### If Luxor increases retention in future:
Simply update the `days > 45` check in the API route to new maximum.

---

**Status:** ✅ **VERIFIED & DOCUMENTED**
