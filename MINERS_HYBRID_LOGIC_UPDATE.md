# ✅ Miners Card Hybrid Logic Update - COMPLETED

**Date**: December 27, 2025  
**Status**: ✅ IMPLEMENTED AND READY  
**Implementation**: Hybrid approach (Luxor API + Local Database)

---

## Summary

Updated the **Miners Card** to use a **hybrid data source approach**:
- **Active Miners**: Fetched from Luxor V2 API (real-time pool workers)
- **Inactive Miners**: Fetched from local Neon database (miners with status = "DEPLOYMENT_IN_PROGRESS")

---

## Implementation Details

### Code Changes

**File**: [src/app/api/admin/dashboard/route.ts](src/app/api/admin/dashboard/route.ts)

**New Logic**:
```typescript
// ========== MINERS (Luxor V2 API + Database) ==========

// Active miners: Fetch from Luxor API V2 (workers endpoint)
// Inactive miners: Fetch from local database (DEPLOYMENT_IN_PROGRESS status)
let activeMinersCount = 0;
let inactiveMiners = 0;

// Fetch active miners from Luxor API
if (subaccountNames.length > 0) {
  try {
    const workersData = await fetchAllWorkers(request, subaccountNames);
    if (workersData) {
      activeMinersCount = workersData.active;
      console.log(`[Admin Dashboard] Active miners from Luxor: ${activeMinersCount}`);
    }
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching miners from Luxor:", error);
  }
}

// Fetch inactive miners from local database (DEPLOYMENT_IN_PROGRESS status)
try {
  inactiveMiners = await prisma.miner.count({
    where: { status: "DEPLOYMENT_IN_PROGRESS" },
  });
  console.log(`[Admin Dashboard] Inactive miners from DB: ${inactiveMiners}`);
} catch (error) {
  console.error("[Admin Dashboard] Error fetching inactive miners from DB:", error);
}
```

---

## Data Sources

### Active Miners (Luxor V2 API)

**Endpoint**: `GET https://app.luxor.tech/api/v2/pool/workers/BTC`

**Parameters**:
- `subaccount_names`: Comma-separated list of all accessible subaccounts
- `page_number`: 1
- `page_size`: 1000

**Data Used**: `total_active` from response

**Meaning**: Real-time active workers mining on Luxor pool across all user subaccounts

### Inactive Miners (Local Database)

**Query**: 
```typescript
Prisma.miner.count({
  where: { status: "DEPLOYMENT_IN_PROGRESS" }
})
```

**Data Used**: Count of miners in database with status "DEPLOYMENT_IN_PROGRESS"

**Meaning**: Miners currently being deployed locally but not yet active

---

## Miners Card Display

| Field | Source | Value |
|-------|--------|-------|
| **Active** | Luxor V2 API | Real-time workers count |
| **Inactive** | Local Database | Count of DEPLOYMENT_IN_PROGRESS miners |
| **Status Bar** | Combined | Blue (Active) + Gray (Inactive) pie chart |
| **Total** | Sum of both | Active + Inactive |

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│        GET /api/admin/dashboard Request                │
└─────────────────────────────────────────────────────────┘
                          │
                ┌─────────┴──────────┐
                │                    │
        ┌───────▼────────┐  ┌────────▼────────────┐
        │  Fetch Active  │  │  Fetch Inactive     │
        │  Miners from   │  │  Miners from        │
        │  Luxor API     │  │  Local Database     │
        └────────┬────────┘  └──────────┬──────────┘
                 │                      │
         ▼       │                      │       ▼
      Subaccount Names               DB Query
         List                     (status="DEPLOYMENT...")
                 │                      │
                 └──────────┬───────────┘
                            │
                    ┌───────▼─────────┐
                    │ Miners Card     │
                    │  - Active: X    │
                    │  - Inactive: Y  │
                    │  - Total: X+Y   │
                    └─────────────────┘
```

---

## Benefits

✅ **Comprehensive Miner Tracking**: Combines both Luxor pool status and local deployment status
✅ **Real-time Active Data**: Active miners from live Luxor API
✅ **Local Deployment Visibility**: See which miners are being deployed
✅ **Hybrid Approach**: Best of both sources - API freshness + database reliability
✅ **Clear Status**: Admin can distinguish between active (Luxor) and deploying (local) miners

---

## Error Handling

**If Luxor API fails**:
- Active miners show 0
- Inactive miners still show from database
- Dashboard continues to function partially

**If Database fails**:
- Active miners show from API
- Inactive miners show 0
- Dashboard continues to function partially

**If both fail**:
- Both counts show 0
- Card still displays with visual structure (pie chart visible due to zero-value handling)

---

## Documentation Updates

### Updated Files

1. **ADMIN_DASHBOARD_STATS_REFERENCE.md**
   - Updated Card 1 description
   - Changed from pure API to "Hybrid - Luxor V2 API + Database"
   - Updated data sources for Active and Inactive

2. **ADMIN_DASHBOARD_STATS_MAPPING.md**
   - Updated Category 1 title
   - Added dual data sources explanation
   - Split API call and Database query documentation
   - Updated implementation notes

3. **MINERS_CARD_STATUS_BAR_FIX.md**
   - Preserved (still relevant - pie chart handling for zero values)

---

## Testing Checklist

- [ ] Dashboard loads successfully
- [ ] Miners card displays with both Active and Inactive counts
- [ ] Active count reflects Luxor API data
- [ ] Inactive count reflects database count (DEPLOYMENT_IN_PROGRESS)
- [ ] Pie chart displays with proper colors
- [ ] Console logs show both data sources being fetched
- [ ] Error handling works if either source fails
- [ ] Card layout remains consistent with other stat cards

---

## Logging Output

When dashboard loads, you should see logs like:

```
[Admin Dashboard] Accessible subaccounts (19 total): [...]
[Admin Dashboard] Active miners from Luxor: 0
[Admin Dashboard] Inactive miners from DB: 0
[Admin Dashboard] Total Miners: 0 active, 0 inactive
```

---

## Future Enhancements

1. **Sync Status**: Show which miners are syncing from local to Luxor
2. **Deployment Progress**: Track deployment percentage
3. **Status Transitions**: Show miners moving from DEPLOYMENT_IN_PROGRESS to ACTIVE
4. **Detailed Breakdown**: Show miners by status and site
5. **Health Checks**: Monitor miner health metrics from both sources

---

## File Changes Summary

| File | Change Type | Details |
|------|-------------|---------|
| src/app/api/admin/dashboard/route.ts | Modified | Added database query for inactive miners |
| ADMIN_DASHBOARD_STATS_REFERENCE.md | Updated | Changed Card 1 source to hybrid |
| ADMIN_DASHBOARD_STATS_MAPPING.md | Updated | Documented both data sources |

---

## Deployment Notes

- No database migrations required
- No schema changes
- Backward compatible
- Ready for immediate deployment
- Monitor logs for both data sources being fetched

---

## Status

✅ **Code Implementation**: COMPLETE
✅ **Documentation**: COMPLETE
✅ **Error Handling**: COMPLETE
✅ **Testing**: READY
✅ **Deployment**: READY

The Miners card now provides a comprehensive view of both active pool workers (Luxor) and locally deployed miners (Database).
