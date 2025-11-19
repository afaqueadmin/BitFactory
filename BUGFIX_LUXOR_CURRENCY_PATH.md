# Bug Fix: Luxor API Currency Parameter

## Issue

The Luxor API was returning 404 errors for `active-workers` and `hashrate-history` endpoints.

```
[Luxor Proxy] Luxor API error (404): Route GET:/v1/pool/active-workers?currency=BTC&start_date=2025-01-01&... not found
```

## Root Cause

The endpoint paths were missing the currency parameter. According to Luxor API documentation, certain endpoints require the currency as a **path parameter**, not a query parameter.

### Incorrect:
```
GET /api/v1/pool/active-workers?currency=BTC&start_date=2025-01-01
```

### Correct:
```
GET /api/v1/pool/active-workers/BTC?start_date=2025-01-01
```

## Solution

Updated the endpoint mapping to distinguish between endpoints that require currency in the path vs those that don't.

### Changes Made

#### 1. `/src/app/api/luxor/route.ts`

**Before:**
```typescript
const endpointMap: Record<string, string> = {
  'active-workers': '/pool/active-workers',
  'hashrate-history': '/pool/hashrate-efficiency',
  'workspace': '/workspace',
};
```

**After:**
```typescript
const endpointMap: Record<string, { path: string; requiresCurrency: boolean }> = {
  'active-workers': { path: '/pool/active-workers', requiresCurrency: true },
  'hashrate-history': { path: '/pool/hashrate-efficiency', requiresCurrency: true },
  'workspace': { path: '/workspace', requiresCurrency: false },
};
```

#### 2. Endpoint Building Logic

**Added validation and path construction:**
```typescript
// Extract currency from query params
const currency = queryParams.currency as string | undefined;

// Check if currency is required
if (endpointConfig.requiresCurrency) {
  if (!currency) {
    return NextResponse.json<ProxyResponse>(
      {
        success: false,
        error: `Endpoint "${endpoint}" requires a currency parameter`,
      },
      { status: 400 }
    );
  }
  // Append currency to path
  luxorEndpoint = `${endpointConfig.path}/${currency}`;
}
```

## Testing

### Before Fix
```
[Luxor Proxy] Built query params: {
  currency: 'BTC',
  start_date: '2025-01-01',
  ...
}
[Luxor Proxy] Calling Luxor endpoint: /pool/active-workers
❌ [Luxor Proxy] Luxor API error (404): Route GET:/v1/pool/active-workers?currency=BTC&...
```

### After Fix
```
[Luxor Proxy] Built query params: {
  currency: 'BTC',
  start_date: '2025-01-01',
  ...
}
[Luxor Proxy] Calling Luxor endpoint: /pool/active-workers/BTC
✅ [Luxor Proxy] Successfully retrieved data from /pool/active-workers/BTC
```

## Impact

- ✅ `active-workers` endpoint now works correctly
- ✅ `hashrate-history` endpoint now works correctly
- ✅ `workspace` endpoint unchanged (doesn't require currency)
- ✅ Better error messages for missing required parameters
- ✅ Extensible for future endpoints with different requirements

## Files Modified

1. `/src/app/api/luxor/route.ts` - Updated endpoint mapping and request building logic

## Files Unaffected

- `/src/lib/luxor.ts` - Client library (still fully functional)
- `/src/app/(auth)/luxor/page.tsx` - Dashboard page (works with corrected API)

## Deployment Notes

- No breaking changes to client code
- All existing API calls will now work correctly
- No database migrations needed
- No environment variable changes needed
- Can be deployed without downtime

## Verification

To verify the fix:

1. Login to the application
2. Navigate to `/luxor`
3. Select filters and observe data loading
4. Check browser console for successful API calls
5. Check server logs for `[Luxor Proxy] Successfully retrieved data`

## Future Improvements

Consider adding a mapping of endpoint requirements to documentation:

```typescript
// Endpoint configuration with full metadata
type EndpointConfig = {
  path: string;
  requiresCurrency: boolean;
  description: string;
  requiredParams?: string[];
  optionalParams?: string[];
};

const endpointMap: Record<string, EndpointConfig> = {
  'active-workers': {
    path: '/pool/active-workers',
    requiresCurrency: true,
    description: 'Get active worker counts over time',
    requiredParams: ['currency', 'start_date', 'end_date'],
    optionalParams: ['tick_size', 'subaccount_names'],
  },
  // ...
};
```

This would enable:
- Auto-generated API documentation
- Better IDE autocomplete
- Runtime parameter validation
- Client-side form generation
