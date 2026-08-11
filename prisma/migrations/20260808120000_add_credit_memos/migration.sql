-- CreateEnum
CREATE TYPE "CreditMemoCategory" AS ENUM ('HOSTING', 'HARDWARE');

-- CreateEnum
CREATE TYPE "CreditMemoType" AS ENUM ('CUSTOMER_FACING', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CreditMemoStatus" AS ENUM ('ISSUED', 'VOIDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CREDIT_MEMO_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CREDIT_MEMO_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'CREDIT_MEMO_VOIDED';

-- CreateTable
CREATE TABLE "credit_memos" (
    "id" TEXT NOT NULL,
    "creditMemoNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "category" "CreditMemoCategory" NOT NULL,
    "memoType" "CreditMemoType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CreditMemoStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "voidedBy" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_memos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_memos_creditMemoNumber_key" ON "credit_memos"("creditMemoNumber");

-- CreateIndex
CREATE INDEX "credit_memos_userId_idx" ON "credit_memos"("userId");

-- CreateIndex
CREATE INDEX "credit_memos_invoiceId_idx" ON "credit_memos"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_memos_category_idx" ON "credit_memos"("category");

-- CreateIndex
CREATE INDEX "credit_memos_status_idx" ON "credit_memos"("status");

-- CreateIndex
CREATE INDEX "credit_memos_createdAt_idx" ON "credit_memos"("createdAt");

-- AddForeignKey
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_voidedBy_fkey" FOREIGN KEY ("voidedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
