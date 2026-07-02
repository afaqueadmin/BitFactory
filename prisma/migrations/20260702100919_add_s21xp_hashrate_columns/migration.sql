-- Add S21 XP hashrate columns, backfilled from existing S21 Pro values

ALTER TABLE "payback_config" ADD COLUMN "s21xpHashrateStockOs" NUMERIC(10, 2);
ALTER TABLE "payback_config" ADD COLUMN "s21xpHashrateLuxos" NUMERIC(10, 2);

UPDATE "payback_config"
SET "s21xpHashrateStockOs" = "s21proHashrateStockOs",
    "s21xpHashrateLuxos" = "s21proHashrateLuxos";

ALTER TABLE "payback_config" ALTER COLUMN "s21xpHashrateStockOs" SET NOT NULL;
ALTER TABLE "payback_config" ALTER COLUMN "s21xpHashrateLuxos" SET NOT NULL;
