-- DropForeignKey cost_payments_invoiceId_fkey
-- AddForeignKey cost_payments_invoiceId with ON DELETE CASCADE

ALTER TABLE "cost_payments" DROP CONSTRAINT IF EXISTS "cost_payments_invoiceId_fkey";

ALTER TABLE "cost_payments" ADD CONSTRAINT "cost_payments_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
ON UPDATE CASCADE ON DELETE CASCADE;

