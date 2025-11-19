# Luxor Mining API Integration Guide

## Overview

A complete, production-grade integration with the Luxor mining API for the BitFactory application. This integration includes:

- ✅ Secure server-side API client (`/src/lib/luxor.ts`)
- ✅ Next.js API proxy route (`/src/app/api/luxor/route.ts`)
- ✅ Beautiful React dashboard page (`/src/app/(auth)/luxor/page.tsx`)
- ✅ Full TypeScript support with response interfaces
- ✅ JWT authentication and role-based access control
- ✅ Comprehensive error handling

## Architecture

### 1. Luxor API Client (`/src/lib/luxor.ts`)

A reusable, server-side only client for the Luxor mining API.

**Key Features:**
- Secure API key management (never exposed to client)
- Dynamic URL building with optional query parameters
- Structured error handling with `LuxorError` class
- TypeScript generics for type-safe responses
- Automatic request logging for debugging

**Usage:**
```typescript
import { createLuxorClient, ActiveWorkersResponse } from '@/lib/luxor';

// Server-side only (API routes, server actions)
const client = createLuxorClient(subaccountName);
const workers = await client.request<ActiveWorkersResponse>(
  '/pool/active-workers/BTC',
  { start_date: '2025-01-01', end_date: '2025-01-31', tick_size: '1d' }
);
```

### 2. API Proxy Route (`/src/app/api/luxor/route.ts`)

A secure Next.js server-side proxy that acts as a gateway between the client and Luxor API.

**Security Features:**
- JWT token verification from cookies
- Endpoint whitelist validation
- Automatic subaccount filtering (user can only access their own data)
- Query parameter sanitization
- Proper HTTP status codes

**Supported Endpoints:**
| Endpoint | Path | Requires Currency | Description |
|----------|------|-------------------|-------------|
| `active-workers` | `/pool/active-workers/{currency}` | Yes | Active worker counts over time |
| `hashrate-history` | `/pool/hashrate-efficiency/{currency}` | Yes | Hashrate and efficiency metrics |
| `workspace` | `/workspace` | No | Workspace information |

**Usage from Client:**
```typescript
const response = await fetch('/api/luxor?endpoint=active-workers&currency=BTC&start_date=2025-01-01&tick_size=1d');
const { success, data, error } = await response.json();
```

**Response Format:**
```json
{
  "success": true,
  "data": { /* Luxor API response */ },
  "timestamp": "2025-01-20T10:30:00.000Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message"
}
```

### 3. Dashboard Page (`/src/app/(auth)/luxor/page.tsx`)

A beautiful, interactive React component for displaying Luxor mining data.

**Features:**
- Real-time data filtering (currency, date range, granularity)
- Line chart for active workers over time
- Bar chart for hashrate and efficiency metrics
- Workspace information display
- Manual refresh button
- Responsive design (mobile/tablet/desktop)
- Dark/light theme support
- Error handling with user-friendly messages
- Loading states

**Access:** `/luxor` (authenticated users only)

## Setup Instructions

### 1. Environment Variables

Ensure your `.env` file includes:

```bash
# Luxor API Configuration
LUXOR_API_KEY=your-luxor-api-key-here

# Other required variables (already in your .env)
DATABASE_URL=...
JWT_ACCESS_TOKEN_SECRET=...
JWT_REFRESH_TOKEN_SECRET=...
```

### 2. Verify Installation

All files should be in place:
```
src/
├── lib/
│   └── luxor.ts                    # API client
├── app/
│   ├── api/
│   │   └── luxor/
│   │       └── route.ts            # Proxy route
│   └── (auth)/
│       └── luxor/
│           └── page.tsx            # Dashboard page
```

### 3. Start the Dev Server

```bash
npm run dev
```

### 4. Access the Dashboard

1. Login to the application
2. Navigate to `/luxor`
3. Adjust filters and see real-time data

## API Endpoints

### GET /api/luxor

**Query Parameters:**
- `endpoint` (required): One of `active-workers`, `hashrate-history`, `workspace`
- `currency`: Mining currency (BTC, LTC, DOGE, ZEC, SC, etc.) - required for pool endpoints
- `start_date`: ISO date string (e.g., `2025-01-01`)
- `end_date`: ISO date string
- `tick_size`: Granularity - `5m`, `1h`, `1d`, `1w`, `1M`
- `page_number`: Pagination
- `page_size`: Pagination
- Any other Luxor API parameter

**Examples:**

Get active workers:
```
GET /api/luxor?endpoint=active-workers&currency=BTC&start_date=2025-01-01&end_date=2025-01-31&tick_size=1d
```

Get hashrate efficiency:
```
GET /api/luxor?endpoint=hashrate-history&currency=BTC&start_date=2025-01-01
```

Get workspace info:
```
GET /api/luxor?endpoint=workspace
```

**Status Codes:**
- `200`: Success
- `400`: Bad request (missing/invalid parameters)
- `401`: Unauthorized (invalid/missing token)
- `404`: Endpoint not found or Luxor API error
- `500`: Server error

## Adding New Endpoints

To add a new Luxor API endpoint:

### Step 1: Update `/src/lib/luxor.ts`

Add response interface:
```typescript
export interface NewEndpointResponse {
  // Define response structure based on Luxor API docs
  data: any;
  pagination?: {
    page_number?: number;
    page_size?: number;
  };
}
```

