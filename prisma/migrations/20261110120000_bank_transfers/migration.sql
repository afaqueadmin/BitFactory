-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'BANK_TRANSFER_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'BANK_TRANSFER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'BANK_TRANSFER_DELETED';

-- CreateTable
CREATE TABLE "accounting_bank_transfers" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fromBankId" TEXT NOT NULL,
    "fromCurrencyId" TEXT NOT NULL,
    "fromAmount" DECIMAL(18,2) NOT NULL,
    "fromFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "fromExchangeRate" DECIMAL(18,8) NOT NULL,
    "toBankId" TEXT NOT NULL,
    "toCurrencyId" TEXT NOT NULL,
    "conversionRate" DECIMAL(18,8) NOT NULL,
    "toAmount" DECIMAL(18,2) NOT NULL,
    "toFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "toExchangeRate" DECIMAL(18,8) NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "fromFeeUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "toFeeUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reference" TEXT,
    "note" TEXT,
    "receiptKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_bank_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_bank_transfers_fromBankId_idx" ON "accounting_bank_transfers"("fromBankId");

-- CreateIndex
CREATE INDEX "accounting_bank_transfers_toBankId_idx" ON "accounting_bank_transfers"("toBankId");

-- CreateIndex
CREATE INDEX "accounting_bank_transfers_fromCurrencyId_idx" ON "accounting_bank_transfers"("fromCurrencyId");

-- CreateIndex
CREATE INDEX "accounting_bank_transfers_toCurrencyId_idx" ON "accounting_bank_transfers"("toCurrencyId");

-- CreateIndex
CREATE INDEX "accounting_bank_transfers_date_idx" ON "accounting_bank_transfers"("date");

-- AddForeignKey
ALTER TABLE "accounting_bank_transfers" ADD CONSTRAINT "accounting_bank_transfers_fromBankId_fkey" FOREIGN KEY ("fromBankId") REFERENCES "accounting_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_bank_transfers" ADD CONSTRAINT "accounting_bank_transfers_toBankId_fkey" FOREIGN KEY ("toBankId") REFERENCES "accounting_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_bank_transfers" ADD CONSTRAINT "accounting_bank_transfers_fromCurrencyId_fkey" FOREIGN KEY ("fromCurrencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_bank_transfers" ADD CONSTRAINT "accounting_bank_transfers_toCurrencyId_fkey" FOREIGN KEY ("toCurrencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_bank_transfers" ADD CONSTRAINT "accounting_bank_transfers_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

