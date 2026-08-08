-- AlterTable
ALTER TABLE "cost_payments" ADD COLUMN "creditMemoId" TEXT;

-- CreateIndex
CREATE INDEX "cost_payments_creditMemoId_idx" ON "cost_payments"("creditMemoId");

-- AddForeignKey
ALTER TABLE "cost_payments" ADD CONSTRAINT "cost_payments_creditMemoId_fkey" FOREIGN KEY ("creditMemoId") REFERENCES "credit_memos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
