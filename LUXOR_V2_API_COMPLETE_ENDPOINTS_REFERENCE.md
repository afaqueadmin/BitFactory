# Luxor Mining Pool API V2 - Complete Endpoints Reference

**Documentation Base:** https://docs.luxor.tech/mining/api/v2/  
**API Base URL:** https://app.luxor.tech/api/v2  
**Last Updated:** February 14, 2026

---

## 🔐 Authentication

All endpoints require:
```
Header: Authorization: <token>
```

---

## 💱 Supported Currency Types

Available in query parameters where applicable:
- `BTC` - Bitcoin
- `LTC_DOGE` - Litecoin & Dogecoin (combined)
- `SC` - Siacoin
- `ZEC` - Zcash
- `LTC` - Litecoin
- `DOGE` - Dogecoin

---

## 📊 REPORTING ENDPOINTS

### 1. Get Active Workers
- **Documentation:** https://docs.luxor.tech/mining/api/v2/reporting/get-active-workers#authorization
- **Method:** `GET`
- **Path:** `/pool/active-workers/{currency_type}`
- **Query Parameters:**
  - `subaccount_names` (required, comma-separated)
  - `site_id` (optional)
  - `start_date` (required, YYYY-MM-DD)
  - `end_date` (required, YYYY-MM-DD)
  - `tick_size` (required: 5m | 1h | 1d | 1w | 1M)
  - `page_number` (optional, default: 1)
  - `page_size` (optional, default: 10)
- **Returns:**
  - Subaccount metadata
  - Time-series active worker count
  - Pagination block

---

### 2. Get Hashrate History
- **Documentation:** https://docs.luxor.tech/mining/api/v2/reporting/get-hashrate-history
- **Method:** `GET`
- **Path:** `/pool/hashrate-history/{currency_type}`
- **Query Parameters:** (Same as Active Workers)
  - `subaccount_names` (required)
  - `site_id` (optional)
  - `start_date` (required)
  - `end_date` (required)
  - `tick_size` (required)
  - `page_number` (optional)
  - `page_size` (optional)
- **Returns:**
  - Timestamped hashrate values
  - Efficiency metrics
  - Subaccount info
  - Pagination

---

### 3. Get Revenue
- **Documentation:** https://docs.luxor.tech/mining/api/v2/reporting/get-revenue
- **Method:** `GET`
- **Path:** `/pool/revenue/{currency_type}`
- **Query Parameters:**
  - `subaccount_names` (required)
  - `site_id` (optional)
  - `start_date` (required)
  - `end_date` (required)
  - `tick_size` (required)
  - `page_number` (optional)
  - `page_size` (optional)
- **Returns:**
  - Revenue amounts per interval
  - Aggregated totals
  - Currency-specific earnings
  - Pagination

---

### 4. Get Pool Stats
- **Documentation:** https://docs.luxor.tech/mining/api/v2/reporting/get-pool-stats
- **Method:** `GET`
- **Path:** `/pool/pool-stats/{currency_type}`
- **Query Parameters:**
  - `start_date` (optional)
  - `end_date` (optional)
  - `tick_size` (optional)
- **Returns:**
  - Global pool hashrate
  - Active worker totals
  - Performance metrics
  - Pool difficulty

---

### 5. Get Summary
- **Documentation:** https://docs.luxor.tech/mining/api/v2/reporting/get-summary
- **Method:** `GET`
- **Path:** `/pool/summary/{currency_type}`
- **Query Parameters:**
  - `subaccount_names` (optional)
  - `site_id` (optional)
- **Returns:**
  - Current hashrate
  - Worker count
  - Earnings summary
  - Status indicators
  - Last update timestamp

---

### 6. Get Uptime
- **Documentation:** https://docs.luxor.tech/mining/api/v2/reporting/get-uptime
- **Method:** `GET`
- **Path:** `/pool/uptime/{currency_type}`
- **Query Parameters:**
  - `subaccount_names` (optional)
  - `start_date` (optional)
  - `end_date` (optional)
