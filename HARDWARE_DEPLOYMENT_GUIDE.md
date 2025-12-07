# Hardware Refactoring - Deployment & Testing Guide

## Quick Start - Run Migration

Once database connectivity is restored, run:

```bash
cd /home/sheheryar/Project/API2/BitFactory
npx prisma migrate dev --name hardware_refactor
```

This will:
1. Create `hardware` table in database
2. Migrate `miners` table structure
3. Apply FK constraints
4. Update Prisma client

## Testing Checklist

### 1. Backend API Tests

```bash
# Test 1: Create Hardware Model
curl -X POST http://localhost:3000/api/hardware \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "model": "Bitmain S21 Pro",
    "powerUsage": 3.25,
    "hashRate": 234.5
  }'

# Expected Response:
# { "success": true, "data": { "id": "...", "model": "Bitmain S21 Pro", "powerUsage": 3.25, "hashRate": "234.5" } }

# Test 2: Get All Hardware
curl http://localhost:3000/api/hardware

# Test 3: Create Miner with Hardware
curl -X POST http://localhost:3000/api/machine \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "name": "test-miner-1",
    "hardwareId": "<HARDWARE_ID_FROM_TEST_1>",
    "userId": "<USER_ID>",
    "spaceId": "<SPACE_ID>",
    "status": "ACTIVE"
  }'

# Expected Response: Miner created with hardware relation populated

# Test 4: Get Miners (should include hardware)
curl http://localhost:3000/api/machine

# Test 5: Check Daily Costs (kW calculation)
curl http://localhost:3000/api/miners/daily-costs

# Should show costs calculated with hardware.powerUsage in kW
```

### 2. Frontend Tests

**Admin Hardware Management Page:**
1. Navigate to `/app/(manage)/hardware`
2. Click "Add Hardware"
3. Fill in: Model, Power Usage (kW), Hash Rate (TH/s)
4. Submit
5. Verify hardware appears in table

**Machine Management Page:**
1. Navigate to `/app/(manage)/machine`
2. Click "Add Miner"
3. Select hardware from dropdown (auto-fills power/hash)
4. Fill in remaining fields
5. Submit
6. Verify dashboard stats update

**Hosted Miners List:**
1. Navigate to hosted/mining page
2. Verify miners display with hardware model
3. Check power usage shows in kW
4. Verify hash rate shows in TH/s

### 3. Data Integrity Tests

```sql
-- Connect to database
psql $DATABASE_URL

-- Check hardware table created
SELECT * FROM hardware LIMIT 5;

-- Check miners have hardwareId
SELECT id, name, "hardwareId" FROM miners LIMIT 5;

-- Check FK constraint works
SELECT m.id, m.name, h.model, h."powerUsage", h."hashRate"
FROM miners m
JOIN hardware h ON m."hardwareId" = h.id
LIMIT 10;

-- Verify no orphaned miners
SELECT COUNT(*) FROM miners WHERE "hardwareId" IS NULL;
-- Should return 0
```

### 4. Cost Calculation Tests

```bash
# Verify daily costs use kW (not watts)
# Create miner with known hardware (e.g., 3.25 kW power)
# Wait for cron job or hit endpoint
# Verify calculation: 3.25 * rate_per_kwh * 24

curl http://localhost:3000/api/miners/daily-costs
# Look for: { minerName, powerUsage: 3.25, dailyCost: calculated_value }
```

## API Response Examples

### Create Hardware
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "model": "Bitmain S21 Pro",
    "powerUsage": 3.25,
    "hashRate": "234.5",
    "createdAt": "2024-12-06T17:10:00Z",
    "updatedAt": "2024-12-06T17:10:00Z"
  }
}
```

### Create Miner
```json
{
  "success": true,
  "data": {
    "id": "miner123",
    "name": "test-miner-1",
    "status": "ACTIVE",
    "hardwareId": "hardware123",
    "userId": "user123",
    "spaceId": "space123",
    "createdAt": "2024-12-06T17:10:00Z",
    "updatedAt": "2024-12-06T17:10:00Z",
    "hardware": {
      "id": "hardware123",
      "model": "Bitmain S21 Pro",
      "powerUsage": 3.25,
      "hashRate": "234.5"
    }
  }
}
```

### Get Miners (Daily Costs)
```json
{
  "success": true,
  "data": [
    {
      "minerId": "miner123",
      "minerName": "test-miner-1",
      "minerModel": "Bitmain S21 Pro",
      "powerUsage": 3.25,
      "location": "NY Warehouse",
      "dailyCost": 9.45
    }
  ]
}
```

## Troubleshooting

### Issue: "Property 'hardware' does not exist"
**Solution:** Run `npm install` and `npx prisma generate` to refresh types

### Issue: "Foreign key constraint violation"
**Solution:** Ensure hardware exists before creating miners with hardwareId

### Issue: Cost calculations showing wrong values
**Solution:** Check that hardware.powerUsage is in kW (not watts)
- Debug: `SELECT "powerUsage" FROM hardware LIMIT 1;` should show values like 3.25, not 3250

### Issue: Migration timeout
**Solution:** Check database connectivity - restart Neon or reconnect

## Rollback Procedure

If something goes wrong:

```bash
# Rollback migration
npx prisma migrate resolve --rolled-back hardware_refactor

# Revert code changes
git checkout prisma/schema.prisma src/

# Restart application
npm run dev
```

## Performance Monitoring

After deployment, monitor:
1. Query performance - hardware relation adds small overhead
2. Database connections - verify connection pool not exhausted
3. Cost calculation accuracy - verify no more unit conversion errors
4. Dashboard stats - should now compute correctly from hardware data

## Success Criteria

✅ Migration completes without errors
✅ Hardware CRUD works via UI and API
✅ Miners display with hardware models
✅ Cost calculations use correct kW values
✅ Dashboard stats calculate accurately
✅ No TypeScript compilation errors
✅ All tests pass

---

**Ready to Deploy!** 🚀
