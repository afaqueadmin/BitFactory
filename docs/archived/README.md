# Archived Admin Dashboard Documentation

**Archive Date:** January 15, 2025  
**Reason:** Documentation superseded by verified, accurate documentation

---

## Why These Files Are Here

The original admin dashboard documentation files were created in December 2025 but contained **8 critical discrepancies** between documented behavior and actual code implementation:

1. ❌ References non-existent "efficiency" metrics (actual code uses "uptime")
2. ❌ Overcounts cards by 7 units (claims 27-31, actual is 24)
3. ❌ Wrong revenue filtering (claims "PAYMENT" type, actual is "ELECTRICITY_CHARGES" + "ADJUSTMENT")
4. ❌ Incorrect helper function names (2 wrong, 1 missing)
5. ❌ Wrong API endpoint references
6. ❌ Incomplete power calculation explanation
7. ❌ Describes endpoints that don't match implementation
8. ❌ Missing fetchTotalRevenue() function documentation

**Impact:** These inaccuracies would have caused errors during Braiins integration implementation.

---

## Current Correct Documentation

**Use:** [`/docs/ADMINPANEL_CARD_DEEP_ANALYSIS.md`](../ADMINPANEL_CARD_DEEP_ANALYSIS.md)

This document is:
- ✅ **100% verified against actual code**
- ✅ **Includes all information from original docs**
- ✅ **Includes historical context** (removed dummy values, implementation history)
- ✅ **Ready for Braiins integration**

---

## Files in This Archive

| File | Contains | Status |
|------|----------|--------|
| `ADMIN_DASHBOARD_CHANGELOG.md` | Implementation changes from dummy → real data | 📌 Historical reference |
| `ADMIN_DASHBOARD_COMPLETE.md` | Original implementation overview | 📌 Historical reference |
| `ADMIN_DASHBOARD_IMPLEMENTATION.md` | Step-by-step implementation guide | 📌 Historical reference |
| `ADMIN_DASHBOARD_QUICK_REFERENCE.md` | Quick lookup guide | ⚠️ Outdated - use new doc |
| `ADMIN_DASHBOARD_STATS_MAPPING.md` | Stats mapping and categories | ⚠️ Outdated - use new doc |
| `ADMIN_DASHBOARD_STATS_REFERENCE.md` | Reference guide with old metrics | ⚠️ Outdated - use new doc |
| `ADMIN_DASHBOARD_DOCUMENTATION_DISCREPANCY_REPORT.md` | Audit report detailing all discrepancies | 📊 Audit trail |

---

## How to Use This Archive

### For Understanding Implementation History
→ Read `ADMIN_DASHBOARD_CHANGELOG.md` (shows evolution from hardcoded → real data)

### For Understanding What Changed
→ Read `ADMIN_DASHBOARD_DOCUMENTATION_DISCREPANCY_REPORT.md` (detailed comparison)

### For Current Information
→ **Always use** `/docs/ADMINPANEL_CARD_DEEP_ANALYSIS.md`

### For Braiins Integration
→ Read `/docs/ADMINPANEL_CARD_DEEP_ANALYSIS.md` section: "CARDS REQUIRING BRAIINS INTEGRATION"

---

## What Was Fixed in New Documentation

✅ **Uptime vs Efficiency**: Now correctly shows `uptime_24h` (not "efficiency")  
✅ **Card Count**: Correctly lists 24 active cards (not 27-31)  
✅ **Revenue Filtering**: Documents actual types: "ELECTRICITY_CHARGES" + "ADJUSTMENT"  
✅ **Helper Functions**: Lists all 5 functions with correct names  
✅ **API Endpoints**: Documents actual endpoints used in code  
✅ **Power Calculation**: Explains complete calculation with hardware iteration  
✅ **Complete Coverage**: Includes `fetchTotalRevenue()` documentation  
✅ **Implementation History**: Documents transition from dummy → real data  

---

## Reference: Summary of Corrected Facts

| Topic | Old Doc Said | Actual Code | Fixed in New Doc |
|-------|--------------|-------------|-----------------|
| Cards | 27-31 total | 24 active | ✅ |
| Efficiency | Primary metric | Doesn't exist | ✅ |
| Uptime | Secondary metric | Primary metric | ✅ |
| Revenue Type | "PAYMENT" | "ELECTRICITY_CHARGES" + "ADJUSTMENT" | ✅ |
| Helper Functions | 4 (fetchHashrateEfficiency, etc) | 5 (fetchSummary, etc) | ✅ |
| Endpoints | "workspace" | "subaccounts" | ✅ |

---

**Recommendation:** Keep this archive for historical reference, but always refer to `/docs/ADMINPANEL_CARD_DEEP_ANALYSIS.md` for current, accurate information.
