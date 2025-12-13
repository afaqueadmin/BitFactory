# Luxor V2 API Complete Reference

**Base URL:** `https://app.luxor.tech/api/v2`

**Authentication:** Bearer token in `Authorization` header

---

## Table of Contents
1. [Payments (Transactions & Settings)](#payments)
2. [Reporting (Analytics & Metrics)](#reporting)
3. [Subaccounts (Management)](#subaccounts)
4. [Workspaces (Sites & Members)](#workspaces)

---

## Payments

### Get Transactions
- **Method:** `GET`
- **Endpoint:** `/pool/transactions/{currency}`
- **Parameters:**
  - `currency` (path, required): BTC, LTC, etc.
  - `subaccount_names` (optional): Comma-separated list
  - `site_id` (optional): Filter by site UUID
  - `start_date` (optional): ISO date (2025-01-01)
  - `end_date` (optional): ISO date (2025-01-31)
  - `transaction_type` (optional): debit, credit
  - `page_number` (optional): Default 1
  - `page_size` (optional): Default 10

**Example:**
```bash
GET /pool/transactions/BTC?subaccount_names=my_subaccount,another_subaccount&site_id=b0a5fad8-0e09-4f10-ac20-ccd80fb2d138&start_date=2025-01-01&end_date=2025-01-31&transaction_type=debit&page_number=1&page_size=10
```

**Response:**
```json
{
  "transactions": [
    {
      "currency_type": "BTC",
      "date_time": "2019-08-24T14:15:22Z",
      "address_name": "wallet-1",
      "subaccount_name": "my_subaccount",
      "transaction_category": "Miner Revenue",
      "currency_amount": 0.00066154,
      "usd_equivalent": 661.54,
      "transaction_id": "001asdfasdf",
      "transaction_type": "debit"
    }
  ],
  "pagination": {
    "page_number": 1,
    "page_size": 1,
    "item_count": 0,
    "previous_page_url": null,
    "next_page_url": null
  }
}
```

---

### Get Payment Settings (List)
- **Method:** `GET`
- **Endpoint:** `/pool/payment-settings/{currency}`
- **Parameters:**
  - `currency` (path, required): BTC, LTC, etc.
  - `subaccount_names` (optional): Comma-separated list
  - `site_id` (optional): Filter by site UUID
  - `page_number` (optional): Default 1
  - `page_size` (optional): Default 10

**Example:**
```bash
GET /pool/payment-settings/BTC?subaccount_names=my_subaccount,another_subaccount&site_id=b0a5fad8-0e09-4f10-ac20-ccd80fb2d138&page_number=1&page_size=10
```

**Response:**
```json
{
  "payment_settings": [
    {
      "currency_type": "BTC",
      "subaccount": {
        "id": 0,
        "name": "my_subaccount",
        "site": {
          "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
          "name": "My Site"
        },
        "created_at": "2019-08-24T14:15:22Z",
        "url": "string"
      },
      "balance": 0.00066154,
      "status": "PENDING_APPROVAL",
      "wallet_id": 0,
      "payment_frequency": "DAILY",
      "day_of_week": "MONDAY",
      "addresses": [
        {
          "address_id": 0,
          "address_name": "address_1",
          "external_address": "YOUR_WALLET_ADDRESS",
          "revenue_allocation": 100
        }
      ],
      "next_payout_at": "2025-01-01T00:00:00Z",
      "frozen_until": "2025-01-01T00:00:00Z",
      "pool_discount_rate": 0.01
    }
  ],
  "pagination": {
    "page_number": 1,
    "page_size": 1,
    "item_count": 0,
    "previous_page_url": null,
    "next_page_url": null
  }
}
```

---

### Get Single Subaccount Payment Settings
- **Method:** `GET`
- **Endpoint:** `/pool/payment-settings/{currency}/{subaccount_name}`
- **Parameters:**
  - `currency` (path, required): BTC, LTC, etc.
  - `subaccount_name` (path, required): Subaccount name

**Example:**
```bash
GET /pool/payment-settings/BTC/my_subaccount
```

**Response:**
```json
{
  "currency_type": "BTC",
  "subaccount": {
    "id": 0,
    "name": "my_subaccount",
    "site": {
      "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
      "name": "My Site"
    },
    "created_at": "2019-08-24T14:15:22Z",
    "url": "string"
  },
  "balance": 0.00066154,
  "status": "PENDING_APPROVAL",
  "wallet_id": 0,
  "payment_frequency": "DAILY",
  "day_of_week": "MONDAY",
  "addresses": [
    {
      "address_id": 0,
      "address_name": "address_1",
      "external_address": "YOUR_WALLET_ADDRESS",
      "revenue_allocation": 100
    }
  ],
  "next_payout_at": "2025-01-01T00:00:00Z",
  "frozen_until": "2025-01-01T00:00:00Z",
  "pool_discount_rate": 0.01
}
```

---

### Create Payment Settings
- **Method:** `POST`
- **Endpoint:** `/pool/payment-settings/{currency}/{subaccount_name}`
- **Parameters:**
  - `currency` (path, required): BTC, LTC, etc.
  - `subaccount_name` (path, required): Subaccount name
- **Body:**
  ```json
  {
    "payment_frequency": "DAILY",
    "day_of_week": "MONDAY",
    "addresses": [
      {
        "address_id": 0,
        "address_name": "address_1",
        "external_address": "YOUR_WALLET_ADDRESS",
        "revenue_allocation": 100
      }
    ]
  }
  ```

**Response:** Action object (may require approval)
```json
{
  "id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  "action_name": "CREATE_PAYMENT_SETTINGS",
  "status": "PENDING",
  "initiated_at": "2019-08-24T14:15:22Z",
  "requires_approval": true,
  "url": "/v2/workspace/actions/2976f92e-541c-48ad-81d8-6dd5be77c83a"
}
```

---

### Update Payment Settings
- **Method:** `PUT`
- **Endpoint:** `/pool/payment-settings/{currency}/{subaccount_name}`
- **Parameters:**
  - `currency` (path, required): BTC, LTC, etc.
  - `subaccount_name` (path, required): Subaccount name
- **Body:**
  ```json
  {
    "wallet_id": 0,
    "payment_frequency": "DAILY",
    "day_of_week": "MONDAY",
    "addresses": [
      {
        "address_id": 0,
        "address_name": "address_1",
        "external_address": "YOUR_WALLET_ADDRESS",
        "revenue_allocation": 100
      }
    ]
  }
  ```

**Response:** Action object (may require approval)

---

## Reporting

### Get Dev Fee
- **Method:** `GET`
- **Endpoint:** `/pool/dev-fee`
- **Parameters:**
  - `subaccount_names` (optional): Comma-separated list
  - `site_id` (optional): Filter by site UUID
  - `start_date` (optional): ISO date
  - `end_date` (optional): ISO date
  - `page_number` (optional): Default 1
  - `page_size` (optional): Default 10

**Response:**
```json
{
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "devfee_data": [
    {
      "datetime": "2019-08-24T14:15:22Z",
      "devfee_hashrate": "1035827914295214",
      "devfee_revenue": 0.00066154,
      "subaccount": "my_subaccount"
    }
  ],
  "pagination": {
    "page_number": 1,
    "page_size": 1,
    "item_count": 0
  }
}
```

---

### Get Hashrate Efficiency History
- **Method:** `GET`
- **Endpoint:** `/pool/hashrate-efficiency/{currency}`
- **Parameters:**
  - `currency` (path, required): BTC, LTC, etc.
  - `subaccount_names` (optional): Comma-separated list
  - `site_id` (optional): Filter by site UUID
  - `start_date` (optional): ISO date
  - `end_date` (optional): ISO date
  - `tick_size` (optional): 5m, 1h, 1d, 1w, 1M
  - `page_number` (optional): Default 1
  - `page_size` (optional): Default 10

**Response:**
```json
{
  "currency_type": "BTC",
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "tick_size": "1d",
  "subaccounts": [
    {
      "id": 0,
      "name": "my_subaccount",
      "site": {
        "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
        "name": "My Site"
      },
      "created_at": "2019-08-24T14:15:22Z",
      "url": "string"
    }
  ],
  "hashrate_efficiency": [
    {
      "date_time": "2019-08-24T14:15:22Z",
      "hashrate": "1035827914295214",
      "efficiency": 0.9960606098175049
    }
  ],
  "pagination": {
    "page_number": 1,
    "page_size": 1,
    "item_count": 0
  }
}
```

---

### Get Pool Hashrate
- **Method:** `GET`
- **Endpoint:** `/pool/pool-hashrate/{currency}`
- **Parameters:**
  - `currency` (path, required): BTC, LTC, etc.

**Response:**
```json
{
  "currency_type": "BTC",
  "hashrate_5m": "1035827914295214",
  "hashrate_1h": "1035827914295214",
  "hashrate_24h": "1035827914295214"
}
```

---

### Get Workers
- **Method:** `GET`
- **Endpoint:** `/pool/workers/{currency}`
- **Parameters:**
  - `currency` (path, required): BTC, LTC, etc.
  - `subaccount_names` (optional): Comma-separated list
  - `site_id` (optional): Filter by site UUID
  - `status` (optional): ACTIVE, INACTIVE
  - `page_number` (optional): Default 1
  - `page_size` (optional): Default 10

**Response:**
```json
{
  "currency_type": "BTC",
  "subaccounts": [
    {
      "id": 0,
      "name": "my_subaccount",
      "site": {
        "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
        "name": "My Site"
      },
      "created_at": "2019-08-24T14:15:22Z",
      "url": "string"
    }
  ],
  "total_inactive": 10,
  "total_active": 10,
  "workers": [
    {
      "currency_type": "BTC",
      "id": "string",
      "subaccount_name": "my_subaccount",
      "name": "worker_1",
      "firmware": "1.0.0",
      "hashrate": 0.00066154,
      "efficiency": 0.9960606098175049,
      "stale_shares": 0.00066154,
      "rejected_shares": 0.00066154,
      "last_share_time": "2019-08-24T14:15:22Z",
      "status": "ACTIVE"
    }
  ],
  "pagination": {
    "page_number": 1,
    "page_size": 1,
    "item_count": 0
  }
}
```

---

### Get Workers Hashrate Efficiency History
- **Method:** `GET`
- **Endpoint:** `/pool/workers-hashrate-efficiency/{currency}/{subaccount_name}`
- **Parameters:**
  - `currency` (path, required): BTC, LTC, etc.
  - `subaccount_name` (path, required): Subaccount name
  - `worker_names` (optional): Comma-separated list
  - `tick_size` (optional): 5m, 1h, 1d, 1w, 1M
  - `start_date` (optional): ISO date
  - `end_date` (optional): ISO date
  - `page_number` (optional): Default 1
  - `page_size` (optional): Default 10

**Response:**
```json
{
  "currency_type": "BTC",
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "tick_size": "1d",
  "hashrate_efficiency_revenue": {
    "worker_1": [
      {
        "date_time": "2019-08-24T14:15:22Z",
        "hashrate": "1035827914295214",
        "efficiency": 0.9960606098175049,
        "est_revenue": 0.00066154
      }
    ],
    "worker_2": [...]
  },
  "pagination": {
    "page_number": 1,
    "page_size": 1,
    "item_count": 0
  }
}
```

---

### Get Revenue
- **Method:** `GET`
- **Endpoint:** `/pool/revenue/{currency}`
- **Parameters:**
  - `currency` (path, required): BTC, LTC, etc.
  - `subaccount_names` (optional): Comma-separated list
  - `site_id` (optional): Filter by site UUID
  - `start_date` (optional): ISO date
  - `end_date` (optional): ISO date

**Response:**
```json
{
  "currency_type": "BTC",
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "subaccounts": [
    {
      "id": 0,
      "name": "my_subaccount",
      "site": {
        "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
        "name": "My Site"
      },
      "created_at": "2019-08-24T14:15:22Z",
      "url": "string"
    }
  ],
  "revenue": [
    {
      "date_time": "2019-08-24T14:15:22Z",
      "revenue": {
        "currency_type": "BTC",
        "revenue_type": "MINING",
        "revenue": 0.00066154
      }
    }
  ]
}
```

---

### Get Active Workers History
- **Method:** `GET`
- **Endpoint:** `/pool/active-workers/{currency}`
- **Parameters:**
  - `currency` (path, required): BTC, LTC, etc.
  - `subaccount_names` (optional): Comma-separated list
  - `site_id` (optional): Filter by site UUID
  - `start_date` (optional): ISO date
  - `end_date` (optional): ISO date
  - `tick_size` (optional): 5m, 1h, 1d, 1w, 1M
  - `page_number` (optional): Default 1
  - `page_size` (optional): Default 10

**Response:**
```json
{
  "currency_type": "BTC",
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "tick_size": "1d",
  "subaccounts": [
    {
      "id": 0,
      "name": "my_subaccount",
      "site": {
        "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
        "name": "My Site"
      },
      "created_at": "2019-08-24T14:15:22Z",
      "url": "string"
    }
  ],
  "active_workers": [
    {
      "date_time": "2019-08-24T14:15:22Z",
      "active_workers": 10
    }
  ],
  "pagination": {
    "page_number": 1,
    "page_size": 1,
    "item_count": 0
  }
}
```

---

## Subaccounts

### List Subaccounts
- **Method:** `GET`
- **Endpoint:** `/pool/subaccounts`
- **Parameters:**
  - `site_id` (optional): Filter by site UUID
  - `page_number` (optional): Default 1
  - `page_size` (optional): Default 10

**Response:**
```json
{
  "subaccounts": [
    {
      "id": 0,
      "name": "my_subaccount",
      "site": {
        "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
        "name": "My Site"
      },
      "created_at": "2019-08-24T14:15:22Z",
      "url": "string"
    }
  ],
  "pagination": {
    "page_number": 1,
    "page_size": 1,
    "item_count": 0
  }
}
```

---

### Get Single Subaccount
- **Method:** `GET`
- **Endpoint:** `/pool/subaccounts/{subaccount_name}`
- **Parameters:**
  - `subaccount_name` (path, required): Subaccount name

**Response:**
```json
{
  "id": 0,
  "name": "my_subaccount",
  "site": {
    "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
    "name": "My Site"
  },
  "created_at": "2019-08-24T14:15:22Z",
  "url": "string"
}
```

---

### Create Subaccount
- **Method:** `POST`
- **Endpoint:** `/pool/subaccounts`
- **Body:**
  ```json
  {
    "name": "my_subaccount",
    "site_id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138"
  }
  ```

**Response:**
```json
{
  "id": 0,
  "name": "my_subaccount",
  "site": {
    "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
    "name": "My Site"
  },
  "created_at": "2019-08-24T14:15:22Z",
  "url": "string"
}
```

---

### Update Subaccount
- **Method:** `PUT`
- **Endpoint:** `/pool/subaccounts/{subaccount_name}`
- **Parameters:**
  - `subaccount_name` (path, required): Current subaccount name
- **Body:**
  ```json
  {
    "site_id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138"
  }
  ```

**Response:** Action object (may require approval)

---

### Delete Subaccount
- **Method:** `DELETE`
- **Endpoint:** `/pool/subaccounts/{subaccount_name}`
- **Parameters:**
  - `subaccount_name` (path, required): Subaccount name to delete

**Response:** Action object (may require approval)

---

## Workspaces

### Get Workspace
- **Method:** `GET`
- **Endpoint:** `/workspace`
- **Parameters:** None

**Response:**
```json
{
  "id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  "name": "My Workspace",
  "products": ["POOL"],
  "sites": [
    {
      "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
      "name": "My Site"
    }
  ]
}
```

---

### List Sites
- **Method:** `GET`
- **Endpoint:** `/workspace/sites`
- **Parameters:** None

**Response:**
```json
{
  "sites": [
    {
      "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
      "name": "My Site",
      "country": "USA",
      "energy": {
        "base_load_kw": 100,
        "max_load_kw": 1000,
        "min_load_kw": 0,
        "settlement_point_id": "123e4567-e89b-12d3-a456-426614174000",
        "settlement_point_name": "LZ_NORTH",
        "power_market": "ERCOT"
      },
      "pool": {
        "subaccounts": [
          {
            "id": 0,
            "name": "my_subaccount"
          }
        ]
      }
    }
  ]
}
```

---

### Get Single Site
- **Method:** `GET`
- **Endpoint:** `/workspace/sites/{site_id}`
- **Parameters:**
  - `site_id` (path, required): Site UUID

**Response:**
```json
{
  "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
  "name": "My Site",
  "country": "USA",
  "energy": {
    "base_load_kw": 100,
    "max_load_kw": 1000,
    "min_load_kw": 0,
    "settlement_point_id": "123e4567-e89b-12d3-a456-426614174000",
    "settlement_point_name": "LZ_NORTH",
    "power_market": "ERCOT"
  },
  "pool": {
    "subaccounts": [
      {
        "id": 0,
        "name": "my_subaccount"
      }
    ]
  }
}
```

---

### Create Site
- **Method:** `POST`
- **Endpoint:** `/workspace/sites`
- **Body:**
  ```json
  {
    "name": "My Site",
    "country": "USA",
    "energy": {
      "base_load_kw": 100,
      "max_load_kw": 1000,
      "settlement_point_id": "123e4567-e89b-12d3-a456-426614174000"
    }
  }
  ```

**Response:** Site object

---

### Update Site
- **Method:** `PUT`
- **Endpoint:** `/workspace/sites/{site_id}`
- **Parameters:**
  - `site_id` (path, required): Site UUID
- **Body:** Same as create

**Response:** Site object

---

### Delete Site
- **Method:** `DELETE`
- **Endpoint:** `/workspace/sites/{site_id}`
- **Parameters:**
  - `site_id` (path, required): Site UUID

**Response:** Action object

---

### List Workspace Members
- **Method:** `GET`
- **Endpoint:** `/workspace/members`
- **Parameters:**
  - `page_number` (optional): Default 1
  - `page_size` (optional): Default 10

**Response:**
```json
{
  "members": [
    {
      "id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Smith"
    }
  ],
  "pagination": {
    "page_number": 1,
    "page_size": 1,
    "item_count": 0
  }
}
```

---

### Get Single Member
- **Method:** `GET`
- **Endpoint:** `/workspace/members/{member_id}`
- **Parameters:**
  - `member_id` (path, required): Member UUID

**Response:**
```json
{
  "id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Smith"
}
```

---

### Invite Member
- **Method:** `POST`
- **Endpoint:** `/workspace/members`
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "permissions": [
      {
        "role": "VIEWER",
        "product": "POOL",
        "site_id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
        "subaccount_id": 0
      }
    ]
  }
  ```

**Response:** Action object

---

### Update Member
- **Method:** `PUT`
- **Endpoint:** `/workspace/members/{member_id}`
- **Parameters:**
  - `member_id` (path, required): Member UUID
- **Body:**
  ```json
  {
    "permissions": [
      {
        "role": "VIEWER",
        "product": "POOL",
        "site_id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
        "subaccount_id": 0,
        "id": "permission-uuid"
      }
    ]
  }
  ```

**Response:** Action object

---

### Delete Member
- **Method:** `DELETE`
- **Endpoint:** `/workspace/members/{member_id}`
- **Parameters:**
  - `member_id` (path, required): Member UUID

**Response:** Action object

---

### Get Member Permissions
- **Method:** `GET`
- **Endpoint:** `/workspace/members/{member_id}/permissions`
- **Parameters:**
  - `member_id` (path, required): Member UUID
  - `product` (optional): POOL, ENERGY, etc.
  - `site_id` (optional): Filter by site UUID
  - `subaccount_id` (optional): Filter by subaccount ID
  - `page_number` (optional): Default 1
  - `page_size` (optional): Default 10

**Response:**
```json
{
  "permissions": [
    {
      "id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
      "product": "POOL",
      "site": {
        "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
        "name": "My Site"
      },
      "subaccount": {
        "id": 0,
        "name": "my_subaccount",
        "site": {
          "id": "b0a5fad8-0e09-4f10-ac20-ccd80fb2d138",
          "name": "My Site"
        },
        "created_at": "2019-08-24T14:15:22Z",
        "url": "string"
      },
      "role": "VIEWER",
      "created_at": "2019-08-24T14:15:22Z"
    }
  ],
  "pagination": {
    "page_number": 1,
    "page_size": 1,
    "item_count": 0
  }
}
```

---

### Get Single Permission
- **Method:** `GET`
- **Endpoint:** `/workspace/members/{member_id}/permissions/{permission_id}`
- **Parameters:**
  - `member_id` (path, required): Member UUID
  - `permission_id` (path, required): Permission UUID

**Response:** Permission object

---

## Key Changes from V1 to V2

| Feature | V1 | V2 | Notes |
|---------|----|----|-------|
| **Base URL** | `/api/v1` | `/api/v2` | Version upgrade |
| **Organization Unit** | Groups (groupId) | Sites (site_id) | Fundamental restructuring |
| **Subaccount API** | `/pool/groups/{groupId}/subaccounts` | `/pool/subaccounts` | Simplified path, no groupId |
| **List Endpoints** | Uses `group_id` param | Uses `site_id` param | Parameter name change |
| **Response Structure** | Returns `groups` | Returns `sites` | Response object changed |
| **Group Management** | Create/Update/Delete groups | ❌ **Not supported** | Groups completely removed |
| **Payment Settings** | Unchanged paths | Unchanged paths | Same endpoints work |
| **Transactions** | Unchanged paths | Unchanged paths | Same endpoints work |
| **Workers** | Unchanged paths | Support `site_id` filtering | Enhanced filtering |

---

## Implementation Notes

1. **Sites are primary organizational unit** - Groups no longer exist, use sites instead
2. **Subaccount creation requires site_id** - When creating subaccounts, you must specify which site
3. **All responses include site information** - Subaccounts, workers, etc. now include their parent site
4. **Page number and size parameters** - Most endpoints support pagination
5. **Optional timezone handling** - All timestamps are in ISO 8601 format (UTC)

