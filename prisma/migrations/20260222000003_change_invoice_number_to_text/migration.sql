-- AlterColumn invoiceNumber in vendor_invoices to TEXT and add UNIQUE INDEX
ALTER TABLE "vendor_invoices" ALTER COLUMN "invoiceNumber" SET DATA TYPE TEXT;

DROP INDEX IF EXISTS "vendor_invoices_invoiceNumber_key";
-- CreateIndex for unique invoiceNumber
CREATE UNIQUE INDEX "vendor_invoices_invoiceNumber_key" ON "vendor_invoices"("invoiceNumber");

