# Get Balance API - Implementation Summary

## Overview
Successfully created a `getbalance` API endpoint that queries the `cost_payments` table and calculates the sum of all amounts for a user. This balance is now displayed on the DashboardPage using the BalanceCard component.

## Files Created

### Balance API Endpoint
**Path**: `/src/app/api/user/balance/route.ts`

**Method**: GET

**Purpose**: 
- Fetch the user's total balance by summing all amounts in the cost_payments table
- Returns the aggregated balance for the authenticated user

**Features**:
- ✅ JWT token verification
- ✅ User authentication required
- ✅ Aggregates sum of all cost_payments amounts
- ✅ Returns 0 if no payments exist
- ✅ Error handling with appropriate HTTP status codes

## API Details

### Endpoint
```
GET /api/user/balance
```

### Authentication
```
Cookie: token={JWT_TOKEN}
```

### Response (Success - 200)
```json
{
  "balance": 1250.75,
  "userId": "user_id_here"
}
```

### Response (Error - 401)
```json
{ "error": "Unauthorized" }
```

### Response (Error - 401)
```json
{ "error": "Invalid token" }
```

### Response (Error - 500)
```json
{ "error": "Failed to get balance" }
```

## How It Works

### Database Query
The API uses Prisma's aggregate function to sum all amounts in the cost_payments table for the authenticated user:

```typescript
const result = await prisma.costPayment.aggregate({
  where: { userId },
  _sum: {
    amount: true,
  },
});

const balance = result._sum.amount || 0;
```

### Calculation
- **Type**: PAYMENT (positive amounts)
- **Type**: ELECTRICITY_CHARGES (negative amounts)
- **Result**: Net balance (sum of all positive and negative amounts)

### Example
If a user has:
- Payment: +500 USD
- Electricity Charges: -150 USD
- Payment: +1000 USD
- Electricity Charges: -99.25 USD

**Balance = 500 - 150 + 1000 - 99.25 = 1,250.75 USD**

## Files Modified

### DashboardPage
**Path**: `/src/app/(auth)/dashboard/page.tsx`

**Changes**:
- ✅ Added state for `balance` and `balanceLoading`
- ✅ Added useEffect hook to fetch balance on component mount
- ✅ Calls `/api/user/balance` endpoint
- ✅ Handles loading state
- ✅ Handles errors gracefully
- ✅ Updated BalanceCard to use fetched balance instead of hardcoded value

### Code Flow
```typescript
// 1. State initialization
const [balance, setBalance] = React.useState<number>(0);
const [balanceLoading, setBalanceLoading] = React.useState(true);

// 2. useEffect to fetch balance
React.useEffect(() => {
  const fetchBalance = async () => {
    try {
      setBalanceLoading(true);
      const response = await fetch("/api/user/balance", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        setBalance(0);
        return;
      }

      const data = await response.json();
      setBalance(data.balance || 0);
    } catch (err) {
      console.error("Error fetching balance:", err);
      setBalance(0);
    } finally {
      setBalanceLoading(false);
    }
  };

  fetchBalance();
}, []);

// 3. Use balance in BalanceCard
<BalanceCard value={balanceLoading ? 0 : balance} />
```

## User Experience

1. **Dashboard Page Loads**
   - BalanceCard initially shows 0
   - Balance is fetched in background

2. **Balance Fetched**
   - API queries database
   - Sum of all cost_payments amounts calculated
   - BalanceCard updates with actual balance

3. **Balance Displayed**
   - Shows total balance (sum of payments - charges)
   - Updates whenever page is refreshed
   - Shows 0 if no payments exist

## Security

✅ **Authentication**: JWT token required (401 if missing/invalid)
✅ **Authorization**: User can only see their own balance
✅ **Query Scope**: Filtered by authenticated user ID
✅ **Error Handling**: No sensitive data exposed in errors

## Error Scenarios

| Scenario | Status | Response |
|----------|--------|----------|
| No token provided | 401 | "Unauthorized" |
| Invalid/expired token | 401 | "Invalid token" |
| Token verification fails | 401 | "Invalid token" |
| Database error | 500 | "Failed to get balance" |
| Success (no payments) | 200 | { balance: 0 } |
| Success (with payments) | 200 | { balance: X.XX } |

## Performance Considerations

- ✅ Uses Prisma aggregate for efficient database query
- ✅ Single SQL query to calculate sum
- ✅ No N+1 queries
- ✅ Indexed userId field for fast lookup
- ✅ Lightweight response payload

## Testing Checklist

- [ ] Load dashboard page
- [ ] Verify balance is fetched and displayed
- [ ] Test with user having multiple payments
- [ ] Test with user having no payments
- [ ] Test with user having both payments and charges
- [ ] Verify negative amounts (charges) are subtracted
- [ ] Test without authentication (should fail with 401)
- [ ] Test with invalid token
- [ ] Verify balance updates on page refresh
- [ ] Check network requests in browser DevTools

## API Testing

```bash
# Get user balance
curl -X GET http://localhost:3000/api/user/balance \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_JWT_TOKEN"
```

## Data Flow

```
DashboardPage
    ↓
useEffect hook fires on mount
    ↓
Fetch /api/user/balance
    ↓
API: Verify JWT token
    ↓
API: Query cost_payments table (sum all amounts for user)
    ↓
API: Return balance
    ↓
DashboardPage: Update state with balance
    ↓
BalanceCard: Display balance value
```

## Integration with Cost Payments

The balance calculation includes:
- ✅ PAYMENT type entries (positive amounts)
- ✅ ELECTRICITY_CHARGES type entries (negative amounts)
- ✅ Net balance (sum of all)

Example scenarios:
- User makes payment of $500 → Balance increases by $500
- User is charged $100 for electricity → Balance decreases by $100
- Balance = Total Payments - Total Charges

## Future Enhancements

- [ ] Add caching to reduce database queries
- [ ] Add date range filtering
- [ ] Add balance history endpoint
- [ ] Add real-time balance updates (WebSocket)
- [ ] Add currency support
- [ ] Add transaction details endpoint
- [ ] Add balance notifications

