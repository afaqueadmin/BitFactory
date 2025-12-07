# Hardware Table Implementation - Status Report

## Completed ✅

### 1. Database Schema (prisma/schema.prisma)
- ✅ Created new Hardware model with:
  - id (String, UUID)
  - model (String, unique)
  - powerUsage (Float in kW)
  - hashRate (Decimal)
  - One-to-many relation to Miner
- ✅ Updated Miner model to:
  - Remove: model, powerUsage, hashRate fields
  - Add: hardwareId (String FK)
  - Add: hardware relation

### 2. Hardware API Routes
- ✅ **GET /api/hardware** - List all hardware models (public access)
- ✅ **POST /api/hardware** - Create new hardware (admin only)
- ✅ **PUT /api/hardware/[id]** - Update hardware (admin only)
- ✅ **DELETE /api/hardware/[id]** - Delete hardware with validation (admin only)
  - Cannot delete if miners are using the hardware

### 3. Hardware Management Page
- ✅ Created `/src/app/(manage)/hardware/page.tsx`
- ✅ CRUD interface with:
  - Table displaying all hardware
  - Summary stats (count, avg power, avg hashrate)
  - Add Hardware button + modal form
  - Edit functionality
  - Delete with confirmation dialog

### 4. Admin Sidebar
- ✅ Added "Hardware Models" link after "Locations"
- ✅ Points to `/hardware` route

### 5. MinerFormModal Component Updates
- ✅ Replaced 3 input fields (model, powerUsage, hashRate) with:
  - Hardware Model dropdown (fetches from /api/hardware)
  - Auto-populated, disabled Power Usage field (read-only)
  - Auto-populated, disabled Hash Rate field (read-only)
- ✅ Updated form data structure to use hardwareId FK
- ✅ Form submission updated to send only: name, hardwareId, userId, spaceId, status

### 6. Machine API Routes (Partial)
- ✅ **POST /api/machine** - Updated to:
  - Accept: name, hardwareId, userId, spaceId, status
  - Reject: model, powerUsage, hashRate fields
  - Validate hardwareId exists
  - Include hardware in response
- ✅ **GET /api/machine** - Updated to:
  - Include hardware relation in SELECT
- ✅ **PUT /api/machine/[id]** - Updated to:
  - Accept hardwareId for updates
  - Reject model/powerUsage/hashRate updates
  - Validate hardwareId exists
  - Include hardware in response

---

## Still TODO ❌

### 1. Database Migration
**STATUS: Pending** - Cannot run due to database connection issue
- Command: `npx prisma migrate dev --name hardware_table_refactor`
- Required: Network access to database at ep-misty-fog-adaebysj-pooler.c-2.us-east-1.aws.neon.tech
- Once accessible, run migration to:
  - Create hardware table
  - Add hardwareId to miners
  - Migrate existing miner data to hardware records
  - Drop old columns from miners

### 2. Remaining API Route Updates

#### a. **DELETE /api/machine/[id]**
- Update to include hardware in response (already included in find/delete)

#### b. **GET /api/miners/user/route.ts**
- Include hardware relation in SELECT
- Update response mapping if needed

#### c. **GET /api/miners/daily-costs/route.ts**
- Include hardware relation
- **CRITICAL**: Convert watts → kW:
  - Current: `miner.powerUsage * rate * 24`
  - New: `(miner.hardware.powerUsage / 1000) * rate * 24`

#### d. **GET /api/cron_deduct_daily_cost/route.ts**
- Include hardware relation
- **CRITICAL**: Convert watts → kW in cost calculation
- **CRITICAL**: Convert watts → kW in consumption tracking

#### e. **GET /api/spaces/route.ts**
- Optional: Calculate powerUsagePercentage now that hardware data is available
- Currently hardcoded to "0.00"

#### f. **GET /api/admin/dashboard/route.ts**
- Optional: Implement totalPower calculation from miner.hardware.powerUsage

### 3. Frontend Component Updates

#### a. **machine/page.tsx**
- Update Miner interface to use hardwareId + hardware relation
- Update total power calculation to convert kW properly:
  - `miners.reduce((sum, m) => sum + (m.hardware?.powerUsage || 0) / 1000, 0)`
- Update total hashrate calculation

#### b. **MinersTable.tsx**
- Update Miner interface
- Update column displays:
  - model → hardware.model
  - powerUsage → hardware.powerUsage (in watts, display as "W")
  - hashRate → hardware.hashRate