- **Returns:**
  - Uptime percentage
  - Downtime intervals
  - Availability metrics

---

### 7. Get Workers
- **Documentation:** https://docs.luxor.tech/mining/api/v2/reporting/get-workers
- **Method:** `GET`
- **Path:** `/pool/workers/{currency_type}`
- **Query Parameters:**
  - `subaccount_names` (optional)
  - `site_id` (optional)
  - `page_number` (optional, default: 1)
  - `page_size` (optional, default: 10)
- **Returns:**
  - Worker list with IDs
  - Individual worker status
  - Hashrate per worker
  - Site mapping
  - Pagination

---

### 8. Get Workers Hashrate History
- **Documentation:** https://docs.luxor.tech/mining/api/v2/reporting/get-workers-hashrate-history
- **Method:** `GET`
- **Path:** `/pool/workers-hashrate-history/{currency_type}`
- **Query Parameters:**
  - `subaccount_names` (optional)
  - `start_date` (optional)
  - `end_date` (optional)
  - `tick_size` (optional)
- **Returns:**
  - Worker-level time-series hashrate
  - Per-worker performance metrics
  - Historical efficiency data

---

## 💳 PAYMENTS ENDPOINTS

### 9. Get Transactions
- **Documentation:** https://docs.luxor.tech/mining/api/v2/payments/get-transactions
- **Method:** `GET`
- **Path:** `/payments/transactions/{currency_type}`
- **Query Parameters:**
  - `subaccount_names` (optional)
  - `start_date` (optional)
  - `end_date` (optional)
  - `page_number` (optional)
  - `page_size` (optional)
- **Returns:**
  - Transaction list
  - Payment amounts
  - Transaction hash
  - Confirmation status
  - Timestamps
  - Pagination

---

### 10. Get Payment Settings
- **Documentation:** https://docs.luxor.tech/mining/api/v2/payments/get-payment-settings
- **Method:** `GET`
- **Path:** `/payments/settings/{currency_type}`
- **Query Parameters:** None
- **Returns:**
  - Payout threshold
  - Payment address
  - Payment frequency
  - Fee configuration

---

### 11. Get Subaccount Payment Settings
- **Documentation:** https://docs.luxor.tech/mining/api/v2/payments/get-subaccount-payment-settings
- **Method:** `GET`
- **Path:** `/payments/subaccount-settings/{currency_type}`
- **Query Parameters:**
  - `subaccount_names` (optional)
- **Returns:**
  - Payment settings per subaccount
  - Individual payout thresholds
  - Address mappings

---

### 12. Create Payment Settings
- **Documentation:** https://docs.luxor.tech/mining/api/v2/payments/create-payment-settings
- **Method:** `POST`
- **Path:** `/payments/settings/{currency_type}`
- **Body:**
  ```json
  {
    "payout_address": "string",
    "payout_threshold": "number",
    "frequency": "string"
  }
  ```
- **Returns:**
  - Updated configuration object
  - Confirmation status

---

### 13. Update Payment Settings
- **Documentation:** https://docs.luxor.tech/mining/api/v2/payments/update-payment-settings
- **Method:** `PATCH`
- **Path:** `/payments/settings/{currency_type}`
- **Body:**
  ```json
  {
    "payout_address": "string (optional)",
    "payout_threshold": "number (optional)",
    "frequency": "string (optional)"
  }
  ```
- **Returns:**
  - Updated settings object
  - Modification confirmation

---

## 👥 SUBACCOUNTS ENDPOINTS

### 14. Get Subaccounts
- **Documentation:** https://docs.luxor.tech/mining/api/v2/pool/subaccounts/get-subaccounts
- **Method:** `GET`
- **Path:** `/pool/subaccounts`
- **Query Parameters:** None
- **Returns:**
  - List of all subaccounts
  - Site associations
  - Creation dates
  - Subaccount IDs

