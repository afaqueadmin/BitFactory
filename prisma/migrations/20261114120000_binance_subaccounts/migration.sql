-- CreateTable
CREATE TABLE "binance_subaccounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "binanceSubaccountEmail" TEXT NOT NULL,
    "coin" TEXT NOT NULL DEFAULT 'USDT',
    "TRXAddress" TEXT,
    "ETHAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "binance_subaccounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "binance_subaccounts_userId_idx" ON "binance_subaccounts"("userId");

-- CreateIndex
CREATE INDEX "binance_subaccounts_createdBy_idx" ON "binance_subaccounts"("createdBy");

-- CreateIndex
CREATE INDEX "binance_subaccounts_updatedBy_idx" ON "binance_subaccounts"("updatedBy");

-- CreateIndex
CREATE UNIQUE INDEX "binance_subaccounts_binanceSubaccountEmail_coin_key" ON "binance_subaccounts"("binanceSubaccountEmail", "coin");

-- AddForeignKey
ALTER TABLE "binance_subaccounts" ADD CONSTRAINT "binance_subaccounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "binance_subaccounts" ADD CONSTRAINT "binance_subaccounts_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "binance_subaccounts" ADD CONSTRAINT "binance_subaccounts_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

