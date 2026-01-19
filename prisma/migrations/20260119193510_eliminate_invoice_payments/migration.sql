-- Drop invoice_payments table (old junction table)
ALTER TABLE "invoice_payments" DROP CONSTRAINT "invoice_payments_costPaymentId_fkey";
ALTER TABLE "invoice_payments" DROP CONSTRAINT "invoice_payments_invoiceId_fkey";
DROP INDEX IF EXISTS "invoice_payments_costPaymentId_idx";
DROP INDEX IF EXISTS "invoice_payments_invoiceId_idx";
DROP INDEX IF EXISTS "invoice_payments_invoiceId_costPaymentId_key";
DROP TABLE "invoice_payments";

-- Add invoiceId column to cost_payments table
ALTER TABLE "cost_payments" ADD COLUMN "invoiceId" TEXT;

-- Add indexes for performance
CREATE INDEX "cost_payments_invoiceId_idx" ON "cost_payments"("invoiceId");
CREATE INDEX "cost_payments_createdAt_idx" ON "cost_payments"("createdAt");

-- Add foreign key constraint
ALTER TABLE "cost_payments" ADD CONSTRAINT "cost_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