---

### 15. Get Subaccount
- **Documentation:** https://docs.luxor.tech/mining/api/v2/pool/subaccounts/get-subaccount
- **Method:** `GET`
- **Path:** `/pool/subaccounts/{subaccount_id}`
- **Query Parameters:** None
- **Returns:**
  - Detailed subaccount information
  - Associated sites
  - Settings
  - Status

---

### 16. Create Subaccount
- **Documentation:** https://docs.luxor.tech/mining/api/v2/subaccounts/create-subaccount
- **Method:** `POST`
- **Path:** `/subaccounts`
- **Body:**
  ```json
  {
    "name": "string (required)",
    "site_id": "uuid (optional)"
  }
  ```
- **Returns:**
  - Created subaccount object
  - Generated ID
  - Confirmation

---

### 17. Update Subaccount
- **Documentation:** https://docs.luxor.tech/mining/api/v2/subaccounts/update-subaccount
- **Method:** `PATCH`
- **Path:** `/subaccounts/{id}`
- **Body:**
  ```json
  {
    "name": "string (optional)",
    "site_id": "uuid (optional)"
  }
  ```
- **Returns:**
  - Updated subaccount object

---

### 18. Delete Subaccount
- **Documentation:** https://docs.luxor.tech/mining/api/v2/subaccounts/delete-subaccount
- **Method:** `DELETE`
- **Path:** `/subaccounts/{id}`
- **Query Parameters:** None
- **Returns:**
  - Deletion confirmation
  - Status code

---

## 🏢 WORKSPACES ENDPOINTS

### 19. Get Workspace
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/get-workspace
- **Method:** `GET`
- **Path:** `/workspaces/{workspace_id}`
- **Returns:** Workspace metadata

---

### 20. Get Members
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/get-members
- **Method:** `GET`
- **Path:** `/workspaces/{workspace_id}/members`
- **Returns:** Member list with roles and permissions

---

### 21. Get Member
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/get-member
- **Method:** `GET`
- **Path:** `/workspaces/{workspace_id}/members/{member_id}`
- **Returns:** Individual member details

---

### 22. Invite Member
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/invite-member
- **Method:** `POST`
- **Path:** `/workspaces/{workspace_id}/members`
- **Body:**
  ```json
  {
    "email": "string",
    "role": "string"
  }
  ```
- **Returns:** Invitation confirmation

---

### 23. Update Member
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/update-member
- **Method:** `PATCH`
- **Path:** `/workspaces/{workspace_id}/members/{member_id}`
- **Body:**
  ```json
  {
    "role": "string (optional)"
  }
  ```
- **Returns:** Updated member object

---

### 24. Delete Member
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/delete-member
- **Method:** `DELETE`
- **Path:** `/workspaces/{workspace_id}/members/{member_id}`
- **Returns:** Deletion confirmation

---

### 25. Get Sites
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/get-sites
- **Method:** `GET`
- **Path:** `/workspaces/{workspace_id}/sites`
- **Returns:** List of all sites in workspace

---

### 26. Get Site
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/get-site
- **Method:** `GET`
- **Path:** `/workspaces/{workspace_id}/sites/{site_id}`
- **Returns:** Individual site details

---

### 27. Create Site
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/create-site
- **Method:** `POST`
- **Path:** `/workspaces/{workspace_id}/sites`
- **Body:**
  ```json
  {
    "name": "string",
    "country": "string",
    "energy": {
      "base_load_kw": "number",
      "max_load_kw": "number",
      "settlement_point_id": "string (optional)"
    }
  }
  ```
- **Returns:** Created site object

---

### 28. Update Site
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/update-site
- **Method:** `PATCH`
- **Path:** `/workspaces/{workspace_id}/sites/{site_id}`
- **Body:**
  ```json
  {
    "name": "string (optional)",
    "country": "string (optional)",
    "energy": { /* optional */ }
  }
  ```
