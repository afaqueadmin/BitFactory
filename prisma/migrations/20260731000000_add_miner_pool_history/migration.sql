-- CreateTable
CREATE TABLE "miner_pool_history" (
    "id" TEXT NOT NULL,
    "minerId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miner_pool_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "miner_pool_history_minerId_idx" ON "miner_pool_history"("minerId");

-- CreateIndex
CREATE INDEX "miner_pool_history_poolId_idx" ON "miner_pool_history"("poolId");

-- CreateIndex
CREATE INDEX "miner_pool_history_createdById_idx" ON "miner_pool_history"("createdById");

-- AddForeignKey
ALTER TABLE "miner_pool_history" ADD CONSTRAINT "miner_pool_history_minerId_fkey" FOREIGN KEY ("minerId") REFERENCES "miners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_pool_history" ADD CONSTRAINT "miner_pool_history_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_pool_history" ADD CONSTRAINT "miner_pool_history_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

