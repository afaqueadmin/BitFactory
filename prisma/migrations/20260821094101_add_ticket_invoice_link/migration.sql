-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "invoiceId" TEXT;

-- CreateIndex
CREATE INDEX "support_tickets_invoiceId_idx" ON "support_tickets"("invoiceId");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
