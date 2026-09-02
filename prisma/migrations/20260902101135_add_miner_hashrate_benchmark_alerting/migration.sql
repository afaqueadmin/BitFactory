-- CreateTable
CREATE TABLE "miner_hashrate_benchmarks" (
    "id" TEXT NOT NULL,
    "minerId" TEXT NOT NULL,
    "benchmarkHashrate" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "miner_hashrate_benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "miner_hashrate_alert_logs" (
    "id" TEXT NOT NULL,
    "minerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "actualHashrate" DECIMAL(10,2) NOT NULL,
    "benchmarkHashrate" DECIMAL(10,2) NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miner_hashrate_alert_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "miner_hashrate_benchmarks_minerId_idx" ON "miner_hashrate_benchmarks"("minerId");

-- CreateIndex
CREATE INDEX "miner_hashrate_benchmarks_minerId_createdAt_idx" ON "miner_hashrate_benchmarks"("minerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "miner_hashrate_alert_logs_minerId_idx" ON "miner_hashrate_alert_logs"("minerId");

-- CreateIndex
CREATE UNIQUE INDEX "miner_hashrate_alert_logs_minerId_date_key" ON "miner_hashrate_alert_logs"("minerId", "date");

-- AddForeignKey
ALTER TABLE "miner_hashrate_benchmarks" ADD CONSTRAINT "miner_hashrate_benchmarks_minerId_fkey" FOREIGN KEY ("minerId") REFERENCES "miners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_hashrate_benchmarks" ADD CONSTRAINT "miner_hashrate_benchmarks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_hashrate_alert_logs" ADD CONSTRAINT "miner_hashrate_alert_logs_minerId_fkey" FOREIGN KEY ("minerId") REFERENCES "miners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
