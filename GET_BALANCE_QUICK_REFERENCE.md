# Get Balance API - Quick Reference Guide

## What Was Created

✅ **Balance API Endpoint**: `/api/user/balance`
- GET method
- Queries cost_payments table
- Sums all amounts for authenticated user
- Returns balance and userId

✅ **DashboardPage Integration**:
- Fetches balance on component mount
- Displays balance in BalanceCard
- Handles loading and error states

## How to Use

### API Endpoint

**Request**:
```bash
GET /api/user/balance
Cookie: token=YOUR_JWT_TOKEN
```

**Response (Success)**:
```json
{
  "balance": 1250.75,
  "userId": "user_id_here"
}
```

### Dashboard Integration

The DashboardPage:
1. Mounts and creates useEffect hook
2. Calls `/api/user/balance` API
3. Receives balance value
4. Passes balance to BalanceCard component
5. BalanceCard displays the balance

## Balance Calculation

**Formula**: Sum of all cost_payments amounts for user

**Includes**:
- PAYMENT entries (positive amounts) → +Balance
- ELECTRICITY_CHARGES entries (negative amounts) → -Balance

**Example**:
- User deposits $500 → Balance increases
- User is charged $100 for electricity → Balance decreases
- Net result displayed in BalanceCard

## Error Handling

| Error | Status | Resolution |
|-------|--------|-----------|
| No authentication token | 401 | Login required |
| Invalid token | 401 | Token may be expired |
| No payments | 200 | Balance = 0 |
| Database error | 500 | System error, try again |

## Files Changed

1. **Created**: `/src/app/api/user/balance/route.ts`
   - GET endpoint implementation

2. **Modified**: `/src/app/(auth)/dashboard/page.tsx`
   - Added balance state
   - Added useEffect to fetch balance
   - Updated BalanceCard value

## Security

✅ Requires JWT authentication
✅ User can only see their own balance
✅ Query filtered by authenticated user ID

## Testing

1. Go to `/dashboard` (authenticated)
2. Check BalanceCard component
3. Balance should display (0 if no payments, or actual balance)
4. Open browser DevTools → Network tab
5. Look for `/api/user/balance` request
6. Should see response with balance value

## Data Flow

```
Dashboard Page Loads
    ↓
useEffect hook fires
    ↓
fetch("/api/user/balance")
    ↓
API verifies JWT token
    ↓
API queries cost_payments table (aggregate sum)
    ↓
Returns balance
    ↓
BalanceCard displays value
```

## Integration Points

- **Authentication**: Uses JWT token from cookies
- **Database**: Queries cost_payments table via Prisma
- **Frontend**: BalanceCard component displays value
- **Refresh**: Updates on page load/refresh

## Notes

- Balance updates on page refresh
- For real-time updates, consider WebSocket or polling
- Balance includes both positive (payments) and negative (charges) amounts
- Null/undefined amounts treated as 0