Update endpoint mapping:
```typescript
export const LUXOR_ENDPOINTS = {
  // ... existing endpoints
  'new-endpoint': '/path/to/endpoint',
};
```

### Step 2: Update `/src/app/api/luxor/route.ts`

Update endpointMap with currency requirement:
```typescript
const endpointMap: Record<string, { path: string; requiresCurrency: boolean }> = {
  // ... existing endpoints
  'new-endpoint': { path: '/path/to/endpoint', requiresCurrency: false },
};
```

### Step 3: Update Dashboard (Optional)

Add fetch call in `/src/app/(auth)/luxor/page.tsx`:
```typescript
const newResponse = await fetch(`/api/luxor?endpoint=new-endpoint&...`);
const newData = await newResponse.json();
```

## TypeScript Interfaces

### ActiveWorkersResponse
```typescript
{
  currency_type: "BTC" | "LTC" | "DOGE" | "ZEC" | "SC" | ...;
  subaccounts: { id: number; name: string }[];
  start_date: string;
  end_date: string;
  tick_size: "5m" | "1h" | "1d" | "1w" | "1M";
  active_workers: { date_time: string; active_workers: number }[];
  pagination: { page_number?: number; page_size?: number; ... };
}
```

### HashrateEfficiencyResponse
```typescript
{
  currency_type: "BTC" | "LTC" | ...;
  subaccounts: { id: number; name: string }[];
  start_date: string;
  end_date: string;
  tick_size: "5m" | "1h" | "1d" | "1w" | "1M";
  hashrate_efficiency: { date_time: string; hashrate: number; efficiency: number }[];
  pagination: { ... };
}
```

### WorkspaceResponse
```typescript
{
  id: string;
  name: string;
  [key: string]: any; // Additional fields from Luxor
}
```

## Security Considerations

### API Key Protection ✅
- Stored in `.env` as `LUXOR_API_KEY`
- Never sent to client
- Only used in server-side proxy route

### Authentication ✅
- JWT token required for all requests
- Token extracted from httpOnly cookies
- Failed auth returns 401 status

### Data Isolation ✅
- User's subaccount automatically filtered
- Can't access other users' data
- Subaccount sourced from verified JWT

### Input Validation ✅
- Endpoint whitelist prevents arbitrary API calls
- Query parameters sanitized (empty values filtered)
- Currency parameter validated where required

## Troubleshooting

### "Route not found" Error

**Cause:** Missing or incorrect currency parameter for pool endpoints

**Solution:** Ensure currency is provided for `active-workers` and `hashrate-history`:
```
❌ /api/luxor?endpoint=active-workers
✅ /api/luxor?endpoint=active-workers&currency=BTC
```

### "Authentication required" Error

**Cause:** User not logged in or token expired

**Solution:** 
1. Ensure user is authenticated
2. Check if token cookie exists
3. Token expires after 15 minutes (get new one on refresh)

### "Unsupported endpoint" Error

**Cause:** Endpoint name not in whitelist

**Solution:** Check supported endpoints in endpointMap or add new endpoint

### Empty Data / No Results

**Cause:** Incorrect date range or filters

**Solution:**
1. Verify start_date < end_date
2. Check tick_size is valid for date range
3. Ensure subaccount exists in Luxor

## Performance Tips

1. **Chart Rendering:** Limit data points for better performance
   - Use `1d` (1 day) granularity for large date ranges
   - Use `1h` (1 hour) for last 30 days
   - Use `5m` only for last week

2. **Caching:** Consider implementing response caching
   - Cache duration depends on tick_size
   - Hourly data can be cached for 1 hour
   - Daily data can be cached for 24 hours

3. **Pagination:** Use page_size to limit results
   - Default Luxor API limit: 100 items
   - Adjust based on performance needs

## Monitoring & Logging

All Luxor API calls are logged with `[Luxor Proxy]` prefix:

```
[Luxor Proxy] Authenticating user...
[Luxor Proxy] User authenticated: <userId>
[Luxor Proxy] Requested endpoint: active-workers
[Luxor Proxy] Added subaccount filter: <subaccount>
[Luxor Proxy] Calling Luxor endpoint: /pool/active-workers/BTC
[Luxor Proxy] Successfully retrieved data
```

Errors are logged with details:
```
[Luxor Proxy] Luxor API error (404): Route GET:/v1/pool/active-workers/BTC...
[Luxor Proxy] Error: <error message>
```

Monitor these logs in development and production for debugging.

## Future Enhancements

1. **Caching Layer:** Implement Redis caching for frequently accessed data
2. **Rate Limiting:** Add rate limiting to prevent API quota issues
3. **Real-time Updates:** WebSocket connection for live data updates
4. **Multiple Subaccounts:** Support switching between subaccounts
5. **Export Data:** Add CSV/JSON export functionality
6. **Alerts:** Set up alerts for mining performance issues
7. **Historical Analysis:** Add trend analysis and comparisons

## Support

For issues or questions:
1. Check logs for error messages
2. Verify API key is correct
3. Ensure Luxor account has proper permissions
4. Check network connectivity
5. Review Luxor API documentation

## References

- [Luxor API Docs](https://docs.luxor.tech)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [JWT Security](https://tools.ietf.org/html/rfc7519)
- [Recharts Documentation](https://recharts.org)