- **Returns:** Updated site object

---

### 29. Delete Site
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/delete-site
- **Method:** `DELETE`
- **Path:** `/workspaces/{workspace_id}/sites/{site_id}`
- **Returns:** Deletion confirmation

---

### 30. Get Actions
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/get-actions
- **Method:** `GET`
- **Path:** `/workspaces/{workspace_id}/actions`
- **Returns:** List of workspace actions

---

### 31. Get Action
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/get-action
- **Method:** `GET`
- **Path:** `/workspaces/{workspace_id}/actions/{action_id}`
- **Returns:** Individual action details

---

### 32. Update Action
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/update-action
- **Method:** `PATCH`
- **Path:** `/workspaces/{workspace_id}/actions/{action_id}`
- **Body:**
  ```json
  {
    "status": "string (optional)"
  }
  ```
- **Returns:** Updated action object

---

### 33. Get Watcher Links
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/get-watcherlinks
- **Method:** `GET`
- **Path:** `/workspaces/{workspace_id}/watcherlinks`
- **Returns:** List of watcher links

---

### 34. Get Watcher Link
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/get-watcherlink
- **Method:** `GET`
- **Path:** `/workspaces/{workspace_id}/watcherlinks/{id}`
- **Returns:** Individual watcher link details

---

### 35. Create Watcher Link
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/create-watcherlink
- **Method:** `POST`
- **Path:** `/workspaces/{workspace_id}/watcherlinks`
- **Body:**
  ```json
  {
    "name": "string",
    "url": "string"
  }
  ```
- **Returns:** Created watcher link object

---

### 36. Delete Watcher Link
- **Documentation:** https://docs.luxor.tech/mining/api/v2/workspaces/delete-watcherlink
- **Method:** `DELETE`
- **Path:** `/workspaces/{workspace_id}/watcherlinks/{id}`
- **Returns:** Deletion confirmation

---

## 📍 APIs Currently Used in BitFactory

### Hashprice History Page
The following endpoints are actively used:

| Endpoint | Usage | Link |
|----------|-------|------|
| **Get Revenue** | Fetch daily pool earnings | https://docs.luxor.tech/mining/api/v2/reporting/get-revenue |
| **Get Hashrate History** | Fetch daily pool hashrate | https://docs.luxor.tech/mining/api/v2/reporting/get-hashrate-history |

**Calculation:**
```
hashprice = daily_revenue / daily_hashrate_in_PHs
```

**Data Retention:** ~45 days (API limitation)

### Implementation Details

**File:** `/src/app/api/hashprice-history/route.ts`

```typescript
// Revenue data
const revenueResponse = await luxorClient.getRevenue("BTC", {
  subaccount_names: subaccountName,
  start_date: startDateStr,
  end_date: endDateStr,
});

// Hashrate data
const hashrateResponse = await luxorClient.getHashrateEfficiency("BTC", {
  subaccount_names: subaccountName,
  start_date: startDateStr,
  end_date: endDateStr,
  tick_size: "1d",
  page_size: 100,
  page_number: 1,
});
```

---

## 🔗 Quick Links

### By Category
- **Reporting:** Endpoints 1-8
- **Payments:** Endpoints 9-13
- **Subaccounts:** Endpoints 14-18
- **Workspaces:** Endpoints 19-36

### Official Documentation
- Main Docs: https://docs.luxor.tech/mining/api/v2/
- Base API: https://app.luxor.tech/api/v2

---

## 📝 Notes

- All timestamps in **ISO 8601 format** (YYYY-MM-DDTHH:MM:SSZ)
- Pagination defaults: `page_number=1`, `page_size=10`
- Maximum `page_size` typically: 100
- Historical data retention: ~45 days for reporting endpoints
- Authentication: Bearer token in Authorization header

---

**Last Updated:** February 14, 2026  
**Status:** ✅ Complete Reference
