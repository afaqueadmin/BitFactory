-- CreateEnum
CREATE TYPE "BtcpayStatus" AS ENUM ('New', 'Processing', 'Settled', 'Expired', 'Invalid');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "btcpayInvoiceId" TEXT,
ADD COLUMN     "btcpayStatus" "BtcpayStatus",
ADD COLUMN     "btcpayCheckoutUrl" TEXT,
ADD COLUMN     "btcpayCreatedAt" TIMESTAMP(3),
ADD COLUMN     "btcpaySettledAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_btcpayInvoiceId_key" ON "invoices"("btcpayInvoiceId");

-- CreateIndex
CREATE INDEX "invoices_btcpayInvoiceId_idx" ON "invoices"("btcpayInvoiceId");
