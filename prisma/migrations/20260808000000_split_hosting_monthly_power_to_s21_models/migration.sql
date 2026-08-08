-- Split hostingCharges, monthlyInvoicingAmount, and powerConsumption on
-- payback_config into per-miner-model (S21 Pro / S21 XP) variants, mirroring
-- the machineCapitalCost -> s21proMachineCost/s21xpMachineCost precedent
-- (20260703000000_rename_machine_cost_to_s21_models). Split by miner model
-- only, not by OS type.

-- hostingCharges
ALTER TABLE "payback_config" RENAME COLUMN "hostingCharges" TO "s21proHostingCharges";
ALTER TABLE "payback_config" ADD COLUMN "s21xpHostingCharges" NUMERIC(10, 5);
UPDATE "payback_config" SET "s21xpHostingCharges" = "s21proHostingCharges";
ALTER TABLE "payback_config" ALTER COLUMN "s21xpHostingCharges" SET NOT NULL;

-- monthlyInvoicingAmount
ALTER TABLE "payback_config" RENAME COLUMN "monthlyInvoicingAmount" TO "s21proMonthlyInvoicingAmount";
ALTER TABLE "payback_config" ADD COLUMN "s21xpMonthlyInvoicingAmount" NUMERIC(12, 2);
UPDATE "payback_config" SET "s21xpMonthlyInvoicingAmount" = "s21proMonthlyInvoicingAmount";
ALTER TABLE "payback_config" ALTER COLUMN "s21xpMonthlyInvoicingAmount" SET NOT NULL;

-- powerConsumption
ALTER TABLE "payback_config" RENAME COLUMN "powerConsumption" TO "s21proPowerConsumption";
ALTER TABLE "payback_config" ADD COLUMN "s21xpPowerConsumption" NUMERIC(10, 4);
UPDATE "payback_config" SET "s21xpPowerConsumption" = "s21proPowerConsumption";
ALTER TABLE "payback_config" ALTER COLUMN "s21xpPowerConsumption" SET NOT NULL;
