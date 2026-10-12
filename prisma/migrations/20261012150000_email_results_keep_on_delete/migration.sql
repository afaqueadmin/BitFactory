-- DropForeignKey
ALTER TABLE "email_send_results" DROP CONSTRAINT "email_send_results_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "email_send_results" DROP CONSTRAINT "email_send_results_memoId_fkey";

-- AddForeignKey
ALTER TABLE "email_send_results" ADD CONSTRAINT "email_send_results_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send_results" ADD CONSTRAINT "email_send_results_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "memos"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: every existing invoice row records its invoice number, so it
-- stays identifiable if the invoice is later deleted.
UPDATE "email_send_results" AS r SET "documentNumber" = i."invoiceNumber" FROM "invoices" AS i WHERE r."invoiceId" = i."id" AND r."documentNumber" IS NULL;
