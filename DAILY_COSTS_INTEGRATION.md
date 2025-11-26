# Daily Miner Costs API Integration - Implementation Summary

## Overview
Successfully integrated the daily miner costs API (`/api/miners/daily-costs`) with the DashboardPage. The CostsCard component now displays real-time calculated daily costs based on user's miners and current electricity rates.

## How It Works

### API Integration Flow
```
DashboardPage mounts
    ↓
useEffect hook fires
    ↓
fetch("/api/miners/daily-costs")
    ↓
API fetches user's miners from database
    ↓
API gets latest electricity rate
    ↓
API calculates: powerUsage × ratePerKwh × 24 (for each active miner)
    ↓
API returns totalDailyCost and miner details
    ↓
DashboardPage updates state with totalDailyCost
    ↓
CostsCard displays total daily cost
```

### Cost Calculation Formula
```
For each miner:
  If status = "INACTIVE" → dailyCost = 0
  If status = "ACTIVE" → dailyCost = powerUsage × ratePerKwh × 24

Total Daily Cost = Sum of all miner daily costs
```

## API Endpoint Details

### Endpoint
```
GET /api/miners/daily-costs
```

### Authentication
```
Cookie: token={JWT_TOKEN}
```

### Response (Success - 200)
```json
{
  "userId": "user_id",
  "minerCount": 3,
  "ratePerKwh": 0.12,
  "rateValidFrom": "2025-12-01T00:00:00.000Z",
  "miners": [
    {
      "minerId": "miner1",
      "minerName": "Miner 1",
      "minerModel": "Antminer S19 Pro",
      "status": "ACTIVE",
      "powerUsage": 1.5,
      "location": "Data Center A",
      "ratePerKwh": 0.12,
      "dailyCost": 43.2
    },
    {
      "minerId": "miner2",
      "minerName": "Miner 2",
      "minerModel": "Antminer S19",
      "status": "INACTIVE",
      "powerUsage": 1.2,
      "location": "Data Center B",
      "ratePerKwh": 0.12,
      "dailyCost": 0
    }
  ],
  "totalDailyCost": 43.2
}
```

### Error Responses

**No Rate Found (404)**:
```json
{ "error": "No electricity rate found" }
```

**Unauthorized (401)**:
```json
{ "error": "Unauthorized" }
```

**Invalid Token (401)**:
```json
{ "error": "Invalid token" }
```

**Server Error (500)**:
```json
{ "error": "Failed to calculate miner costs" }
```

## DashboardPage Implementation

### State Management
```typescript
const [dailyCost, setDailyCost] = React.useState<number>(0);
const [dailyCostLoading, setDailyCostLoading] = React.useState(true);
```

### useEffect Hook
```typescript
React.useEffect(() => {
  const fetchDailyCosts = async () => {
    try {
      setDailyCostLoading(true);
      const response = await fetch("/api/miners/daily-costs", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error("Failed to fetch daily costs");
        setDailyCost(0);
        return;
      }

      const data = await response.json();
      setDailyCost(data.totalDailyCost || 0);
    } catch (err) {
      console.error("Error fetching daily costs:", err);
      setDailyCost(0);
    } finally {
      setDailyCostLoading(false);
    }
  };

  fetchDailyCosts();
}, []);
```

### CostsCard Integration
```typescript
<CostsCard value={dailyCostLoading ? 0 : dailyCost} />
```

## Data Flow

### Miner Fetching
- Queries database for all miners where userId matches authenticated user
- Includes miner details: id, name, model, status, powerUsage, location
- Orders by createdAt (newest first)

### Electricity Rate Fetching
- Queries database for latest electricity rate
- Filters: valid_from date must be ≤ current date
- Orders by valid_from (newest first)
- Returns: id, rate_per_kwh, valid_from

### Cost Calculation
- For each miner:
  - If status = "INACTIVE": dailyCost = 0
  - If status = "ACTIVE": dailyCost = powerUsage × ratePerKwh × 24
- Sums all daily costs for total

## Example Scenario

**User has 3 miners:**
1. Antminer S19 Pro (1.5 kW) - ACTIVE
2. Antminer S19 (1.2 kW) - ACTIVE
3. Antminer L7 (0.8 kW) - INACTIVE

**Current electricity rate:** 0.12 USD/kWh

**Calculation:**
- Miner 1: 1.5 × 0.12 × 24 = 4.32 USD/day
- Miner 2: 1.2 × 0.12 × 24 = 3.46 USD/day
- Miner 3: 0 USD/day (INACTIVE)
- **Total Daily Cost: 7.78 USD/day**

## CostsCard Display

The CostsCard component displays:
- **Value**: totalDailyCost (e.g., $7.78)
- **Format**: Currency with 2 decimal places
- **Loading State**: Shows 0 while fetching
- **Error State**: Shows 0 if fetch fails
- **Update Frequency**: On page load/refresh

## Error Handling

### API Errors
- Returns 0 if fetch fails
- Logs error to console
- Component continues rendering with fallback value

### No Miners
- If user has no miners, totalDailyCost = 0
- CostsCard displays $0.00

### No Electricity Rate
- Returns 404 error
- DashboardPage catches error and sets cost to 0

### Inactive Miners
- Contributes 0 to total daily cost
- Still visible in API response with dailyCost: 0

## Performance Considerations

✅ **Single API Call**: Combines miners + rate fetching
✅ **Efficient Queries**: Uses database indexes on userId and valid_from
✅ **No N+1 Queries**: Single query per entity type
✅ **Lightweight Payload**: Only necessary fields returned
✅ **Caching**: Response can be cached client-side if needed

## Testing Checklist

- [ ] Navigate to /dashboard
- [ ] Verify CostsCard displays daily cost
- [ ] Add a new miner and refresh page
- [ ] Verify cost increases correctly
- [ ] Deactivate a miner and refresh
- [ ] Verify cost decreases
- [ ] Check API response in DevTools Network tab
- [ ] Verify loading state (should be quick)
- [ ] Test without miners (should show $0.00)
- [ ] Test without electricity rate (should show error)

## Files Modified

1. **DashboardPage**: `/src/app/(auth)/dashboard/page.tsx`
   - Added dailyCost state
   - Added dailyCostLoading state
   - Added useEffect to fetch daily costs
   - Updated CostsCard to use fetched value

2. **Daily Costs API**: Already created at `/src/app/api/miners/daily-costs/route.ts`

## Integration Points

- **Authentication**: Uses JWT token from cookies
- **User Identification**: Gets userId from decoded token
- **Miners Data**: Queries Miner model with userId filter
- **Electricity Rates**: Queries ElectricityRate model for current rate
- **Frontend Display**: CostsCard component renders value

## Future Enhancements

- [ ] Add historical daily cost chart
- [ ] Calculate projected monthly cost
- [ ] Show cost breakdown by miner
- [ ] Add cost prediction based on electricity rates
- [ ] Alert user if daily cost exceeds threshold
- [ ] Export daily cost history as CSV

