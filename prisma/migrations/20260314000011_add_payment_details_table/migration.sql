-- CreateTable PaymentDetails
-- 1. Clean up existing structures if they exist
DROP INDEX IF EXISTS "PaymentDetails_id_idx";
DROP INDEX IF EXISTS "PaymentDetails_updatedBy_idx";
DROP TABLE IF EXISTS "PaymentDetails" CASCADE;

-- 2. Create the table
CREATE TABLE IF NOT EXISTS "PaymentDetails" (
    "id" TEXT PRIMARY KEY,
    "companyName" TEXT NOT NULL DEFAULT 'BitFactory.AE',
    "companyLegalName" TEXT NOT NULL DEFAULT 'Higgs Computing Limited',
    "companyLocation" TEXT NOT NULL DEFAULT 'Ras Al Khaimah, UAE',
    "machineHostingLocation" TEXT NOT NULL DEFAULT 'Addis Ababa, Ethiopia',
    "logoBase64" TEXT,
    "paymentOption1Title" TEXT NOT NULL DEFAULT 'OPTION 1:',
    "paymentOption1Details" TEXT NOT NULL DEFAULT 'USDT (Tron): TLNjcYnokhA1UcVsYVKjdeh9HzMS6GQJNe',
    "paymentOption2Title" TEXT NOT NULL DEFAULT 'OPTION 2:',
    "paymentOption2Details" TEXT NOT NULL DEFAULT 'USDC (ETH): 0x722460E434013075E8cF8dd42c8854424aFa336E',
    "paymentOption3Title" TEXT NOT NULL DEFAULT 'OPTION 3:',
    "paymentOption3Details" TEXT NOT NULL,
    "billingInquiriesEmail" TEXT NOT NULL DEFAULT 'invoices@bitfactory.ae',
    "billingInquiriesWhatsApp" TEXT NOT NULL DEFAULT '+971-52-6062903',
    "supportEmail" TEXT NOT NULL DEFAULT 'support@bitfactory.ae',
    "supportWhatsApp" TEXT NOT NULL DEFAULT '+971-52-6062903',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "updatedBy" TEXT,
    "confirmoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "confirmoReturnUrl" TEXT DEFAULT 'https://my.bitfactory.ae/invoices/payment-success',
    "confirmoSettlementCurrency" TEXT DEFAULT 'USDC'
);

-- 3. Add Foreign Key Constraint
-- Note: Table-level constraints use ALTER TABLE for IF NOT EXISTS logic
ALTER TABLE "PaymentDetails"
DROP CONSTRAINT IF EXISTS "PaymentDetails_updatedBy_fkey";

ALTER TABLE "PaymentDetails"
    ADD CONSTRAINT "PaymentDetails_updatedBy_fkey"
        FOREIGN KEY ("updatedBy")
            REFERENCES public.users (id)
            ON UPDATE CASCADE
            ON DELETE SET NULL;

-- 4. Create Indexes
-- Note: pkey index is automatically created by the PRIMARY KEY constraint
CREATE INDEX IF NOT EXISTS "PaymentDetails_id_idx"
    ON "PaymentDetails" USING BTREE ("id");

CREATE INDEX IF NOT EXISTS "PaymentDetails_updatedBy_idx"
    ON "PaymentDetails" USING BTREE ("updatedBy");
