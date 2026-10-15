-- AlterEnum
ALTER TYPE "InvoiceLineItemType" ADD VALUE 'DISCOUNT';

-- AlterTable
ALTER TABLE "invoice_line_items" ADD COLUMN     "parentLineItemId" TEXT;

-- CreateIndex
CREATE INDEX "invoice_line_items_parentLineItemId_idx" ON "invoice_line_items"("parentLineItemId");

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_parentLineItemId_fkey" FOREIGN KEY ("parentLineItemId") REFERENCES "invoice_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
