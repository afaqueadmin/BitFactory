ALTER TABLE users DROP COLUMN IF EXISTS "invoicedAmount";

-- AddColumn invoicedAmount to users
ALTER TABLE "users" ADD COLUMN "invoicedAmount" DECIMAL(12, 2) NOT NULL DEFAULT 4250;

