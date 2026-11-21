-- AlterTable
ALTER TABLE "binance_subaccounts" ADD COLUMN "lockedAt" TIMESTAMP(3),
ADD COLUMN "lockedBy" TEXT;

-- CreateIndex
CREATE INDEX "binance_subaccounts_lockedAt_idx" ON "binance_subaccounts"("lockedAt");

-- AddForeignKey
ALTER TABLE "binance_subaccounts" ADD CONSTRAINT "binance_subaccounts_lockedBy_fkey" FOREIGN KEY ("lockedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
