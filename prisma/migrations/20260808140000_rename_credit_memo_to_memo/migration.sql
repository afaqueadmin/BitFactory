-- Rename CreditMemo -> Memo throughout (table, columns, enums, indexes,
-- constraints) using RENAME statements only, so existing rows/data are
-- preserved untouched - no drop/recreate.

-- Rename enums
ALTER TYPE "CreditMemoCategory" RENAME TO "MemoCategory";
ALTER TYPE "CreditMemoType" RENAME TO "MemoType";
ALTER TYPE "CreditMemoStatus" RENAME TO "MemoStatus";

-- Rename table
ALTER TABLE "credit_memos" RENAME TO "memos";

-- Rename columns
ALTER TABLE "memos" RENAME COLUMN "creditMemoNumber" TO "memoNumber";
ALTER TABLE "cost_payments" RENAME COLUMN "creditMemoId" TO "memoId";

-- Rename constraints/indexes on memos
ALTER TABLE "memos" RENAME CONSTRAINT "credit_memos_pkey" TO "memos_pkey";
ALTER INDEX "credit_memos_creditMemoNumber_key" RENAME TO "memos_memoNumber_key";
ALTER INDEX "credit_memos_userId_idx" RENAME TO "memos_userId_idx";
ALTER INDEX "credit_memos_invoiceId_idx" RENAME TO "memos_invoiceId_idx";
ALTER INDEX "credit_memos_category_idx" RENAME TO "memos_category_idx";
ALTER INDEX "credit_memos_status_idx" RENAME TO "memos_status_idx";
ALTER INDEX "credit_memos_createdAt_idx" RENAME TO "memos_createdAt_idx";
ALTER TABLE "memos" RENAME CONSTRAINT "credit_memos_userId_fkey" TO "memos_userId_fkey";
ALTER TABLE "memos" RENAME CONSTRAINT "credit_memos_invoiceId_fkey" TO "memos_invoiceId_fkey";
ALTER TABLE "memos" RENAME CONSTRAINT "credit_memos_createdBy_fkey" TO "memos_createdBy_fkey";
ALTER TABLE "memos" RENAME CONSTRAINT "credit_memos_voidedBy_fkey" TO "memos_voidedBy_fkey";

-- Rename constraints/indexes on cost_payments referencing memos
ALTER INDEX "cost_payments_creditMemoId_idx" RENAME TO "cost_payments_memoId_idx";
ALTER TABLE "cost_payments" RENAME CONSTRAINT "cost_payments_creditMemoId_fkey" TO "cost_payments_memoId_fkey";

-- New: transfer pairing (internal-transfer flow links two memos together)
ALTER TABLE "memos" ADD COLUMN "pairedMemoId" TEXT;
CREATE INDEX "memos_pairedMemoId_idx" ON "memos"("pairedMemoId");
ALTER TABLE "memos" ADD CONSTRAINT "memos_pairedMemoId_fkey" FOREIGN KEY ("pairedMemoId") REFERENCES "memos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rename AuditAction enum values (RENAME VALUE, unlike ADD VALUE, is safe
-- to use in the same transaction as other schema changes)
ALTER TYPE "AuditAction" RENAME VALUE 'CREDIT_MEMO_CREATED' TO 'MEMO_CREATED';
ALTER TYPE "AuditAction" RENAME VALUE 'CREDIT_MEMO_SENT' TO 'MEMO_SENT';
ALTER TYPE "AuditAction" RENAME VALUE 'CREDIT_MEMO_VOIDED' TO 'MEMO_VOIDED';
