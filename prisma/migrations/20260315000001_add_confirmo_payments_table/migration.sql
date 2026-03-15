-- CreateTable confirmo_payments
-- 1. Create ENUM Type safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConfirmoPaymentStatus') THEN
CREATE TYPE "ConfirmoPaymentStatus" AS ENUM (
            'PENDING', 'PROCESSING', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED'
        );
END IF;
END
$$;

-- 2. Clean up existing structures
DROP INDEX IF EXISTS "confirmo_payments_confirmoInvoiceId_idx";
DROP INDEX IF EXISTS "confirmo_payments_confirmoInvoiceId_key";
DROP INDEX IF EXISTS "confirmo_payments_invoiceId_idx";
DROP INDEX IF EXISTS "confirmo_payments_invoiceId_key";
DROP INDEX IF EXISTS "confirmo_payments_status_idx";

-- 3. Create the table
CREATE TABLE IF NOT EXISTS "confirmo_payments" (
   "id" TEXT PRIMARY KEY,
   "invoiceId" TEXT NOT NULL,
   "confirmoInvoiceId" TEXT NOT NULL,
   "paymentUrl" TEXT NOT NULL,
   "amount" NUMERIC(12, 2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "settlementCurrency" TEXT DEFAULT 'USDC',
    "status" "ConfirmoPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" NUMERIC(12, 8),
    "paidCurrency" TEXT,
    "transactionHash" TEXT,
    "confirmedAt" TIMESTAMP,
    "customerEmail" TEXT NOT NULL,
    "notifyEmail" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "expiresAt" TIMESTAMP
);

-- 4. Add Foreign Key Constraint
ALTER TABLE "confirmo_payments"
DROP CONSTRAINT IF EXISTS "confirmo_payments_invoiceId_fkey";

ALTER TABLE "confirmo_payments"
    ADD CONSTRAINT "confirmo_payments_invoiceId_fkey"
        FOREIGN KEY ("invoiceId")
            REFERENCES public.invoices (id)
            ON UPDATE CASCADE
            ON DELETE CASCADE;

-- 5. Create Indexes
-- Note: Unique indexes on invoiceId and confirmoInvoiceId are created separately
-- to match your schema requirements.

CREATE INDEX IF NOT EXISTS "confirmo_payments_confirmoInvoiceId_idx"
    ON "confirmo_payments" USING BTREE ("confirmoInvoiceId");

CREATE UNIQUE INDEX IF NOT EXISTS "confirmo_payments_confirmoInvoiceId_key"
    ON "confirmo_payments" USING BTREE ("confirmoInvoiceId");

CREATE INDEX IF NOT EXISTS "confirmo_payments_invoiceId_idx"
    ON "confirmo_payments" USING BTREE ("invoiceId");

CREATE UNIQUE INDEX IF NOT EXISTS "confirmo_payments_invoiceId_key"
    ON "confirmo_payments" USING BTREE ("invoiceId");

CREATE INDEX IF NOT EXISTS "confirmo_payments_status_idx"
    ON "confirmo_payments" USING BTREE ("status");
