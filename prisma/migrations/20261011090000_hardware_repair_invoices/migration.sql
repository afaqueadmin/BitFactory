-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'HARDWARE_REPAIR';

-- AlterEnum
ALTER TYPE "InvoiceType" ADD VALUE 'HARDWARE_REPAIR';

-- AlterEnum
ALTER TYPE "InvoiceLineItemType" ADD VALUE 'REPAIR';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "minerId" TEXT;

-- AlterTable
ALTER TABLE "miner_repair_notes" ADD COLUMN     "invoiceId" TEXT;

-- CreateIndex
CREATE INDEX "invoices_minerId_idx" ON "invoices"("minerId");

-- CreateIndex
CREATE UNIQUE INDEX "miner_repair_notes_invoiceId_key" ON "miner_repair_notes"("invoiceId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_minerId_fkey" FOREIGN KEY ("minerId") REFERENCES "miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_repair_notes" ADD CONSTRAINT "miner_repair_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

