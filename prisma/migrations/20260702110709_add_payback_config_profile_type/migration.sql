-- Add profileType to payback_config to support multiple config profiles (client vs company self-mining)

CREATE TYPE "PaybackProfileType" AS ENUM ('CLIENT', 'COMPANY');

ALTER TABLE "payback_config" ADD COLUMN "profileType" "PaybackProfileType" NOT NULL DEFAULT 'CLIENT';

CREATE UNIQUE INDEX "payback_config_profileType_key" ON "payback_config"("profileType");

-- Seed a COMPANY profile row with placeholder values (edit via company settings page)
INSERT INTO "payback_config" (
  "profileType", "hostingCharges", "monthlyInvoicingAmount", "powerConsumption",
  "machineCapitalCost", "poolCommissionStockOs", "poolCommissionLuxos",
  "s21proHashrateStockOs", "s21proHashrateLuxos", "s21xpHashrateStockOs", "s21xpHashrateLuxos",
  "breakevenBtcPrice", "createdAt", "updatedAt"
) VALUES (
  'COMPANY', 0.06300, 199.05, 3.5000,
  4050.95, 2.50, 2.50,
  236.00, 252.00, 236.00, 252.00,
  63500.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
