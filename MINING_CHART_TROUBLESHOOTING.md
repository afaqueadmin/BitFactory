# Daily Mining Performance Chart - Troubleshooting Guide

## Issue
The Daily Mining Performance chart on the dashboard was showing "No mining data available yet" instead of displaying revenue data.

## Root Cause Analysis

The issue was related to how the API endpoint was parsing the Luxor API response structure. The code had several problems:

1. **Incorrect API Call Method**: Was using generic `request()` method instead of the specific `getRevenue()` method
2. **Incorrect Response Structure**: The code was expecting fields like `btc_revenue` or `revenue` directly in the item, but Luxor returns nested structures
3. **Wrong Type Definitions**: Custom interfaces didn't match the actual Luxor API response format

### Actual Luxor API Response Structure

```json
{
  "currency_type": "BTC",
  "start_date": "2025-01-01",
  "end_date": "2025-01-10",
  "revenue": [
    {
      "date_time": "2025-01-01T00:00:00Z",
      "revenue": {
        "currency_type": "BTC",
        "revenue_type": "pool",
        "revenue": 0.00012345
      }
    },
    ...
  ]
}
```

## Fixes Applied

### 1. Updated Type Imports
**File**: [src/app/api/mining/daily-performance/route.ts](src/app/api/mining/daily-performance/route.ts#L1-L11)

- Imported proper types from `@/lib/luxor`:
  - `RevenueResponse`
  - `RevenueData`
- Removed custom incomplete interfaces

### 2. Changed API Call Method
**File**: [src/app/api/mining/daily-performance/route.ts](src/app/api/mining/daily-performance/route.ts#L97-L105)

**Before**:
```typescript
const revenueResponse = await luxorClient.request<LuxorRevenueResponse>(
  "/pool/revenue/BTC",
  {
    subaccount_names: subaccountName,
    start_date: startDateStr,
    end_date: endDateStr,
  },
);
```

**After**:
```typescript
const revenueResponse = await luxorClient.getRevenue("BTC", {
  subaccount_names: subaccountName,
  start_date: startDateStr,
  end_date: endDateStr,
});
```

### 3. Fixed Response Parsing Logic
**File**: [src/app/api/mining/daily-performance/route.ts](src/app/api/mining/daily-performance/route.ts#L110-L160)

Updated to correctly parse nested revenue objects:

```typescript
// Correct parsing of Luxor's nested structure
for (const item of revenueResponse.revenue) {
  // Extract date from date_time field
  const dateStr = item.date_time.split("T")[0];
  
  // Extract revenue from nested object
  const btcRevenue = Number(item.revenue?.revenue || 0);
  
  performanceData.push({
    date: dateStr,
    earnings: btcRevenue,
    costs: 0,
    hashRate: 0,
  });
}
```

### 4. Enhanced Error Logging
**File**: [src/components/MiningEarningsChart.tsx](src/components/MiningEarningsChart.tsx#L51-L80)

Added comprehensive console logging:
- API response status and status text
- Full API error responses when requests fail
- Raw API response data for debugging
- Clear distinction between different error scenarios

## Troubleshooting Steps If Data Still Doesn't Display

### 1. Check Browser Console
Open DevTools (F12) and look at the Console tab. The component logs:
```
[MiningEarningsChart] Fetching 10 days of mining performance data
[MiningEarningsChart] API Response Status: 200 OK
[MiningEarningsChart] Raw API Response: {...}
```

If you see an error, note the status code and error message.

### 2. Common Error Cases

#### "Luxor subaccount not configured for user" (404)
- **Cause**: User doesn't have a `luxorSubaccountName` in the database
- **Fix**: Update user record via admin panel to assign a Luxor subaccount

#### "Invalid token" (401)
- **Cause**: JWT token is invalid or expired
- **Fix**: Clear browser cookies and re-login

#### "403 Forbidden"
- **Cause**: The subaccount name doesn't exist in Luxor or user doesn't have access
- **Fix**: Verify the subaccount exists in Luxor and is correctly assigned to the user

#### Empty Revenue Array
- **Cause**: The Luxor subaccount exists but has no revenue data for the requested date range
- **Fix**: This is normal for new subaccounts. Generate some mining activity first.

### 3. Check Server Logs
Look at Next.js dev server output for logs like:
```
[Mining Performance API] Fetching 10 days of mining revenue data for user abc123
[Mining Performance API] Fetching revenue from Luxor for subaccount: my-subaccount
[Mining Performance API] Processing 10 revenue items from Luxor
[Mining Performance API] Parsed 10 daily performance records from Luxor
```

### 4. Verify Luxor Subaccount
Test the Luxor API directly using the `/api/luxor` proxy:
```
GET /api/luxor?endpoint=subaccounts
```

Check that your user's assigned subaccount appears in the list.

### 5. Check Date Range
The chart requests 10 days of data by default. Verify:
- The `start_date` and `end_date` calculations are correct
- The Luxor subaccount has mining activity within the requested date range

## Testing the Fix

1. **Login to Dashboard**: Sign in with your user account
2. **Navigate to Home**: View the dashboard with the Mining Performance chart
3. **Check Chart**: Should display a bar chart with 10 days of revenue data (or fewer if less than 10 days of activity)
4. **Verify Console**: Open DevTools to confirm:
   - API call succeeds (Status 200)
   - Data is parsed correctly
   - Chart renders with data

## Related Files

- **API Route**: [src/app/api/mining/daily-performance/route.ts](src/app/api/mining/daily-performance/route.ts)
- **Component**: [src/components/MiningEarningsChart.tsx](src/components/MiningEarningsChart.tsx)
- **Luxor Client**: [src/lib/luxor.ts](src/lib/luxor.ts#L814-L826) (getRevenue method)
- **Types**: [src/lib/luxor.ts](src/lib/luxor.ts#L286-L312) (RevenueResponse, RevenueData interfaces)

## Related Documentation

- [Luxor V2 API Complete Reference](LUXOR_V2_API_COMPLETE_REFERENCE.md)
- [Mining Performance Integration](src/app/(auth)/dashboard/page.tsx#L103-L163) (MiningEarningsChart component usage)

