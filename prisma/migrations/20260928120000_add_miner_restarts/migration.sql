-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'MINER_RESTARTED';

-- CreateTable
CREATE TABLE "miner_restarts" (
    "id" TEXT NOT NULL,
    "minerId" TEXT NOT NULL,
    "alertId" TEXT,
    "restartedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miner_restarts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "miner_restarts_minerId_restartedAt_idx" ON "miner_restarts"("minerId", "restartedAt" DESC);

-- CreateIndex
CREATE INDEX "miner_restarts_alertId_idx" ON "miner_restarts"("alertId");

-- CreateIndex
CREATE INDEX "miner_restarts_createdById_idx" ON "miner_restarts"("createdById");

-- AddForeignKey
ALTER TABLE "miner_restarts" ADD CONSTRAINT "miner_restarts_minerId_fkey" FOREIGN KEY ("minerId") REFERENCES "miners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_restarts" ADD CONSTRAINT "miner_restarts_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "miner_hashrate_alert_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_restarts" ADD CONSTRAINT "miner_restarts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
