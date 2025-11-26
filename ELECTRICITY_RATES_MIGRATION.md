# Electricity Rates Table Migration

## Overview
Successfully created a new `electricity_rates` table to store electricity rates per kilowatt-hour (kWh) with validity dates.

## Migration Details

### Migration Folder
- **Path**: `prisma/migrations/20251126_add_electricity_rates_table/`
- **SQL File**: `migration.sql`

### Table Schema

#### electricity_rates Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Auto-generated unique identifier (CUID) |
| `rate_per_kwh` | DOUBLE PRECISION | NOT NULL | Electricity rate per kilowatt-hour |
| `valid_from` | TIMESTAMP(3) | NOT NULL | Date when this rate becomes valid |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |

### Indexes
- **valid_from Index**: `electricity_rates_valid_from_idx`
  - Optimizes queries filtering by valid_from date
  - Enables efficient historical rate lookups

## Prisma Model

```prisma
model ElectricityRate {
  id            String        @id @default(cuid())
  rate_per_kwh  Float
  valid_from    DateTime
  created_at    DateTime      @default(now())

  @@index([valid_from])
  @@map("electricity_rates")
}
```

## SQL Migration

```sql
CREATE TABLE "public"."electricity_rates" (
    "id" TEXT NOT NULL,
    "rate_per_kwh" DOUBLE PRECISION NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "electricity_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "electricity_rates_valid_from_idx" ON "public"."electricity_rates"("valid_from");
```

## Usage Examples

### Insert New Rate
```prisma
await prisma.electricityRate.create({
  data: {
    rate_per_kwh: 0.12,
    valid_from: new Date("2025-12-01"),
  },
});
```

### Get Current Rate
```prisma
const currentRate = await prisma.electricityRate.findFirst({
  where: {
    valid_from: {
      lte: new Date(),
    },
  },
  orderBy: {
    valid_from: "desc",
  },
});
```

### Get All Rates
```prisma
const allRates = await prisma.electricityRate.findMany({
  orderBy: {
    valid_from: "desc",
  },
});
```

### Get Rates for Date Range
```prisma
const ratesInRange = await prisma.electricityRate.findMany({
  where: {
    valid_from: {
      gte: new Date("2025-01-01"),
      lte: new Date("2025-12-31"),
    },
  },
  orderBy: {
    valid_from: "asc",
  },
});
```

## Database Integration

### How It Works
1. Rates are stored with a `valid_from` date
2. Multiple rates can exist for different time periods
3. Index on `valid_from` ensures fast lookups
4. Can track rate history and changes over time

### Example Scenario
```
Rate 1: 0.10 USD/kWh valid from 2025-01-01
Rate 2: 0.12 USD/kWh valid from 2025-07-01
Rate 3: 0.15 USD/kWh valid from 2025-12-01

When calculating charges for June 2025, use Rate 1
When calculating charges for October 2025, use Rate 2
```

## Integration Points

This table can be used to:
- **Electricity Charges**: Calculate charges based on consumption and rate
- **Billing**: Generate accurate bills with historical rates
- **Rate Management**: Track rate changes over time
- **Reports**: Generate historical billing reports

## Future API Endpoints

Potential endpoints to create:
- `GET /api/electricity-rates` - Get all rates
- `GET /api/electricity-rates/current` - Get current rate
- `POST /api/electricity-rates` - Create new rate (admin only)
- `PUT /api/electricity-rates/:id` - Update rate (admin only)
- `DELETE /api/electricity-rates/:id` - Delete rate (admin only)

## Migration Status

✅ **SQL Migration Created**: `20251126_add_electricity_rates_table/migration.sql`
✅ **Prisma Model Added**: `ElectricityRate` in schema.prisma
✅ **Index Created**: On `valid_from` field for performance
✅ **TypeScript Verified**: No compilation errors

## Testing

### Manual Testing Steps
1. Run migration: `npx prisma migrate deploy`
2. Check table exists: `SELECT * FROM electricity_rates;`
3. Insert test data
4. Query using Prisma: `await prisma.electricityRate.findMany()`
5. Verify index: `\d electricity_rates` (in psql)

### Example Test Data
```sql
INSERT INTO electricity_rates (id, rate_per_kwh, valid_from, created_at)
VALUES 
  ('rate1', 0.10, '2025-01-01 00:00:00', NOW()),
  ('rate2', 0.12, '2025-07-01 00:00:00', NOW()),
  ('rate3', 0.15, '2025-12-01 00:00:00', NOW());
```

## Performance Considerations

✅ **Indexed valid_from**: Fast date-based lookups
✅ **DOUBLE PRECISION**: Sufficient precision for currency rates
✅ **No Foreign Keys**: Keeps table simple and flexible
✅ **Scalable**: Can handle years of rate history

## Notes

- Rates are immutable once created (follow append-only pattern)
- Use `valid_from` to determine which rate applies at any given time
- `created_at` tracks when the record was added, not when it became valid
- Index on `valid_from` improves query performance for historical lookups

