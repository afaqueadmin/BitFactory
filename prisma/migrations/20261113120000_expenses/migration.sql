-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_HEAD_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_HEAD_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_HEAD_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_PAYMENT_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_PAYMENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_PAYMENT_DELETED';

-- CreateTable
CREATE TABLE "accounting_expense_heads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_expense_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_expenses" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "headId" TEXT NOT NULL,
    "narration" TEXT,
    "pdfKey" TEXT,
    "pdfName" TEXT,
    "sheetKey" TEXT,
    "sheetName" TEXT,
    "amountDueUsd" DECIMAL(12,2) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_expense_payments" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "bankId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "exchangeRate" DECIMAL(18,8) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "feeUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "receiptKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_expense_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounting_expense_heads_name_key" ON "accounting_expense_heads"("name");

-- CreateIndex
CREATE INDEX "accounting_expense_heads_createdBy_idx" ON "accounting_expense_heads"("createdBy");

-- CreateIndex
CREATE INDEX "accounting_expenses_headId_idx" ON "accounting_expenses"("headId");

-- CreateIndex
CREATE INDEX "accounting_expenses_date_idx" ON "accounting_expenses"("date");

-- CreateIndex
CREATE INDEX "accounting_expenses_createdBy_idx" ON "accounting_expenses"("createdBy");

-- CreateIndex
CREATE INDEX "accounting_expense_payments_expenseId_idx" ON "accounting_expense_payments"("expenseId");

-- CreateIndex
CREATE INDEX "accounting_expense_payments_bankId_idx" ON "accounting_expense_payments"("bankId");

-- CreateIndex
CREATE INDEX "accounting_expense_payments_currencyId_idx" ON "accounting_expense_payments"("currencyId");

-- CreateIndex
CREATE INDEX "accounting_expense_payments_date_idx" ON "accounting_expense_payments"("date");

-- CreateIndex
CREATE INDEX "accounting_expense_payments_createdBy_idx" ON "accounting_expense_payments"("createdBy");

-- AddForeignKey
ALTER TABLE "accounting_expense_heads" ADD CONSTRAINT "accounting_expense_heads_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_expenses" ADD CONSTRAINT "accounting_expenses_headId_fkey" FOREIGN KEY ("headId") REFERENCES "accounting_expense_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_expenses" ADD CONSTRAINT "accounting_expenses_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_expense_payments" ADD CONSTRAINT "accounting_expense_payments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "accounting_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_expense_payments" ADD CONSTRAINT "accounting_expense_payments_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "accounting_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_expense_payments" ADD CONSTRAINT "accounting_expense_payments_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_expense_payments" ADD CONSTRAINT "accounting_expense_payments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

