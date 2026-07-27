-- Drop the DB-level default on users.invoicedAmount; the default is now
-- managed at the application layer via payback_config.defaultInvoicedAmount
ALTER TABLE "users" ALTER COLUMN "invoicedAmount" DROP DEFAULT;

-- AddColumn defaultInvoicedAmount to payback_config
ALTER TABLE "payback_config" ADD COLUMN "defaultInvoicedAmount" DECIMAL(12, 2) NOT NULL DEFAULT 4250;
