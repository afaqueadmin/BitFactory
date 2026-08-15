-- DropIndex
DROP INDEX "pool_transactions_poolId_externalTransactionId_key";

-- DropIndex
DROP INDEX "pool_transactions_poolSubaccountId_idx";

-- AlterTable
ALTER TABLE "pool_transactions" ALTER COLUMN "externalTransactionId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "pool_transactions_poolId_idx" ON "pool_transactions"("poolId");

-- CreateIndex
CREATE INDEX "pool_transactions_externalTransactionId_idx" ON "pool_transactions"("externalTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "pool_transactions_poolSubaccountId_occurredAt_category_tran_key" ON "pool_transactions"("poolSubaccountId", "occurredAt", "category", "transactionType", "amount");

