-- Rename machineCapitalCost to s21proMachineCost and add a separate
-- s21xpMachineCost column so machine capital cost can be tracked per miner model.

ALTER TABLE "payback_config" RENAME COLUMN "machineCapitalCost" TO "s21proMachineCost";

ALTER TABLE "payback_config" ADD COLUMN "s21xpMachineCost" NUMERIC(12, 2);

-- Backfill existing rows so s21xpMachineCost starts equal to the S21 Pro cost;
-- admins can adjust it afterwards via the settings pages.
UPDATE "payback_config" SET "s21xpMachineCost" = "s21proMachineCost";

ALTER TABLE "payback_config" ALTER COLUMN "s21xpMachineCost" SET NOT NULL;
