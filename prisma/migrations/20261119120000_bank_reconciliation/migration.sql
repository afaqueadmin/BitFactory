-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'BANK_RECONCILIATION_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'BANK_RECONCILIATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'BANK_RECONCILIATION_DELETED';

-- CreateTable
CREATE TABLE "accounting_bank_reconciliations" (
    "id" TEXT NOT NULL,
    "entryNumber" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "exchangeRate" DECIMAL(18,8) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "feeUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "pdfKey" TEXT,
    "pdfName" TEXT,
    "sheetKey" TEXT,
    "sheetName" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounting_bank_reconciliations_entryNumber_key" ON "accounting_bank_reconciliations"("entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_bank_reconciliations_invoiceId_key" ON "accounting_bank_reconciliations"("invoiceId");

-- CreateIndex
CREATE INDEX "accounting_bank_reconciliations_bankId_idx" ON "accounting_bank_reconciliations"("bankId");

-- CreateIndex
CREATE INDEX "accounting_bank_reconciliations_currencyId_idx" ON "accounting_bank_reconciliations"("currencyId");

-- CreateIndex
CREATE INDEX "accounting_bank_reconciliations_date_idx" ON "accounting_bank_reconciliations"("date");

-- CreateIndex
CREATE INDEX "accounting_bank_reconciliations_createdBy_idx" ON "accounting_bank_reconciliations"("createdBy");

-- AddForeignKey
ALTER TABLE "accounting_bank_reconciliations" ADD CONSTRAINT "accounting_bank_reconciliations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_bank_reconciliations" ADD CONSTRAINT "accounting_bank_reconciliations_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "accounting_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_bank_reconciliations" ADD CONSTRAINT "accounting_bank_reconciliations_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_bank_reconciliations" ADD CONSTRAINT "accounting_bank_reconciliations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

