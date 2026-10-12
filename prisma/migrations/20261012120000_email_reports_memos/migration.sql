-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailRunKind" ADD VALUE 'MEMO';
ALTER TYPE "EmailRunKind" ADD VALUE 'MEMO_VOID';

-- AlterTable
ALTER TABLE "email_send_results" ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "memoId" TEXT,
ALTER COLUMN "invoiceId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "email_send_results_memoId_idx" ON "email_send_results"("memoId");

-- AddForeignKey
ALTER TABLE "email_send_results" ADD CONSTRAINT "email_send_results_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "memos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

