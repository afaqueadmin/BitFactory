-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_INVOICE_PAID';
ALTER TYPE "AuditAction" ADD VALUE 'HARDWARE_PURCHASE_INVOICE_PAID';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_ENTITY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_ENTITY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_ENTITY_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_BANK_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_BANK_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_BANK_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_CURRENCY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_CURRENCY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_CURRENCY_DELETED';

-- AlterTable
ALTER TABLE "vendor_invoices" ADD COLUMN     "invoicePdfKey" TEXT,
ADD COLUMN     "paymentAmount" DECIMAL(18,2),
ADD COLUMN     "paymentAmountUsd" DECIMAL(12,2),
ADD COLUMN     "paymentBankId" TEXT,
ADD COLUMN     "paymentCurrencyId" TEXT,
ADD COLUMN     "paymentEntityId" TEXT,
ADD COLUMN     "paymentExchangeRate" DECIMAL(18,8),
ADD COLUMN     "paymentReceiptKey" TEXT,
ADD COLUMN     "transactionFee" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "hardware_purchase_invoices" ADD COLUMN     "invoicePdfKey" TEXT,
ADD COLUMN     "paymentAmount" DECIMAL(18,2),
ADD COLUMN     "paymentAmountUsd" DECIMAL(12,2),
ADD COLUMN     "paymentBankId" TEXT,
ADD COLUMN     "paymentCurrencyId" TEXT,
ADD COLUMN     "paymentEntityId" TEXT,
ADD COLUMN     "paymentExchangeRate" DECIMAL(18,8),
ADD COLUMN     "paymentReceiptKey" TEXT,
ADD COLUMN     "transactionFee" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "accounting_entities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_banks" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_currencies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_bank_currencies" (
    "bankId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,

    CONSTRAINT "accounting_bank_currencies_pkey" PRIMARY KEY ("bankId","currencyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounting_entities_name_key" ON "accounting_entities"("name");

-- CreateIndex
CREATE INDEX "accounting_entities_createdBy_idx" ON "accounting_entities"("createdBy");

-- CreateIndex
CREATE INDEX "accounting_banks_createdBy_idx" ON "accounting_banks"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_banks_entityId_name_key" ON "accounting_banks"("entityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_currencies_code_key" ON "accounting_currencies"("code");

-- CreateIndex
CREATE INDEX "accounting_bank_currencies_currencyId_idx" ON "accounting_bank_currencies"("currencyId");

-- CreateIndex
CREATE INDEX "vendor_invoices_paymentEntityId_idx" ON "vendor_invoices"("paymentEntityId");

-- CreateIndex
CREATE INDEX "vendor_invoices_paymentBankId_idx" ON "vendor_invoices"("paymentBankId");

-- CreateIndex
CREATE INDEX "vendor_invoices_paymentCurrencyId_idx" ON "vendor_invoices"("paymentCurrencyId");

-- CreateIndex
CREATE INDEX "hardware_purchase_invoices_paymentEntityId_idx" ON "hardware_purchase_invoices"("paymentEntityId");

-- CreateIndex
CREATE INDEX "hardware_purchase_invoices_paymentBankId_idx" ON "hardware_purchase_invoices"("paymentBankId");

-- CreateIndex
CREATE INDEX "hardware_purchase_invoices_paymentCurrencyId_idx" ON "hardware_purchase_invoices"("paymentCurrencyId");

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_paymentEntityId_fkey" FOREIGN KEY ("paymentEntityId") REFERENCES "accounting_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_paymentBankId_fkey" FOREIGN KEY ("paymentBankId") REFERENCES "accounting_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_paymentCurrencyId_fkey" FOREIGN KEY ("paymentCurrencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_purchase_invoices" ADD CONSTRAINT "hardware_purchase_invoices_paymentEntityId_fkey" FOREIGN KEY ("paymentEntityId") REFERENCES "accounting_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_purchase_invoices" ADD CONSTRAINT "hardware_purchase_invoices_paymentBankId_fkey" FOREIGN KEY ("paymentBankId") REFERENCES "accounting_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_purchase_invoices" ADD CONSTRAINT "hardware_purchase_invoices_paymentCurrencyId_fkey" FOREIGN KEY ("paymentCurrencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entities" ADD CONSTRAINT "accounting_entities_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_banks" ADD CONSTRAINT "accounting_banks_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "accounting_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_banks" ADD CONSTRAINT "accounting_banks_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_bank_currencies" ADD CONSTRAINT "accounting_bank_currencies_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "accounting_banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_bank_currencies" ADD CONSTRAINT "accounting_bank_currencies_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

