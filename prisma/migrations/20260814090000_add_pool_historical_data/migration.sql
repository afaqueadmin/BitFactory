-- CreateTable
CREATE TABLE "pool_subaccounts" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "subaccountName" TEXT NOT NULL,
    "userId" TEXT,
    "poolAuthId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'BTC',
    "walletAddress" TEXT,
    "paymentFrequency" TEXT,
    "dayOfWeek" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pool_subaccounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_subaccount_daily_snapshots" (
    "id" TEXT NOT NULL,
    "poolSubaccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hashrate" DECIMAL(65,30),
    "efficiency" DECIMAL(65,30),
    "uptime" DECIMAL(65,30),
    "activeWorkers" INTEGER,
    "hashprice" DECIMAL(65,30),
    "balance" DECIMAL(20,8),
    "miningRevenue" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "referralRevenue" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "otherRevenue" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "totalRevenue" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pool_subaccount_daily_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_worker_daily_metrics" (
    "id" TEXT NOT NULL,
    "poolSubaccountId" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "externalWorkerId" TEXT,
    "date" DATE NOT NULL,
    "hashrate" DECIMAL(65,30),
    "efficiency" DECIMAL(65,30),
    "staleShares" INTEGER,
    "rejectedShares" INTEGER,
    "estRevenue" DECIMAL(20,8),
    "firmware" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pool_worker_daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_transactions" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "poolSubaccountId" TEXT NOT NULL,
    "externalTransactionId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "category" TEXT,
    "amount" DECIMAL(20,8) NOT NULL,
    "usdEquivalent" DECIMAL(20,2),
    "addressName" TEXT,
    "status" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pool_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pool_subaccounts_userId_idx" ON "pool_subaccounts"("userId");

-- CreateIndex
CREATE INDEX "pool_subaccounts_poolAuthId_idx" ON "pool_subaccounts"("poolAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "pool_subaccounts_poolId_subaccountName_key" ON "pool_subaccounts"("poolId", "subaccountName");

-- CreateIndex
CREATE INDEX "pool_subaccount_daily_snapshots_date_idx" ON "pool_subaccount_daily_snapshots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "pool_subaccount_daily_snapshots_poolSubaccountId_date_key" ON "pool_subaccount_daily_snapshots"("poolSubaccountId", "date");

-- CreateIndex
CREATE INDEX "pool_worker_daily_metrics_date_idx" ON "pool_worker_daily_metrics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "pool_worker_daily_metrics_poolSubaccountId_workerName_date_key" ON "pool_worker_daily_metrics"("poolSubaccountId", "workerName", "date");

-- CreateIndex
CREATE INDEX "pool_transactions_poolSubaccountId_idx" ON "pool_transactions"("poolSubaccountId");

-- CreateIndex
CREATE INDEX "pool_transactions_occurredAt_idx" ON "pool_transactions"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "pool_transactions_poolId_externalTransactionId_key" ON "pool_transactions"("poolId", "externalTransactionId");

-- AddForeignKey
ALTER TABLE "pool_subaccounts" ADD CONSTRAINT "pool_subaccounts_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_subaccounts" ADD CONSTRAINT "pool_subaccounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_subaccounts" ADD CONSTRAINT "pool_subaccounts_poolAuthId_fkey" FOREIGN KEY ("poolAuthId") REFERENCES "pool_auths"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_subaccount_daily_snapshots" ADD CONSTRAINT "pool_subaccount_daily_snapshots_poolSubaccountId_fkey" FOREIGN KEY ("poolSubaccountId") REFERENCES "pool_subaccounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_worker_daily_metrics" ADD CONSTRAINT "pool_worker_daily_metrics_poolSubaccountId_fkey" FOREIGN KEY ("poolSubaccountId") REFERENCES "pool_subaccounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_transactions" ADD CONSTRAINT "pool_transactions_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_transactions" ADD CONSTRAINT "pool_transactions_poolSubaccountId_fkey" FOREIGN KEY ("poolSubaccountId") REFERENCES "pool_subaccounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

