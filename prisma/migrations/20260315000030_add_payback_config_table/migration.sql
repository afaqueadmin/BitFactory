-- CreateTable payback_config

-- 2. Create the table
-- Note: SERIAL automatically creates a sequence and sets it as the default for ID
CREATE TABLE IF NOT EXISTS "payback_config" (
    "id" SERIAL PRIMARY KEY,
    "hostingCharges" NUMERIC(10, 5) NOT NULL,
    "monthlyInvoicingAmount" NUMERIC(12, 2) NOT NULL,
    "powerConsumption" NUMERIC(10, 4) NOT NULL,
    "machineCapitalCost" NUMERIC(12, 2) NOT NULL,
    "poolCommission" NUMERIC(5, 2) NOT NULL,
    "s21proHashrateStockOs" NUMERIC(10, 2) NOT NULL,
    "s21proHashrateLuxos" NUMERIC(10, 2) NOT NULL,
    "breakevenBtcPrice" NUMERIC(12, 2) NOT NULL DEFAULT 63500,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL
    );

-- 3. Redundant Unique Index
-- Postgres creates the "payback_config_pkey" index automatically via the PRIMARY KEY constraint.
-- If you need to manually ensure it exists with that specific name:
CREATE UNIQUE INDEX IF NOT EXISTS "payback_config_pkey"
    ON "payback_config" USING BTREE ("id");