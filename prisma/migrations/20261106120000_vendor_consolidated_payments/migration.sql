-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_CONSOLIDATED_PAYMENT_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_CONSOLIDATED_PAYMENT_REMOVED';

-- CreateTable
CREATE TABLE "vendor_consolidated_payments" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL,
    "entityId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "exchangeRate" DECIMAL(18,8) NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "transactionFee" DECIMAL(18,2) NOT NULL,
    "receiptKey" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_consolidated_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_consolidated_payment_items" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "vendorInvoiceId" TEXT,
    "hardwarePurchaseId" TEXT,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_consolidated_payment_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_consolidated_payments_vendorId_idx" ON "vendor_consolidated_payments"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_consolidated_payments_entityId_idx" ON "vendor_consolidated_payments"("entityId");

-- CreateIndex
CREATE INDEX "vendor_consolidated_payments_bankId_idx" ON "vendor_consolidated_payments"("bankId");

-- CreateIndex
CREATE INDEX "vendor_consolidated_payments_currencyId_idx" ON "vendor_consolidated_payments"("currencyId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_consolidated_payment_items_vendorInvoiceId_key" ON "vendor_consolidated_payment_items"("vendorInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_consolidated_payment_items_hardwarePurchaseId_key" ON "vendor_consolidated_payment_items"("hardwarePurchaseId");

-- CreateIndex
CREATE INDEX "vendor_consolidated_payment_items_paymentId_idx" ON "vendor_consolidated_payment_items"("paymentId");

-- AddForeignKey
ALTER TABLE "vendor_consolidated_payments" ADD CONSTRAINT "vendor_consolidated_payments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "accounting_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_consolidated_payments" ADD CONSTRAINT "vendor_consolidated_payments_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "accounting_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_consolidated_payments" ADD CONSTRAINT "vendor_consolidated_payments_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "accounting_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_consolidated_payments" ADD CONSTRAINT "vendor_consolidated_payments_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_consolidated_payments" ADD CONSTRAINT "vendor_consolidated_payments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_consolidated_payment_items" ADD CONSTRAINT "vendor_consolidated_payment_items_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "vendor_consolidated_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_consolidated_payment_items" ADD CONSTRAINT "vendor_consolidated_payment_items_vendorInvoiceId_fkey" FOREIGN KEY ("vendorInvoiceId") REFERENCES "vendor_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_consolidated_payment_items" ADD CONSTRAINT "vendor_consolidated_payment_items_hardwarePurchaseId_fkey" FOREIGN KEY ("hardwarePurchaseId") REFERENCES "hardware_purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

