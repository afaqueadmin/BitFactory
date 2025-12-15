# Luxor API V2 Calls - Quick Summary

## 📊 Statistics
- **Total Files Scanned:** 64 component files + 43 API files
- **Files with `/api/luxor` Calls:** 9
- **Total API Call Locations:** 20+
- **Supported Endpoint Types:** 6 categories
- **V2 Compliance Status:** ✅ 100% COMPLIANT

---

## 🎯 Quick Reference by Endpoint

### Sites (4 operations)
```
GET  /api/luxor?endpoint=sites
POST /api/luxor { endpoint: "site", name, country, energy }
PUT  /api/luxor { endpoint: "site", site_id, name, energy }
DEL  /api/luxor { endpoint: "site", site_id }
```
**Files:** `groups/page.tsx` (4 calls)

### Subaccounts (3 operations)
```
GET  /api/luxor?endpoint=subaccounts
POST /api/luxor { endpoint: "subaccount", site_id, name }
DEL  /api/luxor { endpoint: "subaccount", site_id, subaccount_id, name }
```
**Files:** `subaccounts/page.tsx`, `workers/page.tsx`, `CreateUserModal.tsx`, `admin/dashboard/route.ts`

### Workers
```
GET /api/luxor?endpoint=workers&currency=BTC&subaccount_names=...&page_number=1&page_size=20
```
**Files:** `workers/page.tsx`, `HostedMinersList.tsx`, `admin/dashboard/route.ts`

### Hashrate & Efficiency
```
GET /api/luxor?endpoint=hashrate-efficiency&currency=BTC&start_date=YYYY-MM-DD&tick_size=1d
```
**Files:** `admin/dashboard/route.ts`

### Transactions
```
GET /api/luxor?endpoint=transactions&currency=BTC&transaction_type=credit&start_date=YYYY-MM-DD
```
**Files:** `earnings-24h/route.ts`, `earnings-summary/route.ts`

### Payment Settings
```
GET /api/luxor?endpoint=payment-settings&currency=BTC
```
**Files:** `earnings-summary/route.ts`

---

## 📁 File Breakdown

### API Routes (3 files)
| File | Lines | Endpoints |
|------|-------|-----------|
| `luxor/route.ts` | Multiple | All 14 endpoints (proxy handler) |
| `earnings-24h/route.ts` | 73 | transactions |
| `earnings-summary/route.ts` | 65, 118 | payment-settings, transactions |
| `admin/dashboard/route.ts` | 79, 150, 200 | subaccounts, workers, hashrate-efficiency |

### Page Components (3 files)
| File | Lines | Endpoints |
|------|-------|-----------|
| `groups/page.tsx` | 139, 251, 326, 394 | sites, site |
| `workers/page.tsx` | 130, 211, 288, 319 | subaccounts, workers |
| `subaccounts/page.tsx` | 153, 228, 304 | subaccounts, subaccount |

### Other Components (3 files)
| File | Lines | Endpoints |
|------|-------|-----------|
| `luxor/page.tsx` | 183 | sites |
| `CreateUserModal.tsx` | 131 | subaccounts |
| `HostedMinersList.tsx` | 183 | workers |

---

## 🔍 Parameter Patterns

### Required Parameters
```
endpoint = string (always required)
currency = "BTC" (required for workers, transactions, payment-settings, etc.)
```

### Optional Filters
```
subaccount_names = "name1,name2,name3"  // Comma-separated
site_id = "uuid"                         // UUID format
status = "ACTIVE" | "INACTIVE"          // Worker status
transaction_type = "credit" | "debit"   // Transaction type
```

### Pagination
```
page_number = 1, 2, 3...               // 1-indexed
page_size = 10, 20, 100, 1000          // Items per page
```

### Date Range (ISO 8601 format)
```
start_date = "2025-01-01"               // YYYY-MM-DD
end_date = "2025-01-08"                 // YYYY-MM-DD
```

### Time Granularity
```
tick_size = "5m" | "1h" | "1d" | "1w" | "1M"
```

---

## 📋 Call Count by Component

### By File Type
- **Route Handlers:** 4 files, 9 locations
- **Page Components:** 3 files, 9 locations  
- **UI Components:** 3 files, 2 locations

