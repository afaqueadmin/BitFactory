-- AlterTable
ALTER TABLE "miner_hashrate_alert_logs" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedById" TEXT;

-- CreateIndex
CREATE INDEX "miner_hashrate_alert_logs_acknowledgedAt_idx" ON "miner_hashrate_alert_logs"("acknowledgedAt");

-- AddForeignKey
ALTER TABLE "miner_hashrate_alert_logs" ADD CONSTRAINT "miner_hashrate_alert_logs_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
