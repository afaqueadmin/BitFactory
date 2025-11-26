# Electricity Rates Table - Quick Reference

## Table Name
`electricity_rates`

## Fields
| Field | Type | Notes |
|-------|------|-------|
| `id` | TEXT | Primary key, auto-generated CUID |
| `rate_per_kwh` | DOUBLE PRECISION | Electricity cost per kWh |
| `valid_from` | TIMESTAMP(3) | When this rate becomes effective |
| `created_at` | TIMESTAMP(3) | When record was created |

## Indexes
- `electricity_rates_valid_from_idx` on `valid_from`

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

## Common Queries

### Create Rate
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
const rate = await prisma.electricityRate.findFirst({
  where: { valid_from: { lte: new Date() } },
  orderBy: { valid_from: "desc" },
});
```

### Get All Rates
```prisma
const rates = await prisma.electricityRate.findMany({
  orderBy: { valid_from: "desc" },
});
```

## Migration File
- Location: `prisma/migrations/20251126_add_electricity_rates_table/migration.sql`
- Status: Ready to deploy

## Use Cases
- Store historical electricity rates
- Calculate electricity charges based on rates
- Generate accurate billing statements
- Track rate changes over time
- Support rate versioning

## Notes
- Multiple rates can be active at different time periods
- Query by `valid_from` to find applicable rate for any date
- Index ensures efficient lookups
- Append-only pattern (rates are immutable once created)

