-- AlterTable
ALTER TABLE "pool_worker_daily_metrics" ALTER COLUMN "staleShares" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "rejectedShares" SET DATA TYPE DECIMAL(65,30);
