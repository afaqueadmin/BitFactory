-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'INCOME_HEAD_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'INCOME_HEAD_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'INCOME_HEAD_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'INCOME_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'INCOME_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'INCOME_DELETED';

-- CreateTable
CREATE TABLE "accounting_income_heads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_income_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_incomes" (
    "id" TEXT NOT NULL,
    "entryNumber" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "headId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "exchangeRate" DECIMAL(18,8) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "feeUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "receivedFrom" TEXT,
    "narration" TEXT,
    "pdfKey" TEXT,
    "pdfName" TEXT,
    "sheetKey" TEXT,
    "sheetName" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounting_income_heads_name_key" ON "accounting_income_heads"("name");

-- CreateIndex
CREATE INDEX "accounting_income_heads_createdBy_idx" ON "accounting_income_heads"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_incomes_entryNumber_key" ON "accounting_incomes"("entryNumber");

-- CreateIndex
CREATE INDEX "accounting_incomes_headId_idx" ON "accounting_incomes"("headId");

-- CreateIndex
CREATE INDEX "accounting_incomes_bankId_idx" ON "accounting_incomes"("bankId");

-- CreateIndex
CREATE INDEX "accounting_incomes_currencyId_idx" ON "accounting_incomes"("currencyId");

-- CreateIndex
CREATE INDEX "accounting_incomes_date_idx" ON "accounting_incomes"("date");

-- CreateIndex
CREATE INDEX "accounting_incomes_createdBy_idx" ON "accounting_incomes"("createdBy");

-- AddForeignKey
ALTER TABLE "accounting_income_heads" ADD CONSTRAINT "accounting_income_heads_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_incomes" ADD CONSTRAINT "accounting_incomes_headId_fkey" FOREIGN KEY ("headId") REFERENCES "accounting_income_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_incomes" ADD CONSTRAINT "accounting_incomes_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "accounting_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_incomes" ADD CONSTRAINT "accounting_incomes_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_incomes" ADD CONSTRAINT "accounting_incomes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

