-- 1. Create ENUM Type safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailRunStatus') THEN
CREATE TYPE "EmailRunStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
END IF;
END
$$;



-- 3. Create the table
CREATE TABLE IF NOT EXISTS "email_send_runs" (
     "id" TEXT PRIMARY KEY,
     "type" TEXT NOT NULL DEFAULT 'INVOICE_BULK_EMAIL',
     "status" "EmailRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
     "totalInvoices" INTEGER NOT NULL,
     "successCount" INTEGER NOT NULL DEFAULT 0,
     "failureCount" INTEGER NOT NULL DEFAULT 0,
     "createdBy" TEXT NOT NULL,
     "startedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "completedAt" TIMESTAMP,
     "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP NOT NULL
);

-- 4. Add Foreign Key Constraint
ALTER TABLE "email_send_runs"
DROP CONSTRAINT IF EXISTS "email_send_runs_createdBy_fkey";

ALTER TABLE "email_send_runs"
    ADD CONSTRAINT "email_send_runs_createdBy_fkey"
        FOREIGN KEY ("createdBy")
            REFERENCES public.users (id)
            ON UPDATE CASCADE
            ON DELETE CASCADE;

-- 5. Create Indexes
CREATE INDEX IF NOT EXISTS "email_send_runs_createdAt_idx"
    ON "email_send_runs" USING BTREE ("createdAt");

CREATE INDEX IF NOT EXISTS "email_send_runs_createdBy_idx"
    ON "email_send_runs" USING BTREE ("createdBy");

CREATE INDEX IF NOT EXISTS "email_send_runs_status_idx"
    ON "email_send_runs" USING BTREE ("status");

-- Note: email_send_runs_pkey is automatically handled by the PRIMARY KEY definition,
-- but adding the explicit UNIQUE INDEX as requested:
CREATE UNIQUE INDEX IF NOT EXISTS "email_send_runs_pkey"
    ON "email_send_runs" USING BTREE ("id");