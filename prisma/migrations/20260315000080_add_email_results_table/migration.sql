-- 1. Clean up existing structures
-- DROP INDEX IF EXISTS "email_send_results_createdAt_idx";
-- DROP INDEX IF EXISTS "email_send_results_customerId_idx";
-- DROP INDEX IF EXISTS "email_send_results_invoiceId_idx";
-- DROP INDEX IF EXISTS "email_send_results_runId_idx";
-- DROP INDEX IF EXISTS "email_send_results_success_idx";
-- DROP TABLE IF EXISTS "email_send_results" CASCADE;

-- 2. Create the table
CREATE TABLE IF NOT EXISTS "email_send_results" (
    "id" TEXT PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL
);

-- 3. Add Foreign Key Constraints
-- runId -> email_send_runs
ALTER TABLE "email_send_results"
DROP CONSTRAINT IF EXISTS "email_send_results_runId_fkey";
ALTER TABLE "email_send_results"
    ADD CONSTRAINT "email_send_results_runId_fkey"
        FOREIGN KEY ("runId")
            REFERENCES public.email_send_runs (id)
            ON UPDATE CASCADE ON DELETE CASCADE;

-- invoiceId -> invoices
ALTER TABLE "email_send_results"
DROP CONSTRAINT IF EXISTS "email_send_results_invoiceId_fkey";
ALTER TABLE "email_send_results"
    ADD CONSTRAINT "email_send_results_invoiceId_fkey"
        FOREIGN KEY ("invoiceId")
            REFERENCES public.invoices (id)
            ON UPDATE CASCADE ON DELETE CASCADE;

-- customerId -> users
ALTER TABLE "email_send_results"
DROP CONSTRAINT IF EXISTS "email_send_results_customerId_fkey";
ALTER TABLE "email_send_results"
    ADD CONSTRAINT "email_send_results_customerId_fkey"
        FOREIGN KEY ("customerId")
            REFERENCES public.users (id)
            ON UPDATE CASCADE ON DELETE CASCADE;

-- 4. Create Indexes
CREATE INDEX IF NOT EXISTS "email_send_results_createdAt_idx"
    ON "email_send_results" USING BTREE ("createdAt");

CREATE INDEX IF NOT EXISTS "email_send_results_customerId_idx"
    ON "email_send_results" USING BTREE ("customerId");

CREATE INDEX IF NOT EXISTS "email_send_results_invoiceId_idx"
    ON "email_send_results" USING BTREE ("invoiceId");

CREATE INDEX IF NOT EXISTS "email_send_results_runId_idx"
    ON "email_send_results" USING BTREE ("runId");

CREATE INDEX IF NOT EXISTS "email_send_results_success_idx"
    ON "email_send_results" USING BTREE ("success");

-- Explicit UNIQUE INDEX for the primary key as requested
CREATE UNIQUE INDEX IF NOT EXISTS "email_send_results_pkey"
    ON "email_send_results" USING BTREE ("id");