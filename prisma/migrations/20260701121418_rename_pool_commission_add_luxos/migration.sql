-- Rename poolCommission to poolCommissionStockOs and add poolCommissionLuxos

ALTER TABLE "payback_config" RENAME COLUMN "poolCommission" TO "poolCommissionStockOs";

ALTER TABLE "payback_config" ADD COLUMN "poolCommissionLuxos" NUMERIC(5, 2) NOT NULL DEFAULT 2.50;
