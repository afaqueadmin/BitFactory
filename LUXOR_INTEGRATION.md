# Luxor Mining API Integration Guide

## Overview

This document describes the complete Luxor mining API integration for BitFactory, including:
- Server-side secure API client (`/src/lib/luxor.ts`)
- Next.js API proxy route (`/src/app/api/luxor/route.ts`)
- Beautiful React dashboard (`/src/app/(auth)/luxor/page.tsx`)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Client)                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  /luxor Dashboard Page                               │   │
│  │  - Displays charts and statistics                    │   │
│  │  - Makes HTTP requests to /api/luxor                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js Server (/api/luxor)                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. Verify JWT token from cookies                    │   │
│  │  2. Fetch user data from database                    │   │
│  │  3. Validate endpoint against whitelist              │   │
│  │  4. Build query string (sanitized)                   │   │
│  │  5. Create LuxorClient with API key                 │   │
│  │  6. Proxy request to Luxor API                       │   │
│  │  7. Return response in standard format               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│         Luxor Mining API (https://app.luxor.tech)           │
│  - Active Workers: /pool/active-workers                    │
│  - Hashrate: /pool/hashrate-efficiency                     │
│  - Workspace: /workspace                                    │
└─────────────────────────────────────────────────────────────┘
```

## Security Features

### 🔐 API Key Protection
- **Never exposed to client**: API key stored in environment variables only
- **Server-side only**: Key only used in `/api/luxor` route
- **Environment variable**: `LUXOR_API_KEY` in `.env`

### 🔐 Authentication
- **JWT verification**: All requests require valid JWT token from cookies
- **User database lookup**: Subaccount name fetched from authenticated user's profile
- **Automatic data filtering**: Results automatically filtered to user's subaccount

### 🔐 Input Validation
- **Endpoint whitelist**: Only whitelisted endpoints are allowed
- **Query sanitization**: Empty/undefined parameters are filtered out
- **Status code checking**: HTTP errors are properly handled and reported

## Setup Instructions

### 1. Environment Configuration

The `LUXOR_API_KEY` is already configured in your `.env` file:

```properties
LUXOR_API_KEY=api-835ef3237f7d1ef3d02aac447588e90c
```

### 2. Access the Dashboard

Navigate to: **`http://localhost:3000/luxor`** (when logged in)

The page requires authentication - only authenticated users can access it.

### 3. Features

#### Filter Panel
- **Currency**: Select mining currency (BTC, LTC, DOGE, ZEC, SC)
- **Start Date**: ISO date format (YYYY-MM-DD)
- **End Date**: ISO date format
- **Granularity**: Data granularity (5m, 1h, 1d, 1w, 1M)

#### Display Components
- **Stat Cards**: Shows total workers, currency, time period, data points
- **Active Workers Chart**: Line chart showing worker count over time
- **Hashrate Chart**: Bar chart showing hashrate and efficiency
- **Workspace Info**: Displays workspace configuration details

## API Documentation

### Proxy Endpoint: `/api/luxor`

**Method**: `GET`

**Authentication**: Required (JWT token in httpOnly cookie)

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `endpoint` | string | ✓ | One of: `active-workers`, `hashrate-history`, `workspace` |
| `currency` | string | | Mining currency (BTC, LTC, DOGE, ZEC, SC) |
| `start_date` | string | | ISO date (YYYY-MM-DD) |
| `end_date` | string | | ISO date (YYYY-MM-DD) |
| `tick_size` | string | | Granularity: 5m, 1h, 1d, 1w, 1M |
| `page_number` | number | | Pagination (default: 1) |
| `page_size` | number | | Items per page (default: 10) |

**Response Format**:
```json
{
  "success": boolean,
  "data": {...},
  "error": "error message if success=false",
  "timestamp": "2025-01-20T10:30:00.000Z"
}
```

**Examples**:

```bash
# Get active workers for BTC
curl -H "Cookie: token=<your-jwt-token>" \
  "http://localhost:3000/api/luxor?endpoint=active-workers&currency=BTC&start_date=2025-01-01&end_date=2025-01-31&tick_size=1d"

# Get hashrate efficiency
curl -H "Cookie: token=<your-jwt-token>" \
  "http://localhost:3000/api/luxor?endpoint=hashrate-history&currency=BTC&start_date=2025-01-01"

# Get workspace info
curl -H "Cookie: token=<your-jwt-token>" \
  "http://localhost:3000/api/luxor?endpoint=workspace"
```

## Adding New Endpoints

To add a new Luxor endpoint:

### Step 1: Define Response Type in `/src/lib/luxor.ts`

```typescript
export interface NewEndpointResponse {
  // Define response structure based on Luxor API docs
  id: string;
  name: string;
  value: number;
}
```

### Step 2: Add to Endpoint Map in `/src/lib/luxor.ts`

```typescript
export const LUXOR_ENDPOINTS = {
  'active-workers': '/pool/active-workers',
  'hashrate-history': '/pool/hashrate-efficiency',
  'workspace': '/workspace',
  'new-endpoint': '/new/endpoint/path', // ← Add here
};
```

### Step 3: Update Proxy Route in `/src/app/api/luxor/route.ts`

```typescript
const endpointMap: Record<string, string> = {
  'active-workers': '/pool/active-workers',
  'hashrate-history': '/pool/hashrate-efficiency',
  'workspace': '/workspace',
  'new-endpoint': '/new/endpoint/path', // ← Add here
};
```

### Step 4: Use in Dashboard

```typescript
const params = new URLSearchParams({
  endpoint: 'new-endpoint',
  // ... add any required parameters
}).toString();

const response = await fetch(`/api/luxor?${params}`);
const { success, data, error } = await response.json();
```

## TypeScript Interfaces

All responses include proper TypeScript types:

### ActiveWorkersResponse
```typescript
interface ActiveWorkersResponse {
  currency_type: 'BTC' | 'LTC' | 'DOGE' | 'ZEC' | 'SC' | 'ZEN' | 'LTC_DOGE';
  subaccounts: Array<{ id: number; name: string }>;
  start_date: string;
  end_date: string;
  tick_size: '5m' | '1h' | '1d' | '1w' | '1M';
  active_workers: Array<{ date_time: string; active_workers: number }>;
  pagination: PaginationInfo;
}
```

### HashrateEfficiencyResponse
```typescript
interface HashrateEfficiencyResponse {
  currency_type: 'BTC' | 'LTC' | 'DOGE' | 'ZEC' | 'SC' | 'ZEN' | 'LTC_DOGE';
  subaccounts: Array<{ id: number; name: string }>;
  start_date: string;
  end_date: string;
  tick_size: '5m' | '1h' | '1d' | '1w' | '1M';
  hashrate_efficiency: Array<{
    date_time: string;
    hashrate: number;
    efficiency: number;
  }>;
  pagination: PaginationInfo;
}
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Authentication required: No token found" | Not logged in | Log in first |
| "User not found in database" | User deleted | Re-authenticate |
| "Unsupported endpoint" | Invalid endpoint | Use valid endpoint |
| "API returned status 401" | Invalid Luxor API key | Check `.env` file |
| "Invalid or expired token" | JWT expired | Log out and log in again |

### Error Response Example

```json
{
  "success": false,
  "error": "Service configuration error. Please contact support.",
  "timestamp": "2025-01-20T10:30:00.000Z"
}
```

## File Structure

```
src/
├── lib/
│   └── luxor.ts                    # Luxor API client library
├── app/
│   ├── api/
│   │   └── luxor/
│   │       └── route.ts            # Proxy API route
│   └── (auth)/
│       └── luxor/
│           └── page.tsx            # Dashboard page
```

## Performance Considerations

1. **Parallel Requests**: Dashboard fetches data in parallel (workers, hashrate, workspace)
2. **Query Optimization**: Only includes non-empty parameters in requests
3. **Caching**: Use React state to avoid unnecessary re-fetches
4. **Error Recovery**: Individual failed endpoints don't block others

## Debugging

Enable debug logging by checking browser console:

```typescript
// In browser DevTools Console:
// Look for logs like:
// [Luxor Dashboard] Fetching data with filters: {...}
// [Luxor Dashboard] Data fetched successfully
// [Luxor Proxy] User authenticated: <userId>
// [Luxor Proxy] Calling Luxor endpoint: /pool/active-workers
```

Check server logs for API route debugging:
```bash
npm run dev
# Look for [Luxor Proxy] logs in terminal
```

## Troubleshooting

### Issue: "Route GET:/v1/pool/active-workers... not found"

**Cause**: API request failed before reaching Luxor servers

**Solutions**:
1. Check JWT token is valid (log out and log in again)
2. Verify user exists in database
3. Check LUXOR_API_KEY in `.env`
4. Verify network connectivity

### Issue: No data appears on dashboard

**Cause**: API request succeeded but returned empty data

**Solutions**:
1. Check date range includes data
2. Verify currency code is correct
3. Check granularity matches Luxor API requirements
4. Review Luxor API documentation for endpoint specs

### Issue: 401 Unauthorized from Luxor API

**Cause**: LUXOR_API_KEY is invalid

**Solutions**:
1. Verify key in `.env` file
2. Request new API key from Luxor
3. Check key doesn't have extra whitespace

## Stack Information

- **Framework**: Next.js 15.5.3 (App Router)
- **Language**: TypeScript 5
- **UI Library**: Material-UI v7
- **Authentication**: JWT (jose library)
- **Database**: PostgreSQL (Prisma)
- **Charts**: Recharts

## Additional Resources

- [Luxor API Documentation](https://docs.luxor.tech)
- [Next.js Documentation](https://nextjs.org/docs)
- [Material-UI Documentation](https://mui.com/material-ui/getting-started/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

## Support

For issues or questions:
1. Check the error message in browser console
2. Review this documentation
3. Check server logs (`npm run dev`)
4. Verify `.env` configuration
5. Ensure JWT token is valid (log in again)