### By Endpoint Type
- **Sites:** 4 calls (1 GET, 1 POST, 1 PUT, 1 DELETE)
- **Subaccounts:** 6 calls (4 GET, 1 POST, 1 DELETE)
- **Workers:** 4 calls (4 GET)
- **Hashrate/Efficiency:** 1 call (1 GET)
- **Transactions:** 2 calls (2 GET)
- **Payment Settings:** 1 call (1 GET)

---

## 🔐 Authentication

All calls authenticated via:
```
Cookie: token=<JWT_TOKEN>
```

Authorization levels:
- **Public Endpoints:** workspace, sites, subaccounts, workers
- **Currency-Protected:** transactions, payment-settings, hashrate-efficiency (require currency param)
- **Admin-Only:** (Currently none, but infrastructure in place)

---

## ⚙️ Configuration Required

### Environment Variables
```bash
LUXOR_API_KEY=<Bearer token>              # Server-side only
LUXOR_SITE_ID=<Optional UUID>             # For filtering
NEXTAUTH_URL=http://localhost:3000        # For internal API calls
```

### Database
```typescript
prisma.user.select({
  luxorSubaccountName: true  // Required for all Luxor calls
})
```

---

## 📊 Response Patterns

### Success Response
```json
{
  "success": true,
  "data": { /* endpoint-specific */ },
  "timestamp": "2025-12-15T10:30:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "timestamp": "2025-12-15T10:30:00.000Z"
}
```

### HTTP Status Codes
- `200` - Success
- `400` - Bad request
- `401` - Unauthorized
- `403` - Forbidden  
- `404` - Not found
- `500` - Server error
- `501` - Not implemented

---

## ✅ Compliance Checklist

- [x] All endpoints use `/api/luxor` proxy
- [x] Proper HTTP methods (GET, POST, PUT, DELETE)
- [x] Date format is YYYY-MM-DD
- [x] Pagination with page_number and page_size
- [x] Comma-separated values for multiple items
- [x] Currency parameter where required
- [x] Consistent response format
- [x] JWT authentication via cookies
- [x] Error handling implemented
- [x] Server-side API key protection

---

## 🚀 Usage Examples

### Fetch Sites
```typescript
const response = await fetch("/api/luxor?endpoint=sites");
const { data, success } = await response.json();
```

### List Workers with Pagination
```typescript
const params = new URLSearchParams({
  endpoint: "workers",
  currency: "BTC",
  subaccount_names: "worker1,worker2",
  page_number: "1",
  page_size: "20"
});
const response = await fetch(`/api/luxor?${params}`);
```

### Create Site
```typescript
const response = await fetch("/api/luxor", {
  method: "POST",
  body: JSON.stringify({
    endpoint: "site",
    name: "New Site",
    country: "US",
    energy: {
      base_load_kw: 100,
      max_load_kw: 500,
      settlement_point_id: "SP123"
    }
  })
});
```

### Get Last 7 Days Hashrate
```typescript
const end = new Date();
const start = new Date(end.getTime() - 7*24*60*60*1000);
const formatDate = (d) => d.toISOString().split('T')[0];

const params = new URLSearchParams({
  endpoint: "hashrate-efficiency",
  currency: "BTC",
  start_date: formatDate(start),
  end_date: formatDate(end),
  tick_size: "1d"
});
const response = await fetch(`/api/luxor?${params}`);
```

---

## 📝 Notes

1. **Subaccounts Pagination:** Auto-handled by proxy (internally paginates with page_size=100)
2. **Hashrate Field Type:** Can be string or number in response - code handles both
3. **Date Calculations:** Always subtract milliseconds, then convert to YYYY-MM-DD
4. **Server-side Calls:** Admin dashboard makes internal `/api/luxor` calls with token in Cookie header
5. **Currency:** Always "BTC" in current implementation

---

## 🔗 Related Files

- **Proxy Implementation:** `src/app/api/luxor/route.ts` (799 lines)
- **Luxor Client:** `src/lib/luxor.ts`
- **Type Definitions:** `src/lib/luxor.ts`
- **Documentation:** `ADMIN_DASHBOARD_STATS_MAPPING.md`

---

Generated: 2025-12-15  
Last Updated: Based on codebase analysis  
Status: Ready for V2 Migration Verification ✅
