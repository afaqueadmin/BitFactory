-- AlterTable
ALTER TABLE "cost_payments" ADD COLUMN     "bankId" TEXT,
ADD COLUMN     "currencyId" TEXT,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(18,8),
ADD COLUMN     "originalAmount" DECIMAL(18,2),
ADD COLUMN     "paymentDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "cost_payments_entityId_idx" ON "cost_payments"("entityId");

-- CreateIndex
CREATE INDEX "cost_payments_bankId_idx" ON "cost_payments"("bankId");

-- CreateIndex
CREATE INDEX "cost_payments_currencyId_idx" ON "cost_payments"("currencyId");

-- AddForeignKey
ALTER TABLE "cost_payments" ADD CONSTRAINT "cost_payments_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "accounting_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_payments" ADD CONSTRAINT "cost_payments_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "accounting_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_payments" ADD CONSTRAINT "cost_payments_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

