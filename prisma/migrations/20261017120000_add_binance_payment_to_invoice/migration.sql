-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "binanceCheckoutStartedAt" TIMESTAMP(3),
ADD COLUMN     "binanceTxId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_binanceTxId_key" ON "invoices"("binanceTxId");
