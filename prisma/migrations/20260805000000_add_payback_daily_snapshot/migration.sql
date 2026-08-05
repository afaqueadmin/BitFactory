-- CreateTable
CREATE TABLE "payback_daily_snapshot" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "btcCloseUsd" DECIMAL(12,2) NOT NULL,
    "hashpriceBtcPerPhDay" DECIMAL(20,10) NOT NULL,
    "clientS21ProStockBreakeven" DECIMAL(12,2) NOT NULL,
    "clientS21ProCustomBreakeven" DECIMAL(12,2) NOT NULL,
    "clientS21XpStockBreakeven" DECIMAL(12,2) NOT NULL,
    "clientS21XpCustomBreakeven" DECIMAL(12,2) NOT NULL,
    "companyS21ProStockBreakeven" DECIMAL(12,2) NOT NULL,
    "companyS21ProCustomBreakeven" DECIMAL(12,2) NOT NULL,
    "companyS21XpStockBreakeven" DECIMAL(12,2) NOT NULL,
    "companyS21XpCustomBreakeven" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payback_daily_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payback_daily_snapshot_date_key" ON "payback_daily_snapshot"("date");
