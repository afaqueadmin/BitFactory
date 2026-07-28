-- AlterTable
ALTER TABLE "cost_payments" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "cost_payments_isDeleted_idx" ON "cost_payments"("isDeleted");