#### c. **HostedMinersList.tsx**
- Update MinerData interface to include hardware relation
- Update display references:
  - miner.model → miner.hardware.model
  - miner.hashRate → miner.hardware.hashRate

#### d. **HostedMinersCard.tsx** (if it exists)
- Update to use hardware relation

#### e. **app/(auth)/miners/page.tsx**
- Update to use hardware relation for miner stats

---

## Important Notes 📝

### Unit Consistency
- **powerUsage in Hardware table**: Float (in kW)
- **Current rate**: Float (per kW)
- **All calculations**: Use Hardware powerUsage directly (already in kW)
- **NO conversion needed** in cost calculations (user specified kW everywhere)

### Data Migration Strategy (for when DB is accessible)
1. Extract unique (model, powerUsage, hashRate) combinations from existing miners
2. Create Hardware records for each unique combination
3. Update miners table with hardwareId mappings
4. Drop old columns from miners table

### Breaking API Changes
- ❌ POST /api/machine now requires `hardwareId` instead of `model, powerUsage, hashRate`
- ❌ PUT /api/machine/[id] no longer accepts `model, powerUsage, hashRate` for updates
- ⚠️ Clients must be updated simultaneously

---

## Next Steps

1. **IMMEDIATE**: Once database is accessible, run Prisma migration
2. **THEN**: Complete remaining API route updates (daily-costs, cron, spaces)
3. **THEN**: Update frontend components (machine page, tables, displays)
4. **TEST**: Create/edit/view miners through the full flow
5. **TEST**: Verify cost calculations are correct
6. **DEPLOY**: Push all changes to GitHub

---

## Files Modified/Created

### Created:
- `src/app/api/hardware/route.ts` - Hardware CRUD
- `src/app/api/hardware/[id]/route.ts` - Hardware GET/PUT/DELETE
- `src/app/(manage)/hardware/page.tsx` - Hardware management UI

### Modified:
- `prisma/schema.prisma` - Added Hardware model, updated Miner
- `src/components/admin/MinerFormModal.tsx` - Complete refactor to use hardware dropdown
- `src/components/admin/AdminSidebar.tsx` - Added Hardware Models link
- `src/app/api/machine/route.ts` - Updated POST/GET to use hardwareId
- `src/app/api/machine/[id]/route.ts` - Updated PUT to use hardwareId

### Still Need to Update:
- `src/app/api/miners/user/route.ts`
- `src/app/api/miners/daily-costs/route.ts` ⚠️ CRITICAL unit conversion
- `src/app/api/cron_deduct_daily_cost/route.ts` ⚠️ CRITICAL unit conversion
- `src/app/api/spaces/route.ts`
- `src/app/(manage)/machine/page.tsx`
- `src/components/admin/MinersTable.tsx`
- `src/components/HostedMinersList.tsx`
- `src/components/HostedMinersCard.tsx`
- `src/app/(auth)/miners/page.tsx`

---

## Configuration Details

### Hardware API Endpoints

**GET /api/hardware**
```json
{
  "success": true,
  "data": [
    {
      "id": "hw1",
      "model": "Bitmain S21 Pro",
      "powerUsage": 3.25,
      "hashRate": 234.5,
      "createdAt": "2025-12-06T...",
      "updatedAt": "2025-12-06T..."
    }
  ]
}
```

**POST /api/hardware**
```json
{
  "model": "Bitmain S21 Pro",
  "powerUsage": 3.25,
  "hashRate": 234.5
}
```

**PUT /api/hardware/[id]**
```json
{
  "model": "Bitmain S21 Pro",
  "powerUsage": 3.25,
  "hashRate": 234.5
}
```

### Machine API Changes

**Old POST /api/machine**
```json
{
  "name": "Miner-001",
  "model": "Bitmain S21 Pro",
  "powerUsage": 3.25,
  "hashRate": 234.5,
  "userId": "user1",
  "spaceId": "space1",
  "status": "ACTIVE"
}
```

**New POST /api/machine**
```json
{
  "name": "Miner-001",
  "hardwareId": "hw1",
  "userId": "user1",
  "spaceId": "space1",
  "status": "ACTIVE"
}
```

---

Generated: 2025-12-06
Implementation Status: ~60% Complete (Schema, API Routes, UI mostly done; remaining: DB migration, frontend updates, unit conversion fixes)
